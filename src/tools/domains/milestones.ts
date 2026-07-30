// tools/domains/milestones.ts — Milestones domain (6 tools).
// Design: 06-api.md §4 Milestones. CRUD + set_issue_milestone.
//
// Tools (6, FR-04 D4):
//   1. huly_list_milestones        — list trong project
//   2. huly_get_milestone          — get by id
//   3. huly_create_milestone       — {project, label, description?, targetDate} → {id}
//   4. huly_update_milestone       — update label/description/targetDate/status
//   5. huly_set_issue_milestone    — gán issue → milestone
//   6. huly_delete_milestone       — destructive

import { z } from "zod";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { MILESTONE_CLASS, ISSUE_CLASS, PROJECT_CLASS } from "./_class-refs.js";

/**
 * T-72 #80: MilestoneStatus enum (numeric) ↔ string map.
 * Verified T-67: Planned=0, InProgress=1, Completed=2, Canceled=3.
 */
const MILESTONE_STATUS_MAP: Record<string, number> = {
  planned: 0,
  "in-progress": 1,
  completed: 2,
  canceled: 3,
};
function stringToMilestoneStatus(s: string): number {
  const v = MILESTONE_STATUS_MAP[s];
  if (v === undefined) {
    throw new Error(
      `Invalid milestone status "${s}". Valid: ${Object.keys(MILESTONE_STATUS_MAP).join(", ")}.`,
    );
  }
  return v;
}
/** T-82 #105: reverse map number → string (READ path). T-72 chỉ fix write. */
function milestoneStatusToString(n: unknown): string {
  return Object.entries(MILESTONE_STATUS_MAP).find(([, v]) => v === n)?.[0] ?? "planned";
}
import {
  workspaceParam,
  projectParam,
  identifierParam,
  resolveIdentifier,
  safeUpdateDoc,
  safeRemoveDoc,
  getProjectSpace,
} from "./_common.js";

export const tools: HulyToolDefinition[] = [
  // 1. list_milestones
  defineHulyTool({
    name: "list_milestones",
    label: "List milestones",
    description: "List milestones trong project.",
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
      const milestones = await tctx.client.findAll(
        MILESTONE_CLASS,
        { space } as never,
        // T-82G #108: sort modifiedOn desc.
        { sort: { modifiedOn: -1 } } as never,
      );
      const list = milestones.map((m) => ({
        id: m._id,
        label: (m as { label?: string }).label ?? "",
        // T-82 #105: status READ trả string (KHÔNG raw number — dead `?? "planned"`
        // before fix vì 0 không nullish).
        status: milestoneStatusToString((m as { status?: number }).status),
        targetDate: (m as { targetDate?: number }).targetDate,
      }));
      return {
        content: `Found ${list.length} milestone(s).`,
        details: { count: list.length, milestones: list },
      };
    },
  }),

  // 2. get_milestone
  defineHulyTool({
    name: "get_milestone",
    label: "Get milestone",
    description: "Get milestone by id.",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      milestone: z.string().describe("Milestone id."),
    }),
    async handler(params, tctx) {
      // T-100 (#146): scope milestone lookup theo project space (mirror components.ts T-81).
      const space = await getProjectSpace(tctx.client, tctx.project!);
      if (!space) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const m = await tctx.client.findOne(MILESTONE_CLASS, {
        _id: params.milestone,
        space,
      } as never);
      if (!m) {
        return {
          content: `Milestone "${params.milestone}" not found.`,
          isError: true,
          details: { milestone: params.milestone },
        };
      }
      const ms = m as {
        label?: string;
        status?: number;
        targetDate?: number;
        description?: string | null;
        space?: string;
        modifiedOn?: number;
        createdOn?: number;
      };
      // T-82G #108: description → markdown (fetchMarkup).
      let description: string | undefined;
      if (ms.description) {
        try {
          const markup = await tctx.client.fetchMarkup(
            MILESTONE_CLASS,
            m._id,
            "description",
            ms.description,
            "markdown",
          );
          description = typeof markup === "string" ? markup : undefined;
        } catch {
          description = undefined;
        }
      }
      return {
        content: `Milestone ${ms.label ?? ""}`,
        details: {
          id: m._id,
          label: ms.label,
          // T-82 #105: status READ trả string (KHÔNG raw number).
          status: milestoneStatusToString(ms.status),
          targetDate: ms.targetDate,
          // T-82G #108: add description (markdown), project (=space), modifiedOn, createdOn.
          description,
          project: ms.space,
          modifiedOn: ms.modifiedOn,
          createdOn: ms.createdOn,
        },
      };
    },
  }),

  // 3. create_milestone
  defineHulyTool({
    name: "create_milestone",
    label: "Create milestone",
    description: "Create milestone. targetDate BẮT BUỘC (Unix ms).",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      label: z.string(),
      description: z.optional(z.string()),
      targetDate: z.number().int().describe("Unix ms timestamp (BẮT BUỘC)."),
    }),
    async handler(params, tctx) {
      // T-103 #160: guard label non-empty.
      if (params.label.trim() === "") {
        return {
          content: `create_milestone label must be non-empty.`,
          isError: true,
          details: { label: params.label },
        };
      }
      const project = await tctx.client.findOne(PROJECT_CLASS, {
        identifier: tctx.project,
      });
      // T-51 #41: project null → isError rõ ràng, KHÔNG fallback workspace.
      if (!project) {
        return {
          content: `Project "${tctx.project}" not found. Run /huly init or check binding.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      // T-97 (#143): space = project._id (KHÔNG project.space — T-67 assumption sai).
      const id = await tctx.client.createDoc(MILESTONE_CLASS, project._id as never, {
        label: params.label,
        description: params.description,
        targetDate: params.targetDate,
        // T-67 #75: MilestoneStatus.Planned = 0 (numeric enum, KHÔNG phải string).
        status: 0,
      });
      return {
        content: `Created milestone "${params.label}".`,
        details: { id, label: params.label },
      };
    },
  }),

  // 4. update_milestone
  defineHulyTool({
    name: "update_milestone",
    label: "Update milestone",
    description: "Update milestone (label, description, targetDate, status).",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      milestone: z.string(),
      label: z.optional(z.string()),
      description: z.optional(z.string()),
      targetDate: z.optional(z.number().int()),
      status: z.optional(
        z.union([
          z.literal("planned"),
          z.literal("in-progress"),
          z.literal("completed"),
          z.literal("canceled"),
        ]),
      ),
    }),
    async handler(params, tctx) {
      // T-100 (#146): scope milestone lookup theo project space.
      const space = await getProjectSpace(tctx.client, tctx.project!);
      if (!space) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const m = await tctx.client.findOne(MILESTONE_CLASS, {
        _id: params.milestone,
        space,
      } as never);
      if (!m) {
        return {
          content: `Milestone "${params.milestone}" not found.`,
          isError: true,
          details: { milestone: params.milestone },
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
      if (params.targetDate !== undefined) ops.targetDate = params.targetDate;
      if (params.status !== undefined) {
        try {
          ops.status = stringToMilestoneStatus(params.status);
        } catch (e) {
          return {
            content: (e as Error).message,
            isError: true,
            details: { milestone: params.milestone, invalidStatus: params.status },
          };
        }
      }
      if (Object.keys(ops).length === 0) {
        return { content: "No fields to update.", details: { updated: false } };
      }
      const updResult = await safeUpdateDoc(tctx.client, MILESTONE_CLASS, m, ops);
      if (!updResult.ok) return updResult.error;
      return {
        content: `Updated milestone ${params.milestone}: ${Object.keys(ops).join(", ")}`,
        details: { updated: true, fields: Object.keys(ops) },
      };
    },
  }),

  // 5. set_issue_milestone
  defineHulyTool({
    name: "set_issue_milestone",
    label: "Set issue milestone",
    description: "Gán milestone cho issue. Qua identifier (PD-123 HOẶC raw num).",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      // T-82G #108: milestone=null → clear (unassign).
      milestone: z.optional(z.union([z.string(), z.null()])),
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
      // T-82G #108: milestone=null → clear.
      if (params.milestone === null) {
        const clr = await safeUpdateDoc(tctx.client, ISSUE_CLASS, issue, { milestone: null });
        if (!clr.ok) return clr.error;
        return {
          content: `Cleared milestone on ${params.identifier}.`,
          details: { identifier: params.identifier, milestone: null },
        };
      }
      // T-100 (#146): scope milestone lookup theo issue space (issue đã load,
      // = project._id — giống set_issue_component, tránh getProjectSpace thừa).
      const milestone = await tctx.client.findOne(MILESTONE_CLASS, {
        _id: params.milestone,
        space: issue.space,
      } as never);
      if (!milestone) {
        return {
          content: `Milestone "${params.milestone}" not found.`,
          isError: true,
          details: { identifier: params.identifier, milestone: params.milestone },
        };
      }
      const updResult = await safeUpdateDoc(tctx.client, ISSUE_CLASS, issue, {
        milestone: milestone._id as never,
      });
      if (!updResult.ok) return updResult.error;
      return {
        content: `Set ${params.identifier} → milestone ${params.milestone}.`,
        details: { identifier: params.identifier, milestone: params.milestone },
      };
    },
  }),

  // 6. delete_milestone — destructive
  defineHulyTool({
    name: "delete_milestone",
    label: "Delete milestone",
    description: "Delete milestone (destructive — confirm gate).",
    destructive: true,
    needsProject: true,
    destructiveContext: (p) => ({
      type: "milestone",
      id: (p as { milestone?: string }).milestone ?? "<unknown>",
    }),
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      milestone: z.string(),
    }),
    async handler(params, tctx) {
      // T-100 (#146): scope milestone lookup theo project space.
      const space = await getProjectSpace(tctx.client, tctx.project!);
      if (!space) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const m = await tctx.client.findOne(MILESTONE_CLASS, {
        _id: params.milestone,
        space,
      } as never);
      if (!m) {
        return {
          content: `Milestone "${params.milestone}" not found.`,
          isError: true,
          details: { milestone: params.milestone },
        };
      }
      const delResult = await safeRemoveDoc(tctx.client, MILESTONE_CLASS, m);
      if (!delResult.ok) return delResult.error;
      return {
        content: `Deleted milestone ${params.milestone}.`,
        details: { deleted: true, milestone: params.milestone },
      };
    },
  }),
];

// resolveIdentifier imported từ _common.ts
