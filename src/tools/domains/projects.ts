// tools/domains/projects.ts — Projects domain (6 tools).
// Design: 06-api.md §4 Projects. CRUD projects + list_statuses.
//
// Tools (6, FR-04 D4):
//   1. huly_list_projects          — list trong workspace (project-scoped)
//   2. huly_get_project            — get by identifier
//   3. huly_create_project         — {name, identifier} → {identifier}
//   4. huly_update_project         — update name/description
//   5. huly_delete_project         — destructive, confirm gate
//   6. huly_list_statuses          — workflow statuses cho project

import { z } from "zod";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { PROJECT_CLASS, CLASSIC_PROJECT_TYPE_REF } from "./_class-refs.js";
import {
  workspaceParam,
  projectParam,
  safeUpdateDoc,
  safeRemoveDoc,
  getProjectStatuses,
} from "./_common.js";

export const tools: HulyToolDefinition[] = [
  // 1. list_projects
  defineHulyTool({
    name: "list_projects",
    label: "List projects",
    description: "List Huly projects trong workspace.",
    promptSnippet: "List Huly projects.",
    parameters: z.object({
      workspace: workspaceParam,
      includeArchived: z.optional(
        z.boolean().describe("Include archived projects (default false)."),
      ),
    }),
    async handler(params, tctx) {
      // T-81G #107: archived-filter default (exclude archived) + sort name asc.
      const query: Record<string, unknown> =
        params.includeArchived === true ? {} : { archived: { $ne: true } };
      const projects = await tctx.client.findAll(PROJECT_CLASS, query as never, {
        sort: { name: 1 },
      });
      const list = projects.map((p) => ({
        identifier: (p as { identifier?: string }).identifier ?? "",
        name: (p as { name?: string }).name ?? "",
        description: (p as { description?: string }).description,
        archived: (p as { archived?: boolean }).archived === true,
        total: (p as { sequence?: number }).sequence ?? 0,
      }));
      return {
        content: `Found ${list.length} project(s): ${list.map((p) => p.identifier).join(", ")}`,
        details: { count: list.length, projects: list },
      };
    },
  }),

  // 2. get_project
  defineHulyTool({
    name: "get_project",
    label: "Get project",
    description: "Get Huly project by identifier.",
    promptSnippet: "Get Huly project details.",
    needsProject: true,
    parameters: z.object({ workspace: workspaceParam, project: projectParam }),
    async handler(_params, tctx) {
      const project = await tctx.client.findOne(PROJECT_CLASS, {
        identifier: tctx.project,
      });
      if (!project) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project, found: false },
        };
      }
      const projFields = project as {
        identifier?: string;
        name?: string;
        description?: string;
        archived?: boolean;
      };
      // T-81G #107: inline defaultStatus + statuses[] (convenience — avoid extra
      // list_statuses call). getProjectStatuses resolves qua core.class.Status.
      const statusResult = await getProjectStatuses(tctx.client, tctx.project!);
      const statuses = statusResult?.statuses ?? [];
      const defaultStatus = statuses.find((s) => s.isDefault)?.name;
      return {
        content: `Project ${projFields.identifier}: ${projFields.name ?? ""}`,
        details: {
          identifier: projFields.identifier,
          name: projFields.name,
          description: projFields.description,
          archived: projFields.archived ?? false,
          defaultStatus,
          statuses: statuses.map((s) => ({ name: s.name, category: s.category })),
        },
      };
    },
  }),

  // 3. create_project
  defineHulyTool({
    name: "create_project",
    label: "Create project",
    description:
      "Create Huly project. Idempotent (findOne by identifier trước). Returns identifier.",
    promptSnippet: "Create a new Huly project.",
    parameters: z.object({
      workspace: workspaceParam,
      name: z.string().describe("Project name."),
      identifier: z.string().describe("1-5 chars uppercase, start with letter.").min(1).max(5),
      description: z.optional(z.string()),
    }),
    async handler(params, tctx) {
      // T-67 #75: idempotent — findOne by identifier trước (spec §9).
      const existing = await tctx.client.findOne(PROJECT_CLASS, {
        identifier: params.identifier,
      });
      if (existing) {
        return {
          content: `Project ${params.identifier} (${(existing as { name?: string }).name ?? ""}) đã tồn tại.`,
          details: { identifier: params.identifier, id: existing._id, idempotent: true },
        };
      }
      // T-67 #75: Project = TypedSpace, self-ref space (project._id = own space).
      // Required fields: type (SpaceType), members/owners, sequence:0,
      // defaultIssueStatus:"" (placeholder), defaultTimeReportDay:"CurrentWorkDay".
      const projectId = `tracker:project.${Math.random().toString(36).slice(2, 14)}`;
      const id = await tctx.client.createDoc(
        PROJECT_CLASS,
        projectId as never, // self-ref space
        {
          name: params.name,
          identifier: params.identifier,
          description: params.description ?? "",
          private: false,
          archived: false,
          members: [tctx.currentUser.id],
          owners: [tctx.currentUser.id],
          sequence: 0,
          type: CLASSIC_PROJECT_TYPE_REF,
          defaultIssueStatus: "", // placeholder — server resolve từ ProjectType statuses
          defaultTimeReportDay: "CurrentWorkDay",
        } as never,
        projectId as never,
      );
      return {
        content: `Created project ${params.identifier} (${params.name}).`,
        details: { identifier: params.identifier, id },
      };
    },
  }),

  // 4. update_project
  defineHulyTool({
    name: "update_project",
    label: "Update project",
    description: "Update Huly project (name, description).",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      name: z.optional(z.string()),
      description: z.optional(z.union([z.string(), z.null()])),
    }),
    async handler(params, tctx) {
      const existing = await tctx.client.findOne(PROJECT_CLASS, {
        identifier: tctx.project,
      });
      if (!existing) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const operations: Record<string, unknown> = {};
      if (typeof params.name === "string") operations.name = params.name;
      // T-81G #107: description=null → $unset clear.
      if (params.description !== undefined) {
        if (params.description === null) {
          operations.$unset = { description: "" };
        } else {
          operations.description = params.description;
        }
      }
      if (Object.keys(operations).length === 0) {
        return { content: "No fields to update.", details: { updated: false } };
      }
      const updResult = await safeUpdateDoc(tctx.client, PROJECT_CLASS, existing, operations);
      if (!updResult.ok) return updResult.error;
      const fields = Object.keys(operations).filter((f) => f !== "$unset");
      if (operations.$unset !== undefined) fields.push("description(clear)");
      return {
        content: `Updated project ${tctx.project}: ${fields.join(", ")}`,
        details: { updated: true, fields },
      };
    },
  }),

  // 5. delete_project — destructive, confirm gate
  defineHulyTool({
    name: "delete_project",
    label: "Delete project",
    description: "Delete Huly project (destructive — confirm gate).",
    promptSnippet: "Delete a Huly project (asks confirmation).",
    destructive: true,
    needsProject: true,
    destructiveContext: (p) => ({
      type: "project",
      id: (p as { project?: string }).project ?? "<unknown>",
    }),
    parameters: z.object({ workspace: workspaceParam, project: projectParam }),
    async handler(_params, tctx) {
      const existing = await tctx.client.findOne(PROJECT_CLASS, {
        identifier: tctx.project,
      });
      if (!existing) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const delResult = await safeRemoveDoc(tctx.client, PROJECT_CLASS, existing);
      if (!delResult.ok) return delResult.error;
      return {
        content: `Deleted project ${tctx.project}.`,
        details: { deleted: true, identifier: tctx.project },
      };
    },
  }),

  // 6. list_statuses
  defineHulyTool({
    name: "list_statuses",
    label: "List statuses",
    description: "List workflow statuses cho project.",
    needsProject: true,
    parameters: z.object({ workspace: workspaceParam, project: projectParam }),
    async handler(_params, tctx) {
      // T-71: ProjectType.statuses traversal (KHÔNG findAll global).
      const result = await getProjectStatuses(tctx.client, tctx.project!);
      if (!result) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const list = result.statuses.map((s) => ({
        name: s.name,
        category: s.category, // enum key (strip Ref prefix)
        isDefault: s.isDefault,
      }));
      return {
        content: `Found ${list.length} status(es).`,
        details: { count: list.length, statuses: list },
      };
    },
  }),
];
