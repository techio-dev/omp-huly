// tools/domains/components.ts — Components domain (6 tools).
// Design: 06-api.md §4 Components. CRUD + set_issue_component.

import { z } from "zod";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { COMPONENT_CLASS, ISSUE_CLASS, PROJECT_CLASS, PERSON_CLASS } from "./_class-refs.js";
import {
  workspaceParam,
  projectParam,
  identifierParam,
  resolveIdentifier,
  safeUpdateDoc,
  safeRemoveDoc,
  getProjectSpace,
} from "./_common.js";
import { findPersonByEmailOrName } from "./contacts.js";

export const tools: HulyToolDefinition[] = [
  // 1. list_components
  defineHulyTool({
    name: "list_components",
    label: "List components",
    description: "List components trong project.",
    needsProject: true,
    parameters: z.object({ workspace: workspaceParam, project: projectParam }),
    async handler(_params, tctx) {
      // T-71: space scoping (KHÔNG findAll global cross-project).
      const space = await getProjectSpace(tctx.client, tctx.project!);
      if (!space) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const comps = await tctx.client.findAll(COMPONENT_CLASS, { space } as never, {});
      const list = comps.map((c) => ({
        id: c._id,
        label: (c as { label?: string }).label ?? "",
        lead: (c as { lead?: string }).lead,
      }));
      return {
        content: `Found ${list.length} component(s).`,
        details: { count: list.length, components: list },
      };
    },
  }),

  // 2. get_component
  defineHulyTool({
    name: "get_component",
    label: "Get component",
    description: "Get component by id.",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      component: z.string(),
    }),
    async handler(params, tctx) {
      // T-81 #104: scope component lookup theo project (space = project._id).
      const space = await getProjectSpace(tctx.client, tctx.project!);
      if (!space) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const c = await tctx.client.findOne(COMPONENT_CLASS, {
        _id: params.component,
        space,
      } as never);
      if (!c) {
        return {
          content: `Component "${params.component}" not found.`,
          isError: true,
          details: { component: params.component },
        };
      }
      // T-81G #107: resolve lead raw Ref → Person name; description → markdown.
      const comp = c as { label?: string; description?: string | null; lead?: string };
      let leadName: string | undefined;
      if (comp.lead) {
        const person = await tctx.client.findOne(PERSON_CLASS, { _id: comp.lead } as never);
        leadName = (person as { name?: string } | null)?.name;
      }
      let description: string | undefined;
      if (comp.description) {
        try {
          const markup = await tctx.client.fetchMarkup(
            COMPONENT_CLASS,
            c._id,
            "description",
            comp.description,
            "markdown",
          );
          description = typeof markup === "string" ? markup : undefined;
        } catch {
          description = undefined;
        }
      }
      return {
        content: `Component ${comp.label ?? ""}`,
        details: {
          id: c._id,
          label: comp.label,
          description,
          lead: leadName,
          leadRef: comp.lead,
        },
      };
    },
  }),

  // 3. create_component
  defineHulyTool({
    name: "create_component",
    label: "Create component",
    description: "Create component.",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      label: z.string(),
      description: z.optional(z.string()),
      lead: z.optional(z.string().describe("Lead email/name.")),
    }),
    async handler(params, tctx) {
      // T-103 #160: guard label non-empty.
      if (params.label.trim() === "") {
        return {
          content: `create_component label must be non-empty.`,
          isError: true,
          details: { label: params.label },
        };
      }
      const project = await tctx.client.findOne(PROJECT_CLASS, {
        identifier: tctx.project,
      });
      // T-51 #41: project null → isError rõ ràng, KHÔNG fallback workspace
      // (trước đây fallback silent → document mồ côi không thuộc project).
      if (!project) {
        return {
          content: `Project "${tctx.project}" not found. Run /huly init or check binding.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      // T-81 #104: lead = Ref<Employee> (KHÔNG raw string). Resolve Person trước.
      let leadRef: string | undefined;
      if (params.lead !== undefined) {
        leadRef = await findPersonByEmailOrName(tctx.client, params.lead);
        if (!leadRef) {
          return {
            content: `Lead "${params.lead}" not found (no Person matching email/name).`,
            isError: true,
            details: { lead: params.lead, project: tctx.project },
          };
        }
      }
      // T-81 #104: comments:0 default (pattern chung Component/Milestone/IssueTemplate).
      // T-97 (#143): space = project._id (getProjectSpace canonical), KHÔNG
      // project.space (T-67 assumption project._id===project.space SAI cho ws này
      // → component orphan, set_issue_component scope issue.space=project._id
      // không thấy). Đồng bộ list/get/update/set/delete (dùng getProjectSpace).
      const id = await tctx.client.createDoc(COMPONENT_CLASS, project._id as never, {
        label: params.label,
        description: params.description,
        lead: leadRef,
        comments: 0,
      });
      return {
        content: `Created component "${params.label}".`,
        details: { id, label: params.label },
      };
    },
  }),

  // 4. update_component
  defineHulyTool({
    name: "update_component",
    label: "Update component",
    description: "Update component (label, description, lead).",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      component: z.string(),
      label: z.optional(z.string()),
      description: z.optional(z.string()),
      lead: z.optional(z.string()),
    }),
    async handler(params, tctx) {
      // T-81 #104: scope component lookup theo project.
      const space = await getProjectSpace(tctx.client, tctx.project!);
      if (!space) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const c = await tctx.client.findOne(COMPONENT_CLASS, {
        _id: params.component,
        space,
      } as never);
      if (!c) {
        return {
          content: `Component "${params.component}" not found.`,
          isError: true,
          details: { component: params.component },
        };
      }
      const ops: Record<string, unknown> = {};
      if (params.label !== undefined) {
        if (params.label.trim() === "")
          return {
            content: "label must be non-empty.",
            isError: true,
            details: { label: params.label },
          };
        ops.label = params.label;
      }
      if (params.description !== undefined) ops.description = params.description;
      // T-81 #104: lead = Ref<Employee> (resolve Person, KHÔNG raw string).
      if (params.lead !== undefined) {
        const leadRef = await findPersonByEmailOrName(tctx.client, params.lead);
        if (!leadRef) {
          return {
            content: `Lead "${params.lead}" not found (no Person matching email/name).`,
            isError: true,
            details: { lead: params.lead, component: params.component },
          };
        }
        ops.lead = leadRef;
      }
      if (Object.keys(ops).length === 0) {
        return { content: "No fields to update.", details: { updated: false } };
      }
      const updResult = await safeUpdateDoc(tctx.client, COMPONENT_CLASS, c, ops);
      if (!updResult.ok) return updResult.error;
      return {
        content: `Updated component ${params.component}.`,
        details: { updated: true, fields: Object.keys(ops) },
      };
    },
  }),

  // 5. set_issue_component
  defineHulyTool({
    name: "set_issue_component",
    label: "Set issue component",
    description: "Gán component cho issue.",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      // T-81G #107: component = label OR _id; null → clear (unassign).
      component: z.optional(z.union([z.string(), z.null()])),
    }),
    async handler(params, tctx) {
      const issue = await tctx.client.findOne(ISSUE_CLASS, {
        identifier: resolveIdentifier(tctx.project!, params.identifier),
      });
      if (!issue) {
        return {
          content: `Issue "${params.identifier}" not found.`,
          isError: true,
          details: { identifier: params.identifier },
        };
      }
      // T-81G #107: component=null → clear (unassign).
      if (params.component === null) {
        const updResult = await safeUpdateDoc(tctx.client, ISSUE_CLASS, issue, {
          component: null,
        });
        if (!updResult.ok) return updResult.error;
        return {
          content: `Cleared component on ${params.identifier}.`,
          details: { identifier: params.identifier, component: null },
        };
      }
      // T-52 #42 + T-81 #104 + T-81G #107: resolve component by _id OR label + scope.
      const space = issue.space as string;
      let component = await tctx.client.findOne(COMPONENT_CLASS, {
        _id: params.component,
        space,
      } as never);
      if (!component) {
        // T-81G #107: label-fallback resolve.
        component = await tctx.client.findOne(COMPONENT_CLASS, {
          label: params.component,
          space,
        } as never);
      }
      if (!component) {
        return {
          content: `Component "${params.component}" not found (by _id or label).`,
          isError: true,
          details: { identifier: params.identifier, component: params.component },
        };
      }
      const updResult = await safeUpdateDoc(tctx.client, ISSUE_CLASS, issue, {
        component: component._id as never,
      });
      if (!updResult.ok) return updResult.error;
      return {
        content: `Set ${params.identifier} → component ${params.component}.`,
        details: { identifier: params.identifier, component: params.component },
      };
    },
  }),

  // 6. delete_component — destructive
  defineHulyTool({
    name: "delete_component",
    label: "Delete component",
    description: "Delete component (destructive).",
    destructive: true,
    needsProject: true,
    destructiveContext: (p) => ({
      type: "component",
      id: (p as { component?: string }).component ?? "<unknown>",
    }),
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      component: z.string(),
    }),
    async handler(params, tctx) {
      // T-81 #104: scope component lookup theo project.
      const space = await getProjectSpace(tctx.client, tctx.project!);
      if (!space) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const c = await tctx.client.findOne(COMPONENT_CLASS, {
        _id: params.component,
        space,
      } as never);
      if (!c) {
        return {
          content: `Component "${params.component}" not found.`,
          isError: true,
          details: { component: params.component },
        };
      }
      const delResult = await safeRemoveDoc(tctx.client, COMPONENT_CLASS, c);
      if (!delResult.ok) return delResult.error;
      return {
        content: `Deleted component ${params.component}.`,
        details: { deleted: true, component: params.component },
      };
    },
  }),
];
