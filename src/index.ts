// pi-huly extension entry — factory register tools + commands + lifecycle.
// Design: 04-system.md §6 index.ts, 07-uc-04 (subagent shared pool), FR-12 (session_shutdown).
//
// Factory (T-33):
//   1. registerAllTools(pi) — 102 tools từ 21 domain modules (register.ts)
//   2. wire render hooks vào 3 high-value tools (huly_get_issue/list_issues/get_document)
//   3. registerHulyCommand(pi) — unified /huly command (commands/huly.ts)
//   4. pi.on("session_shutdown") → pool.closeAll() — cleanup WS connections (FR-12)
//   5. T-55: pi.on("session_start") → warm pool (fire-and-forget) — fix first-call failure
//   6. T-56: pi.on("tool_execution_start") → log tool name + args (debug, stderr)
//   7. Skills qua package manifest `pi.skills` (declarative, KHÔNG runtime register)
//
// R6 verification: type-only import force load pi types → typecheck catch TS 7
// incompatibility với pi types sớm (design 03 §8 R6).

import type {
  AgentToolResult,
  ExtensionAPI,
  ToolRenderResultOptions,
} from "@oh-my-pi/pi-coding-agent";
import type { Component } from "@oh-my-pi/pi-tui";

import { HULY_VERSION } from "./version.js";
// Re-export giữ backward-compat cho consumer import từ index.
export { HULY_VERSION };

import { allTools, registerAllTools } from "./tools/register.js";
import { registerHulyCommand } from "./commands/huly.js";
import { closeAll, getClient } from "./client/pool.js";
import { loadCredentials, type Credentials } from "./config/credentials.js";
import { sanitize } from "./client/errors.js";
import { renderIssueListResult, renderIssueResult } from "./render/issue.js";
import { renderDocumentResult } from "./render/document.js";
import {
  DEFAULT_UPSTREAM_NOISE_PATTERNS,
  installGlobalConsoleFilter,
} from "./client/console-filter.js";
import { loadConfig, type Config } from "./config/config.js";

/**
 * Render hook signature (omp ToolDefinition.renderResult).
 * omp calls renderResult(result, options, theme, args) — `args` is the tool's
 * parsed params (NOT pi's { lastComponent }). The render funcs read
 * `context.lastComponent` for Text reuse; with omp `args` that field is absent
 * → getOrCreateText() always makes a fresh Text (no crash, minor: no reuse).
 * AgentToolResult + ToolRenderResultOptions are omp types (type-safe).
 */
type RenderHook = (
  result: AgentToolResult<unknown>,
  options: ToolRenderResultOptions,
  theme: unknown,
  args: unknown,
) => Component;

/** Map tool name → render hook (3 high-value per design 04 §6 D12). */
const RENDER_HOOKS: Record<string, RenderHook> = {
  huly_get_issue: renderIssueResult as unknown as RenderHook,
  huly_list_issues: renderIssueListResult as unknown as RenderHook,
  huly_get_document: renderDocumentResult as unknown as RenderHook,
};

/**
 * Build tool list với render hooks attached (shallow copy — KHÔNG mutate allTools
 * module-level global, tránh leak state giữa các consumer import allTools).
 * Tools KHÔNG trong RENDER_HOOKS → pi fallback default text render (~99 tool).
 */
function buildToolsWithRender(): typeof allTools {
  return allTools.map((tool) => {
    const hook = RENDER_HOOKS[tool.name];
    return hook !== undefined ? { ...tool, renderResult: hook } : tool;
  });
}

/** Module-level guard: setup() chỉ chạy 1 lần (tránh dev-reload leak handler/command). */
let setupCalled = false;

/** Test-only: reset setup guard (vitest isolation — tránh leak state giữa tests). */
export function __resetSetupGuardForTests(): void {
  setupCalled = false;
}

/**
 * T-55 #59: Warm pool cho workspace đầu tiên trong credentials (fire-and-forget).
 * Fix first-call failure — WS chỉ kết nối khi tool đầu tiên gọi getClient (lazy),
 * gây delay/fail nếu credentials init chậm. Warm at session_start → connection
 * sẵn sàng trước khi LLM gọi tool đầu tiên.
 *
 * Bounds:
 * - KHÔNG block startup (fire-and-forget — không await trong caller).
 * - Skip khi credentials rỗng / NeedsInitError (no-op, không log lỗi).
 * - KHÔNG crash nếu warm fail (swallow — lazy retry ở lần gọi tool đầu tiên).
 * - Qua getClient(workspace) (KHÔNG bypass pool — D14 shared state nhất quán).
 */
async function warmPool(): Promise<void> {
  try {
    const creds: Credentials = await loadCredentials();
    const ids = Object.keys(creds.workspaces);
    if (ids.length === 0) return; // chưa init → no-op im lặng
    // Warm workspace đầu tiên (default). Multi-workspace warm là overkill — lazy
    // connect còn lại khi tool resolve workspace khác.
    await getClient(ids[0]!);
  } catch {
    // Swallow — warm là best-effort. Lần gọi tool đầu tiên sẽ retry lazy connect
    // như cũ (getClient throw → builder return error result rõ ràng cho LLM).
  }
}

/** Bound JSON length cho log tool args (T-56 #60) — tránh bloat stderr. */
const LOG_ARGS_CAP = 500;

/**
 * T-64 #69: Resolve console filter pattern từ config cho global install.
 * - `quietUpstreamNoise === false` → null (escape hatch, KHÔNG filter)
 * - `upstreamNoisePatterns` override → compile user pattern (case-insensitive)
 * - Default → DEFAULT_UPSTREAM_NOISE_PATTERNS
 *
 * KHÔNG throw nếu pattern invalid (skip + fallback default).
 */
function resolvePatternsFromConfig(config: Config): RegExp[] | null {
  if (config.quietUpstreamNoise === false) return null;
  if (config.upstreamNoisePatterns !== undefined && config.upstreamNoisePatterns.length > 0) {
    const compiled: RegExp[] = [];
    for (const src of config.upstreamNoisePatterns) {
      try {
        compiled.push(new RegExp(src, "i"));
      } catch {
        // Skip invalid — validateConfig đã catch khi load, runtime skip cho safety.
      }
    }
    return compiled.length > 0 ? compiled : DEFAULT_UPSTREAM_NOISE_PATTERNS;
  }
  return DEFAULT_UPSTREAM_NOISE_PATTERNS;
}

/**
 * T-56 #60: Log tool call khi LLM gọi Huly tool (debug observability).
 * Subscribe tool_execution_start → log `[huly_<tool>] args: <json>` ra stderr.
 *
 * Bounds:
 * - Filter `toolName.startsWith("huly_")` — skip built-in tool (bash, read, ...).
 * - Sanitize args qua `sanitize()` (strip LEAK_PATTERNS — token/secret) trước log.
 * - Truncate JSON > LOG_ARGS_CAP chars (500) + đuôi `... (truncated, N chars total)`.
 * - console.error (stderr) — pi TUI hiển thị nhưng JSON/print mode KHÔNG parse
 *   thành output → an toàn cho programmatic consumer.
 */
function logToolCall(event: { toolName: string; args: unknown }): void {
  if (!event.toolName.startsWith("huly_")) return;
  let json: string;
  try {
    json = JSON.stringify(event.args ?? {});
  } catch {
    json = "<unserializable>";
  }
  // Truncate TRƯỚC sanitize (code-review MINOR #1) — đảm bảo sanitize luôn chạy
  // sau cùng, không có secret nào lọt qua vì slice cắt giữa (vd token có ký tự
  // lạ KHÔNG match LEAK_PATTERNS → nếu sanitize trước truncate, phần raw token
  // có thể nằm trong phần bị truncate khỏi log).
  const capped =
    json.length > LOG_ARGS_CAP
      ? `${json.slice(0, LOG_ARGS_CAP)}... (truncated, ${json.length} chars total)`
      : json;
  console.error(`[${event.toolName}] args: ${sanitize(capped)}`);
}

/**
 * pi-huly extension factory — pi gọi default export khi load extension.
 *
 * Idempotent: lần 2+ là no-op (return 0) — tránh dev-reload leak
 * (đăng ký trùng session_shutdown handler + /huly command).
 *
 * @param pi Pi ExtensionAPI
 * @returns number of tools registered (0 nếu đã setup, debug aid)
 */
export default function setup(pi: ExtensionAPI): void {
  // Guard: pi thực guard load 1 lần production, nhưng dev-reload có thể gọi lại.
  // Tránh leak: 2x session_shutdown handler → closeAll() gọi 2 lần song song.
  if (setupCalled) return;
  setupCalled = true;

  // 1. Build tools với render hooks (shallow copy, KHÔNG mutate module global)
  const tools = buildToolsWithRender();

  // 2. Register 102 tools (21 domain modules)
  registerAllTools(pi, tools);

  // 3. Register unified /huly command (init/status/workspace/link/unlink)
  registerHulyCommand(pi);

  // 3.5. T-64 #69: install global console filter ASAP (active toàn session).
  // Cần thiết vì WS error (wsocket.onerror async callback) fires post-connect —
  // runWithConsoleFilter trong createHulyClient chỉ cover connect-time, restore
  // console.error trước khi WS error thật fire → token leak nếu KHÔNG global filter.
  // Async vì resolveFilterPatterns đọc config ( KHÔNG block setup — fire-and-forget).
  void (async () => {
    try {
      const config = await loadConfig();
      if (config.quietUpstreamNoise === false) return; // escape hatch
      const patterns = resolvePatternsFromConfig(config);
      if (patterns !== null) installGlobalConsoleFilter(patterns);
    } catch {
      // Config error → install default patterns (best-effort, KHÔNG block setup).
      installGlobalConsoleFilter(DEFAULT_UPSTREAM_NOISE_PATTERNS);
    }
  })();

  // 4. session_shutdown hook → close all WS connections (FR-12, D14 pool cleanup).
  // Pi AWAIT handler xong trước khi exit (contract ExtensionHandler async support).
  // closeAll nên ngắn (WS close nhanh) — nếu block lâu, pi shutdown bị chậm.
  pi.on("session_shutdown", async () => {
    try {
      await closeAll();
    } catch {
      // Shutdown cleanup KHÔNG block exit — swallow để pi exit sạch
      // (dù closeAll throw, handler resolve → pi tiếp tục shutdown).
    }
  });

  // 5. T-55 #59: session_start → warm pool fire-and-forget (fix first-call failure).
  // omp's SessionStartEvent has no `reason` field (unlike Pi), so warm
  // unconditionally. Handler is fire-and-forget (KHÔNG await); warmPool swallows
  // mọi error (best-effort).
  pi.on("session_start", () => {
    void warmPool(); // fire-and-forget — KHÔNG await, KHÔNG crash setup
  });

  // 6. T-56 #60: tool_execution_start → log tool name + args (debug observability).
  // Filter huly_ prefix, sanitize args (strip secret), truncate JSON > 500 chars.
  // Log ra stderr (pi TUI hiển thị, JSON/print mode không parse → safe).
  pi.on("tool_execution_start", (event) => {
    try {
      logToolCall(event);
    } catch {
      // Logging KHÔNG block tool execution — swallow mọi error (vd args circular).
    }
  });

}
