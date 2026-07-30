// Common Zod schemas cho domain tools — tránh lặp.
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
 * Huly identifier format. Vd "PD-123" hoặc "123" (project=PD).
 *
 * Cross-project guard: nếu input có prefix "<X>-<num>" mà X != project →
 * throw Error (KHÔNG silently query sai project). Caller catch → isError.
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
  const project = await client.findOne(PROJECT_CLASS, { identifier: projectIdentifier });
  return project?._id;
}

/**
 * T-71: Resolve IssueStatus docs cho project qua ProjectType.statuses traversal.
 * Flow: Project → project.type (Ref<ProjectType>) → ProjectType.statuses
 * (Ref<IssueStatus>[]) → resolve docs. Trả {statuses, defaultStatusId}.
 *
 * category Ref<StatusCategory> → enum key (strip `*:statusCategory:` prefix).
 * isDefault = status._id === project.defaultIssueStatus.
 */
export async function getProjectStatuses(
  client: HulyClient,
  projectIdentifier: string,
): Promise<
  | { statuses: Array<{ _id: string; name: string; category: string; isDefault: boolean }> }
  | undefined
> {
  const project = await client.findOne(PROJECT_CLASS, {
    identifier: projectIdentifier,
  } as never);
  if (!project) return undefined;
  const projectTypeRef = (project as { type?: string }).type;
  if (!projectTypeRef) return { statuses: [] };
  const projectType = await client.findOne(PROJECT_TYPE_CLASS, { _id: projectTypeRef } as never);
  // ProjectType.statuses = ProjectStatus[] (objects {_id: Ref<Status>, taskType, ...}),
  // KHÔNG Ref[] — extract ._id trước (trusted issues-shared.ts:157 .map(s => s._id)).
  const rawStatuses =
    (projectType as { statuses?: Array<{ _id?: string }> } | null)?.statuses ?? [];
  const statusRefs = rawStatuses
    .map((s) => s._id)
    .filter((r): r is string => typeof r === "string");
  const defaultStatusId = (project as { defaultIssueStatus?: string }).defaultIssueStatus ?? "";
  // T-81 #104: resolve statuses qua core.class.Status + batch $in (KHÔNG
  // findOne IssueStatus per ref N+1 — trusted né: "can fail on some workspaces").
  let statuses: Array<{ _id: string; name: string; category: string; isDefault: boolean }> = [];
  if (statusRefs.length > 0) {
    const statusDocs = (await client.findAll(STATUS_CLASS, {
      _id: { $in: statusRefs },
    } as never)) as Array<{ _id?: string; name?: string; category?: string }>;
    statuses = statusRefs
      .map((ref) => {
        const s = statusDocs.find((d) => d._id === ref);
        if (!s) return null;
        const rawCat = s.category ?? "";
        return {
          _id: ref,
          name: s.name ?? "",
          category: rawCat.split(":").pop() ?? rawCat,
          isDefault: ref === defaultStatusId,
        };
      })
      .filter(
        (x): x is { _id: string; name: string; category: string; isDefault: boolean } => x !== null,
      );
  }
  return { statuses };
}

export function resolveIdentifier(project: string, identifier: string): string {
  if (/^\d+$/.test(identifier)) {
    return `${project}-${identifier}`;
  }
  // Check cross-project: input "FOO-5" nhưng tool scoped ở "PD"
  const m = /^([A-Za-z]+)-(\d+)$/.exec(identifier);
  if (m && m[1] !== project) {
    throw new Error(
      `Cross-project identifier not allowed: "${identifier}" (tool scoped to project "${project}")`,
    );
  }
  return identifier;
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
 * (plain text cũ HOẶC rỗng). Caller fallback về raw content.
 *
 * Huly content field có thể là:
 *   - JSON markup string (mới): `'{"type":"doc",...}'`
 *   - Plain text (cũ): `"hello"`
 *   - Empty: `""`
 */
export function parseMarkupSafe(content: unknown): unknown {
  if (typeof content !== "string" || content.length === 0) return null;
  if (!content.startsWith("{")) return null;
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
  const docId =
    typeof doc === "object" && doc !== null ? (doc as { _id?: unknown })._id : undefined;
  return {
    content:
      `Cannot update ${_class}: doc record missing "${missingField}" field (schema drift). ` +
      `Update skipped to prevent silent no-op.`,
    isError: true,
    details: {
      _class,
      docId,
      missingField,
      ...(typeof doc === "object" && doc !== null ? { docRecord: doc } : {}),
    },
  };
}

/**
 * Validate doc có `.space` + `._id` field (string/ref). Return extracted hoặc
 * undefined nếu schema drift.
 */
function extractDocRefs(
  doc: unknown,
): { space: Ref<Space>; objectId: string } | { missing: "space" | "_id" } {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    return { missing: "space" }; // doc không hợp lệ → guard space first
  }
  const d = doc as { space?: unknown; _id?: unknown };
  if (d.space === undefined || d.space === null) return { missing: "space" };
  if (d._id === undefined || d._id === null) return { missing: "_id" };
  return { space: d.space as Ref<Space>, objectId: d._id as string };
}

/**
 * safeUpdateDoc — updateDoc với schema drift guard.
 *
 * @param client HulyClient đã kết nối
 * @param _class Class ref (vd tracker:class:Issue)
 * @param doc Doc ĐÃ LOOKUP (caller findOne trước). Helper extract .space/._id.
 * @param operations DocumentUpdate ops
 * @returns Discriminated union: ok → TxResult | !ok → isError result (return thẳng)
 *
 * Pattern T-50 (workspace.ts:155-173) centralized.
 */
export async function safeUpdateDoc<T extends Doc>(
  client: HulyClient,
  _class: Ref<Class<T>>,
  doc: unknown,
  operations: DocumentUpdate<T>,
): Promise<SafeWriteOk | SafeWriteErr> {
  const refs = extractDocRefs(doc);
  if ("missing" in refs) {
    return { ok: false, error: schemaDriftError(_class as string, doc, refs.missing) };
  }
  const result = await client.updateDoc(
    _class,
    refs.space,
    refs.objectId as Ref<T>,
    operations as never,
  );
  return { ok: true, result };
}

/**
 * safeRemoveDoc — removeDoc với schema drift guard.
 *
 * @param client HulyClient đã kết nối
 * @param _class Class ref
 * @param doc Doc ĐÃ LOOKUP. Helper extract .space/._id.
 * @returns Discriminated union: ok → TxResult | !ok → isError result
 */
export async function safeRemoveDoc<T extends Doc>(
  client: HulyClient,
  _class: Ref<Class<T>>,
  doc: unknown,
): Promise<SafeWriteOk | SafeWriteErr> {
  const refs = extractDocRefs(doc);
  if ("missing" in refs) {
    return { ok: false, error: schemaDriftError(_class as string, doc, refs.missing) };
  }
  const result = await client.removeDoc(_class, refs.space, refs.objectId as Ref<T>);
  return { ok: true, result };
}
