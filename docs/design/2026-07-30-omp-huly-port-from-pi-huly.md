# Design: omp-huly — port pi-huly → oh-my-pi (omp)

- **Date**: 2026-07-30
- **Status**: Draft (pending user review)
- **Author**: brainstorming session
- **Scope**: retarget the `pi-huly` Huly integration from Pi (`@earendil-works/*`, typebox) to **oh-my-pi / omp** (`@oh-my-pi/*`, Zod).

## 1. Goal

Port `pi-huly` (native Huly integration for Pi by Mario / earendil) to **oh-my-pi
(omp)**, can1357's fork of Pi, with **full feature parity** and a **hard fork,
omp-only** codebase. The Huly integration logic (HulyClient, WS pool, REST, markup
round-trip, resolver, CRUD handlers, confirm gate) is **host-agnostic** and is
ported **verbatim**. Only the host-binding surface changes: imports, tool-parameter
schema system, manifest, factory wiring, config location, and skills.

## 2. Non-goals

- No new Huly features, no new tools beyond pi-huly's ~102.
- No MCP path — omp-huly stays **native**, calling Huly WebSocket/REST directly
  (same core value-prop as pi-huly).
- No pi-huly backward-compatibility — hard fork. omp-huly diverges freely.
- No dual-target source (one codebase emitting both pi-huly and omp-huly).

## 3. Verified divergence map (omp vs pi-huly)

Source of truth: omp `docs/extensions.md`, `docs/sdk.md`, `docs/skills.md`,
`docs/extension-loading.md`, `docs/porting-from-pi-mono.md` (commit at last sync:
`b21b42d`, 2026-03-22).

### 3.1 What is API-IDENTICAL (verified)

- Extension factory shape: `export default function(pi: ExtensionAPI) { ... }`.
- `ExtensionAPI` methods used by pi-huly: `on`, `registerTool`, `registerCommand`.
- Tool `execute` signature — pi-huly's `HulyToolDefinition.execute` is **already**
  `(toolCallId, params, signal, onUpdate, ctx) => Promise<{content, details, isError?}>`,
  i.e. omp's exact `execute` shape. `ctx` is omp's `ExtensionContext`.
  `register.ts` already calls `pi.registerTool(tool as never)`. → **registration
  mechanism needs no change.**
- Events pi-huly uses all exist in omp with identical names:
  `session_start`, `session_shutdown`, `tool_execution_start`. (omp handler
  signatures are `(event, ctx)`.) **Caveat (verified by review):** event *names* match, but the `session_start` *payload* differs — omp's `SessionStartEvent` is `{ type: "session_start" }` with **no `reason` field** (pi-huly filters pool-warming by `event.reason`). So Task 5 warms unconditionally on `session_start`. `tool_execution_start` keeps `toolName` + `args`; `session_shutdown` is arg-free.
- Confirm gate: pi-huly's `confirmDestructive(ctx, c)` uses `ctx.hasUI` +
  `ctx.ui.confirm(title, message)` → **directly omp-compatible** (omp interactive
  mode supports `ctx.ui.confirm`; non-TUI auto-deny via `ctx.hasUI === false` holds).
- Render hooks: omp `ToolDefinition` supports `renderResult(result, options, theme, args)`.
  pi-huly attaches `renderResult` to 3 tools. → maps (minor arg diff, Phase 2).
- Skills layout: omp discovers `<skills-root>/<name>/SKILL.md`. pi-huly's skills
  layout matches.

### 3.2 What DIVERGES (must change)

| Concern | pi-huly | omp-huly |
|---|---|---|
| Import scope | `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui` (10 + 7 sites) | `@oh-my-pi/pi-coding-agent`, `@oh-my-pi/pi-tui` |
| Param schema | `typebox` (`Type.Object`, `Static<T>`, `TObject`) | **Zod** (`z.object`, `z.infer<T>`, `ZodObject`) — canonical |
| Manifest key | `package.json` `"pi": { extensions, skills }` | `"omp": { extensions }` (preferred; `pi` fallback remains) |
| Install cmd | `pi install npm:pi-huly` | `omp install npm:omp-huly` |
| Package name | `pi-huly` | `omp-huly` |
| Config/cred path | `~/.pi/agent/huly/` | `~/.omp/agent/huly/` (+ legacy `~/.pi` auto-migration) |
| Skills | bundled `skills/huly-docs`, `huly-tasks` (native `huly_*`) | **tools-only package**; skills live in `~/.omp/agent/skills/`, converted to native `huly_*` |
| Runtime | Node ≥22.19 | Bun (omp runs Bun ≥1.3.14) |

- `StringEnum` / `pi-ai`: **not used** by pi-huly (grep confirmed). Eliminated risk.
- `pi.typebox` shim exists in omp (zod-backed, legacy) — **not used**; we go
  canonical Zod.

## 4. Architecture (what stays / what changes)

### 4.1 Stays verbatim (host-agnostic — do not touch logic)

- `src/client/` — `HulyClient`, WS pool (`pool.ts`), REST, `errors.ts`,
  `console-filter.ts`. (Huly API, not omp.)
- `src/markup/` — Huly markup ↔ markdown round-trip.
- `src/config/resolver.ts` — cwd→{workspace,project} resolution chain
  (consumes the config/cred store; store location changes, logic does not).
- `src/render/` — issue/document TUI `Component`s (Phase 2 wiring).
- `src/tools/confirm.ts` — confirm gate (omp-compatible as-is).
- `src/tools/domains/*.ts` — the **21 domain modules' handler bodies** (CRUD logic).
- `src/tools/builder.ts` `defineHulyTool.execute` body — resolve workspace/project
  → client → confirm → handler → map errors (already omp-shaped).

### 4.2 Changes (the port)

#### 4.2.1 Import re-namespace (mechanical)

- `@earendil-works/pi-coding-agent` → `@oh-my-pi/pi-coding-agent`
- `@earendil-works/pi-tui` → `@oh-my-pi/pi-tui`
- Verify omp exports exist (typecheck will fail fast): `ExtensionAPI`,
  `AgentToolResult`, `ToolRenderResultOptions`, `ExtensionContext`, `Component`.

#### 4.2.2 Schema typebox → Zod (Approach A — the bulk)

Add `zod@^4` dependency. Per the 21 domain modules + `builder.ts`:

- `Type.Object({...})` → `z.object({...})`; `Type.String/Number/Boolean/Array/Optional/Union/...`
  → `z.string/number/boolean/array/optional/union/...`. Import `{ z } from "zod"` at
  module top level (no `pi` instance needed — schemas are static).
- `builder.ts`: `ToolParams = TObject` → `ToolParams = ZodObject`; `Static<P>` →
  `z.infer<P>`.
- Keep pi-huly's structure: top-level `tools` arrays per domain, the `defineHulyTool`
  builder seam, `_common.ts` helpers. No restructuring.

#### 4.2.3 `package.json`

- `name`: `omp-huly`.
- `description` / `keywords`: oh-my-pi / omp (drop pi-coding-agent).
- `peerDependencies`: `@earendil-works/*` → `@oh-my-pi/*` (`pi-coding-agent`,
  `pi-tui`, and `pi-agent-core`/`pi-utils` only if referenced); drop bare `typebox`
  peer; add `zod` (as dep, see 4.2.2).
- `dependencies`: add `zod@^4`; keep `@hcengineering/*` + `ws`.
- Manifest: `"pi": { ... }` → `"omp": { "extensions": ["./dist/index.mjs"] }`
  (**no `skills` key** — tools-only package).
- `files`: drop `skills` from the packaged files list.
- `homepage` / `repository` / `bugs`: `https://github.com/techio-dev/omp-huly`.
- `engines.node`: keep `>=22.19.0` (harmless under Bun).

#### 4.2.4 `src/index.ts` factory + events

- `export default function ompHuly(pi: ExtensionAPI)`.
- Adapt omp event handler signatures to `(event, ctx)` for:
  - `session_start` → warm pool (`ctx` provides cwd for workspace resolution).
  - `session_shutdown` → `closeAll()` (pool cleanup) — unchanged logic.
  - `tool_execution_start` → debug log tool name + args (stderr).
- `registerAllTools(pi)` and `registerHulyCommand(pi)` already call
  `pi.registerTool` / `pi.registerCommand` — no change.
- Render hooks (3 tools) wired via builder → omp `renderResult` — **Phase 2**
  (adapt last arg from `{ lastComponent }` to omp's `args`).

#### 4.2.5 Config + credentials (NEW: location change + auto-migration)

- Primary store: `~/.omp/agent/huly/` (`config.json`, `credentials.json`).
  Same format + security as pi-huly (chmod 600, atomic write, schema validate,
  no secret logging).
- `src/config/config.ts`: `CONFIG_DIR = ~/.omp/agent/huly`;
  `LEGACY_CONFIG_PATH = ~/.pi/agent/huly/config.json`.
- `src/config/credentials.ts`: `CREDENTIALS_DIR = ~/.omp/agent/huly`;
  `LEGACY_CREDENTIALS_PATH = ~/.pi/agent/huly/credentials.json`.
- **Auto-migration (lazy, on read-miss):** when resolving a cwd→binding
  (`config`) or a workspace's credentials, if absent in `~/.omp`, look up
  `~/.pi/agent/huly/`; if found, migrate the specific entry into `~/.omp`
  (merge + persist) and use it. Idempotent (no-op once migrated). Lets a pi-huly
  user switch to omp without re-running `/huly init`.
- Security during migration: legacy read honors chmod-600 verify; migrated
  writes are atomic + chmod 600; never log token/password.

#### 4.2.6 Skills (OUTSIDE the package — user global)

omp-huly is **tools-only**. The canonical Huly skills live in
`~/.omp/agent/skills/`. As part of this work, convert them from MCP → native:

- `~/.omp/agent/skills/huly-docs/SKILL.md` + `references/*`
- `~/.omp/agent/skills/huly-tasks/SKILL.md` + `references/*`
- Conversions:
  - MCP tool refs (`create_issue`, `get_document`, …) → native `huly_*`
    (`huly_create_issue`, `huly_get_document`, …).
  - `@firfi/huly-mcp` setup → omp-huly native setup (`omp install npm:omp-huly`,
    `/huly init`, `/huly status` diagnostic).
  - Rename `references/huly-mcp-setup.md` → `omp-huly-setup.md`;
    `references/huly-mcp-params.md` → `huly-tool-params.md` (restore pi-huly's
    native param reference, which lists exact `huly_*` fields).
- Remove omp-huly repo's bundled `skills/` dir (not packaged; canonical copies
  are the `~/.omp` ones).

#### 4.2.7 README / CHANGELOG / NOTICE / branding

- README rewrite: omp-huly for oh-my-pi; `omp install npm:omp-huly`; omp
  requirements (Bun ≥1.3.14, self-host Huly); drop pi badges/URLs; update the
  "Tại sao" framing to omp. Note tools-only + skills in `~/.omp`.
- `CHANGELOG.md`: entry for the omp port.
- `NOTICE.md`: update attributions (omp fork lineage).

## 5. Phasing

### Phase 1 — installs & runs on omp (core parity)

1. Re-namespace imports (4.2.1) + peer deps.
2. Zod migration across 21 domain modules + `builder.ts` (4.2.2).
3. `package.json` (4.2.3).
4. `index.ts` factory + event signatures (4.2.4, minus render hooks).
5. Config/credentials location + auto-migration (4.2.5).
6. Skills conversion in `~/.omp/agent/skills/` (4.2.6).
7. README/branding (4.2.7).
8. **Exit criteria**: `typecheck` clean; `build` (rolldown) clean; tests green;
   **smoke test**: `omp install` local build → `/huly init` (incl. legacy
   migration from `~/.pi`) → call one read tool + one create tool against a
   self-host Huly instance.

### Phase 2 — parity polish

1. Render hooks: wire `renderIssueResult` / `renderIssueListResult` /
   `renderDocumentResult` via omp `renderResult` (adapt last arg). Verify
   `Component` from `@oh-my-pi/pi-tui`.
2. Verify confirm gate: non-TUI auto-deny + RPC `confirm` round-trip.
3. Evaluate omp native `ToolDefinition.approval` field as an alternative/complement
   to the manual confirm gate.
4. Verify pool warm / console-filter on omp event signatures.

## 6. Risks & verification

- **R1 (Zod instance identity).** Approach A imports `zod` directly; omp uses
  `pi.zod` (zod/v4). Risk: omp validation could be instanceof-bound to its own
  module instance. Mitigation: pin `zod@^4` to omp's catalog; Zod v4 `.parse()` /
  `.safeParse()` is cross-instance-safe (schemas are data). **Verified by Phase 1
  smoke test** (a tool call exercises omp's param validation). Contingency: if
  rejected, isolate to Approach B (`pi.zod` inside factory) — bounded change.
- **R2 (export availability).** `AgentToolResult`, `ToolRenderResultOptions`,
  `ExtensionContext`, `Component` must be exported by `@oh-my-pi/*`. Mitigation:
  typecheck fails fast if missing; `extensions.md` references them as live types.
- **R3 (Bun runtime).** omp runs Bun. `ws` + `node:fs`/`node:os` +
  `@hcengineering/api-client` WebSocket under Bun — verified in Phase 1 smoke test.
- **R4 (config migration security).** Legacy `~/.pi` read + `~/.omp` write must
  preserve chmod 600 + atomic write + no secret logging. Mitigation: reuse
  pi-huly's existing secure-read/write helpers; add a focused test.

## 7. Toolchain

- Build: keep **rolldown** (single `dist/index.mjs` omp loads as extension module).
- Tests: keep **vitest** under Bun for Phase 1 (minimize churn). Optional later:
  migrate to `bun:test` to match omp convention.
- `oxfmt` / `oxlint` / `tsconfig`: keep.
- `.node-version`: bump/keep aligned to a Bun-compatible Node.

## 8. Confirmed decisions & open items

**Confirmed (by user):**

- Repo: `https://github.com/techio-dev/omp-huly` (package.json `homepage` /
  `repository` / `bugs` + README badges).
- Skills live in `~/.omp/agent/skills/` (user canonical); converted MCP → native
  `huly_*`. Package is **tools-only**.
- Config primary store `~/.omp/agent/huly/`, legacy `~/.pi` auto-migration.

**Open — confirm during review:**

- O1 — Skills packaging collision: tools-only design means omp discovers skills
  only from `~/.omp/agent/skills/` (no package `skills/`). Acceptable? (Avoids a
  same-name `huly-docs`/`huly-tasks` collision between a bundled copy and the
  global one.)
- O2 — Config migration granularity: design picks **per-entry on miss** (lazy,
  idempotent) vs bulk one-time on first run. Confirm lazy is preferred.
