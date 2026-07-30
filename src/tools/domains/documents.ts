// tools/domains/documents.ts — Documents/Teamspaces domain (10 tools).
// Design: 06-api.md §4 Documents/Teamspaces. Teamspace + Document CRUD.
//
// T-66 (2026-07-28): RE-ENABLE từ honest-unavailable (T-58/T-60 conclusion sai).
// Real class registered trong @hcengineering/document plugin() block — verified
// vs trusted huly-mcp v0.45. Class refs từ _class-refs.ts (T-65 fix):
//   TEAMSPACE_CLASS = document:class:Teamspace
//   DOCUMENT_CLASS  = document:class:Document
//
// Teamspace model (verified trusted documents.ts):
//   - findAll/findOne TEAMSPACE_CLASS (KHÔNG SPACE_CLASS — trả cross all spaces)
//   - CRUD space param = core.space.Space (root, top-level space parent)
//   - fields: name, description, private, archived, members, owners
//   - create needs icon (documentPlugin.icon.Teamspace) + spaceType
//     (documentPlugin.spaceType.DefaultTeamspaceType) — Ref values từ document
//     plugin, pi-huly KHÔNG bundle → create_teamspace stays honest-unavailable.
//
// Document model (verified trusted documents-edit.ts):
//   - findAll/findOne DOCUMENT_CLASS + space=teamspace._id (scoping)
//   - content = MarkupBlobRef → fetchMarkup (get) / uploadMarkup (create+edit).
//     Library KHÔNG có updateMarkup — edit = uploadMarkup + updateDoc (new ref).
//   - parent: Ref<Document> (document hierarchy), rank (lexorank)

import { z } from "zod";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import {
  TEAMSPACE_CLASS,
  TEAMSPACE_ICON,
  DEFAULT_TEAMSPACE_TYPE,
  SPACE_PARENT,
  DOCUMENT_CLASS,
} from "./_class-refs.js";
import { workspaceParam, limitParam, safeRemoveDoc } from "./_common.js";
import type { TeamspaceDoc, DocumentDoc } from "./_entity-types.js";

/** Teamspace CRUD space = core.space.Space (root, top-level space parent). */
const TEAMSPACE_PARENT_SPACE = SPACE_PARENT;

export const tools: HulyToolDefinition[] = [
  // === Teamspaces (5) ===

  // 1. list_teamspaces — T-66: TEAMSPACE_CLASS (chỉ trả Teamspace, không lẫn Project/Drive)
  defineHulyTool({
    name: "list_teamspaces",
    label: "List teamspaces",
    description: "List teamspaces (document spaces).",
    parameters: z.object({ workspace: workspaceParam, limit: limitParam }),
    async handler(params, tctx) {
      const limit = typeof params.limit === "number" ? params.limit : 50;
      // T-88 #123: sort name Ascending (trusted). T-90: native TeamspaceDoc.
      const spaces = await tctx.client.findAll<TeamspaceDoc>(
        TEAMSPACE_CLASS,
        { archived: false },
        {
          limit,
          sort: { name: 1 },
        },
      );
      const list = spaces.map((s) => ({
        id: s._id,
        name: s.name ?? "",
        description: s.description,
        private: s.private ?? false,
        archived: s.archived ?? false,
      }));
      // T-78: surface ids+names trong content (agent đọc content để resolve).
      const lines = list.map((t) => `- ${t.name} (${t.id})`).join("\n");
      return {
        content:
          list.length === 0
            ? "No teamspaces found."
            : `Found ${list.length} teamspace(s):\n${lines}`,
        details: { count: list.length, teamspaces: list },
      };
    },
  }),

  // 2. get_teamspace — T-66: TEAMSPACE_CLASS
  defineHulyTool({
    name: "get_teamspace",
    label: "Get teamspace",
    description: "Get teamspace by id.",
    parameters: z.object({
      workspace: workspaceParam,
      teamspace: z.string(),
    }),
    async handler(params, tctx) {
      const s = await tctx.client.findOne<TeamspaceDoc>(TEAMSPACE_CLASS, { _id: params.teamspace });
      if (!s) {
        return {
          content: `Teamspace "${params.teamspace}" not found.`,
          isError: true,
          details: { teamspace: params.teamspace },
        };
      }
      // T-88 #123: document count trong teamspace (capped 1000). T-90: native DocumentDoc.
      const docs = await tctx.client.findAll<DocumentDoc>(
        DOCUMENT_CLASS,
        { space: s._id },
        {
          limit: 1000,
        },
      );
      return {
        content: `Teamspace ${s.name ?? ""}`,
        details: {
          id: s._id,
          name: s.name,
          description: s.description,
          private: s.private,
          archived: s.archived ?? false,
          documentCount: docs.length,
        },
      };
    },
  }),

  // 3. create_teamspace — T-78: implement (string-literal icon/spaceType refs).
  // Idempotent: return existing nếu name đã tồn tại (archived:false).
  defineHulyTool({
    name: "create_teamspace",
    label: "Create teamspace",
    description:
      "Create teamspace. Idempotent (returns existing if name exists). " +
      "Returns teamspace id for use in document tools.",
    parameters: z.object({
      workspace: workspaceParam,
      name: z.string(),
      description: z.optional(z.string()),
      private: z.optional(z.boolean()),
    }),
    async handler(params, tctx) {
      // Idempotent: findOne by name (archived:false).
      const existing = await tctx.client.findOne(TEAMSPACE_CLASS, {
        name: params.name,
        archived: false,
      });
      if (existing) {
        return {
          content: `Teamspace "${params.name}" already exists (id ${existing._id}).`,
          details: { id: existing._id, name: params.name, created: false },
        };
      }
      // Account UUID for members/owners.
      const account = await tctx.client.getAccount();
      const uuid = account.uuid as string;
      const id = await tctx.client.createDoc(TEAMSPACE_CLASS, TEAMSPACE_PARENT_SPACE, {
        name: params.name,
        description: params.description ?? "",
        private: params.private ?? false,
        archived: false,
        members: [uuid],
        owners: [uuid],
        icon: TEAMSPACE_ICON,
        type: DEFAULT_TEAMSPACE_TYPE,
      } as never);
      return {
        content: `Created teamspace "${params.name}" (id ${id}).`,
        details: { id, name: params.name, created: true },
      };
    },
  }),

  // 4. update_teamspace — T-66: TEAMSPACE_CLASS + core.space.Space parent
  defineHulyTool({
    name: "update_teamspace",
    label: "Update teamspace",
    description: "Update teamspace (name, description, private).",
    parameters: z.object({
      workspace: workspaceParam,
      teamspace: z.string(),
      name: z.optional(z.string()),
      description: z.optional(z.string()),
      private: z.optional(z.boolean()),
    }),
    async handler(params, tctx) {
      const s = await tctx.client.findOne(TEAMSPACE_CLASS, { _id: params.teamspace });
      if (!s) {
        return {
          content: `Teamspace "${params.teamspace}" not found.`,
          isError: true,
          details: { teamspace: params.teamspace },
        };
      }
      const ops: Record<string, unknown> = {};
      if (params.name !== undefined) ops.name = params.name;
      if (params.description !== undefined) ops.description = params.description;
      if (params.private !== undefined) ops.private = params.private;
      if (Object.keys(ops).length === 0) {
        return { content: "No fields to update.", details: { updated: false } };
      }
      // Teamspace = top-level space, parent space = core.space.Space (root).
      await tctx.client.updateDoc(
        TEAMSPACE_CLASS,
        TEAMSPACE_PARENT_SPACE,
        s._id as never,
        ops as never,
      );
      return {
        content: `Updated teamspace ${params.teamspace}.`,
        details: { updated: true, fields: Object.keys(ops) },
      };
    },
  }),

  // 5. delete_teamspace — destructive. T-66: TEAMSPACE_CLASS + core.space.Space
  defineHulyTool({
    name: "delete_teamspace",
    label: "Delete teamspace",
    description: "Delete teamspace (destructive). Cascade xóa tất cả documents.",
    destructive: true,
    destructiveContext: (p) => ({
      type: "teamspace",
      id: (p as { teamspace?: string }).teamspace ?? "<unknown>",
    }),
    parameters: z.object({
      workspace: workspaceParam,
      teamspace: z.string(),
    }),
    async handler(params, tctx) {
      const s = await tctx.client.findOne(TEAMSPACE_CLASS, { _id: params.teamspace });
      if (!s) {
        return {
          content: `Teamspace "${params.teamspace}" not found.`,
          isError: true,
          details: { teamspace: params.teamspace },
        };
      }
      await tctx.client.removeDoc(TEAMSPACE_CLASS, TEAMSPACE_PARENT_SPACE, s._id as never);
      return {
        content: `Deleted teamspace ${params.teamspace}.`,
        details: { deleted: true, teamspace: params.teamspace },
      };
    },
  }),

  // === Documents (5) — T-66: RE-ENABLED (DOCUMENT_CLASS + space scoping) ===

  // 6. list_documents — T-66: DOCUMENT_CLASS + space=teamspace._id
  defineHulyTool({
    name: "list_documents",
    label: "List documents",
    description: "List documents in a teamspace.",
    parameters: z.object({
      workspace: workspaceParam,
      teamspace: z.string(),
      limit: limitParam,
      titleSearch: z.optional(z.string()),
    }),
    async handler(params, tctx) {
      const ts = await tctx.client.findOne<TeamspaceDoc>(TEAMSPACE_CLASS, {
        _id: params.teamspace,
      });
      if (!ts) {
        return {
          content: `Teamspace "${params.teamspace}" not found.`,
          isError: true,
          details: { teamspace: params.teamspace },
        };
      }
      const limit = typeof params.limit === "number" ? params.limit : 50;
      const query: Record<string, unknown> = { space: ts._id };
      if (params.titleSearch) {
        query.title = { $like: `%${params.titleSearch}%` };
      }
      // T-88 #123: sort modifiedOn Descending + output teamspace/modifiedOn. T-90: native DocumentDoc.
      const docs = await tctx.client.findAll<DocumentDoc>(DOCUMENT_CLASS, query, {
        limit,
        sort: { modifiedOn: -1 },
      });
      const tsName = ts.name ?? params.teamspace;
      const list = docs.map((d) => ({
        id: d._id,
        title: d.title ?? "",
        teamspace: tsName,
        modifiedOn: d.modifiedOn,
      }));
      // T-88 #123 fix: surface titles+ids trong content (giống list_teamspaces).
      // Trước đó chỉ count → LLM/consumer không thấy danh sách.
      const lines = list.map((d) => `- ${d.title || "(untitled)"} (${d.id})`).join("\n");
      return {
        content:
          list.length === 0
            ? `No documents found in teamspace "${tsName}".`
            : `Found ${list.length} document(s) in teamspace "${tsName}":\n${lines}`,
        details: { count: list.length, documents: list },
      };
    },
  }),

  // 7. get_document — T-66: DOCUMENT_CLASS + fetchMarkup content
  defineHulyTool({
    name: "get_document",
    label: "Get document",
    description: "Get document by id with full content (markdown).",
    parameters: z.object({
      workspace: workspaceParam,
      document: z.string(),
    }),
    async handler(params, tctx) {
      const d = await tctx.client.findOne<DocumentDoc>(DOCUMENT_CLASS, { _id: params.document });
      if (!d) {
        return {
          content: `Document "${params.document}" not found.`,
          isError: true,
          details: { document: params.document },
        };
      }
      // Document.content = MarkupBlobRef → fetchMarkup resolve to markdown.
      const contentRef = d.content;
      let content: string | undefined;
      if (contentRef) {
        try {
          content = await tctx.client.fetchMarkup(
            DOCUMENT_CLASS,
            d._id,
            "content",
            contentRef,
            "markdown",
          );
        } catch {
          // Markup fetch fail (blob missing/corrupted) — return metadata without content.
        }
      }
      // T-88 #123: resolve teamspace name + createdOn. T-90: native TeamspaceDoc.
      let teamspaceName: string | undefined;
      if (d.space) {
        const ts = await tctx.client.findOne<TeamspaceDoc>(TEAMSPACE_CLASS, { _id: d.space });
        teamspaceName = ts?.name;
      }
      // T-88 #123 fix: body markdown phải đến content text (LLM đọc document).
      // Trước đó content chỉ = "Document <title>" — body nằm trong details.content
      // (string, KHÔNG array) → appendDetailsForLLM skip → LLM mất body hoàn toàn.
      const titleDisplay = d.title?.trim() || "(untitled)";
      const header = `Document "${titleDisplay}" (id ${d._id})`;
      const body = content ?? "(no content)";
      return {
        content: `${header}\n\n---\n${body}`,
        details: {
          id: d._id,
          title: d.title,
          teamspace: teamspaceName ?? d.space,
          createdOn: d.createdOn,
        },
      };
    },
  }),

  // 8. create_document — T-66: DOCUMENT_CLASS + uploadMarkup content
  defineHulyTool({
    name: "create_document",
    label: "Create document",
    description: "Create document in a teamspace with optional markdown content.",
    parameters: z.object({
      workspace: workspaceParam,
      teamspace: z.string(),
      title: z.string(),
      content: z.optional(z.string().describe("Markdown content.")),
    }),
    async handler(params, tctx) {
      const ts = await tctx.client.findOne(TEAMSPACE_CLASS, { _id: params.teamspace });
      if (!ts) {
        return {
          content: `Teamspace "${params.teamspace}" not found.`,
          isError: true,
          details: { teamspace: params.teamspace },
        };
      }
      // Generate doc id for uploadMarkup (content blob needs id before createDoc).
      const docId = `${DOCUMENT_CLASS as string}.${Math.random().toString(36).slice(2, 12)}`;
      let contentRef: unknown = null;
      if (params.content && params.content.trim() !== "") {
        contentRef = await tctx.client.uploadMarkup(
          DOCUMENT_CLASS,
          docId,
          "content",
          params.content,
          "markdown",
        );
      }
      const newId = await tctx.client.createDoc(
        DOCUMENT_CLASS,
        ts._id as never,
        {
          title: params.title,
          content: contentRef,
        } as never,
        docId as never,
      );
      return {
        content: `Created document "${params.title}" in teamspace "${(ts as { name?: string }).name ?? params.teamspace}".`,
        details: { id: newId, title: params.title, teamspace: ts._id },
      };
    },
  }),

  // 9. edit_document — T-66: DOCUMENT_CLASS + uploadMarkup+updateDoc (no updateMarkup)
  defineHulyTool({
    name: "edit_document",
    label: "Edit document",
    description: "Edit document. Either full content replace OR search-and-replace.",
    parameters: z.object({
      workspace: workspaceParam,
      document: z.string(),
      old_text: z.optional(z.string()),
      new_text: z.optional(z.string()),
      content: z.optional(z.string().describe("Full new content (markdown).")),
      replace_all: z.optional(
        z.boolean().describe("true nếu old_text match nhiều (default false)."),
      ),
    }),
    async handler(params, tctx) {
      const d = await tctx.client.findOne(DOCUMENT_CLASS, { _id: params.document });
      if (!d) {
        return {
          content: `Document "${params.document}" not found.`,
          isError: true,
          details: { document: params.document },
        };
      }
      const existingContentRef = (d as { content?: unknown }).content;
      // T-103 #156: createMarkup (uploadMarkup/createContent rpc) KHÔNG update
      // document đã tồn tại (content unchanged + 0 snapshot). Dùng updateMarkup
      // (updateContent rpc) — edit operation đúng cho existing doc content.
      const saveContent = async (text: string): Promise<void> => {
        await tctx.client.updateMarkup!(DOCUMENT_CLASS, d._id, "content", text, "markdown");
      };

      // Mode validation: content vs old_text/new_text mutually exclusive.
      if (params.content !== undefined && (params.old_text || params.new_text)) {
        return {
          content: "edit_document: content cannot combine with old_text/new_text.",
          isError: true,
          details: { document: params.document },
        };
      }

      // Mode 1: full content replace.
      if (params.content !== undefined) {
        const newContent = params.content.trim() === "" ? "" : params.content;
        await saveContent(newContent);
        return {
          content: `Updated document ${params.document} content.`,
          details: { updated: true, mode: "content-replace", document: d._id },
        };
      }

      // Mode 2: search-and-replace.
      if (params.old_text !== undefined && params.new_text !== undefined) {
        if (!existingContentRef) {
          return {
            content: `Document "${params.document}" has no content to search.`,
            isError: true,
            details: { document: params.document },
          };
        }
        const current = await tctx.client.fetchMarkup(
          DOCUMENT_CLASS,
          d._id,
          "content",
          existingContentRef,
          "markdown",
        );
        const idx = current.indexOf(params.old_text);
        if (idx === -1) {
          return {
            content: `Text not found in document "${params.document}".`,
            isError: true,
            details: { document: params.document, search: params.old_text },
          };
        }
        const occurrences = current.split(params.old_text).length - 1;
        if (occurrences > 1 && !params.replace_all) {
          return {
            content: `Text matches ${occurrences} times. Set replace_all=true to replace all.`,
            isError: true,
            details: { document: params.document, matches: occurrences },
          };
        }
        const updated = params.replace_all
          ? current.split(params.old_text).join(params.new_text)
          : current.substring(0, idx) +
            params.new_text +
            current.substring(idx + params.old_text.length);
        await saveContent(updated);
        return {
          content: `Updated document ${params.document} (search-replace).`,
          details: {
            updated: true,
            mode: "search-replace",
            replaced: params.replace_all ? occurrences : 1,
            document: d._id,
          },
        };
      }

      return {
        content: "edit_document: provide content OR old_text+new_text.",
        isError: true,
        details: { document: params.document },
      };
    },
  }),

  // 10. delete_document — destructive. T-66: DOCUMENT_CLASS + space from doc
  defineHulyTool({
    name: "delete_document",
    label: "Delete document",
    description: "Delete document (destructive).",
    destructive: true,
    destructiveContext: (p) => ({
      type: "document",
      id: (p as { document?: string }).document ?? "<unknown>",
    }),
    parameters: z.object({
      workspace: workspaceParam,
      document: z.string(),
    }),
    async handler(params, tctx) {
      const d = await tctx.client.findOne(DOCUMENT_CLASS, { _id: params.document });
      if (!d) {
        return {
          content: `Document "${params.document}" not found.`,
          isError: true,
          details: { document: params.document },
        };
      }
      const delResult = await safeRemoveDoc(tctx.client, DOCUMENT_CLASS, d);
      if (!delResult.ok) return delResult.error;
      return {
        content: `Deleted document ${params.document}.`,
        details: { deleted: true, document: params.document },
      };
    },
  }),
];
