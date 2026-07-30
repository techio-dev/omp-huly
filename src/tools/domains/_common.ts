// Common typebox schemas cho domain tools — tránh lặp.
// 06-api.md §2 Common Parameters Convention.

import { z } from "zod";
import type { Class, Doc, DocumentUpdate, Ref, Space, TxResult } from "@hcengineering/api-client";
import type { HulyClient } from "../../client/client.js";
import type { HulyToolResult } from "../builder.js";
import { PROJECT_CLASS, PROJECT_TYPE_CLASS, STATUS_CLASS } from "./_class-refs.js";

/** Workspace override param (mọi tool). */
export const workspaceParam = z.optional(
  z.string().describe("Workspace id-handle override (default: cwd-map)."),
);

/** Project override param (project-scoped tools). */
export const projectParam = z.optional(
  z.string().describe("Huly project identifier (vd PD). Default: cwd-map."),
);

/** Limit param (list tools). Default service-side, pi truncate 50KB/2000 lines. */
export const limitParam = z.optional(
  z.number().int().describe("Max results (default: 50).").min(1),
);

/** Identifier param (issue). vd "PD-123" HOẶC raw num. */
export const identifierParam = z.string().describe('Issue identifier (vd "PD-123") hoặc raw number.');

/** Priority enum (create/update issue). */
export const prioritySchema = z.optional(
  z.enum(["urgent", "high", "medium", "low", "no-priority"]),
);

/** statusCategory enum (list/update issue, derived). */
export const statusCategorySchema = z.optional(
  z.enum(["UnStarted", "ToDo", "Active", "Won", "Lost"]),
);

/** Base params mọi tool có: workspace?. */
export function baseParams() {
  return z.object({ workspace: workspaceParam });
}

/**
 * Project base params: workspace? + project?.
 * Domain tool extend thêm field riêng.
 */
export function projectParams() {
  return z.object({ workspace: workspaceParam, project: projectParam });
}

/**
 * Resolve issue identifier: "<PROJ>-<num>" → as-is; raw num → "<project>-<num>".
 * Caller phải đảm bảo project resolved (tool params có project field + builder validate).
 */
/**
 * T-71: Resolve project _id (= space cho AttachedDoc scoping) từ identifier.
 * Project._id === Project.space (self-ref — T-67 confirmed). Trả undefined nếu
 * project không tồn tại (caller → isError).
 */
export async function getProjectSpace(
  client: HulyClient,
  projectIdentifier: string,
): Promise<string | undefined> {
  const project = await client.findDoc(PROJECT_CLASS, projectIdentifier);
  if (!project) return undefined;
  // Project._id === space (T-67), cast string cho client API
  return project.space as string;
}

/**
 * T-71: Resolve IssueStatus docs cho project qua ProjectType.statuses traversal.
 * Return undefined nếu project không tồn tại hoặc statuses array rỗng.
 */
export async function getProjectStatuses(
  client: HulyClient,
  projectIdentifier: string,
): Promise<
  | { statuses: Array<{ _id: string; name: string; category: string; isDefault: boolean }> }
  | undefined
> {
  const project = await client.findDoc(PROJECT_CLASS, projectIdentifier);
  if (!project) return undefined;

  const projectType = await client.findDoc(PROJECT_TYPE_CLASS, project.type);
  if (!projectType) return undefined;

  const statusIds = projectType.statuses;
  if (!statusIds || statusIds.length === 0) return undefined;

  const statuses = await client.findDocs(STATUS_CLASS, statusIds);
  return {
    statuses: statuses.map((s) => ({
      _id: s._id,
      name: s.name,
      category: s.category,
      isDefault: s.isDefault ?? false,
    })),
  };
}

export function resolveIdentifier(project: string, identifier: string): string {
  // Nếu identifier đã có dash → assume format "<PROJ>-<NUM>" → return as-is
  if (identifier.includes("-")) return identifier;
  // raw num → prefix với project
  return `${project}-${identifier}`;
}

/**
 * Escape SQL LIKE wildcards (% _ \) trong search pattern — tránh injection.
 * Huly $like dùng PostgreSQL LIKE semantics.
 */
export function escapeLikePattern(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Parse Huly markup JSON safe — return null nếu content không phải JSON markup
 * (text, object markup, hoặc malformed JSON). Tránh JSON.parse throw khi user
 * input không phải markup (Tool output text thoải mái, markup strict).
 */
export function parseMarkupSafe(content: unknown): unknown {
  if (typeof content !== "string") return null;
  if (!content.startsWith("{") && !content.startsWith("[")) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// === T-63 #68: safeUpdateDoc / safeRemoveDoc — schema drift guard ===
//
// Khi tool gọi `client.updateDoc(_class, space, objectId, ops)` / `removeDoc(...)`
// với `space` HOẶC `objectId` là `undefined` (data corruption, partial import,
// schema drift), Huly server KHÔNG throw mà **skip silently** transaction
// (ModelDb tìm doc theo `_id + space` không match) → update KHÔNG persist
// (silent data loss, giống bug #36/#40 đã fix T-47/T-50).
//
// Helper centralize pattern T-50 (workspace.ts:155-173 — schema drift guard):
// nhận doc ĐÃ LOOKUP (KHÔNG nhận space/objectId riêng — ép caller lấy từ doc),
// tự extract `.space` / `._id` + guard undefined → return isError rõ ràng
// (KHÔNG gửi updateDoc). Migration 42 call site sang helper (audit hardening).
//
// Discriminated union return: caller pattern:
//   const result = await safeUpdateDoc(client, CLASS, doc, ops);
//   if (!result.ok) return result.error; // isError sẵn sàng return cho LLM
//   // result.result = TxResult

/** Result khi guard pass — gọi updateDoc/removeDoc thành công. */
type SafeWriteOk = { ok: true; result: TxResult };
/** Result khi guard fail — schema drift, KHÔNG gửi write. */
type SafeWriteErr = { ok: false; error: HulyToolResult };

/**
 * Build error result cho schema drift guard. Message include _class + docId
 * (nếu có) cho debug. Details structured cho render.
 */
function schemaDriftError(
  _class: string,
  doc: unknown,
  missingField: "space" | "_id",
): HulyToolResult {
  const docId = (doc as Doc)._id;
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `Schema drift: missing ${missingField} field for ${_class}${docId ? ` doc ${docId}` : ""}. Data may be corrupted or partially imported. Operation cancelled.`,
      },
    ],
    details: { _class, docId, missing: missingField },
  };
}

/**
 * Validate doc có `.space` + `._id` field (string/ref). Return extracted hoặc
 * undefined nếu schema drift.
 */
function extractDocRefs(
  doc: unknown,
): { space: Ref<Space>; objectId: string } | { missing: "space" | "_id" } {
  if (doc === null || typeof doc !== "object") return { missing: "_id" };
  const d = doc as Doc;

  if (!d.space) return { missing: "space" };
  if (!d._id) return { missing: "_id" };
  if (typeof d.space !== "object") return { missing: "space" }; // must be Ref
  if (typeof d._id !== "string") return { missing: "_id" };

  return { space: d.space, objectId: d._id };
}

/**
 * safeUpdateDoc — updateDoc với schema drift guard.
 * Return { ok: true, result } hoặc { ok: false, error } (caller check ok → return error).
 */
export async function safeUpdateDoc<T extends Doc>(
  client: HulyClient,
  _class: Ref<Class<T>>,
  doc: unknown,
  operations: DocumentUpdate<T>,
): Promise<SafeWriteOk | SafeWriteErr> {
  const refs = extractDocRefs(doc);
  if ("missing" in refs) {
    return { ok: false, error: schemaDriftError(_class.name, doc, refs.missing) };
  }

  const result = await client.updateDoc(_class, refs.space, refs.objectId, operations);
  return { ok: true, result };
}

/**
 * safeRemoveDoc — removeDoc với schema drift guard.
 * Return { ok: true, result } hoặc { ok: false, error } (caller check ok → return error).
 */
export async function safeRemoveDoc<T extends Doc>(
  client: HulyClient,
  _class: Ref<Class<T>>,
  doc: unknown,
): Promise<SafeWriteOk | SafeWriteErr> {
  const refs = extractDocRefs(doc);
  if ("missing" in refs) {
    return { ok: false, error: schemaDriftError(_class.name, doc, refs.missing) };
  }

  const result = await client.removeDoc(_class, refs.space, refs.objectId);
  return { ok: true, result };
}