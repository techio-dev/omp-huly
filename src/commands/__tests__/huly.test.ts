// Test T-31 commands/huly.ts — unified /huly command.
// Strategy: test pure logic (runHulyCommand + parseArgs) với mock CommandContext.
// Temp dirs cho credentialsPath/configPath (KHÔNG touch ~/.pi/agent/huly).
// Mock getClient/health để tránh real connection (pool module-level singleton).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { parseArgs, runHulyCommand, type CommandContext, type CommandUI } from "../huly.js";
import { saveCredentials, type Credentials } from "../../config/credentials.js";
import { saveConfig, type Config } from "../../config/config.js";

// === Mock pool (getClient + health) — tránh real connection ===

const mockClient = {
  getCurrentUser: vi.fn(),
  findAll: vi.fn(),
  createDoc: vi.fn(),
};

vi.mock("../../client/pool.js", () => ({
  getClient: vi.fn(() => Promise.resolve(mockClient)),
  health: vi.fn(() => Promise.resolve([])),
  closeAll: vi.fn(() => Promise.resolve()),
}));

// === Test fixtures ===

const TEST_DIR = join(tmpdir(), `pi-huly-cmd-test-${process.pid}`);
const CRED_PATH = join(TEST_DIR, "credentials.json");
const CONFIG_PATH = join(TEST_DIR, "config.json");
// Legacy paths point to NON-EXISTENT temp files → isolates tests from the user's real ~/.pi (migration no-op).
const LEGACY_CRED_PATH = join(TEST_DIR, "legacy-credentials.json");
const LEGACY_CONFIG_PATH = join(TEST_DIR, "legacy-config.json");
const CWD = "/fake/project";

function makeUI(overrides: Partial<CommandUI> = {}): CommandUI {
  return {
    select: vi.fn(),
    confirm: vi.fn(),
    input: vi.fn(),
    notify: vi.fn(),
    ...overrides,
  };
}

function makeCtx(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    ui: makeUI(),
    hasUI: true,
    cwd: CWD,
    credentialsPath: CRED_PATH,
    configPath: CONFIG_PATH,
    legacyCredentialsPath: LEGACY_CRED_PATH,
    legacyConfigPath: LEGACY_CONFIG_PATH,
    ...overrides,
  };
}

async function writeCreds(workspaces: Credentials["workspaces"]): Promise<void> {
  await saveCredentials({ version: 1, workspaces }, CRED_PATH);
}

async function writeConfig(config: Config): Promise<void> {
  await saveConfig(config, CONFIG_PATH);
}

beforeEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
  await mkdir(TEST_DIR, { recursive: true });
  vi.clearAllMocks();
  mockClient.getCurrentUser.mockResolvedValue({ id: "u1", name: "Nai", email: "nai@x.com" });
  mockClient.findAll.mockResolvedValue([]);
  mockClient.createDoc.mockResolvedValue("new-id");
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

// === parseArgs ===

describe("parseArgs", () => {
  it("empty string → undefined subcommand", () => {
    expect(parseArgs("")).toEqual({ subcommand: undefined, positional: [] });
  });

  it("whitespace only → undefined subcommand", () => {
    expect(parseArgs("   ")).toEqual({ subcommand: undefined, positional: [] });
  });

  it("single subcommand", () => {
    expect(parseArgs("init")).toEqual({ subcommand: "init", positional: [] });
  });

  it("subcommand + positionals", () => {
    expect(parseArgs("link ws-x PD")).toEqual({
      subcommand: "link",
      positional: ["ws-x", "PD"],
    });
  });

  it("trims + collapses whitespace", () => {
    expect(parseArgs("  status   ")).toEqual({ subcommand: "status", positional: [] });
  });
});

// === Dispatch: unknown subcommand ===

describe("runHulyCommand — dispatch", () => {
  it("unknown subcommand → error", async () => {
    const ctx = makeCtx();
    const result = await runHulyCommand("bogus", ctx);
    expect(result.type).toBe("error");
    expect(result.message).toContain("Unknown subcommand");
    expect(result.message).toContain("init");
  });
});

// === /huly status ===

describe("/huly status", () => {
  it("shows version + cwd + no binding", async () => {
    const ctx = makeCtx();
    const result = await runHulyCommand("status", ctx);
    expect(result.type).toBe("info");
    expect(result.message).toContain("pi-huly v");
    expect(result.message).toContain(`cwd: ${CWD}`);
    expect(result.message).toContain("binding: (none");
    expect(result.message).toContain("workspaces: 0 configured");
  });

  it("shows binding when cwd bound", async () => {
    await writeConfig({
      version: 1,
      transport: "ws",
      projects: { [CWD]: { workspace: "ws1", project: "PD" } },
    });
    await writeCreds({ ws1: { url: "https://h", workspace: "prod", token: "t" } });
    const ctx = makeCtx();
    const result = await runHulyCommand("status", ctx);
    expect(result.message).toContain('workspace "ws1"');
    expect(result.message).toContain('project "PD"');
    expect(result.message).toContain("workspaces: 1 configured");
  });

  it("shows pool health (empty)", async () => {
    const ctx = makeCtx();
    const result = await runHulyCommand("status", ctx);
    expect(result.message).toContain("pool: (no active connections)");
  });

  it("calls health() with bound workspace when cwd bound", async () => {
    const { health } = await import("../../client/pool.js");
    await writeConfig({
      version: 1,
      transport: "ws",
      projects: { [CWD]: { workspace: "ws1", project: "PD" } },
    });
    await writeCreds({ ws1: { url: "https://h", workspace: "prod", token: "t" } });
    const ctx = makeCtx();
    await runHulyCommand("status", ctx);
    expect(health).toHaveBeenCalledWith("ws1");
  });

  // T-62 #67: hiển thị dòng pool noise khi có upstream log đã filter.
  it("T-62: shows pool noise line when upstreamNoiseFiltered > 0", async () => {
    const { health } = await import("../../client/pool.js");
    vi.mocked(health).mockResolvedValueOnce([
      {
        workspace: "ws1",
        connected: true,
        transport: "ws",
        user: { id: "u1", name: "User", email: "u@x.com" },
        upstreamNoiseFiltered: { total: 42, byPattern: { "/^no document found/i": 42 } },
      },
    ]);
    const ctx = makeCtx();
    const result = await runHulyCommand("status", ctx);
    // Total + per-pattern breakdown (T-64 readiness — phân biệt nguồn noise).
    expect(result.message).toContain("pool noise: 42 upstream log filtered");
    expect(result.message).toContain("/^no document found/i: 42");
  });

  it("T-62: KHÔNG show pool noise line khi total = 0", async () => {
    const { health } = await import("../../client/pool.js");
    vi.mocked(health).mockResolvedValueOnce([
      {
        workspace: "ws1",
        connected: true,
        transport: "ws",
        user: { id: "u1", name: "User", email: "u@x.com" },
      },
    ]);
    const ctx = makeCtx();
    const result = await runHulyCommand("status", ctx);
    expect(result.message).not.toContain("pool noise");
  });
});

// === /huly workspace list|add|remove ===

describe("/huly workspace", () => {
  it("list empty → no workspaces", async () => {
    const ctx = makeCtx();
    const result = await runHulyCommand("workspace list", ctx);
    expect(result.type).toBe("info");
    expect(result.message).toContain("No workspaces configured");
  });

  it("list → shows id + url + auth method", async () => {
    await writeCreds({
      ws1: { url: "https://h", workspace: "prod", token: "t" },
      ws2: { url: "https://h2", workspace: "dev", email: "a@b.c", password: "p" },
    });
    const ctx = makeCtx();
    const result = await runHulyCommand("workspace list", ctx);
    expect(result.message).toContain("Workspaces (2)");
    expect(result.message).toContain("ws1 → https://h");
    expect(result.message).toContain("auth=token");
    expect(result.message).toContain("ws2 → https://h2");
    expect(result.message).toContain("auth=email+pass");
  });

  it("remove existing → success", async () => {
    await writeCreds({ ws1: { url: "https://h", workspace: "prod", token: "t" } });
    const ctx = makeCtx();
    const result = await runHulyCommand("workspace remove ws1", ctx);
    expect(result.type).toBe("info");
    expect(result.message).toContain('Removed workspace "ws1"');
  });

  it("remove non-existent → warning", async () => {
    const ctx = makeCtx();
    const result = await runHulyCommand("workspace remove ghost", ctx);
    expect(result.type).toBe("warning");
    expect(result.message).toContain("not found");
  });

  it("remove without id → usage error", async () => {
    const ctx = makeCtx();
    const result = await runHulyCommand("workspace remove", ctx);
    expect(result.type).toBe("error");
    expect(result.message).toContain("Usage:");
  });

  it("no action → usage error", async () => {
    const ctx = makeCtx();
    const result = await runHulyCommand("workspace", ctx);
    expect(result.type).toBe("error");
    expect(result.message).toContain("list|add|remove");
  });

  it("add non-TUI → error (requires UI)", async () => {
    const ctx = makeCtx({ hasUI: false });
    const result = await runHulyCommand("workspace add", ctx);
    expect(result.type).toBe("error");
    expect(result.message).toContain("interactive UI");
  });
});

// === /huly link / unlink ===

describe("/huly link", () => {
  it("link ws + project → binds cwd", async () => {
    await writeCreds({ ws1: { url: "https://h", workspace: "prod", token: "t" } });
    const ctx = makeCtx();
    const result = await runHulyCommand("link ws1 PD", ctx);
    expect(result.type).toBe("info");
    expect(result.message).toContain("Bound");
    expect(result.message).toContain('workspace "ws1"');
    expect(result.message).toContain('project "PD"');
  });

  it("link missing args → usage error", async () => {
    const ctx = makeCtx();
    const result = await runHulyCommand("link", ctx);
    expect(result.type).toBe("error");
    expect(result.message).toContain("Usage:");
  });

  it("link unknown workspace → error (validate exists)", async () => {
    const ctx = makeCtx();
    const result = await runHulyCommand("link ghost PD", ctx);
    expect(result.type).toBe("error");
    expect(result.message).toContain("not found in credentials");
  });

  it("unlink bound → removes binding", async () => {
    await writeConfig({
      version: 1,
      transport: "ws",
      projects: { [CWD]: { workspace: "ws1", project: "PD" } },
    });
    const ctx = makeCtx();
    const result = await runHulyCommand("unlink", ctx);
    expect(result.type).toBe("info");
    expect(result.message).toContain("Unbound");
  });

  it("unlink unbound → info (no-op)", async () => {
    const ctx = makeCtx();
    const result = await runHulyCommand("unlink", ctx);
    expect(result.type).toBe("info");
    expect(result.message).toContain("no Huly binding");
  });
});

// === /huly (smart no-arg) ===

describe("/huly (smart)", () => {
  it("bound → runs status", async () => {
    await writeConfig({
      version: 1,
      transport: "ws",
      projects: { [CWD]: { workspace: "ws1", project: "PD" } },
    });
    const ctx = makeCtx();
    const result = await runHulyCommand("", ctx);
    expect(result.message).toContain("pi-huly v");
    expect(result.message).toContain('workspace "ws1"');
  });

  it("unbound + TUI → runs init", async () => {
    const ctx = makeCtx();
    // init sẽ prompt → mock trả cancel để tránh full flow
    ctx.ui.input = vi.fn().mockResolvedValue(undefined);
    const result = await runHulyCommand("", ctx);
    // init flow starts → prompt → user cancel → "cancelled"
    expect(result.message.includes("cancelled") || result.message.includes("Init")).toBe(true);
  });

  it("unbound + non-TUI → warning hint link (KHÔNG contradictory init)", async () => {
    const ctx = makeCtx({ hasUI: false });
    const result = await runHulyCommand("", ctx);
    expect(result.type).toBe("warning");
    expect(result.message).toContain("/huly link");
    // KHÔNG có notify "starting init" (tránh contradictory message)
    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });
});

// === /huly init (UC-01) ===

describe("/huly init", () => {
  it("non-TUI → error (requires UI)", async () => {
    const ctx = makeCtx({ hasUI: false });
    const result = await runHulyCommand("init", ctx);
    expect(result.type).toBe("error");
    expect(result.message).toContain("interactive UI");
    expect(result.message).toContain("/huly link");
  });

  it("cancel at workspace name → cancelled", async () => {
    const ctx = makeCtx();
    ctx.ui.input = vi.fn().mockResolvedValue(undefined);
    const result = await runHulyCommand("init", ctx);
    expect(result.type).toBe("info");
    expect(result.message).toContain("cancelled");
  });

  it("cancel empty workspace name → cancelled", async () => {
    const ctx = makeCtx();
    ctx.ui.input = vi.fn().mockResolvedValue("");
    const result = await runHulyCommand("init", ctx);
    expect(result.message).toContain("cancelled");
  });

  it("happy path: new workspace + create project → bound", async () => {
    // findByName returns 0 → prompt url + auth → addWorkspace
    // getCurrentUser verify OK → list_projects empty → create new
    const ctx = makeCtx();
    // Flow inputs (input prompts theo thứ tự gọi):
    //   [0] ws name, [1] url, [2] token (sau select "Token"),
    //   [3] project name, [4] project identifier (sau select "+ Create new")
    const inputs = [
      "prod-workspace", // ws name
      "https://huly.io", // url
      "tok123", // token (sau select auth=Token)
      "My Project", // project name
      "MP", // project identifier
    ];
    const selects = ["Token", "+ Create new project"];
    let inputIdx = 0;
    let selectIdx = 0;
    ctx.ui.input = vi.fn(() => Promise.resolve(inputs[inputIdx++]));
    ctx.ui.select = vi.fn(() => Promise.resolve(selects[selectIdx++]));
    ctx.ui.notify = vi.fn();

    const result = await runHulyCommand("init", ctx);

    expect(result.type).toBe("info");
    expect(result.message).toContain("Bound");
    expect(result.message).toContain(CWD);
    expect(result.message).toContain('workspace "prod-workspace"');
    expect(result.message).toContain('project "MP"');
    // create_project createDoc args chính xác (PROJECT_CLASS, space, {name, identifier})
    expect(mockClient.createDoc).toHaveBeenCalledWith("tracker:class:Project", "prod-workspace", {
      name: "My Project",
      identifier: "MP",
    });
  });

  it("reuse existing single-match workspace", async () => {
    await writeCreds({ prod: { url: "https://h", workspace: "prod", token: "t" } });
    const ctx = makeCtx();
    // ws name = "prod" → findByName returns 1 → reuse
    const inputs = ["prod", "NewProj", "NP"];
    const selects = ["+ Create new project"];
    let inputIdx = 0;
    let selectIdx = 0;
    ctx.ui.input = vi.fn(() => Promise.resolve(inputs[inputIdx++]));
    ctx.ui.select = vi.fn(() => Promise.resolve(selects[selectIdx++]));
    ctx.ui.notify = vi.fn();

    const result = await runHulyCommand("init", ctx);
    expect(result.message).toContain("Bound");
    expect(result.message).toContain('workspace "prod"');
    // KHÔNG prompt url khi reuse (chỉ prompt name + project name + identifier = 3 inputs).
    // Lọc theo arg 0 (title) — arg 1 là placeholder luôn undefined khi không truyền.
    const inputCalls = (ctx.ui.input as ReturnType<typeof vi.fn>).mock.calls;
    const urlPrompts = inputCalls.filter(([t]) => t === "Huly URL (vd https://huly.example.com):");
    expect(urlPrompts).toHaveLength(0);
    // ws name prompt phải được gọi (arg đầu)
    expect(inputCalls[0]?.[0]).toBe("Huly workspace name:");
  });

  it("ambiguous same-name → disambiguate select", async () => {
    await writeCreds({
      "prod-1": { url: "https://h1", workspace: "prod", token: "t1" },
      "prod-2": { url: "https://h2", workspace: "prod", token: "t2" },
    });
    const ctx = makeCtx();
    const inputs = ["prod", "NP-proj", "NPP"];
    const selects = [
      "prod-1 (https://h1)", // disambiguate
      "+ Create new project",
    ];
    let inputIdx = 0;
    let selectIdx = 0;
    ctx.ui.input = vi.fn(() => Promise.resolve(inputs[inputIdx++]));
    ctx.ui.select = vi.fn(() => Promise.resolve(selects[selectIdx++]));
    ctx.ui.notify = vi.fn();

    const result = await runHulyCommand("init", ctx);
    expect(result.message).toContain("Bound");
    expect(result.message).toContain('workspace "prod-1"');
  });

  it("auth failure at verify → error with hint", async () => {
    await writeCreds({ prod: { url: "https://h", workspace: "prod", token: "t" } });
    mockClient.getCurrentUser.mockRejectedValueOnce(new Error("Unauthorized"));
    const ctx = makeCtx();
    const inputs = ["prod"];
    let inputIdx = 0;
    ctx.ui.input = vi.fn(() => Promise.resolve(inputs[inputIdx++] ?? ""));

    const result = await runHulyCommand("init", ctx);
    expect(result.type).toBe("error");
    expect(result.message).toContain("Auth/connection failed");
    expect(result.message).toContain("Unauthorized");
  });

  it("invalid project identifier → cancelled (no createDoc)", async () => {
    await writeCreds({ prod: { url: "https://h", workspace: "prod", token: "t" } });
    const ctx = makeCtx();
    // ws name, project name, identifier quá dài + ký tự lạ (KHÔNG fix bằng uppercase)
    const inputs = ["prod", "My Proj", "toolong!!"];
    const selects = ["+ Create new project"];
    let inputIdx = 0;
    let selectIdx = 0;
    ctx.ui.input = vi.fn(() => Promise.resolve(inputs[inputIdx++]));
    ctx.ui.select = vi.fn(() => Promise.resolve(selects[selectIdx++]));
    ctx.ui.notify = vi.fn();

    const result = await runHulyCommand("init", ctx);
    // KHÔNG bind, KHÔNG createDoc (validation reject trước)
    expect(result.message).toContain("cancelled");
    expect(mockClient.createDoc).not.toHaveBeenCalled();
  });

  it("lowercase identifier → auto-uppercase + bound", async () => {
    await writeCreds({ prod: { url: "https://h", workspace: "prod", token: "t" } });
    const ctx = makeCtx();
    const inputs = ["prod", "My Proj", "mp"]; // lowercase → auto "MP"
    const selects = ["+ Create new project"];
    let inputIdx = 0;
    let selectIdx = 0;
    ctx.ui.input = vi.fn(() => Promise.resolve(inputs[inputIdx++]));
    ctx.ui.select = vi.fn(() => Promise.resolve(selects[selectIdx++]));
    ctx.ui.notify = vi.fn();

    const result = await runHulyCommand("init", ctx);
    expect(result.message).toContain("Bound");
    expect(result.message).toContain('project "MP"');
    // createDoc nhận identifier đã uppercase
    expect(mockClient.createDoc).toHaveBeenCalledWith("tracker:class:Project", "prod", {
      name: "My Proj",
      identifier: "MP",
    });
  });
});
