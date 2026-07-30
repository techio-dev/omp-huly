// tools/domains/labels.ts — Labels domain (4 tools, GLOBAL namespace).
// Design: 06-api.md §4 Labels. CRUD GLOBAL (KHÔNG project-scoped).
//
// T-58 #43 fix (2026-07-28): DEEP-AUDIT 12 packages @0.7.423 — `view:class:Label`
// KHÔNG tồn tại (0 match interface + class toàn packages). Deprecated — Huly
// runtime dùng `tags:class:TagElement` cho tag/label entity (đã verify T-43,
// dùng ở tags.ts). User yêu cầu "KHÔNG defensive che lỗi" → honest-unavailable
// tất cả 4 label tools, hướng dẫn user dùng tag tools (huly_list_tags /
// huly_create_tag / huly_attach_tag) thay thế.

import { z } from "zod";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { workspaceParam } from "./_common.js";

/** Honest-unavailable message cho label tools (deprecated — dùng tag tools). */
function labelUnavailableMessage(operation: string): string {
  return (
    `huly_${operation} KHÔNG khả dụng: Huly runtime class "view:class:Label" ` +
    `KHÔNG tồn tại (0 match trong 12 packages @0.7.423 — deprecated). Huly dùng ` +
    `tags:class:TagElement cho tag/label entity. Dùng tag tools thay thế: ` +
    `huly_list_tags, huly_create_tag, huly_update_tag, huly_attach_tag, ` +
    `huly_detach_tag (xem tags domain).`
  );
}

export const tools: HulyToolDefinition[] = [
  // 1. list_labels — honest-unavailable (deprecated)
  defineHulyTool({
    name: "list_labels",
    label: "List labels",
    description: "UNAVAILABLE — Label deprecated in Huly runtime. Use huly_list_tags instead.",
    parameters: z.object({ workspace: workspaceParam }),
    async handler(_params, _tctx) {
      return {
        content: labelUnavailableMessage("list_labels"),
        isError: true,
        details: {
          reason: "deprecated",
          useClass: "tags:class:TagElement",
          useTool: "huly_list_tags",
        },
      };
    },
  }),

  // 2. create_label — honest-unavailable (deprecated)
  defineHulyTool({
    name: "create_label",
    label: "Create label",
    description: "UNAVAILABLE — Label deprecated in Huly runtime. Use huly_create_tag instead.",
    parameters: z.object({
      workspace: workspaceParam,
      title: z.string(),
      color: z.optional(z.string()),
      description: z.optional(z.string()),
      category: z.optional(z.string()),
    }),
    async handler(_params, _tctx) {
      return {
        content: labelUnavailableMessage("create_label"),
        isError: true,
        details: {
          reason: "deprecated",
          useClass: "tags:class:TagElement",
          useTool: "huly_create_tag",
        },
      };
    },
  }),

  // 3. update_label — honest-unavailable (deprecated)
  defineHulyTool({
    name: "update_label",
    label: "Update label",
    description: "UNAVAILABLE — Label deprecated in Huly runtime. Use huly_update_tag instead.",
    parameters: z.object({
      workspace: workspaceParam,
      label: z.string(),
      title: z.optional(z.string()),
      color: z.optional(z.string()),
      description: z.optional(z.string()),
      category: z.optional(z.string()),
    }),
    async handler(_params, _tctx) {
      return {
        content: labelUnavailableMessage("update_label"),
        isError: true,
        details: {
          reason: "deprecated",
          useClass: "tags:class:TagElement",
          useTool: "huly_update_tag",
        },
      };
    },
  }),

  // 4. delete_label — honest-unavailable (deprecated)
  defineHulyTool({
    name: "delete_label",
    label: "Delete label",
    description: "UNAVAILABLE — Label deprecated in Huly runtime. Use huly_delete_tag instead.",
    parameters: z.object({
      workspace: workspaceParam,
      label: z.string(),
    }),
    async handler(_params, _tctx) {
      return {
        content: labelUnavailableMessage("delete_label"),
        isError: true,
        details: {
          reason: "deprecated",
          useClass: "tags:class:TagElement",
          useTool: "huly_delete_tag",
        },
      };
    },
  }),
];
