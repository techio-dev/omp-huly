// tools/domains/attachments.ts — Attachments domain (5 tools).
// Design: 06-api.md §4 Attachments.

import { z } from "zod";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { ATTACHMENT_CLASS, ISSUE_CLASS, spaceRef } from "./_class-refs.js";
import { workspaceParam, projectParam, identifierParam, resolveIdentifier } from "./_common.js";

export const tools: HulyToolDefinition[] = [
  // 1. list_attachments
  defineHulyTool({
    name: "list_attachments",
    label: "List attachments",
    description: "List attachments attached to entity.",
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
      const atts = await tctx.client.findAll(ATTACHMENT_CLASS, { attachedTo: issue._id }, {});
      const list = atts.map((a) => ({
        _id: a._id,
        name: (a as { name?: string }).name ?? "",
        type: (a as { type?: string }).type, // T-75: field `type` (KHÔNG contentType)
        size: (a as { size?: number }).size,
      }));
      return {
        content: `Found ${list.length} attachment(s).`,
        details: { count: list.length, attachments: list },
      };
    },
  }),

  // 2. get_attachment
  defineHulyTool({
    name: "get_attachment",
    label: "Get attachment",
    description: "Get attachment metadata by id.",
    parameters: z.object({
      workspace: workspaceParam,
      attachment: z.string(),
    }),
    async handler(params, tctx) {
      const a = await tctx.client.findOne(ATTACHMENT_CLASS, { _id: params.attachment });
      if (!a) {
        return {
          content: `Attachment "${params.attachment}" not found.`,
          isError: true,
          details: { attachment: params.attachment },
        };
      }
      return {
        content: `Attachment ${(a as { name?: string }).name ?? ""}`,
        details: {
          _id: a._id,
          name: (a as { name?: string }).name,
          type: (a as { type?: string }).type, // T-75: field `type`
          size: (a as { size?: number }).size,
        },
      };
    },
  }),

  // 3. add_attachment (generic) — T-75: uploadFile → blobId → addCollection
  defineHulyTool({
    name: "add_attachment",
    label: "Add attachment",
    description:
      "Add attachment to entity. Uploads base64 data → blob, attaches via addCollection.",
    parameters: z.object({
      workspace: workspaceParam,
      attachedTo: z.string(),
      attachedToClass: z.optional(
        z.string().describe("Target class (default tracker:class:Issue)."),
      ),
      filename: z.string(),
      contentType: z.string(),
      data: z.optional(z.string().describe("Base64 data (raw, no data: URL prefix).")),
      description: z.optional(z.string()),
    }),
    async handler(params, tctx) {
      if (!params.data) {
        return {
          content: "add_attachment requires `data` (base64).",
          isError: true,
          details: { filename: params.filename },
        };
      }
      if (typeof tctx.client.uploadBlob !== "function") {
        return {
          content: "uploadBlob not available on this transport (use WS).",
          isError: true,
          details: { reason: "storage_not_wired" },
        };
      }
      // T-75: strip data: URL prefix nếu có.
      const b64 = params.data.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(b64, "base64");
      const { blobId, size } = await tctx.client.uploadBlob(
        params.filename,
        buffer,
        params.contentType,
      );
      // T-75: Attachment = AttachedDoc → addCollection (KHÔNG createDoc). Fields
      // {name, file: Ref<Blob>, size, type, lastModified} (KHÔNG contentType/data).
      const targetClass = params.attachedToClass ?? ISSUE_CLASS;
      // T-93b TODO(#139): space nên là attachedTo entity's space (resolve entity →
      // ._id → space). Hiện spaceRef(workspace) = handle string — có thể orphan.
      // add_issue_attachment (project-scoped) đã đúng (issue.space). Generic path
      // defer đến khi cần (ít dùng — đa số attach qua add_issue_attachment).
      const id = await tctx.client.addCollection(
        ATTACHMENT_CLASS,
        spaceRef(tctx.workspace),
        params.attachedTo as never,
        targetClass as never,
        "attachments",
        {
          name: params.filename,
          file: blobId,
          size,
          type: params.contentType,
          lastModified: Date.now(),
          ...(params.description ? { description: params.description } : {}),
        } as never,
      );
      return {
        content: `Added attachment "${params.filename}".`,
        details: { id, filename: params.filename, blobId, size },
      };
    },
  }),

  // 4. add_issue_attachment — issue-specific
  defineHulyTool({
    name: "add_issue_attachment",
    label: "Add issue attachment",
    description: "Add attachment to issue.",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      filename: z.string(),
      contentType: z.string(),
      data: z.optional(z.string()),
      description: z.optional(z.string()),
    }),
    async handler(params, tctx) {
      if (!params.data) {
        return {
          content: "add_issue_attachment requires `data` (base64).",
          isError: true,
          details: { filename: params.filename },
        };
      }
      if (typeof tctx.client.uploadBlob !== "function") {
        return {
          content: "uploadBlob not available on this transport (use WS).",
          isError: true,
          details: { reason: "storage_not_wired" },
        };
      }
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
      const b64 = params.data.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(b64, "base64");
      const { blobId, size } = await tctx.client.uploadBlob(
        params.filename,
        buffer,
        params.contentType,
      );
      const id = await tctx.client.addCollection(
        ATTACHMENT_CLASS,
        issue.space as never,
        issue._id as never,
        ISSUE_CLASS,
        "attachments",
        {
          name: params.filename,
          file: blobId,
          size,
          type: params.contentType,
          lastModified: Date.now(),
          ...(params.description ? { description: params.description } : {}),
        } as never,
      );
      return {
        content: `Added attachment "${params.filename}" to ${params.identifier}.`,
        details: { id, filename: params.filename, identifier: params.identifier, blobId, size },
      };
    },
  }),

  // 5. download_attachment — T-75: getBlob → base64 (KHÔNG đọc field `data`)
  defineHulyTool({
    name: "download_attachment",
    label: "Download attachment",
    description: "Get attachment content (base64). Downloads blob via storageClient.",
    parameters: z.object({
      workspace: workspaceParam,
      attachment: z.string(),
    }),
    async handler(params, tctx) {
      const a = await tctx.client.findOne(ATTACHMENT_CLASS, { _id: params.attachment });
      if (!a) {
        return {
          content: `Attachment "${params.attachment}" not found.`,
          isError: true,
          details: { attachment: params.attachment },
        };
      }
      const fileId = (a as { file?: string }).file;
      if (!fileId) {
        return {
          content: `Attachment "${params.attachment}" has no file blob ref.`,
          isError: true,
          details: { attachment: params.attachment },
        };
      }
      if (typeof tctx.client.getBlob !== "function") {
        return {
          content: "getBlob not available on this transport (use WS).",
          isError: true,
          details: { reason: "storage_not_wired" },
        };
      }
      const buffer = await tctx.client.getBlob(fileId);
      return {
        content: `Attachment ${(a as { name?: string }).name ?? ""} downloaded.`,
        details: {
          _id: a._id,
          name: (a as { name?: string }).name,
          type: (a as { type?: string }).type,
          size: (a as { size?: number }).size,
          data: buffer.toString("base64"),
        },
      };
    },
  }),
];
