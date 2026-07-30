// toolBuilder — single seam cho mọi Huly tool (defineHulyTool).
// Design: 04-system.md §6 tools/builder.ts, 06-api.md §1 Tool Interface Pattern,
// 01-vision §B.4 D4 (~102 tools), §B.5 D5 (huly_ prefix).
//
// defineHulyTool tự động:
//   - prefix `huly_` (D5 FR-02)
//   - resolve workspace + project từ params (FR-06 chain: explicit > cwd-map)
//   - getClient từ pool (D14 shared)
//   - error map → AgentToolResult isError (FR-14, 08 §A no-leak)
//   - confirm gate nếu destructive (FR-09 D9)
//   - assignee default cho tool khai báo needsAssignee (D15 FR-18)
//
// Domain module chỉ khai báo opts (schema + handler thuần), builder lo phần binding.

import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import type { Static, TObject } from "typebox";
import { getClient } from "../client/pool.js";
import { mapError, sanitize } from "../client/errors.js";
import type { HulyClient, CurrentUser } from "../client/client.js";
import {
  resolveProject,
  resolveWorkspace,
  NeedsDisambiguationError,
  NeedsInitError,
  type ResolverCtx,
} from "../config/resolver.js";
import { confirmDestructive, type ConfirmContext } from "./confirm.js";

/** Tool parameter schema phải là TObject (Type.Object) cho LLM-callable. */
export type ToolParams = TObject;

/** Error class identifier (re-export từ errors.ts — single source). */
export type { ErrorClass, HulyError } from "../client/errors.js";

/**
 * Huly tool context — passed vào handler sau khi builder resolve binding.
 * Handler nhận client đã kết nối + resolved workspace/project, KHÔNG phải tự lookup.
 */
export interface HulyToolContext {
  /** Pi extension context (ui, cwd, hasUI, ...). */
  ctx: ExtensionContext;
  /** Resolved workspace id-handle (đã qua FR-06 chain). */
  workspace: string;
  /** Resolved project identifier (FR-06 chain; undefined nếu tool không cần project). */
  project: string | undefined;
  /** Current user (cached sau getClient — D15 default assignee source). */
  currentUser: CurrentUser;
  /** HulyClient đã kết nối (cho handler gọi CRUD). */
  client: HulyClient;
}

/**
 * Result trả về từ handler. Builder convert sang AgentToolResult.
 * - `content` text cho LLM (≤ 50KB / 2000 lines — pi truncate)
 * - `details` structured cho render + state (entity shapes từ 05-data-model.md)
 * - `isError?` true → LLM thấy error
 */
export interface HulyToolResult<TDetails = unknown> {
  /** Human-readable text cho LLM. */
  content: string;
  /** Structured details cho render + downstream. */
  details?: TDetails;
  /** True nếu result là error (builder wrap message + isError=true). */
  isError?: boolean;
}

/**
 * Handler signature cho Huly tool.
 * - `params`: validated theo schema (typebox Static<P>)
 * - `toolCtx`: resolved binding (client + workspace + project + user)
 * - Return HulyToolResult (builder convert sang AgentToolResult)
 *
 * TDetails default `unknown` — caller KHÔNG cần khai báo, return type flexible.
 */
export type HulyToolHandler<P extends ToolParams, TDetails = unknown> = (
  params: Static<P>,
  toolCtx: HulyToolContext,
) => Promise<HulyToolResult<TDetails>>;

/** Re-export HulyClient type cho domain consumer. */
export type { HulyClient, CurrentUser } from "../client/client.js";
/** Re-export ResolverCtx cho consumer (test mock). */
export type { ResolverCtx, NeedsInitError, NeedsDisambiguationError } from "../config/resolver.js";

/**
 * defineHulyTool options — domain module chỉ khai báo này.
 * Builder wrap thành ToolDefinition cho pi.registerTool.
 *
 * TDetails default `unknown` — domain KHÔNG cần khai báo. Handler return type flexible
 * (nhiều shape success/error/not-found → TDetails cố định gây union conflict).
 */
export interface DefineHulyToolOptions<P extends ToolParams = ToolParams, TDetails = unknown> {
  /** Tool name KHÔNG có prefix `huly_` — builder tự thêm (D5). VD: "create_issue". */
  name: string;
  /** Human-readable label cho UI. */
  label: string;
  /** Description cho LLM (khi nào gọi, input shape mong đợi). */
  description: string;
  /** Optional 1 dòng snippet cho system prompt "Available tools" section. */
  promptSnippet?: string;
  /** Optional guideline bullets appended to system prompt. */
  promptGuidelines?: string[];
  /** Parameter schema (typebox Type.Object). */
  parameters: P;
  /** Handler thuần — nhận resolved binding, return HulyToolResult. */
  handler: (params: Static<P>, toolCtx: HulyToolContext) => Promise<HulyToolResult<TDetails>>;
  /** True → confirm gate (FR-09 D9). Builder call confirmDestructive trước handler. */
  destructive?: boolean;
  /**
   * Detail object cho confirm prompt (khi destructive=true).
   * Builder call confirmDestructive({ type, id, detail }).
   */
  destructiveContext?: (params: Static<P>) => ConfirmContext;
  /**
   * True → tool cần project resolved (issues/milestones/components/templates).
   * False → tool global (workspaces, search, contacts, ...).
   * Default: false (handler tự resolve nếu cần).
   */
  needsProject?: boolean;
  /**
   * True → tool có assignee?/owner? param cần auto-resolve currentUser khi absent (D15 FR-18).
   * Builder resolve trước khi pass params vào handler (param `assignee` filled).
   */
  needsAssignee?: boolean;
  /**
   * Field name chứa assignee (default "assignee"). Builder fill params[fieldName] = email khi absent.
   */
  assigneeField?: string;
}

/**
 * Pi ToolDefinition-compatible shape (subset — builder output).
 * Domain modules return HulyToolDefinition[]; register.ts call pi.registerTool
 * (cast qua ToolDefinition full khi register — bổ sung execute signature chuẩn).
 */
export interface HulyToolDefinition<P extends ToolParams = ToolParams, TDetails = unknown> {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  parameters: P;
  execute: (
    toolCallId: string,
    params: Static<P>,
    signal: AbortSignal | undefined,
    onUpdate:
      | ((partialResult: {
          content: Array<{ type: "text"; text: string }>;
          details: TDetails;
          isError?: true;
        }) => void)
      | undefined,
    ctx: ExtensionContext,
  ) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    details: TDetails;
    isError?: true;
  }>;
}

/**
 * Build Huly tool từ declaration → pi ToolDefinition-compatible.
 *
 * Flow execute (chạy khi LLM gọi tool):
 *   1. Resolve workspace (params.workspace > cwd-map > NeedsInitError → error result)
 *   2. Resolve project nếu needsProject (params.project > cwd-map > undefined)
 *   3. getClient(workspace) từ pool
 *   4. Nếu needsAssignee + params[fieldName] absent → resolveAssignee (D15)
 *   5. Nếu destructive → confirmDestructive; deny → return "cancelled"
 *   6. Call handler(params, { ctx, client, workspace, project, currentUser })
 *   7. Handler throw → mapError → error result (FR-14, 08 §A no-leak)
 *   8. Handler return HulyToolResult → convert sang AgentToolResult shape
 */
export function defineHulyTool<P extends ToolParams>(
  opts: DefineHulyToolOptions<P, unknown>,
): HulyToolDefinition<P, unknown> {
  const fullName = `huly_${opts.name}`;
  const assigneeField = opts.assigneeField ?? "assignee";
  const needsProject = opts.needsProject === true;
  const needsAssignee = opts.needsAssignee === true;

  return {
    name: fullName,
    label: opts.label,
    description: opts.description,
    promptSnippet: opts.promptSnippet,
    promptGuidelines: opts.promptGuidelines,
    parameters: opts.parameters,

    async execute(_toolCallId, rawParams, _signal, _onUpdate, ctx) {
      const params = { ...(rawParams as Static<P>) } as Record<string, unknown>;
      const resolverCtx: ResolverCtx = { cwd: ctx.cwd };

      // 1. Resolve workspace
      let workspace: string;
      try {
        workspace = await resolveWorkspace(
          typeof params.workspace === "string" ? params.workspace : undefined,
          resolverCtx,
        );
      } catch (e) {
        return toErrorResult(e);
      }

      // 2. Resolve project nếu cần
      let project: string | undefined;
      if (needsProject) {
        try {
          project = await resolveProject(
            typeof params.project === "string" ? params.project : undefined,
            resolverCtx,
          );
        } catch (e) {
          return toErrorResult(e);
        }
      }

      // 3. getClient từ pool
      let client: HulyClient;
      try {
        client = await getClient(workspace);
      } catch (e) {
        return toErrorResult(e);
      }

      // 4. Current user (cached — D15)
      let currentUser: CurrentUser;
      try {
        currentUser = await client.getCurrentUser();
      } catch (e) {
        return toErrorResult(e);
      }

      // 5. Auto-resolve assignee nếu cần + absent (D15 FR-18)
      // Dùng currentUser đã fetch ở step 4 (cached — single source = Huly).
      if (needsAssignee) {
        const current = params[assigneeField];
        if (current === undefined || current === null || current === "") {
          params[assigneeField] = currentUser.email;
        }
      }

      // 6. Confirm gate (FR-09 D9) — non-TUI auto-deny (KHÔNG bypass)
      if (opts.destructive === true) {
        let destructiveCtx: ConfirmContext;
        if (opts.destructiveContext) {
          try {
            destructiveCtx = opts.destructiveContext(rawParams as Static<P>);
          } catch {
            // destructiveContext throw (domain bug) → fallback safe defaults
            destructiveCtx = { type: opts.name, id: "<unknown>" };
          }
        } else {
          destructiveCtx = { type: opts.name, id: "<unknown>" };
        }
        const confirmed = await confirmDestructive(ctx, destructiveCtx);
        if (!confirmed) {
          return {
            content: [
              {
                type: "text",
                text: `Cancelled: ${opts.name} requires confirmation.`,
              },
            ],
            details: { cancelled: true, tool: fullName },
            isError: true,
          };
        }
      }

      // 7. Call handler
      try {
        const result = await opts.handler(params as Static<P>, {
          ctx,
          workspace,
          project,
          currentUser,
          client,
        });
        // 8. Convert HulyToolResult → AgentToolResult shape
        // Sanitize content (08 §A no-leak) — handler có thể return entity có
        // token user paste (vd issue description). Success path cũng strip.
        const contentText = sanitize(result.content);
        // T-92 (#138): LUÔN append details summary vào content cho LLM — KHÔNG
        // gate theo hasUI. Trước đây gate `hasUI !== true` khiến TUI mode drop
        // details cho ~99 tool (chỉ 3 tool có renderResult hook: get_issue /
        // list_issues / get_document), model thấy count-only → không drive được
        // tool follow-up (list_issues không trả identifier, list_tags không _id,
        // fulltext_search không identifier, add_comment/create_todo không id, …).
        // Render hook (3 tool) vẫn consume details cho UI user; content (model)
        // giờ cũng thấy → khác audience, KHÔNG xung đột. Append bị cap
        // LLM_ARRAY_CAP + sanitize mỗi field. Error path KHÔNG append (content
        // error message đã đủ, tránh noise).
        const finalContent =
          result.isError !== true ? appendDetailsForLLM(contentText, result.details) : contentText;
        return {
          content: [{ type: "text", text: finalContent }],
          details: result.details ?? {},
          isError: result.isError === true ? true : undefined,
        };
      } catch (e) {
        return toErrorResult(e);
      }
    },
  };
}

/**
 * Số item tối đa khi serialize array details → content text (T-40).
 * Tránh bloat context khi list trả nhiều (list_issues limit 50, có thể lớn hơn).
 */
const LLM_ARRAY_CAP = 30;

/**
 * Append summary của `details` vào content text cho non-TUI path (T-40 #22 #26).
 *
 * Heuristic shape-aware (KHÔNG schema per-tool — 1 seam generic):
 * - Detect MỌI array field (vd `issues`, `members`, `attachments`, `tags`, ...)
 *   KHÔNG whitelist — iterate toàn bộ keys, kiểm `Array.isArray`. Serialize
 *   cap top `LLM_ARRAY_CAP` + đuôi "... và N khác". Lưu ý: handler nào đặt
 *   array lớn binary/debug vào details (vd `chunks`) cũng sẽ serialize —
 *   domain tránh pattern đó.
 * - Detect field `id`/`_id`/`identifier` (entity vừa create) → append dạng
 *   `id: <val>`.
 * - Bỏ qua field meta trống/count trùng (count đã trong content gốc nhiều case).
 *
 * Return text đã append (content gốc + "\n" + summary). Nếu details rỗng/không
 * có gì hữu ích → return content gốc y nguyên.
 */
function appendDetailsForLLM(content: string, details: unknown): string {
  if (details === null || details === undefined) return content;
  if (typeof details !== "object") return content;
  const d = details as Record<string, unknown>;
  const keys = Object.keys(d);
  if (keys.length === 0) return content;

  const lines: string[] = [];

  // 1. Array fields: serialize cap top items
  const seenArrays = new Set<string>();
  for (const k of keys) {
    const v = d[k];
    if (Array.isArray(v) && v.length > 0) {
      seenArrays.add(k);
      const items = v.slice(0, LLM_ARRAY_CAP);
      const remaining = v.length - items.length;
      const serialized = items
        .map((item, idx) => {
          if (item !== null && typeof item === "object") {
            const obj = item as Record<string, unknown>;
            // Pick most useful fields cho LLM (identifier/id + title/name + status)
            const ident = (obj.identifier ?? obj._id ?? obj.id) as string | undefined;
            const title = (obj.title ?? obj.name ?? obj.label) as string | undefined;
            const status = (obj.status ?? obj.priority) as string | undefined;
            const parts: string[] = [];
            // Sanitize mỗi field (08 §A NFR-04) — details có thể chứa token
            // user paste (vd issue title có secret). Tránh leak qua non-TUI path.
            if (ident !== undefined) parts.push(sanitize(String(ident)));
            if (title !== undefined) parts.push(sanitize(String(title)));
            if (status !== undefined) parts.push(`[${sanitize(String(status))}]`);
            return parts.length > 0 ? `  ${idx + 1}. ${parts.join(" — ")}` : null;
          }
          return `  ${idx + 1}. ${sanitize(String(item))}`;
        })
        .filter((line): line is string => line !== null);
      if (serialized.length > 0) {
        lines.push(`${k} (${v.length}):`);
        lines.push(...serialized);
        if (remaining > 0) {
          lines.push(`  ... và ${remaining} khác.`);
        }
      }
    }
  }

  // 2. Scalar id-like fields (entity create): id/_id/identifier + title/name.
  // CHỈ khi chưa có array nào chiếm chỗ (tránh lặp cho list). Hiển thị TẤT CẢ
  // id-like field (LLM cần `_id` raw cho 1 số tool, `identifier` human-friendly cho
  // tool khác — vd create_issue trả _id internal + identifier PD-42).
  if (seenArrays.size === 0) {
    const idCandidates: Array<[string, unknown]> = [
      ["identifier", d.identifier],
      ["_id", d._id],
      ["id", d.id],
    ];
    const idFields = idCandidates.filter(
      (pair): pair is [string, unknown] => pair[1] !== undefined && pair[1] !== null,
    );
    const parts: string[] = [];
    for (const [k, v] of idFields) {
      const sv = sanitize(String(v));
      // Skip nếu id đã xuất hiện trong content (tránh duplicate)
      if (!content.includes(sv)) {
        parts.push(`${k}: ${sv}`);
      }
    }
    const title = (d.title ?? d.name ?? d.label) as string | undefined;
    if (title !== undefined) {
      const st = sanitize(String(title));
      if (!content.includes(st)) {
        parts.push(`title: ${st}`);
      }
    }
    if (parts.length > 0) {
      lines.push(parts.join(" · "));
    }
  }

  if (lines.length === 0) return content;
  return `${content}\n${lines.join("\n")}`;
}

/**
 * Convert error → AgentToolResult với isError=true (FR-14, 08 §A no-leak).
 * Resolver errors (NeedsInit/NeedsDisambiguation) → clear recovery hint.
 * HulyError khác → mapError classify + sanitize.
 */
function toErrorResult<TDetails = unknown>(
  e: unknown,
): {
  content: Array<{ type: "text"; text: string }>;
  details: TDetails;
  isError: true;
} {
  // Resolver errors — clear hint cho LLM
  if (e instanceof NeedsInitError) {
    return {
      content: [{ type: "text", text: e.message }],
      details: { errorClass: "Auth", kind: "NeedsInit" } as unknown as TDetails,
      isError: true,
    };
  }
  if (e instanceof NeedsDisambiguationError) {
    return {
      content: [
        {
          type: "text",
          text: `Workspace ambiguous: ${e.matches
            .map((m) => `${m.id} (${m.url})`)
            .join(", ")}. Specify workspace param.`,
        },
      ],
      details: {
        errorClass: "Auth",
        kind: "NeedsDisambiguation",
        matches: e.matches,
      } as unknown as TDetails,
      isError: true,
    };
  }

  // HulyError + PlatformError + network → mapError classify + sanitize
  const hulyErr = mapError(e);
  // T-57 #61: UnavailableError (domain not found) → render honest message với
  // class ref thật + recovery hint, distinct generic InternalError. Dùng duck-type
  // `class === "Unavailable"` (taxonomy identity) thay `instanceof` — compatible
  // với test mock (mock tạo object cùng shape, KHÔNG phải subclass thật).
  if (hulyErr.class === "Unavailable") {
    const cls = (hulyErr as { hulyClass?: string }).hulyClass ?? "<unknown>";
    return {
      content: [
        {
          type: "text",
          text:
            `[UnavailableError] ${sanitize(hulyErr.message)}\n\n` +
            `Recovery: kiểm tra workspace đã enable package chứa class "${cls}". ` +
            `Nếu workspace OK → report bug pi-huly (sai class ref) kèm Huly version.`,
        },
      ],
      details: { errorClass: "Unavailable", hulyClass: cls } as unknown as TDetails,
      isError: true,
    };
  }
  return {
    content: [{ type: "text", text: `[${hulyErr.class}Error] ${sanitize(hulyErr.message)}` }],
    details: { errorClass: hulyErr.class } as unknown as TDetails,
    isError: true,
  };
}

// Re-export sub-modules cho domain single-import.
export { confirmDestructive } from "./confirm.js";
export type { ConfirmContext } from "./confirm.js";
// Re-export sanitize + LEAK_PATTERNS centralized (cho domain tool muốn sanitize custom output).
export { sanitize, LEAK_PATTERNS } from "../client/errors.js";
