// tools/domains/comments.ts — Comments domain (4 tools).
// Design: 06-api.md §4 Comments.
//
// T-70 (2026-07-28): field thật là `message` (KHÔNG `body` — gotcha cũ bị
// ĐẢO ngược). reality-checker CONFIRMED vs trusted comments.ts:150
// `message: markdownToMarkupString(params.body)`. ChatMessage.message = inline
// Markup = JSON.stringify(mdToMarkup(md)). KHÔNG MarkupBlobRef (KHÔNG uploadMarkup).
//
// Comment = chunter:class:ChatMessage attached to issue (collection "comments").

import { z } from "zod";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { CHAT_MESSAGE_CLASS, ISSUE_CLASS } from "./_class-refs.js";
import {
  workspaceParam,
  projectParam,
  identifierParam,
  resolveIdentifier,
  safeUpdateDoc,
  safeRemoveDoc,
} from "./_common.js";
import { mdToMarkup, markupToMd } from "../../markup/markup.js";

/** Markdown → inline Huly Markup string (JSON.stringify(markupNode)). */
function markdownToMessage(md: string): string {
  return JSON.stringify(mdToMarkup(md));
}

/** Inline Huly Markup string → markdown (round-trip for list read). */
function messageToMarkdown(message: unknown): string | undefined {
  if (typeof message !== "string" || message === "") return undefined;
  try {
    return markupToMd(JSON.parse(message) as never);
  } catch {
    // Non-JSON message (legacy/edge) — return raw.
    return message;
  }
}

export const tools: HulyToolDefinition[] = [
  // 1. list_comments — T-70: filter attachedToClass + read field `message`
  defineHulyTool({
    name: "list_comments",
    label: "List comments",
    description: "List comments trên issue.",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
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
      // T-70: query thêm attachedToClass: ISSUE_CLASS (trusted pattern — tránh
      // trả comments từ attachment/activity khác attach cùng issue).
      const comments = await tctx.client.findAll(
        CHAT_MESSAGE_CLASS,
        { attachedTo: issue._id, attachedToClass: ISSUE_CLASS } as never,
        { sort: { createdOn: 1 } } as never,
      );
      const list = comments.map((c) => {
        const raw = c as { message?: string; createdOn?: number; modifiedBy?: string };
        return {
          _id: c._id,
          message: messageToMarkdown(raw.message),
          createdOn: raw.createdOn,
          modifiedBy: raw.modifiedBy,
        };
      });
      return {
        content: `Found ${list.length} comment(s) on ${params.identifier}.`,
        details: { count: list.length, comments: list },
      };
    },
  }),

  // 2. add_comment — T-70: field `message` (inline Markup), KHÔNG `body`
  defineHulyTool({
    name: "add_comment",
    label: "Add comment",
    description: "Add comment to issue. Body param → message field (Huly inline Markup).",
    needsProject: true,
    needsAssignee: true,
    assigneeField: "author",
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      body: z.string().describe("Comment body (markdown)."),
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
      const id = await tctx.client.addCollection(
        CHAT_MESSAGE_CLASS,
        issue.space as never,
        issue._id as never,
        ISSUE_CLASS,
        "comments",
        { message: markdownToMessage(params.body) } as never,
      );
      return {
        content: `Comment added to ${params.identifier}.`,
        details: { id, identifier: params.identifier },
      };
    },
  }),

  // 3. update_comment — T-70: field `message` + editedOn timestamp
  defineHulyTool({
    name: "update_comment",
    label: "Update comment",
    description: "Update comment body (→ message field + editedOn).",
    parameters: z.object({
      workspace: workspaceParam,
      comment: z.string(),
      body: z.string(),
    }),
    async handler(params, tctx) {
      const c = await tctx.client.findOne(CHAT_MESSAGE_CLASS, { _id: params.comment });
      if (!c) {
        return {
          content: `Comment "${params.comment}" not found.`,
          isError: true,
          details: { comment: params.comment },
        };
      }
      const updResult = await safeUpdateDoc(tctx.client, CHAT_MESSAGE_CLASS, c, {
        message: markdownToMessage(params.body),
        editedOn: Date.now(),
      } as never);
      if (!updResult.ok) return updResult.error;
      return {
        content: `Updated comment ${params.comment}.`,
        details: { updated: true, comment: params.comment },
      };
    },
  }),

  // 4. delete_comment — destructive (không affected by field name)
  defineHulyTool({
    name: "delete_comment",
    label: "Delete comment",
    description: "Delete comment (destructive).",
    destructive: true,
    destructiveContext: (p) => ({
      type: "comment",
      id: (p as { comment?: string }).comment ?? "<unknown>",
    }),
    parameters: z.object({
      workspace: workspaceParam,
      comment: z.string(),
    }),
    async handler(params, tctx) {
      const c = await tctx.client.findOne(CHAT_MESSAGE_CLASS, { _id: params.comment });
      if (!c) {
        return {
          content: `Comment "${params.comment}" not found.`,
          isError: true,
          details: { comment: params.comment },
        };
      }
      const delResult = await safeRemoveDoc(tctx.client, CHAT_MESSAGE_CLASS, c);
      if (!delResult.ok) return delResult.error;
      return {
        content: `Deleted comment ${params.comment}.`,
        details: { deleted: true, comment: params.comment },
      };
    },
  }),
];
