// tools/domains/document-snapshots.ts — Document snapshots domain (2 tools).
// Design: 06-api.md §4 Snapshots. Read-only version history.
//
// T-66 (2026-07-28): RE-ENABLE từ honest-unavailable (T-58 conclusion sai).
// Real class registered trong @hcengineering/document plugin() block —
// `document:class:DocumentSnapshot`. Verified vs trusted huly-mcp v0.45
// (document-snapshots.ts:74,80,95,121,139 dùng documentPlugin.class.DocumentSnapshot).
// Snapshot content = MarkupBlobRef → fetchMarkup.

import { z } from "zod";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { DOCUMENT_SNAPSHOT_CLASS } from "./_class-refs.js";
import { workspaceParam } from "./_common.js";
import type { DocumentSnapshotDoc } from "./_entity-types.js";

export const tools: HulyToolDefinition[] = [
  // 1. list_document_snapshots — T-66: RE-ENABLED (DOCUMENT_SNAPSHOT_CLASS)
  defineHulyTool({
    name: "list_document_snapshots",
    label: "List document snapshots",
    description: "List document snapshots (version history) for a document.",
    parameters: z.object({
      workspace: workspaceParam,
      document: z.string().describe("Document id."),
      limit: z.optional(z.number().describe("Max snapshots to return.")),
    }),
    async handler(params, tctx) {
      // T-85 #120: sort newest-first (trusted createdOn: Descending). T-90: native DocumentSnapshotDoc.
      const snaps = await tctx.client.findAll<DocumentSnapshotDoc>(
        DOCUMENT_SNAPSHOT_CLASS,
        { attachedTo: params.document },
        {
          sort: { createdOn: -1 },
          ...(params.limit !== undefined ? { limit: params.limit } : {}),
        },
      );
      // T-99 (#145): field `_id` (KHÔNG `snapshotId`) — appendDetailsForLLM chỉ
      // serialize identifier/_id/id → `snapshotId` bị drop → get_document_snapshot
      // unreachable (dead-end).
      const list = snaps.map((snap) => ({
        _id: snap._id,
        documentId: params.document,
        title: snap.title,
        parentDocumentId: snap.parent,
        createdOn: snap.createdOn,
        modifiedOn: snap.modifiedOn,
      }));
      return {
        content: `Found ${list.length} snapshot(s) for document "${params.document}".`,
        details: { count: list.length, snapshots: list },
      };
    },
  }),

  // 2. get_document_snapshot — T-66: RE-ENABLED + fetchMarkup content
  defineHulyTool({
    name: "get_document_snapshot",
    label: "Get document snapshot",
    description: "Get a document snapshot content (markdown) by snapshot id.",
    parameters: z.object({
      workspace: workspaceParam,
      snapshot: z.string().describe("Snapshot id."),
    }),
    async handler(params, tctx) {
      const s = await tctx.client.findOne<DocumentSnapshotDoc>(DOCUMENT_SNAPSHOT_CLASS, {
        _id: params.snapshot,
      });
      if (!s) {
        return {
          content: `Snapshot "${params.snapshot}" not found.`,
          isError: true,
          details: { snapshot: params.snapshot },
        };
      }
      // Snapshot content = MarkupBlobRef → fetchMarkup resolve to markdown.
      const contentRef = s.content;
      let content: string | undefined;
      if (contentRef) {
        try {
          content = await tctx.client.fetchMarkup(
            DOCUMENT_SNAPSHOT_CLASS,
            s._id,
            "content",
            contentRef,
            "markdown",
          );
        } catch {
          // Markup fetch fail — return metadata without content.
        }
      }
      // T-99 (#145): body vào content (clone get_document T-88 #123). Trước đây
      // body chỉ trong details.content → appendDetailsForLLM skip → LLM mất body.
      const header = `Snapshot ${s.title ?? s._id}${s.createdOn ? ` · ${new Date(s.createdOn).toISOString()}` : ""}`;
      return {
        content: content !== undefined ? `${header}\n\n---\n${content}` : header,
        details: {
          _id: s._id,
          documentId: s.attachedTo,
          title: s.title,
          parentDocumentId: s.parent,
          createdOn: s.createdOn,
          modifiedOn: s.modifiedOn,
          content,
        },
      };
    },
  }),
];
