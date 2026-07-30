// tools/domains/spaces.ts — Spaces domain (5 tools).
// Design: 06-api.md §4 Spaces. Read-heavy + update.

import { z } from "zod";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { SPACE_CLASS } from "./_class-refs.js";
import { workspaceParam, safeUpdateDoc } from "./_common.js";

export const tools: HulyToolDefinition[] = [
  // 1. list_spaces
  defineHulyTool({
    name: "list_spaces",
    label: "List spaces",
    description: "List Huly spaces (teamspaces + tracker spaces).",
    parameters: z.object({
      workspace: workspaceParam,
      includeArchived: z.optional(
        z.boolean().describe("Include archived spaces (default false)."),
      ),
    }),
    async handler(params, tctx) {
      // T-81G #107: archived-filter default + widen output (class, privacy).
      const query: Record<string, unknown> =
        params.includeArchived === true ? {} : { archived: { $ne: true } };
      const spaces = await tctx.client.findAll(SPACE_CLASS, query as never, {});
      const list = spaces.map((s) => ({
        _id: s._id,
        name: (s as { name?: string }).name ?? "",
        description: (s as { description?: string }).description,
        class: (s as { _class?: string })._class,
        private: (s as { private?: boolean }).private === true,
        archived: (s as { archived?: boolean }).archived === true,
      }));
      return {
        content: `Found ${list.length} space(s).`,
        details: { count: list.length, spaces: list },
      };
    },
  }),

  // 2. get_space
  defineHulyTool({
    name: "get_space",
    label: "Get space",
    description: "Get space by id.",
    parameters: z.object({
      workspace: workspaceParam,
      space: z.string(),
    }),
    async handler(params, tctx) {
      // T-81G #107: name-fallback — _id trước, exact name sau, ambiguous → isError.
      let s = (await tctx.client.findOne(SPACE_CLASS, { _id: params.space })) as {
        _id: string;
        _class?: string;
        name?: string;
        description?: string;
        private?: boolean;
        archived?: boolean;
      } | null;
      if (!s) {
        const byName = (await tctx.client.findAll(SPACE_CLASS, {
          name: params.space,
        } as never)) as Array<{
          _id: string;
          _class?: string;
          name?: string;
        }>;
        if (byName.length === 0) {
          return {
            content: `Space "${params.space}" not found (by _id or name).`,
            isError: true,
            details: { space: params.space },
          };
        }
        if (byName.length > 1) {
          return {
            content: `Space name "${params.space}" ambiguous (${byName.length} matches). Use _id.`,
            isError: true,
            details: {
              space: params.space,
              candidates: byName.map((x) => ({ _id: x._id, name: x.name })),
            },
          };
        }
        s = byName[0]!;
      }
      return {
        content: `Space ${s.name ?? ""}`,
        details: {
          _id: s._id,
          name: s.name,
          description: s.description,
          class: s._class,
          private: s.private === true,
          archived: s.archived === true,
        },
      };
    },
  }),

  // 3. list_space_types — T-73: honest-unavailable (fabricated data removed).
  // Space types = SpaceTypeDescriptor config (drive/class注册), KHÔNG query tự do.
  // Pi-huly KHÔNG bundle drive plugin → KHÔNG access descriptors honestly.
  defineHulyTool({
    name: "list_space_types",
    label: "List space types",
    description:
      "UNAVAILABLE — space types = SpaceTypeDescriptor config (drive plugin not " +
      "bundled). Create/browse spaces via Huly UI.",
    parameters: z.object({ workspace: workspaceParam }),
    async handler(_params, _tctx) {
      return {
        content:
          "list_space_types KHÔNG khả dụng: space types = SpaceTypeDescriptor " +
          "config registered qua drive plugin (pi-huly KHÔNG bundle drive). " +
          "Browse/create spaces qua Huly UI trực tiếp.",
        isError: true,
        details: { reason: "spacetype_descriptor_inaccessible" },
      };
    },
  }),

  // 4. get_space_type — T-73: honest-unavailable
  defineHulyTool({
    name: "get_space_type",
    label: "Get space type",
    description:
      "UNAVAILABLE — space type = SpaceTypeDescriptor config (drive plugin not " +
      "bundled). Browse via Huly UI.",
    parameters: z.object({
      workspace: workspaceParam,
      spaceType: z.string(),
    }),
    async handler(_params, _tctx) {
      return {
        content:
          "get_space_type KHÔNG khả dụng: space type = SpaceTypeDescriptor config " +
          "(drive plugin not bundled). Browse via Huly UI.",
        isError: true,
        details: { reason: "spacetype_descriptor_inaccessible" },
      };
    },
  }),

  // 5. update_space
  defineHulyTool({
    name: "update_space",
    label: "Update space",
    description: "Update space (name, description, private, archived, autoJoin).",
    parameters: z.object({
      workspace: workspaceParam,
      space: z.string(),
      name: z.optional(z.string()),
      description: z.optional(z.union([z.string(), z.null()])),
      // T-81G #107: add private, archived, autoJoin (trusted có 5 fields).
      private: z.optional(z.boolean()),
      archived: z.optional(z.boolean()),
      autoJoin: z.optional(z.boolean()),
    }),
    async handler(params, tctx) {
      const s = await tctx.client.findOne(SPACE_CLASS, { _id: params.space });
      if (!s) {
        return {
          content: `Space "${params.space}" not found.`,
          isError: true,
          details: { space: params.space },
        };
      }
      const ops: Record<string, unknown> = {};
      if (params.name !== undefined) ops.name = params.name;
      if (params.description !== undefined) {
        if (params.description === null) ops.$unset = { description: "" };
        else ops.description = params.description;
      }
      if (params.private !== undefined) ops.private = params.private;
      if (params.archived !== undefined) ops.archived = params.archived;
      if (params.autoJoin !== undefined) ops.autoJoin = params.autoJoin;
      if (Object.keys(ops).length === 0) {
        return { content: "No fields to update.", details: { updated: false } };
      }
      const updResult = await safeUpdateDoc(tctx.client, SPACE_CLASS, s, ops);
      if (!updResult.ok) return updResult.error;
      const fields = Object.keys(ops).filter((f) => f !== "$unset");
      if (ops.$unset !== undefined) fields.push("description(clear)");
      return {
        content: `Updated space ${params.space}: ${fields.join(", ")}`,
        details: { updated: true, fields },
      };
    },
  }),
];
