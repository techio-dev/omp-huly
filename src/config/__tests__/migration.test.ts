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
