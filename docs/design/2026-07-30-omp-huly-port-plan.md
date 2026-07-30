# omp-huly Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the `pi-huly` native Huly integration to oh-my-pi (omp) as `omp-huly` — tools-only package, Zod schemas, omp-namespaced imports, `~/.omp` config with legacy `~/.pi` auto-migration.

**Architecture:** Hard fork, omp-only. The Huly logic (client/pool/markup/resolver/handlers/confirm) is host-agnostic and stays verbatim; only the host-binding surface changes (imports, schema system, manifest, factory event payloads, config path, skills). Pi-huly's `HulyToolDefinition.execute` is already omp's exact `execute(toolCallId, params, signal, onUpdate, ctx)` shape, and `register.ts` already calls `pi.registerTool(...)` — so the port is: re-namespace + typebox→Zod + manifest/config/skills/factory-wiring.

**Tech Stack:** TypeScript, Zod (`zod@^4`), rolldown (build), vitest (tests), `@oh-my-pi/pi-coding-agent` + `@oh-my-pi/pi-tui` (peer deps), `@hcengineering/*` + `ws` (Huly client), Bun runtime (omp).

**Spec:** `docs/design/2026-07-30-omp-huly-port-from-pi-huly.md`

## Global Constraints

- **Working dir for all paths/commands:** `/Users/naicoi/Projects/lttech/omp-huly` (the fork repo), unless a path is under `~/.omp/agent/skills/` (user-global skills, outside the repo).
- **Package manager:** `pnpm` (pi-huly uses pnpm + pnpm-lock.yaml). Use `pnpm install` / `pnpm run <script>`.
- **Verify commands:** `pnpm run typecheck` (tsc --noEmit), `pnpm run build` (rolldown → dist/index.mjs), `pnpm run test:run` (vitest run), `pnpm run lint` (oxlint). A task is "green" only when the relevant subset passes.
- **No MCP.** omp-huly stays native (`huly_*` tools call Huly WebSocket/REST directly).
- **No `StringEnum` / `pi-ai`** — pi-huly uses neither (grep-confirmed); do not introduce them.
- **Imports:** re-namespace `@earendil-works/pi-coding-agent` → `@oh-my-pi/pi-coding-agent`, `@earendil-works/pi-tui` → `@oh-my-pi/pi-tui`. omp still accepts the `"pi"` manifest key as fallback, but we use canonical `"omp"`.
- **Do not touch host-agnostic logic:** `src/client/*`, `src/markup/*`, `src/config/resolver.ts`, `src/tools/confirm.ts`, `src/tools/domains/*.ts` handler bodies, the `defineHulyTool.execute` body. Only their imports/schemas/config-paths change.
- **Security invariant (config migration):** credentials writes stay atomic + chmod 0o600; never log token/password; legacy `~/.pi` reads honored only if chmod-600 valid.
- **Zod import:** use `import { z } from "zod"` (resolves to zod v4 "Classic"). omp detects tool schemas by duck-typing (`_zod` + `.parse`), so direct import is canonical & compatible (verified by review).

---

## File Structure

**Modify (repo):**
- `package.json` — name, deps (+zod, −typebox), peer deps (re-namespace), manifest key, repo URLs, `files`.
- `src/index.ts` — factory event-handler payload adaptation.
- `src/tools/builder.ts` — `ToolParams`/`Static` → Zod; import re-namespace.
- `src/tools/domains/_common.ts`, `_class-refs.ts`, `_entity-types.ts` — shared schema helpers → Zod.
- `src/tools/domains/<20 domain>.ts` — per-tool `Type.*` → `z.*` schemas.
- `src/tools/register.ts`, `src/tools/confirm.ts`, `src/commands/huly.ts`, `src/render/{issue,document,util}.ts` — import re-namespace only.
- `src/config/{config,credentials}.ts` — store path `~/.omp/agent/huly/` + legacy `~/.pi` auto-migration.
- `src/__tests__/e2e-*.test.ts`, `src/render/__tests__/*.test.ts` — import re-namespace.
- `README.md`, `CHANGELOG.md`, `NOTICE.md` — branding.

**Delete (repo):** `skills/` directory (tools-only package; canonical skills live in `~/.omp/agent/skills/`).

**Modify (user-global, outside repo):** `~/.omp/agent/skills/huly-docs/{SKILL.md,references/*}`, `~/.omp/agent/skills/huly-tasks/{SKILL.md,references/*}` — MCP → native `huly_*` conversion.

---

## Phase 1 — installs & runs on omp

### Task 1: package.json + manifest + repo + deps

**Files:**
- Modify: `package.json`
- Test: `pnpm run build` still succeeds (typebox still present; nothing breaks yet).

**Interfaces:**
- Produces: `name: "omp-huly"`, manifest `"omp": { "extensions": ["./dist/index.mjs"] }`, `zod@^4` in deps, `typebox` removed, peer deps `@oh-my-pi/*`, repo `techio-dev/omp-huly`.

- [ ] **Step 1: Edit `package.json`**

Set these fields:
```jsonc
{
  "name": "omp-huly",
  "version": "0.1.0",
  "description": "Native Huly support cho oh-my-pi (omp) — tools (KHÔNG MCP, gọi thẳng WebSocket API). Fork của pi-huly.",
  "keywords": ["huly", "oh-my-pi", "omp", "pi-package", "project-management"],
  "homepage": "https://github.com/techio-dev/omp-huly",
  "bugs": { "url": "https://github.com/techio-dev/omp-huly/issues" },
  "repository": { "type": "git", "url": "git+ssh://git@github.com/techio-dev/omp-huly.git" },
  "files": ["dist", "README.md", "LICENSE", "NOTICE.md", "CHANGELOG.md"],
  "dependencies": {
    "@hcengineering/api-client": "^0.7.423",
    "@hcengineering/core": "^0.7.423",
    "@hcengineering/platform": "^0.7.423",
    "@hcengineering/text-core": "^0.7.423",
    "@hcengineering/text-markdown": "^0.7.423",
    "ws": "^8.21.1",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@vitest/coverage-v8": "^4.1.10",
    "markdownlint-cli2": "^0.23.1",
    "oxfmt": "^0.60.0",
    "oxlint": "^1.75.0",
    "rolldown": "^1.2.0",
    "typescript": "^7.0.2",
    "vitest": "^4.1.10"
  },
  "peerDependencies": {
    "@oh-my-pi/pi-agent-core": "*",
    "@oh-my-pi/pi-coding-agent": "*",
    "@oh-my-pi/pi-tui": "*"
  },
  "engines": { "node": ">=22.19.0" },
  "omp": { "extensions": ["./dist/index.mjs"] }
}
```
Notes: remove `typebox` from both deps and peerDependencies; remove the `skills` array from the manifest; remove `./skills` from `files`. Drop the `typebox` devDep entirely.

- [ ] **Step 2: Install + verify build still green**

Run: `pnpm install && pnpm run build`
Expected: builds `dist/index.mjs`. typebox still present in src, so it compiles (typebox remains resolvable until Task 4 removes its usage; keep it installed until then — actually we removed it from package.json in Step 1, so add it back to devDependencies TEMPORARILY until Task 4). 

Correction: to keep the tree green between Task 1 and Task 4, **keep `typebox` in `devDependencies`** (not deps) until Task 4 removes all typebox usage; Task 4 Step final removes it. Apply: in Step 1, move `typebox` from deps → devDependencies (`"typebox": "^1.3.8"`), do NOT delete yet.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build(omp-huly): rename package, omp manifest, add zod, re-namespace peer deps"
```

---

### Task 2: Import re-namespace `@earendil-works/*` → `@oh-my-pi/*`

**Files (exact, 14 files, 19 sites):**
- Modify: `src/index.ts`, `src/commands/huly.ts`, `src/tools/builder.ts`, `src/tools/confirm.ts`, `src/tools/register.ts`, `src/render/document.ts`, `src/render/issue.ts`, `src/render/util.ts`, `src/__tests__/e2e-live-domains.test.ts`, `src/__tests__/e2e-live-hunt3.test.ts`, `src/__tests__/e2e-live.test.ts`, `src/__tests__/e2e-smoke.test.ts`, `src/render/__tests__/document.test.ts`, `src/render/__tests__/issue.test.ts`

**Interfaces:**
- Consumes: omp packages `@oh-my-pi/pi-coding-agent`, `@oh-my-pi/pi-tui` must export `ExtensionAPI`, `ExtensionContext`, `ExtensionCommandContext`, `AgentToolResult`, `ToolRenderResultOptions`, `Component`, `Text`.
- Produces: all src imports resolve to omp packages. **This task validates R2** (export availability) — `typecheck` will fail if an export is missing/renamed.

- [ ] **Step 1: Replace scopes mechanically**

Replace every `@earendil-works/pi-coding-agent` → `@oh-my-pi/pi-coding-agent` and `@earendil-works/pi-tui` → `@oh-my-pi/pi-tui` across the 14 files above. (A scoped sed is fine here — these are import specifiers, not code identifiers.)

- [ ] **Step 2: Install omp peer deps for typecheck**

The omp packages are needed for `tsc` to resolve. Add them to devDependencies (workspace link or npm) so typecheck can run:
```bash
pnpm add -D @oh-my-pi/pi-coding-agent@latest @oh-my-pi/pi-tui@latest
```
(These satisfy the peer deps locally; they remain peerDependencies for consumers.)

- [ ] **Step 3: Run typecheck — the R2 gate**

Run: `pnpm run typecheck`
Expected: PASS. If it FAILS on a missing export (e.g. `ToolRenderResultOptions` not exported by omp, or renamed), that is **R2 firing** — find the omp equivalent in `@oh-my-pi/pi-coding-agent` types and update the import. Common cases: omp may export the same names (extensions.md references them as live types). Record any rename in the commit message.

- [ ] **Step 4: Run tests + build**

Run: `pnpm run test:run && pnpm run build`
Expected: PASS (logic unchanged; only import specifiers changed).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(imports): re-namespace @earendil-works/* -> @oh-my-pi/*"
```

---

### Task 3: Config store → `~/.omp/agent/huly/` + legacy `~/.pi` auto-migration

**Files:**
- Modify: `src/config/credentials.ts`, `src/config/config.ts`
- Test: `src/config/__tests__/migration.test.ts` (create)

**Interfaces:**
- Consumes: pi-huly's existing secure read/write helpers in `credentials.ts` (`readFile`/`writeFile`/`chmod`/`stat`, schema validate, atomic rename).
- Produces: `loadCredentials()` and `loadConfig()` now (a) read/write `~/.omp/agent/huly/`, and (b) on load, merge any entries present in legacy `~/.pi/agent/huly/` but missing from the omp store, persisting the merge (idempotent). This resolves spec O2 with the simplest equivalent of "auto-migration on miss."

- [ ] **Step 1: Write the failing test**

Create `src/config/__tests__/migration.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, chmodSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCredentials, type Credentials } from "../credentials.js";
import { loadConfig, type Config } from "../config.js";

// Both modules read CONFIG_DIR/CREDENTIALS_DIR from homedir(); tests override
// via the modules' path-override param (loadCredentials/loadConfig accept an
// optional path arg — see existing signatures). If not present, add one.

describe("legacy ~/.pi -> ~/.omp auto-migration", () => {
  let ompDir: string;
  let legacyDir: string;

  beforeEach(() => {
    ompDir = mkdtempSync(join(tmpdir(), "omp-huly-"));
    legacyDir = mkdtempSync(join(tmpdir(), "pi-huly-"));
  });
  afterEach(() => {
    rmSync(ompDir, { recursive: true, force: true });
    rmSync(legacyDir, { recursive: true, force: true });
  });

  it("migrates a legacy workspace credential into the omp store on load", async () => {
    const legacy: Credentials = {
      version: 1,
      workspaces: {
        "corp-prod": {
          url: "https://huly.corp",
          workspace: "corp",
          token: "tok_123",
        },
      },
    };
    const legacyPath = join(legacyDir, "credentials.json");
    writeFileSync(legacyPath, JSON.stringify(legacy), { mode: 0o600 });
    chmodSync(legacyPath, 0o600);

    // omp store empty/absent -> loadCredentials(ompPath, legacyPath) migrates
    const creds = await loadCredentials(join(ompDir, "credentials.json"), legacyPath);

    expect(creds.workspaces["corp-prod"]?.token).toBe("tok_123");
    // persisted to omp store, chmod 600
    const ompPath = join(ompDir, "credentials.json");
    const st = statSync(ompPath);
    expect(st.mode & 0o777).toBe(0o600);
  });

  it("does not overwrite an omp entry that already exists (idempotent)", async () => {
    const ompCreds: Credentials = {
      version: 1,
      workspaces: {
        "corp-prod": { url: "https://new", workspace: "corp", token: "new_tok" },
      },
    };
    const ompPath = join(ompDir, "credentials.json");
    writeFileSync(ompPath, JSON.stringify(ompCreds), { mode: 0o600 });
    chmodSync(ompPath, 0o600);

    const legacyPath = join(legacyDir, "credentials.json");
    writeFileSync(
      legacyPath,
      JSON.stringify({ version: 1, workspaces: { "corp-prod": { url: "https://old", workspace: "corp", token: "old_tok" } } }),
      { mode: 0o600 },
    );
    chmodSync(legacyPath, 0o600);

    const creds = await loadCredentials(ompPath, legacyPath);
    expect(creds.workspaces["corp-prod"]?.token).toBe("new_tok"); // omp wins
  });

  it("migrates legacy project bindings into omp config on load", async () => {
    const legacyCfg: Config = { version: 1, transport: "ws", projects: { "/work/a": { workspace: "corp-prod", project: "PD" } } };
    const legacyPath = join(legacyDir, "config.json");
    writeFileSync(legacyPath, JSON.stringify(legacyCfg));

    const cfg = await loadConfig(join(ompDir, "config.json"), legacyPath);
    expect(cfg.projects["/work/a"]?.project).toBe("PD");
  });
});
```

If `loadCredentials`/`loadConfig` do not already accept a path-override arg, **add one** (defaulting to the `~/.omp` primary path) so tests can point at temp dirs — this is the test seam.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test:run -- src/config/__tests__/migration.test.ts`
Expected: FAIL (paths still `~/.pi`; no migration logic; possibly missing path-override arg).

- [ ] **Step 3: Implement — `src/config/credentials.ts`**

1. Change:
   ```ts
   export const CREDENTIALS_DIR = join(homedir(), ".omp", "agent", "huly");
   export const CREDENTIALS_PATH = join(CREDENTIALS_DIR, "credentials.json");
   export const LEGACY_CREDENTIALS_PATH = join(homedir(), ".pi", "agent", "huly", "credentials.json");
   ```
2. Add a `legacyPath` param to `loadCredentials(overridePath?, legacyOverridePath?)` (default `CREDENTIALS_PATH` / `LEGACY_CREDENTIALS_PATH`).
3. After loading the omp store (or treating absent as empty), if the legacy file exists AND is chmod-0o600 valid: parse it, and for each `workspaces[id]` NOT already in the omp store, copy it in. If any were copied, persist via the existing atomic-write + chmod-0o600 path. Never overwrite an existing omp entry.
4. Keep all existing security (schema validate, atomic rename, chmod verify, no secret logging). The legacy read reuses `validateWorkspace` for each migrated entry.

- [ ] **Step 4: Implement — `src/config/config.ts`**

Mirror the credentials change:
```ts
export const CONFIG_DIR = join(homedir(), ".omp", "agent", "huly");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");
export const LEGACY_CONFIG_PATH = join(homedir(), ".pi", "agent", "huly", "config.json");
```
Add `legacyPath` param to `loadConfig(...)`. On load, merge legacy `projects` bindings missing from omp (omp wins on key collision). Merge `transport`/`pool`/`quietUpstreamNoise`/`upstreamNoisePatterns` only if absent in omp (omp's explicit setting wins). Persist the merge if anything changed (non-secret; default perms OK).

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm run test:run -- src/config`
Expected: PASS (new migration tests + existing config/credentials tests, with paths updated).

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm run typecheck`
```bash
git add -A
git commit -m "feat(config): move store to ~/.omp/agent/huly + legacy ~/.pi auto-migration"
```

---

### Task 4: Schema migration typebox → Zod (the bulk — atomic)

> This task is **atomic**: typecheck is red until ALL files are converted. Do not commit mid-task. The conversion is mechanical via the rule table below.

**Files (23 non-test files):**
- `src/tools/builder.ts`
- `src/tools/domains/_common.ts` (shared schemas — convert), `_class-refs.ts` + `_entity-types.ts` (verify only — no schemas; hold Huly `_class`/type refs)
- `src/tools/domains/{workspace,projects,milestones,task-management,components,spaces,document-snapshots,labels,tags,tag-categories,comments,search,deletion,time,contacts,documents,issues-core,issues-relations,issues-templates,attachments,todos}.ts`

**Interfaces:**
- Consumes: `zod@^4` (added in Task 1).
- Produces: every tool's `parameters` is a Zod object; `ToolParams = z.ZodObject`; `Static<P>` → `z.infer<P>`. omp's `registerTool` accepts the Zod schema as `parameters` (R1 verification at Task 8 smoke test).

**Conversion rule table (apply uniformly):**

| typebox | Zod |
|---|---|
| `import { Type } from "typebox"` | `import { z } from "zod"` |
| `import { Type, type TObject, type TOptional, type TString, type TInteger } from "typebox"` | `import { z } from "zod"` (drop typebox type imports) |
| `Type.Object({...})` | `z.object({...})` |
| `Type.String()` | `z.string()` |
| `Type.String({ description: "x" })` | `z.string().describe("x")` |
| `Type.Integer()` | `z.number().int()` |
| `Type.Integer({ minimum: 1 })` | `z.number().int().min(1)` |
| `Type.Number()` | `z.number()` |
| `Type.Boolean()` | `z.boolean()` |
| `Type.Boolean({ description: "x" })` | `z.boolean().describe("x")` |
| `Type.String({ description, minLength: N, maxLength: M })` | `z.string().describe("...").min(N).max(M)` |
| `Type.Number({ description, minimum: N })` | `z.number().describe("...").min(N)` |
| `Type.Integer({ description, minimum: N })` | `z.number().int().describe("...").min(N)` |
| `Type.Optional(X)` | `z.optional(X)` (or `X.optional()`) |
| `Type.Union([Type.Literal("a"), Type.Literal("b")])` | `z.enum(["a", "b"])` |
| `Type.Union([A, B])` (non-literal) | `z.union([A, B])` |
| `Type.Literal("x")` | `z.literal("x")` |
| `Type.Array(X)` | `z.array(X)` |
| `Type.Record(K, V)` | `z.record(K, V)` |
| `Type.Unknown()` | `z.unknown()` |
| `Type.Null()` | `z.null()` |
| `Type.Any()` | `z.unknown()` (prefer over `z.any`) |
| type alias `TObject` | `z.ZodObject<z.ZodRawShape>` (`z.AnyZodObject` was REMOVED in zod v4) |
| type alias `TOptional<TString>` | `z.ZodOptional<z.ZodString>` (or just annotate the const with `z.ZodType`) |
| `Static<P>` | `z.infer<P>` |

**Shared-schema notes for `_common.ts`:** exported param consts like `workspaceParam: TOptional<TString>` become, e.g., `export const workspaceParam = z.string().optional().describe("Workspace id-handle override (default: cwd-map).")`. Drop the explicit `TOptional<TString>` annotation (let Zod inference carry the type). `baseParams(): TObject` → `function baseParams() { return z.object({ workspace: workspaceParam }); }` (return type inferred). Domains reference these consts inside their own `z.object({...})` — confirmed (no spreading; e.g. `issues-core.ts` inlines `workspace: workspaceParam, project: projectParam, ...`).

- [ ] **Step 1: Convert `builder.ts`**

1. `import type { Static, TObject } from "typebox"` → `import { z } from "zod"`.
2. `export type ToolParams = TObject;` → `export type ToolParams = z.ZodObject<z.ZodRawShape>;` — **NOT `z.AnyZodObject`** (removed in zod v4; `z.ZodObject<z.ZodRawShape>` is the equivalent of "any object schema").
3. Every `Static<P>` → `z.infer<P>` (in `DefineHulyToolOptions.handler`, `HulyToolDefinition.execute`, `destructiveContext`).
4. `parameters: P` stays (now `P extends z.ZodObject<z.ZodRawShape>`).
5. The `execute` body is unchanged (host-agnostic).

- [ ] **Step 2: Convert `_class-refs.ts` and `_entity-types.ts`**

Check both for typebox usage (`grep "Type\.\|TObject\|from \"typebox\"" src/tools/domains/_class-refs.ts src/tools/domains/_entity-types.ts`). If `_class-refs.ts` only holds string consts (Huly `_class` identifiers), it has no schemas — leave as-is. If `_entity-types.ts` has typebox, convert per the table. (Verify before editing.)

- [ ] **Step 3: Convert `_common.ts`**

Apply the rule table to all `Type.*` schemas (`workspaceParam`, `projectParam`, `limitParam`, `identifierParam`, `prioritySchema`, `statusCategorySchema`, `baseParams()`, `projectParams()`). Drop typebox type-only imports. Keep all non-schema helpers (`resolveIdentifier`, `escapeLikePattern`, `safeUpdateDoc`, etc.) untouched.

- [ ] **Step 4: Convert the 20 domain files**

For each of the 20 domain files listed above, apply the rule table to every `Type.*` call inside `defineHulyTool({ parameters: Type.Object({...}), ... })`. Do NOT touch handler bodies, imports of `_class-refs`/`_entity-types`/`_common` consts, or `defineHulyTool` options other than `parameters`.

**Also convert typebox usage in tests:** `grep -rln 'from "typebox"\|Type\.' src/**/__tests__` and convert every match — notably `src/tools/__tests__/builder.test.ts` builds `Type.Object({...})` schemas fed into `defineHulyTool`, which would fail the `P extends z.ZodObject<z.ZodRawShape>` constraint after migration. Tests assert tool *behavior*, not schema shapes, so assertions stay valid; only schema construction changes.

- [ ] **Step 5: Remove `typebox` from devDependencies**

Now that no src uses typebox, delete `"typebox"` from `package.json` devDependencies. Run `pnpm install`.

- [ ] **Step 6: Typecheck — the gate**

Run: `pnpm run typecheck`
Expected: PASS. Fix any leftover `Type.`/`Static<`/`TObject`/`from "typebox"` (grep to confirm none remain): `grep -rn "typebox\|Type\.\|Static<\|TObject" src/`.

- [ ] **Step 7: Run full test suite + build**

Run: `pnpm run test:run && pnpm run build`
Expected: PASS. (Tests assert tool behavior, not schema library — they should pass unchanged; a few tests may construct params objects — verify they still match Zod-inferred types.)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(schemas): migrate typebox -> Zod across all tools (omp canonical)"
```

---

### Task 5: index.ts factory — omp event-payload adaptation

**Files:**
- Modify: `src/index.ts` (lines ~214-245: the `pi.on(...)` handlers)
- Test: `src/__tests__/index.test.ts` (existing — verify still passes)

**Interfaces:**
- Consumes: omp event payload types from `@oh-my-pi/pi-coding-agent` (the `session_start`, `session_shutdown`, `tool_execution_start` event shapes in omp's `types.ts`).
- Produces: event handlers read the correct omp payload fields.

- [ ] **Step 1: Inspect omp event payload shapes**

In the omp package types (`node_modules/@oh-my-pi/pi-coding-agent/.../extensibility/extensions/types.ts`, or via hover in the editor), read the payload type for:
- `session_start` — does it have a `reason` field (pi-huly uses `event.reason` ∈ {startup, resume, reload, new, fork})? If omp renamed/removed it, adapt `WARM_REASONS` logic.
- `tool_execution_start` — does it have `toolName` + `args` (pi-huly's `logToolCall` reads both)?
- `session_shutdown` — pi-huly's handler takes no args; fine.

- [ ] **Step 2: Adapt the three handlers in `index.ts`**

- `pi.on("session_shutdown", async () => { await closeAll(); ... })` — unchanged (ignores args).
- `pi.on("session_start", (event) => { if (!WARM_REASONS.has(event.reason)) return; void warmPool(); })` — adjust `event.reason` to the omp field if different. If omp has no per-start reason, warm unconditionally on `session_start` (document the deviation).
- `pi.on("tool_execution_start", (event) => logToolCall(event))` — adjust `event.toolName` / `event.args` to omp's field names if different.
- **Factory return type:** change `export default function setup(pi: ExtensionAPI): number` → `: void`. omp's `ExtensionFactory` is `(pi) => void | Promise<void>`; returning a count is tolerated by TS's void-return rule but make it explicit.

- [ ] **Step 3: Typecheck + tests + build**

Run: `pnpm run typecheck && pnpm run test:run && pnpm run build`
Expected: PASS (the typecheck is the real gate here — it confirms the payload fields exist and are typed).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix(factory): adapt event handlers to omp session/tool payload shapes"
```

---

### Task 6: Convert `~/.omp/agent/skills/huly-*` MCP → native `huly_*`

> Files are OUTSIDE the repo (user-global `~/.omp/agent/skills/`). These are the user's canonical omp skills; omp-huly is tools-only.

**Files:**
- Modify: `~/.omp/agent/skills/huly-docs/SKILL.md`, `~/.omp/agent/skills/huly-docs/references/huly-mcp-setup.md` (rename → `omp-huly-setup.md`)
- Modify: `~/.omp/agent/skills/huly-tasks/SKILL.md`, `~/.omp/agent/skills/huly-tasks/references/huly-mcp-setup.md` (rename → `omp-huly-setup.md`), `~/.omp/agent/skills/huly-tasks/references/huly-mcp-params.md` (rename → `huly-tool-params.md`)

**Interfaces:**
- Produces: skill bodies reference omp-huly native `huly_*` tools (not `@firfi/huly-mcp` MCP tools), and setup docs describe `omp install npm:omp-huly` + `/huly init` + `/huly status`.

**Conversion rules:**
1. Tool refs: `create_issue` → `huly_create_issue`, `get_document` → `huly_get_document`, `list_issues` → `huly_list_issues`, etc. (prepend `huly_` to every bare MCP tool name). Apply across both SKILL.md + references.
2. Remove `@firfi/huly-mcp` framing: "MCP server", "MCP tool", "get_huly_context" → "extension omp-huly", "native huly tool", "`/huly status`".
3. Setup: replace MCP env-var/TOOLSETS config with omp-huly native setup (`omp install npm:omp-huly`, `/huly init`, `/huly status` diagnostic, config at `~/.omp/agent/huly/` with `~/.pi` legacy migration).
4. Rename reference files: `huly-mcp-setup.md` → `omp-huly-setup.md`; `huly-mcp-params.md` → `huly-tool-params.md`. Update SKILL.md `references/...` links + description frontmatter.
5. Restore the exact `huly_*` param table (pi-huly's `references/huly-tool-params.md` / `task-format.md` content is the source of truth for native tool params — port that param detail into the renamed file).

- [ ] **Step 1: Convert `huly-docs`**

Apply rules 1-4 to `~/.omp/agent/skills/huly-docs/SKILL.md` and its `references/`. Rename `references/huly-mcp-setup.md` → `references/omp-huly-setup.md`. Port pi-huly's native doc-setup content (from `pi-huly/skills/huly-docs/references/pi-huly-setup.md`, adapted omp→pi inverse) as the basis.

- [ ] **Step 2: Convert `huly-tasks`**

Apply rules 1-5 to `~/.omp/agent/skills/huly-tasks/SKILL.md` + references. Rename `huly-mcp-setup.md` → `omp-huly-setup.md` and `huly-mcp-params.md` → `huly-tool-params.md`. Port pi-huly's `references/huly-tool-params.md` (exact `huly_*` field table) into the renamed params file.

- [ ] **Step 3: Verify no MCP references remain**

Run: `grep -rn "@firfi/huly-mcp\|MCP tool\|MCP server\|get_huly_context\|create_issue\|get_document\|list_issues" ~/.omp/agent/skills/huly-docs ~/.omp/agent/skills/huly-tasks`
Expected: no matches (every bare tool name now has `huly_` prefix; no MCP framing).

- [ ] **Step 4: Commit (in the omp-huly repo, document the external skill change)**

The skills live outside the repo, so commit a note in `CHANGELOG.md` (Task 7 covers CHANGELOG). No repo file change here. Mark task done.

---

### Task 7: README / CHANGELOG / NOTICE branding + remove repo `skills/`

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, `NOTICE.md`
- Delete: `skills/` directory (repo copy — not packaged; canonical skills are in `~/.omp`)

- [ ] **Step 1: Rewrite `README.md`**

- Title/intro: "omp-huly — Native Huly support cho oh-my-pi (omp)". State it's a fork of pi-huly.
- Features list: keep pi-huly's (native, lean, multi-workspace, transport toggle, confirm gate, markdown round-trip, TUI render). Drop/adjust pi-specific framing.
- Requirements: **Bun ≥ 1.3.14** (omp runtime), self-host Huly, `@hcengineering/*` public on npm.
- Install: `omp install npm:omp-huly`. From source: `pnpm install && pnpm run build`.
- Quick start: `omp install npm:omp-huly` → `/huly init` → use tools. Note: config at `~/.omp/agent/huly/`; existing pi-huly users auto-migrate from `~/.pi`.
- Note skills: Huly skills (`huly-docs`, `huly-tasks`) live in `~/.omp/agent/skills/` (not bundled); tools-only package.
- Badges/URLs: `techio-dev/omp-huly`.

- [ ] **Step 2: Update `CHANGELOG.md`**

Add entry at top:
```
## [0.1.0] — 2026-07-30
- Fork from pi-huly; retarget to oh-my-pi (omp).
- Schema system: typebox -> Zod.
- Imports: @earendil-works/* -> @oh-my-pi/*.
- Config store: ~/.omp/agent/huly/ (+ legacy ~/.pi auto-migration).
- Tools-only package; Huly skills maintained in ~/.omp/agent/skills/.
```

- [ ] **Step 3: Update `NOTICE.md`**

Note omp fork lineage (fork of pi-huly, which targets Pi by Mario; omp is can1357's Pi fork). Keep @hcengineering attribution.

- [ ] **Step 4: Remove repo `skills/` dir**

```bash
git rm -r skills
```

- [ ] **Step 5: Build + commit**

Run: `pnpm run build`
```bash
git add -A
git commit -m "docs: omp-huly branding; drop bundled skills (tools-only)"
```

---

### Task 8: Smoke test on omp (R1 + R3 + migration verification)

> Manual verification task. Confirms the port actually runs on omp, Zod schemas validate (R1), and `ws`/Huly client work under Bun (R3), and legacy config migrates.

- [ ] **Step 1: Build the package tarball**

Run: `pnpm run build && pnpm pack`
Expected: `omp-huly-0.1.0.tgz` produced.

- [ ] **Step 2: Install into omp**

Run: `omp install ./omp-huly-0.1.0.tgz` (or `omp install npm:omp-huly` if published).
Expected: extension discovered via `"omp".extensions` manifest; loads without error.

- [ ] **Step 3: Verify legacy config migration**

If `~/.pi/agent/huly/credentials.json` exists (from prior pi-huly use) and `~/.omp/agent/huly/` does not: start omp in a bound cwd, run `/huly status`. Expected: workspace resolves; `~/.omp/agent/huly/credentials.json` now exists (migrated), chmod 600.

- [ ] **Step 4: `/huly init` (if no prior config)**

Run `/huly init`, pick workspace + project, bind to cwd. Expected: `~/.omp/agent/huly/{config,credentials}.json` written.

- [ ] **Step 5: Exercise one read + one create tool (R1 + R3)**

In omp, prompt: "List issues in project PD" (read) and "Create issue PD-?: 'omp port smoke' priority low" (create).
Expected: LLM calls `huly_list_issues` / `huly_create_issue`; **schemas validate** (R1 — proves Zod schemas accepted by omp); Huly WebSocket connects under Bun (R3); issue created.

- [ ] **Step 6: Record results**

If R1 fails (omp rejects the directly-imported Zod schema): fall back to **Approach B** — in `index.ts`/builder, re-derive schemas through `pi.zod` at registration time (bounded change; add a `pi.zod`-based re-build step). Re-run Step 5. Document outcome in CHANGELOG.

---

## Phase 2 — parity polish

### Task 9: Render hooks via omp `renderResult`

**Files:**
- Modify: `src/index.ts` (`buildToolsWithRender` + `RENDER_HOOKS`), `src/render/{issue,document}.ts` signatures
- Test: existing `src/render/__tests__/{issue,document}.test.ts`

**Interfaces:**
- Consumes: omp `ToolDefinition.renderResult(result, options, theme, args)`. pi-huly's `RenderHook` is `(result, options, theme, { lastComponent })` — adapt the 4th arg.
- Produces: 3 high-value tools (`huly_get_issue`, `huly_list_issues`, `huly_get_document`) render custom TUI `Component`s in omp interactive mode.

- [ ] **Step 1: Inspect omp `renderResult` signature + `Component`**

Confirm `renderResult(result: AgentToolResult, options: ToolRenderResultOptions, theme, args)` and that `@oh-my-pi/pi-tui` exports the `Component`/`Text`/`Container` etc. that `render/issue.ts`, `render/document.ts`, `render/util.ts` use.

- [ ] **Step 2: Adapt `RENDER_HOOKS` in `index.ts`**

Change the `RenderHook` type's last param from `{ lastComponent?: Component }` to omp's `args` shape. Update the 3 hook functions' signatures accordingly. If `lastComponent` was used, find the omp equivalent (likely via `options` or omitted). Concretely:

```ts
// omp ToolDefinition.renderResult(result, options, theme, args)
type RenderHook = (
  result: AgentToolResult<unknown>,
  options: ToolRenderResultOptions,
  theme: unknown,
  args: unknown, // omp passes the tool's parsed args; pi-huly previously read { lastComponent? }
) => Component;
```

- [ ] **Step 3: Typecheck + render tests + build**

Run: `pnpm run typecheck && pnpm run test:run -- src/render && pnpm run build`
Expected: PASS.

- [ ] **Step 4: Manual verify in omp TUI**

Run omp, call `huly_get_issue`; expect the custom issue card (not default text). Commit:
```bash
git add -A && git commit -m "feat(render): wire renderResult hooks to omp TUI signature"
```

---

### Task 10: Confirm gate + RPC verification

**Files:**
- Verify only: `src/tools/confirm.ts` (logic unchanged in Phase 1).

- [ ] **Step 1: Verify non-TUI auto-deny**

Run omp in a non-interactive/headless context (or a subagent `ctx.hasUI === false`) and trigger a destructive tool (`huly_delete_issue`). Expected: auto-deny (returns "cancelled"), no deletion. Confirms NFR-10 holds on omp.

- [ ] **Step 2: Verify RPC `confirm` round-trip**

Run omp in RPC mode, trigger `huly_delete_issue`. Expected: `ctx.ui.confirm` round-trips to the client; user yes/no honored.

- [ ] **Step 3: Evaluate omp `approval` field (optional)**

If omp's `ToolDefinition.approval` field offers a cleaner native permission prompt than the manual `confirmDestructive`, note it as a future improvement (do not change unless it's strictly better + tested). Commit any docs note:
```bash
git add -A && git commit -m "docs(confirm): note omp approval-field alternative (deferred)"
```

---

## Self-Review (completed)

- **Spec coverage:** §3.2 divergence table → Tasks 1-5,7. §4.2.5 config migration → Task 3. §4.2.6 skills → Task 6. §5 Phase 1 exit criteria → Task 8. §5 Phase 2 → Tasks 9-10. §6 R1→Task 8 Step 6, R2→Task 2 Step 3, R3→Task 8 Step 5, R4→Task 3. All covered.
- **Placeholder scan:** none. Every step has exact files + commands/code. Task 5 Step 1 / Task 9 Step 1 are "inspect then adapt" — intentional (omp payload/`Component` shapes must be read from the installed package at execution time, not guessed).
- **Type consistency:** `ToolParams = z.ZodObject<z.ZodRawShape>` (Task 4 Step 1 — corrected from `z.AnyZodObject`, which does NOT exist in zod v4) consumed by every domain `parameters: P` (Task 4 Step 4) — consistent. `loadCredentials(ompPath, legacyPath)` signature (Task 3 Step 1 test) matches implementation (Task 3 Step 3) — consistent. Test files using typebox (`builder.test.ts`) are converted in Task 4 Step 4.

## Review revisions (independent subagent review, 2026-07-30)

Three independent reviewers ran (omp-API librarian; spec-coverage; Zod-conversion) and verified claims against real omp source + pi-huly source. Fixes applied to this plan:
- **P0:** `z.AnyZodObject` → `z.ZodObject<z.ZodRawShape>` (removed in zod v4) — flagged by two reviewers independently.
- **P1:** added missing conversion rows (`Type.Boolean/String/Number/Integer` with `description`/`min`/`max` constraints).
- **P2:** Task 4 now converts typebox in test files (`builder.test.ts`); Task 2 file count 11→14; Task 4 file list annotates non-schema files; Task 5 factory return `: void`; Task 9 Step 2 gets a concrete `RenderHook` type.
- **Verified by review (no action needed):** R1 holds — omp duck-types Zod schemas via `_zod` + `.parse`, so direct `import { z } from "zod"` works without `pi.zod`. All omp API claims + exports (`ExtensionAPI`, `AgentToolResult`, `ToolRenderResultOptions`, `ExtensionContext`, `Component`, events) confirmed against omp source. `session_start` payload is `{ type: "session_start" }` with NO `reason` field → Task 5 warms unconditionally. `tool_execution_start` has `toolName` + `args`. Spec fully covered (no gaps, no scope-creep).
