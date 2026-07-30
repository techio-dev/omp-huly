// tools/domains/deletion.ts — Deletion preview domain (1 tool).
// Design: 06-api.md §4 Deletion. Preview cascade trước khi delete.

import { z } from "zod";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { workspaceParam, projectParam, identifierParam, resolveIdentifier } from "./_common.js";
import { ISSUE_CLASS } from "./_class-refs.js";

export const tools: HulyToolDefinition[] = [
  // 1. preview_deletion — cascade preview
  defineHulyTool({
    name: "preview_deletion",
    label: "Preview deletion",
    description:
      "Preview cascade deletion của entity (issues, comments, attachments affected). KHÔNG xóa — preview only.",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      _class: z.optional(
        z.string().describe("Entity _class (default: tracker:class:Issue)."),
      ),
    }),
    async handler(params, tctx) {
      const cls = (params._class ?? ISSUE_CLASS) as never;
      const entity = await tctx.client.findOne(cls, {
        identifier: resolveIdentifier(tctx.project!, params.identifier),
      });
      if (!entity) {
        return {
          content: `Entity "${params.identifier}" not found.`,
          isError: true,
          details: { identifier: params.identifier },
        };
      }
      // T-84 #119: read CollectionSize counters trực tiếp từ entity (subIssues/
      // comments/attachments) + inline blockedBy/relations. KHÔNG N+1 findAll
      // (Issue có sẵn counters) + KHÔNG reverseBlocks (dotted-path `blockedBy._id`
      // broken query — T-80 confirmed trả 0 rows; trusted previewIssueDeletion
      // không track direction này). total match trusted formula (no +1 entity).
      const issueFields = entity as {
        subIssues?: number;
        comments?: number;
        attachments?: number;
        blockedBy?: Array<{ _id?: string }>;
        relations?: Array<{ _id?: string }>;
      };
      const subIssues = issueFields.subIssues ?? 0;
      const comments = issueFields.comments ?? 0;
      const attachments = issueFields.attachments ?? 0;
      const blockedByCount = issueFields.blockedBy?.length ?? 0;
      const relationsCount = issueFields.relations?.length ?? 0;
      const cascade = {
        entity: entity._id,
        comments,
        attachments,
        subIssues,
        blockedBy: blockedByCount,
        relations: relationsCount,
        total: subIssues + comments + attachments + blockedByCount + relationsCount,
      };
      const warnings: string[] = [];
      if (subIssues > 0) warnings.push(`${subIssues} sub-issue(s) orphaned`);
      if (blockedByCount > 0) warnings.push(`${blockedByCount} blockedBy reference(s) dropped`);
      if (relationsCount > 0) warnings.push(`${relationsCount} relation(s) dropped`);
      const warnText = warnings.length > 0 ? ` Warnings: ${warnings.join("; ")}.` : "";
      return {
        content: `Deletion preview for ${params.identifier}: ${cascade.total} item(s) affected (${subIssues} sub-issues + ${comments} comments + ${attachments} attachments + ${blockedByCount} blockedBy + ${relationsCount} relations).${warnText}`,
        details: { cascade, warnings: warnings.length > 0 ? warnings : undefined },
      };
    },
  }),
];
