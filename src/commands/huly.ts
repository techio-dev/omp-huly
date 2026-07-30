// commands/huly.ts — unified `/huly` command (git-like subcommands).
// Design: 04-system.md §6 commands/huly.ts, 06-api.md §5 /huly command,
// 01-vision §B.10 D10/D11, UC-01 (/huly init flow), UC-02 (link).
//
// Subcommands:
//   /huly              smart: cwd bound → status; unbound → init flow
//   /huly init         setup/bind cwd (UC-01): workspace → verify → project → bind
//   /huly status       diagnostics: binding, pool.health, user, version
//   /huly workspace list|add|remove   global workspace CRUD (credentials.ts)
//   /huly link [ws] [project]         bind cwd manual
//   /huly unlink                      remove cwd binding
//
// Architecture: tách pure logic (runHulyCommand) khỏi pi registration
// (registerHulyCommand). runHulyCommand nhận CommandContext injectable →
// testable KHÔNG cần mock toàn bộ ExtensionCommandContext. Output qua
// ctx.ui.notify (TUI) + return string (non-TUI / log).

import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import {
  addWorkspace,
  findByName,
  getWorkspace,
  loadCredentials,
  removeWorkspace,
  type WorkspaceCreds,
} from "../config/credentials.js";
import {
  bindProject,
  loadConfig,
  resolveByCwd,
  unbindProject,
  type ProjectBinding,
} from "../config/config.js";
import { getClient, health, closeAll } from "../client/pool.js";
import { createHulyClient } from "../client/client.js";
import { classRef, spaceRef } from "../tools/domains/_class-refs.js";
import { HULY_VERSION } from "../version.js";

/**
 * UI surface mà command cần (subset của ExtensionUIContext — injectable test).
 * select/confirm/input return undefined khi user cancel hoặc non-TUI.
 */
export interface CommandUI {
  /** Show selector → user choice (1 option). Undefined = cancel/non-TUI. */
  select(title: string, options: string[]): Promise<string | undefined>;
  /** Yes/no confirm. */
  confirm(title: string, message: string): Promise<boolean>;
  /** Free text input. Undefined = cancel/non-TUI. */
  input(title: string, placeholder?: string): Promise<string | undefined>;
  /** Show notification. */
  notify(message: string, type?: "info" | "warning" | "error"): void;
}

/**
 * Context inject vào runHulyCommand (testability — thay vì ExtensionCommandContext
 * đầy đủ). Bao gồm UI + cwd + paths override (test inject temp).
 */
export interface CommandContext {
  /** UI surface (TUI/RPC). */
  ui: CommandUI;
  /** Whether dialog-capable UI available. false → commands non-interactive. */
  hasUI: boolean;
  /** Current working directory. */
  cwd: string;
  /** Override credentials path (test). */
  credentialsPath?: string;
  /** Override config path (test). */
  configPath?: string;
}

/** Parse subcommand + positional args từ raw command arg string. */
export interface ParsedArgs {
  /** Subcommand keyword (init/status/workspace/link/unlink). Undefined = no-arg. */
  subcommand: string | undefined;
  /** Positional args sau subcommand. */
  positional: string[];
}

/**
 * Parse raw arg string → subcommand + positional.
 *   ""              → { subcommand: undefined, positional: [] }
 *   "init"          → { subcommand: "init", positional: [] }
 *   "workspace add" → { subcommand: "workspace", positional: ["add"] }
 *   "link ws-x PD"  → { subcommand: "link", positional: ["ws-x", "PD"] }
 *   "  status  "    → { subcommand: "status", positional: [] } (trim)
 */
export function parseArgs(raw: string): ParsedArgs {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (tokens.length === 0) {
    return { subcommand: undefined, positional: [] };
  }
  const [subcommand, ...positional] = tokens;
  return { subcommand, positional };
}

/** Result trả về từ runHulyCommand (cho non-TUI log + test assert). */
export interface CommandResult {
  /** Human-readable output line(s). */
  message: string;
  /** Notification type (info/warning/error). */
  type: "info" | "warning" | "error";
}

/**
 * Run unified /huly command. Dispatch theo subcommand.
 *
 * Non-TUI (hasUI=false): commands không thể prompt → trả error message hướng
 * dẫn dùng subcommand explicit (vd `/huly link <ws> <project>` thay vì init
 * interactive). NFR-10 fail-safe — KHÔNG bypass confirmation.
 *
 * @returns CommandResult (message + type) cho caller notify/log
 */
export async function runHulyCommand(rawArgs: string, ctx: CommandContext): Promise<CommandResult> {
  const { subcommand, positional } = parseArgs(rawArgs);

  switch (subcommand) {
    case undefined:
      return runSmart(ctx);
    case "init":
      return runInit(ctx);
    case "status":
      return runStatus(ctx);
    case "workspace":
      return runWorkspace(positional, ctx);
    case "link":
      return runLink(positional, ctx);
    case "unlink":
      return runUnlink(ctx);
    default:
      return {
        message: `Unknown subcommand "${subcommand}". Available: init, status, workspace, link, unlink.`,
        type: "error",
      };
  }
}

// === Smart (no-arg) ===

/** `/huly` no-arg: cwd bound → status; unbound → init flow (TUI only). */
async function runSmart(ctx: CommandContext): Promise<CommandResult> {
  const binding = await safeResolveByCwd(ctx);
  if (binding !== undefined) {
    return runStatus(ctx);
  }
  // Unbound: init flow yêu cầu interactive UI. Non-TUI → hint link manual
  // (tránh contradictory messages: notify "starting init" rồi init error "requires UI").
  if (ctx.hasUI !== true) {
    return {
      message:
        "No Huly binding for this directory. Use `/huly link <workspace> <project>` to bind (non-interactive mode).",
      type: "warning",
    };
  }
  ctx.ui.notify("No Huly binding for this directory. Starting /huly init…", "info");
  return runInit(ctx);
}

// === /huly init (UC-01) ===

/**
 * `/huly init` — bind cwd → {workspace, project} (UC-01).
 * Flow:
 *   1. prompt workspace name
 *   2. findByName(name): 0 → add (prompt url + auth); 1 → reuse; N → disambiguate
 *   3. verify token (getClient → getCurrentUser)
 *   4. list_projects → pick HOẶC create new
 *   5. bindProject(cwd, {workspace, project})
 *
 * Non-TUI → KHÔNG interactive → error hướng dẫn `/huly link <ws> <project>`.
 * User cancel bất kỳ bước → abort (no bind).
 */
async function runInit(ctx: CommandContext): Promise<CommandResult> {
  if (ctx.hasUI !== true) {
    return {
      message:
        "/huly init requires interactive UI. Use `/huly link <workspace> <project>` to bind non-interactively.",
      type: "error",
    };
  }

  // 1. Prompt workspace name
  const name = await ctx.ui.input("Huly workspace name:");
  if (name === undefined || name.length === 0) {
    return { message: "Init cancelled.", type: "info" };
  }

  // 2. findByName → resolve workspace id-handle
  let workspaceId: string;
  try {
    const matches = await findByName(name, ctx.credentialsPath);
    if (matches.length === 0) {
      // Add new workspace entry
      const added = await promptAddWorkspace(name, ctx);
      if (added === undefined) {
        return { message: "Init cancelled.", type: "info" };
      }
      workspaceId = added;
    } else if (matches.length === 1) {
      workspaceId = matches[0].id;
      ctx.ui.notify(`Reusing workspace "${workspaceId}".`, "info");
    } else {
      // Disambiguate (same-name diff-URL). Index lookup thay vì split string
      // (tránh truncate sai nếu id/url chứa " (").
      const opts = matches.map((m) => `${m.id} (${m.url})`);
      const chosen = await ctx.ui.select(`Workspace "${name}" is ambiguous. Pick:`, opts);
      if (chosen === undefined) {
        return { message: "Init cancelled.", type: "info" };
      }
      const idx = opts.indexOf(chosen);
      if (idx < 0 || matches[idx] === undefined) {
        return { message: "Init cancelled (invalid selection).", type: "info" };
      }
      workspaceId = matches[idx]!.id;
    }
  } catch (e) {
    return { message: `Init failed: ${errorMessage(e)}`, type: "error" };
  }

  // 3. Verify token (getClient → getCurrentUser). KHÔNG swallow — surface rõ.
  let user: { name: string; email: string };
  try {
    const client = await getClient(workspaceId);
    const u = await client.getCurrentUser();
    user = { name: u.name, email: u.email };
  } catch (e) {
    return {
      message: `Auth/connection failed for workspace "${workspaceId}": ${errorMessage(
        e,
      )}. Check URL/credentials (/huly workspace remove ${workspaceId} + add lại).`,
      type: "error",
    };
  }

  // 4. Project: list → pick HOẶC create
  let project: string;
  try {
    project = await promptProject(workspaceId, ctx);
    if (project.length === 0) {
      return { message: "Init cancelled (no project).", type: "info" };
    }
  } catch (e) {
    return { message: `Project setup failed: ${errorMessage(e)}`, type: "error" };
  }

  // 5. Bind cwd
  try {
    await bindProject(ctx.cwd, { workspace: workspaceId, project }, ctx.configPath);
  } catch (e) {
    return { message: `Bind failed: ${errorMessage(e)}`, type: "error" };
  }

  return {
    message: `Bound ${ctx.cwd} → workspace "${workspaceId}", project "${project}" (user: ${user.name} <${user.email}>).`,
    type: "info",
  };
}

/**
 * Prompt url + auth method → addWorkspace. Trả id-handle HOẶC undefined (cancel).
 */
async function promptAddWorkspace(name: string, ctx: CommandContext): Promise<string | undefined> {
  const url = await ctx.ui.input("Huly URL (vd https://huly.example.com):");
  if (url === undefined || url.length === 0) return undefined;

  const method = await ctx.ui.select("Auth method:", ["Token", "Email + password"]);
  if (method === undefined) return undefined;

  let entry: WorkspaceCreds;
  if (method === "Token") {
    const token = await ctx.ui.input("Token:");
    if (token === undefined || token.length === 0) return undefined;
    entry = { url, workspace: name, token };
  } else {
    const email = await ctx.ui.input("Email:");
    if (email === undefined || email.length === 0) return undefined;
    const password = await ctx.ui.input("Password:");
    if (password === undefined || password.length === 0) return undefined;
    entry = { url, workspace: name, email, password };
  }

  // id-handle: dùng name (stable). Nếu trùng id → suffix -2, -3...
  const baseId = await uniqueWorkspaceId(name, ctx);
  await addWorkspace(baseId, entry, ctx.credentialsPath);
  return baseId;
}

/** Tạo id-handle unik dựa trên name (suffix -2, -3 nếu trùng). */
async function uniqueWorkspaceId(name: string, ctx: CommandContext): Promise<string> {
  const creds = await loadCredentials(ctx.credentialsPath);
  if (!(name in creds.workspaces)) return name;
  let i = 2;
  while (`${name}-${i}` in creds.workspaces) i++;
  return `${name}-${i}`;
}

/**
 * List projects → pick existing HOẶC create new.
 * Trả project identifier HOẶC "" (cancel).
 */
async function promptProject(workspaceId: string, ctx: CommandContext): Promise<string> {
  const client = await getClient(workspaceId);
  // Reuse PROJECT_CLASS via classRef (single source với domain modules).
  // Pattern space=workspaceId-handle nhất quán với domains/projects.ts create_project.
  const PROJECT_CLASS = classRef("tracker:class:Project");
  const projects = await client.findAll(PROJECT_CLASS, {}, {});
  const items = projects.map((p) => ({
    identifier: (p as { identifier?: string }).identifier ?? "",
    name: (p as { name?: string }).name ?? "",
  }));

  const opts = ["+ Create new project", ...items.map((p) => `${p.identifier} — ${p.name}`)];
  const chosen = await ctx.ui.select("Pick project:", opts);
  if (chosen === undefined) return "";

  if (chosen === "+ Create new project") {
    const name = await ctx.ui.input("Project name:");
    if (name === undefined || name.length === 0) return "";
    // Validate identifier: 1-5 chars, uppercase letter start (Huly convention).
    let identifier = await ctx.ui.input("Project identifier (1-5 uppercase):");
    if (identifier === undefined) return "";
    identifier = identifier.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9]{0,4}$/.test(identifier)) {
      ctx.ui.notify(
        `Invalid identifier "${identifier}": must be 1-5 chars, start with uppercase letter.`,
        "error",
      );
      return "";
    }
    await client.createDoc(PROJECT_CLASS, spaceRef(workspaceId), { name, identifier });
    return identifier;
  }

  // Pick existing: index lookup thay vì split string (tránh truncate nếu name chứa " —").
  const idx = opts.indexOf(chosen) - 1; // -1 vì opts[0] = "+ Create new"
  if (idx < 0 || items[idx] === undefined) return "";
  return items[idx]!.identifier;
}

// === /huly status ===

/**
 * `/huly status` — diagnostics.
 * Output: version, cwd binding (workspace+project), pool health, current user.
 * KHÔNG throw — catch hết, surface dạng warning/error.
 */
async function runStatus(ctx: CommandContext): Promise<CommandResult> {
  const lines: string[] = [`pi-huly v${HULY_VERSION}`, `cwd: ${ctx.cwd}`];

  // Binding
  const binding = await safeResolveByCwd(ctx);
  if (binding !== undefined) {
    lines.push(`binding: workspace "${binding.workspace}" · project "${binding.project}"`);
  } else {
    lines.push("binding: (none — run /huly init)");
  }

  // Config transport
  try {
    const config = await loadConfig(ctx.configPath);
    lines.push(`transport: ${config.transport ?? "ws"}`);
  } catch (e) {
    lines.push(`transport: error reading config — ${errorMessage(e)}`);
  }

  // Credentials count
  try {
    const creds = await loadCredentials(ctx.credentialsPath);
    lines.push(`workspaces: ${Object.keys(creds.workspaces).length} configured`);
  } catch (e) {
    lines.push(`workspaces: error reading credentials — ${errorMessage(e)}`);
  }

  // Pool health (only if binding exists → check specific workspace)
  try {
    const target = binding?.workspace;
    const statuses = await health(target);
    if (statuses.length === 0) {
      lines.push("pool: (no active connections)");
    } else {
      // T-62 #67: total noise cross entry (module-level counter) — show 1 lần.
      let noiseTotal = 0;
      let noiseByPattern: Record<string, number> = {};
      for (const s of statuses) {
        const userStr = s.user ? `${s.user.name} <${s.user.email}>` : "(user unknown)";
        lines.push(
          `pool[${s.workspace}]: ${s.connected ? "connected" : "disconnected"} (${s.transport}) · ${userStr}`,
        );
        if (s.upstreamNoiseFiltered !== undefined) {
          noiseTotal = Math.max(noiseTotal, s.upstreamNoiseFiltered.total);
          noiseByPattern = s.upstreamNoiseFiltered.byPattern;
        }
      }
      if (noiseTotal > 0) {
        // Per-pattern breakdown giúp user phân biệt nguồn noise (vd #67 model-tx
        // vs T-64 WS error). Sort desc theo count, format "key: N" top 3.
        const sorted = Object.entries(noiseByPattern)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([pattern, count]) => `${pattern}: ${count}`)
          .join(", ");
        lines.push(
          `pool noise: ${noiseTotal} upstream log filtered${sorted ? ` (${sorted})` : ""}`,
        );
      }
    }
  } catch (e) {
    lines.push(`pool: health check failed — ${errorMessage(e)}`);
  }

  return { message: lines.join("\n"), type: "info" };
}

// === /huly workspace list|add|remove ===

async function runWorkspace(positional: string[], ctx: CommandContext): Promise<CommandResult> {
  const action = positional[0];
  switch (action) {
    case "list":
      return runWorkspaceList(ctx);
    case "add":
      return runWorkspaceAdd(ctx);
    case "remove":
      return runWorkspaceRemove(positional[1], ctx);
    default:
      return {
        message: "Usage: /huly workspace list|add|remove",
        type: "error",
      };
  }
}

/** `/huly workspace list` — list configured workspaces (id + url + workspace name). */
async function runWorkspaceList(ctx: CommandContext): Promise<CommandResult> {
  try {
    const creds = await loadCredentials(ctx.credentialsPath);
    const ids = Object.keys(creds.workspaces);
    if (ids.length === 0) {
      return {
        message: "No workspaces configured. Run /huly init or /huly workspace add.",
        type: "info",
      };
    }
    const lines = ids.map((id) => {
      const w = creds.workspaces[id]!;
      const auth = "token" in w ? "token" : "email+pass";
      return `${id} → ${w.url} · workspace="${w.workspace}" · auth=${auth}`;
    });
    return { message: `Workspaces (${ids.length}):\n${lines.join("\n")}`, type: "info" };
  } catch (e) {
    return { message: `Failed to list workspaces: ${errorMessage(e)}`, type: "error" };
  }
}

/** `/huly workspace add` — interactive add (TUI only). */
async function runWorkspaceAdd(ctx: CommandContext): Promise<CommandResult> {
  if (ctx.hasUI !== true) {
    return {
      message: "/huly workspace add requires interactive UI. Edit credentials.json manually.",
      type: "error",
    };
  }
  const name = await ctx.ui.input("Workspace name (Huly workspace):");
  if (name === undefined || name.length === 0) return { message: "Cancelled.", type: "info" };
  const id = await promptAddWorkspace(name, ctx);
  if (id === undefined) return { message: "Cancelled.", type: "info" };
  return { message: `Added workspace "${id}".`, type: "info" };
}

/** `/huly workspace remove <id>` — remove by id-handle. */
async function runWorkspaceRemove(
  id: string | undefined,
  ctx: CommandContext,
): Promise<CommandResult> {
  if (id === undefined || id.length === 0) {
    return { message: "Usage: /huly workspace remove <id>", type: "error" };
  }
  try {
    const existing = await getWorkspace(id, ctx.credentialsPath);
    if (existing === undefined) {
      return { message: `Workspace "${id}" not found.`, type: "warning" };
    }
    await removeWorkspace(id, ctx.credentialsPath);
    return { message: `Removed workspace "${id}".`, type: "info" };
  } catch (e) {
    return { message: `Failed to remove workspace: ${errorMessage(e)}`, type: "error" };
  }
}

// === /huly link [ws] [project] ===

/**
 * `/huly link [workspace] [project]` — bind cwd manual (non-interactive OK).
 *   /huly link              → TUI: prompt ws + project
 *   /huly link ws PD        → bind trực tiếp (verify workspace tồn tại)
 * Validate workspace có trong credentials trước khi bind (fail-fast).
 */
async function runLink(positional: string[], ctx: CommandContext): Promise<CommandResult> {
  let workspace: string | undefined = positional[0];
  let project: string | undefined = positional[1];

  // Interactive fill nếu thiếu (TUI only)
  if ((workspace === undefined || project === undefined) && ctx.hasUI === true) {
    if (workspace === undefined) {
      workspace = (await ctx.ui.input("Workspace id:")) ?? undefined;
    }
    if (project === undefined && workspace !== undefined && workspace.length > 0) {
      project = (await ctx.ui.input("Project identifier:")) ?? undefined;
    }
  }

  if (workspace === undefined || workspace.length === 0) {
    return { message: "Usage: /huly link <workspace> <project>", type: "error" };
  }
  if (project === undefined || project.length === 0) {
    return { message: "Usage: /huly link <workspace> <project>", type: "error" };
  }

  // Validate workspace tồn tại trong credentials
  try {
    const existing = await getWorkspace(workspace, ctx.credentialsPath);
    if (existing === undefined) {
      return {
        message: `Workspace "${workspace}" not found in credentials. Run /huly workspace add first.`,
        type: "error",
      };
    }
  } catch (e) {
    return { message: `Failed to validate workspace: ${errorMessage(e)}`, type: "error" };
  }

  try {
    await bindProject(ctx.cwd, { workspace, project }, ctx.configPath);
  } catch (e) {
    return { message: `Bind failed: ${errorMessage(e)}`, type: "error" };
  }
  return {
    message: `Bound ${ctx.cwd} → workspace "${workspace}", project "${project}".`,
    type: "info",
  };
}

// === /huly unlink ===

/** `/huly unlink` — remove cwd binding. No-op nếu chưa bound. */
async function runUnlink(ctx: CommandContext): Promise<CommandResult> {
  try {
    const binding = await safeResolveByCwd(ctx);
    if (binding === undefined) {
      return { message: `${ctx.cwd} has no Huly binding.`, type: "info" };
    }
    await unbindProject(ctx.cwd, ctx.configPath);
    return { message: `Unbound ${ctx.cwd}.`, type: "info" };
  } catch (e) {
    return { message: `Unbind failed: ${errorMessage(e)}`, type: "error" };
  }
}

// === Helpers ===

/** resolveByCwd wrap — KHÔNG throw (tránh crash command khi config corrupt). */
async function safeResolveByCwd(ctx: CommandContext): Promise<ProjectBinding | undefined> {
  try {
    return await resolveByCwd(ctx.cwd, ctx.configPath);
  } catch {
    return undefined;
  }
}

/** Extract message từ unknown error (KHÔNG leak stack). */
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

// === Pi registration ===

/**
 * Map CommandUI methods sang ExtensionCommandContext. select/confirm/input
 * trả undefined khi non-TUI (pi đã handle internally).
 */
function adaptUI(ctx: ExtensionCommandContext): CommandUI {
  return {
    select: (title, options) => ctx.ui.select(title, options),
    confirm: (title, message) => ctx.ui.confirm(title, message),
    input: (title, placeholder) => ctx.ui.input(title, placeholder),
    notify: (message, type) => ctx.ui.notify(message, type),
  };
}

/**
 * Register unified `/huly` command với pi.
 * 1 registration, dispatch subcommand trong handler.
 *
 * @param pi Pi ExtensionAPI
 */
export function registerHulyCommand(pi: ExtensionAPI): void {
  pi.registerCommand("huly", {
    description: "Huly workspace/project management (init, status, workspace, link, unlink).",
    async handler(args, ctx) {
      const cmdCtx: CommandContext = {
        ui: adaptUI(ctx),
        hasUI: ctx.hasUI,
        cwd: ctx.cwd,
      };
      const result = await runHulyCommand(args, cmdCtx);
      ctx.ui.notify(result.message, result.type);
    },
  });
}

// Re-export closeAll cho index.ts factory (session_shutdown cleanup).
export { closeAll };
// Re-export createHulyClient cho potential direct use (test/verify).
export { createHulyClient };
