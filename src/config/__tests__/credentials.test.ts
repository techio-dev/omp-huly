import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmod, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import {
  addWorkspace,
  findByName,
  getWorkspace,
  loadCredentials,
  removeWorkspace,
  saveCredentials,
  type Credentials,
  type WorkspaceCreds,
} from "../credentials.js";

const TEST_DIR = join(tmpdir(), `pi-huly-test-${process.pid}`);
const TEST_PATH = join(TEST_DIR, "credentials.json");
const NONEXISTENT_PATH = join(tmpdir(), `nonexistent-${process.pid}`, "credentials.json");

async function writeCreds(path: string, content: string, mode = 0o600): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  await chmod(path, mode);
}

const tokenWs: WorkspaceCreds = {
  url: "https://huly.example.com",
  workspace: "myteam",
  token: "secret-token-123",
};
const emailWs: WorkspaceCreds = {
  url: "https://huly.corp.com",
  workspace: "corp",
  email: "user@corp.com",
  password: "pass123",
};

describe("loadCredentials", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("returns empty Credentials when file does not exist", async () => {
    const creds = await loadCredentials(TEST_PATH, NONEXISTENT_PATH);
    expect(creds).toEqual({ version: 1, workspaces: {} });
  });

  it("parses file with single workspace using token auth", async () => {
    await writeCreds(TEST_PATH, JSON.stringify({ version: 1, workspaces: { myteam: tokenWs } }));
    const creds = await loadCredentials(TEST_PATH, NONEXISTENT_PATH);
    expect(creds.workspaces.myteam).toEqual(tokenWs);
  });

  it("parses file with single workspace using email+password auth", async () => {
    await writeCreds(TEST_PATH, JSON.stringify({ version: 1, workspaces: { corp: emailWs } }));
    const creds = await loadCredentials(TEST_PATH, NONEXISTENT_PATH);
    expect(creds.workspaces.corp).toEqual(emailWs);
  });

  it("parses file with multiple workspaces", async () => {
    await writeCreds(
      TEST_PATH,
      JSON.stringify({
        version: 1,
        workspaces: {
          ws1: { url: "https://a.com", workspace: "ws1", token: "t1" },
          ws2: { url: "https://b.com", workspace: "ws2", email: "e@b.com", password: "p2" },
        },
      }),
    );
    const creds = await loadCredentials(TEST_PATH, NONEXISTENT_PATH);
    expect(Object.keys(creds.workspaces).sort()).toEqual(["ws1", "ws2"]);
  });

  it("throws when file has loose permissions (mode 644)", async () => {
    await writeCreds(TEST_PATH, JSON.stringify({ version: 1, workspaces: {} }), 0o644);
    await expect(loadCredentials(TEST_PATH, NONEXISTENT_PATH)).rejects.toThrow(/permissions too open|chmod|600/i);
  });

  it("throws when file is malformed JSON", async () => {
    await writeCreds(TEST_PATH, "{ not valid json");
    await expect(loadCredentials(TEST_PATH, NONEXISTENT_PATH)).rejects.toThrow(/malformed|json|parse/i);
  });

  it("throws when workspace entry missing required `workspace` field", async () => {
    await writeCreds(
      TEST_PATH,
      JSON.stringify({
        version: 1,
        workspaces: {
          // Intentionally invalid: missing required `workspace` field
          bad: { url: "https://x.com", token: "t" } as unknown as WorkspaceCreds,
        },
      }),
    );
    await expect(loadCredentials(TEST_PATH, NONEXISTENT_PATH)).rejects.toThrow(/workspace required|schema invalid/i);
  });

  it("throws when workspace entry has BOTH token and email+password", async () => {
    await writeCreds(
      TEST_PATH,
      JSON.stringify({
        version: 1,
        workspaces: {
          // Intentionally invalid: both auth methods (XOR violated)
          bad: {
            url: "https://x.com",
            workspace: "w",
            token: "t",
            email: "e@x.com",
            password: "p",
          } as unknown as WorkspaceCreds,
        },
      }),
    );
    await expect(loadCredentials(TEST_PATH, NONEXISTENT_PATH)).rejects.toThrow(/XOR|auth union|both/i);
  });

  it("throws when workspace entry has NEITHER token nor email+password", async () => {
    await writeCreds(
      TEST_PATH,
      JSON.stringify({
        version: 1,
        workspaces: {
          // Intentionally invalid: neither auth method (XOR violated)
          bad: { url: "https://x.com", workspace: "w" } as unknown as WorkspaceCreds,
        },
      }),
    );
    await expect(loadFromNeither()).rejects.toThrow(
      /XOR|auth union|neither|token required|email.*password/i,
    );
  });
});

// Helper wrapper cho test NEITHER (tránh lint duplicate regex)
async function loadFromNeither(): Promise<Credentials> {
  return loadCredentials(TEST_PATH, NONEXISTENT_PATH);
}

describe("saveCredentials", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("writes valid Credentials to file with chmod 600", async () => {
    const creds: Credentials = { version: 1, workspaces: { myteam: tokenWs } };
    await saveCredentials(creds, TEST_PATH);
    expect(existsSync(TEST_PATH)).toBe(true);
    const st = await stat(TEST_PATH);
    const mode = st.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("creates parent dir if not exists", async () => {
    const nestedPath = join(TEST_DIR, "nested", "deep", "credentials.json");
    await saveCredentials({ version: 1, workspaces: {} }, nestedPath);
    expect(existsSync(nestedPath)).toBe(true);
  });

  it("tightens loose perms to 600 on existing file", async () => {
    await writeCreds(TEST_PATH, JSON.stringify({ version: 1, workspaces: {} }), 0o644);
    await saveCredentials({ version: 1, workspaces: { myteam: tokenWs } }, TEST_PATH);
    const st = await stat(TEST_PATH);
    expect(st.mode & 0o777).toBe(0o600);
  });

  it("writes JSON readable by loadCredentials (round-trip)", async () => {
    const creds: Credentials = { version: 1, workspaces: { myteam: tokenWs, corp: emailWs } };
    await saveCredentials(creds, TEST_PATH);
    const loaded = await loadCredentials(TEST_PATH, NONEXISTENT_PATH);
    expect(loaded).toEqual(creds);
  });

  it("uses atomic write (temp + rename) — no temp file left after success", async () => {
    const creds: Credentials = { version: 1, workspaces: { myteam: tokenWs } };
    await saveCredentials(creds, TEST_PATH);
    // Sau save thành công, KHÔNG còn temp file `.credentials.json.tmp.*` trong dir
    const dir = dirname(TEST_PATH);
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(dir);
    const temps = files.filter((f) => f.startsWith(".credentials.json.tmp"));
    expect(temps).toEqual([]);
  });

  it("overwrites stale temp file from previous crashed process (same pid)", async () => {
    // Simulate stale temp từ crash trước (cùng pid path)
    const dir = dirname(TEST_PATH);
    await mkdir(dir, { recursive: true });
    const staleTmp = join(dir, `.credentials.json.tmp.${process.pid}`);
    await writeFile(staleTmp, "stale data", "utf8");
    await saveCredentials({ version: 1, workspaces: { myteam: tokenWs } }, TEST_PATH);
    // Sau save: stale temp overwritten + renamed, file đích có content mới
    const loaded = await loadCredentials(TEST_PATH, NONEXISTENT_PATH);
    expect(loaded.workspaces.myteam).toEqual(tokenWs);
  });
});

describe("loadCredentials — strict mode enforcement", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("rejects mode 700 (owner-only but != 600, strict equality)", async () => {
    await writeCreds(TEST_PATH, JSON.stringify({ version: 1, workspaces: {} }), 0o700);
    await expect(loadCredentials(TEST_PATH, NONEXISTENT_PATH)).rejects.toThrow(/permissions too open|chmod|600/i);
  });

  it("rejects mode 666 (world-writable)", async () => {
    await writeCreds(TEST_PATH, JSON.stringify({ version: 1, workspaces: {} }), 0o666);
    await expect(loadCredentials(TEST_PATH, NONEXISTENT_PATH)).rejects.toThrow(/permissions too open|chmod|600/i);
  });

  it("rejects mode 640 (group-readable)", async () => {
    await writeCreds(TEST_PATH, JSON.stringify({ version: 1, workspaces: {} }), 0o640);
    await expect(loadCredentials(TEST_PATH, NONEXISTENT_PATH)).rejects.toThrow(/permissions too open|chmod|600/i);
  });
});

describe("loadCredentials — partial auth field rejection", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("rejects {token, email} without password (partial field leak prevention)", async () => {
    await writeCreds(
      TEST_PATH,
      JSON.stringify({
        version: 1,
        workspaces: {
          bad: {
            url: "https://x.com",
            workspace: "w",
            token: "t",
            email: "e@x.com",
            // password missing → partial
          } as unknown as WorkspaceCreds,
        },
      }),
    );
    await expect(loadCredentials(TEST_PATH, NONEXISTENT_PATH)).rejects.toThrow(/partial email\/password|XOR/i);
  });

  it("rejects {email} without password (partial field leak prevention)", async () => {
    await writeCreds(
      TEST_PATH,
      JSON.stringify({
        version: 1,
        workspaces: {
          bad: {
            url: "https://x.com",
            workspace: "w",
            email: "e@x.com",
          } as unknown as WorkspaceCreds,
        },
      }),
    );
    await expect(loadCredentials(TEST_PATH, NONEXISTENT_PATH)).rejects.toThrow(
      /partial email\/password|XOR|neither/i,
    );
  });
});

describe("addWorkspace", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("adds new workspace with explicit id", async () => {
    await addWorkspace("myteam", tokenWs, TEST_PATH);
    const creds = await loadCredentials(TEST_PATH, NONEXISTENT_PATH);
    expect(creds.workspaces.myteam).toEqual(tokenWs);
  });

  it("defaults id to workspace name when id omitted", async () => {
    await addWorkspace(undefined, tokenWs, TEST_PATH);
    const creds = await loadCredentials(TEST_PATH, NONEXISTENT_PATH);
    expect(creds.workspaces.myteam).toEqual(tokenWs);
  });

  it("upserts (updates) existing id", async () => {
    await addWorkspace("myteam", tokenWs, TEST_PATH);
    const updated: WorkspaceCreds = { ...tokenWs, token: "new-token" };
    await addWorkspace("myteam", updated, TEST_PATH);
    const creds = await loadCredentials(TEST_PATH, NONEXISTENT_PATH);
    // Union narrowing: extract token qua type guard thay vì direct access
    const ws = creds.workspaces.myteam;
    expect("token" in ws && ws.token).toBe("new-token");
  });

  it("throws when workspace field missing", async () => {
    // Intentionally invalid: missing required `workspace` field
    const bad = { url: "https://x.com", token: "t" } as unknown as WorkspaceCreds;
    await expect(addWorkspace("bad", bad, TEST_PATH)).rejects.toThrow(/workspace required/i);
  });

  it("throws when BOTH token and email+password provided", async () => {
    // Intentionally invalid: both auth methods (XOR violated)
    const bad = {
      url: "https://x.com",
      workspace: "w",
      token: "t",
      email: "e@x.com",
      password: "p",
    } as unknown as WorkspaceCreds;
    await expect(addWorkspace("bad", bad, TEST_PATH)).rejects.toThrow(/XOR|both/i);
  });

  it("throws when NEITHER token nor email+password provided", async () => {
    // Intentionally invalid: neither auth method (XOR violated)
    const bad = { url: "https://x.com", workspace: "w" } as unknown as WorkspaceCreds;
    await expect(addWorkspace("bad", bad, TEST_PATH)).rejects.toThrow(
      /XOR|neither|token required|email.*password/i,
    );
  });
});

describe("removeWorkspace", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("removes existing id", async () => {
    await addWorkspace("myteam", tokenWs, TEST_PATH);
    await addWorkspace("corp", emailWs, TEST_PATH);
    await removeWorkspace("myteam", TEST_PATH);
    const creds = await loadCredentials(TEST_PATH, NONEXISTENT_PATH);
    expect(creds.workspaces.myteam).toBeUndefined();
    expect(creds.workspaces.corp).toEqual(emailWs);
  });

  it("is no-op when id does not exist", async () => {
    await addWorkspace("myteam", tokenWs, TEST_PATH);
    await expect(removeWorkspace("nonexistent", TEST_PATH)).resolves.toBeUndefined();
    const creds = await loadCredentials(TEST_PATH, NONEXISTENT_PATH);
    expect(creds.workspaces.myteam).toEqual(tokenWs);
  });

  it("does NOT delete file when last workspace removed", async () => {
    await addWorkspace("myteam", tokenWs, TEST_PATH);
    await removeWorkspace("myteam", TEST_PATH);
    expect(existsSync(TEST_PATH)).toBe(true);
    const creds = await loadCredentials(TEST_PATH, NONEXISTENT_PATH);
    expect(creds.workspaces).toEqual({});
  });
});

describe("getWorkspace", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("returns WorkspaceCreds for existing id", async () => {
    await addWorkspace("myteam", tokenWs, TEST_PATH);
    const ws = await getWorkspace("myteam", TEST_PATH);
    expect(ws).toEqual(tokenWs);
  });

  it("returns undefined for non-existent id", async () => {
    const ws = await getWorkspace("nonexistent", TEST_PATH);
    expect(ws).toBeUndefined();
  });
});

describe("findByName", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("returns Array length 1 for unique workspace name", async () => {
    await addWorkspace("myteam", tokenWs, TEST_PATH);
    const results = await findByName("myteam", TEST_PATH);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: "myteam", workspace: "myteam" });
  });

  it("returns Array length 2 for same-name diff-URL (disambiguate)", async () => {
    // 2 workspaces CÙNG workspace name 'corp', KHÁC url + id (D8 same-name diff-URL)
    const corpProd: WorkspaceCreds = {
      url: "https://huly.prod.com",
      workspace: "corp",
      token: "prod-token",
    };
    const corpStaging: WorkspaceCreds = {
      url: "https://huly.staging.com",
      workspace: "corp",
      token: "staging-token",
    };
    await addWorkspace("corp-prod", corpProd, TEST_PATH);
    await addWorkspace("corp-staging", corpStaging, TEST_PATH);
    const results = await findByName("corp", TEST_PATH);
    expect(results).toHaveLength(2);
    const ids = results.map((r) => r.id).sort();
    expect(ids).toEqual(["corp-prod", "corp-staging"]);
  });

  it("returns Array length 0 for non-existent name (KHÔNG undefined)", async () => {
    const results = await findByName("nonexistent", TEST_PATH);
    expect(results).toEqual([]);
    expect(Array.isArray(results)).toBe(true);
  });
});

describe("integration: full flow", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("load empty → add 2 workspaces → save → reload round-trip", async () => {
    // Start empty
    let creds = await loadCredentials(TEST_PATH, NONEXISTENT_PATH);
    expect(creds.workspaces).toEqual({});

    // Add 2 workspaces (different auth methods)
    await addWorkspace("myteam", tokenWs, TEST_PATH);
    await addWorkspace("corp", emailWs, TEST_PATH);

    // Reload + verify both present
    creds = await loadCredentials(TEST_PATH, NONEXISTENT_PATH);
    expect(Object.keys(creds.workspaces).sort()).toEqual(["corp", "myteam"]);
    expect(creds.workspaces.myteam).toEqual(tokenWs);
    expect(creds.workspaces.corp).toEqual(emailWs);
  });

  it("same-name diff-URL: add 2 workspaces → findByName returns 2", async () => {
    const corpProd: WorkspaceCreds = {
      url: "https://huly.prod.com",
      workspace: "corp",
      token: "prod-token",
    };
    const corpStaging: WorkspaceCreds = {
      url: "https://huly.staging.com",
      workspace: "corp",
      token: "staging-token",
    };
    await addWorkspace("corp-prod", corpProd, TEST_PATH);
    await addWorkspace("corp-staging", corpStaging, TEST_PATH);

    const results = await findByName("corp", TEST_PATH);
    expect(results).toHaveLength(2);
    // Mỗi result có id + full creds
    expect(results[0]).toMatchObject({
      id: expect.any(String),
      url: expect.any(String),
      workspace: "corp",
      token: expect.any(String),
    });
  });
});
