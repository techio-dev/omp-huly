// tools/domains/tag-categories.ts — Tag categories domain (4 tools).
// Design: 06-api.md §4 Tag-categories. CRUD.
//
// T-77 (2026-07-28): field thật là `label` (KHÔNG `title` — TagCategory.label).
// reality-checker CONFIRMED vs @hcengineering/tags types. TagElement dùng title,
// TagCategory dùng label — KHÔNG nhầm.

import { z } from "zod";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { TAG_CATEGORY_CLASS, WORKSPACE_SPACE } from "./_class-refs.js";
import { workspaceParam, safeUpdateDoc, safeRemoveDoc } from "./_common.js";

export const tools: HulyToolDefinition[] = [
  // 1. list_tag_categories
  defineHulyTool({
    name: "list_tag_categories",
    label: "List tag categories",
    description: "List tag categories.",
    parameters: z.object({ workspace: workspaceParam }),
    async handler(_params, tctx) {
      const cats = await tctx.client.findAll(TAG_CATEGORY_CLASS, {}, {});
      const list = cats.map((c) => ({
        _id: c._id,
        label: (c as { label?: string }).label ?? "",
        targetClass: (c as { targetClass?: string }).targetClass,
      }));
      return {
        content: `Found ${list.length} tag category(ies).`,
        details: { count: list.length, categories: list },
      };
    },
  }),

  // 2. create_tag_category
  defineHulyTool({
    name: "create_tag_category",
    label: "Create tag category",
    description: "Create tag category.",
    parameters: z.object({
      workspace: workspaceParam,
      label: z.string(),
      targetClass: z.optional(z.string()),
    }),
    async handler(params, tctx) {
      const id = await tctx.client.createDoc(TAG_CATEGORY_CLASS, WORKSPACE_SPACE, {
        label: params.label,
        targetClass: params.targetClass,
        // T-77: defaults (trusted createTagCategory).
        icon: "",
        tags: [],
        default: false,
      } as never);
      return {
        content: `Created tag category "${params.label}".`,
        details: { id, label: params.label },
      };
    },
  }),

  // 3. update_tag_category
  defineHulyTool({
    name: "update_tag_category",
    label: "Update tag category",
    description: "Update tag category (label, targetClass).",
    parameters: z.object({
      workspace: workspaceParam,
      category: z.string(),
      label: z.optional(z.string()),
      targetClass: z.optional(z.string()),
    }),
    async handler(params, tctx) {
      const c = await tctx.client.findOne(TAG_CATEGORY_CLASS, { _id: params.category });
      if (!c) {
        return {
          content: `Tag category "${params.category}" not found.`,
          isError: true,
          details: { category: params.category },
        };
      }
      const ops: Record<string, unknown> = {};
      if (params.label !== undefined) ops.label = params.label;
      if (params.targetClass !== undefined) ops.targetClass = params.targetClass;
      if (Object.keys(ops).length === 0) {
        return { content: "No fields to update.", details: { updated: false } };
      }
      const updResult = await safeUpdateDoc(tctx.client, TAG_CATEGORY_CLASS, c, ops);
      if (!updResult.ok) return updResult.error;
      return {
        content: `Updated tag category ${params.category}.`,
        details: { updated: true, fields: Object.keys(ops) },
      };
    },
  }),

  // 4. delete_tag_category — destructive
  defineHulyTool({
    name: "delete_tag_category",
    label: "Delete tag category",
    description: "Delete tag category (destructive).",
    destructive: true,
    destructiveContext: (p) => ({
      type: "tag category",
      id: (p as { category?: string }).category ?? "<unknown>",
    }),
    parameters: z.object({
      workspace: workspaceParam,
      category: z.string(),
    }),
    async handler(params, tctx) {
      const c = await tctx.client.findOne(TAG_CATEGORY_CLASS, { _id: params.category });
      if (!c) {
        return {
          content: `Tag category "${params.category}" not found.`,
          isError: true,
          details: { category: params.category },
        };
      }
      const delResult = await safeRemoveDoc(tctx.client, TAG_CATEGORY_CLASS, c);
      if (!delResult.ok) return delResult.error;
      return {
        content: `Deleted tag category ${params.category}.`,
        details: { deleted: true, category: params.category },
      };
    },
  }),
];
