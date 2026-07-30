import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import {
  bindProject,
  loadConfig,
  normalizePath,
  resolveByCwd,
  saveConfig,
  unbindProject,
  DEFAULT_CONFIG,
  type Config,
} from "../config.js";

const TEST_DIR = join(tmpdir(), `pi-huly-test-${process.pid}`);
const TEST_PATH = join(TEST_DIR, "config.json");
const NONEXISTENT_PATH = join(tmpdir(), `nonexistent-${process.pid}`, "config.json");

async function writeConfig(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

describe("loadConfig", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("returns DEFAULT_CONFIG when file does not exist", async () => {
    const config = await loadConfig(TEST_PATH, NONEXISTENT_PATH);
    expect(config.version).toBe(1);
    expect(config.transport).toBe("ws");
    expect(config.projects).toEqual({});
  });

  it("parses file with transport=ws", async () => {
    await writeConfig(TEST_PATH, JSON.stringify({ version: 1, transport: "ws", projects: {} }));
    const config = await loadConfig(TEST_PATH, NONEXISTENT_PATH);
    expect(config.transport).toBe("ws");
  });

  it("parses file with transport=rest", async () => {
    await writeConfig(TEST_PATH, JSON.stringify({ version: 1, transport: "rest", projects: {} }));
    const config = await loadConfig(TEST_PATH, NONEXISTENT_PATH);
    expect(config.transport).toBe("rest");
  });

  it("defaults transport to ws when field missing", async () => {
    await writeConfig(TEST_PATH, JSON.stringify({ version: 1, projects: {} }));
    const config = await loadConfig(TEST_PATH, NONEXISTENT_PATH);
    expect(config.transport).toBe("ws");
  });

  it("parses projects map", async () => {
    await writeConfig(
      TEST_PATH,
      JSON.stringify({
        version: 1,
        projects: {
          "/a/b": { workspace: "myteam", project: "proj1" },
        },
      }),
    );
    const config = await loadConfig(TEST_PATH, NONEXISTENT_PATH);
    expect(config.projects["/a/b"]).toEqual({ workspace: "myteam", project: "proj1" });
  });

  it("parses pool.maxSize", async () => {
    await writeConfig(
      TEST_PATH,
      JSON.stringify({ version: 1, projects: {}, pool: { maxSize: 4 } }),
    );
    const config = await loadConfig(TEST_PATH, NONEXISTENT_PATH);
    expect(config.pool?.maxSize).toBe(4);
  });

  it("throws when file is malformed JSON", async () => {
    await writeConfig(TEST_PATH, "{ not json");
    await expect(loadConfig(TEST_PATH, NONEXISTENT_PATH)).rejects.toThrow(/malformed|json/i);
  });

  it("throws when version != 1", async () => {
    await writeConfig(TEST_PATH, JSON.stringify({ version: 2, projects: {} }));
    await expect(loadConfig(TEST_PATH, NONEXISTENT_PATH)).rejects.toThrow(/version must be 1/i);
  });

  it("throws when transport invalid", async () => {
    await writeConfig(TEST_PATH, JSON.stringify({ version: 1, transport: "grpc", projects: {} }));
    await expect(loadConfig(TEST_PATH, NONEXISTENT_PATH)).rejects.toThrow(/transport must be/i);
  });

  it("throws when projects not an object", async () => {
    await writeConfig(TEST_PATH, JSON.stringify({ version: 1, projects: "not-object" }));
    await expect(loadConfig(TEST_PATH, NONEXISTENT_PATH)).rejects.toThrow(/projects must be an object/i);
  });

  it("throws when binding missing workspace field", async () => {
    await writeConfig(
      TEST_PATH,
      JSON.stringify({ version: 1, projects: { "/a": { project: "p" } } }),
    );
    await expect(loadConfig(TEST_PATH, NONEXISTENT_PATH)).rejects.toThrow(/workspace required/i);
  });

  it("throws when binding missing project field", async () => {
    await writeConfig(
      TEST_PATH,
      JSON.stringify({ version: 1, projects: { "/a": { workspace: "ws" } } }),
    );
    await expect(loadConfig(TEST_PATH, NONEXISTENT_PATH)).rejects.toThrow(/project required/i);
  });

  it("throws when pool.maxSize negative", async () => {
    await writeConfig(
      TEST_PATH,
      JSON.stringify({ version: 1, projects: {}, pool: { maxSize: -1 } }),
    );
    await expect(loadConfig(TEST_PATH, NONEXISTENT_PATH)).rejects.toThrow(/pool.maxSize must be positive/i);
  });

  it("throws when pool.maxSize not a number", async () => {
    await writeConfig(
      TEST_PATH,
      JSON.stringify({ version: 1, projects: {}, pool: { maxSize: "big" } }),
    );
    await expect(loadConfig(TEST_PATH, NONEXISTENT_PATH)).rejects.toThrow(/pool.maxSize must be positive/i);
  });

  // T-62 #67: quietUpstreamNoise + upstreamNoisePatterns schema validation.
  it("T-62: accepts quietUpstreamNoise boolean + upstreamNoisePatterns string[]", async () => {
    await writeConfig(
      TEST_PATH,
      JSON.stringify({
        version: 1,
        projects: {},
        quietUpstreamNoise: false,
        upstreamNoisePatterns: ["^custom pattern$", "^another /"],
      }),
    );
    const cfg = await loadConfig(TEST_PATH, NONEXISTENT_PATH);
    expect(cfg.quietUpstreamNoise).toBe(false);
    expect(cfg.upstreamNoisePatterns).toEqual(["^custom pattern$", "^another /"]);
  });

  it("T-62: throws khi quietUpstreamNoise không phải boolean", async () => {
    await writeConfig(
      TEST_PATH,
      JSON.stringify({ version: 1, projects: {}, quietUpstreamNoise: "yes" }),
    );
    await expect(loadConfig(TEST_PATH, NONEXISTENT_PATH)).rejects.toThrow(/quietUpstreamNoise must be boolean/i);
  });

  it("T-62: throws khi upstreamNoisePatterns không phải array", async () => {
    await writeConfig(
      TEST_PATH,
      JSON.stringify({ version: 1, projects: {}, upstreamNoisePatterns: "not-array" }),
    );
    await expect(loadConfig(TEST_PATH, NONEXISTENT_PATH)).rejects.toThrow(/upstreamNoisePatterns must be array/i);
  });

  it("T-62: throws khi upstreamNoisePatterns[i] invalid RegExp", async () => {
    await writeConfig(
      TEST_PATH,
      JSON.stringify({ version: 1, projects: {}, upstreamNoisePatterns: ["[unclosed"] }),
    );
    await expect(loadConfig(TEST_PATH, NONEXISTENT_PATH)).rejects.toThrow(/not valid RegExp/i);
  });

  it("T-62: defaults — quietUpstreamNoise undefined khi không set", async () => {
    await writeConfig(TEST_PATH, JSON.stringify({ version: 1, projects: {} }));
    const cfg = await loadConfig(TEST_PATH, NONEXISTENT_PATH);
    expect(cfg.quietUpstreamNoise).toBeUndefined();
    expect(cfg.upstreamNoisePatterns).toBeUndefined();
  });

  it("throws when saveConfig called with invalid transport", async () => {
    // @ts-expect-error — intentionally invalid
    const bad: Config = { version: 1, transport: "grpc", projects: {} };
    await expect(saveConfig(bad, TEST_PATH)).rejects.toThrow(/transport must be/i);
  });

  it("binds with ~ tilde path, resolves with same ~ cwd (E2E tilde expansion)", async () => {
    // Bind với ~ path, resolve bằng ~ path — cả 2 expand qua homedir
    await bindProject("~/pi-huly-test-tilde", { workspace: "ws", project: "p" }, TEST_PATH);
    const result = await resolveByCwd("~/pi-huly-test-tilde/sub", TEST_PATH);
    expect(result).toEqual({ workspace: "ws", project: "p" });
    // Cleanup binding
    await unbindProject("~/pi-huly-test-tilde", TEST_PATH);
  });
});

describe("saveConfig", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("writes valid Config to file (round-trip)", async () => {
    const config: Config = {
      version: 1,
      transport: "ws",
      projects: { "/a/b": { workspace: "ws", project: "p" } },
    };
    await saveConfig(config, TEST_PATH);
    expect(existsSync(TEST_PATH)).toBe(true);
    const loaded = await loadConfig(TEST_PATH, NONEXISTENT_PATH);
    expect(loaded).toEqual(config);
  });

  it("creates parent dir if not exists", async () => {
    const nested = join(TEST_DIR, "nested", "deep", "config.json");
    await saveConfig(DEFAULT_CONFIG, nested);
    expect(existsSync(nested)).toBe(true);
  });

  it("throws when version invalid", async () => {
    // @ts-expect-error — intentionally invalid
    const bad: Config = { version: 2, projects: {} };
    await expect(saveConfig(bad, TEST_PATH)).rejects.toThrow(/version must be 1/i);
  });
});

describe("bindProject", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("binds cwd → {workspace, project}", async () => {
    await bindProject("/a/b", { workspace: "myteam", project: "proj1" }, TEST_PATH);
    const config = await loadConfig(TEST_PATH, NONEXISTENT_PATH);
    expect(config.projects["/a/b"]).toEqual({ workspace: "myteam", project: "proj1" });
  });

  it("upserts (updates) existing cwd binding", async () => {
    await bindProject("/a/b", { workspace: "old", project: "old" }, TEST_PATH);
    await bindProject("/a/b", { workspace: "new", project: "new" }, TEST_PATH);
    const config = await loadConfig(TEST_PATH, NONEXISTENT_PATH);
    expect(config.projects["/a/b"]).toEqual({ workspace: "new", project: "new" });
  });

  it("normalizes cwd path before bind", async () => {
    await bindProject("/a/./b/", { workspace: "ws", project: "p" }, TEST_PATH);
    const config = await loadConfig(TEST_PATH, NONEXISTENT_PATH);
    expect(config.projects["/a/b"]).toBeDefined();
    expect(config.projects["/a/./b/"]).toBeUndefined();
  });

  it("throws when workspace missing", async () => {
    // @ts-expect-error — intentionally invalid
    await expect(bindProject("/a/b", { project: "p" }, TEST_PATH)).rejects.toThrow(
      /workspace required/i,
    );
  });

  it("throws when project missing", async () => {
    // @ts-expect-error — intentionally invalid
    await expect(bindProject("/a/b", { workspace: "ws" }, TEST_PATH)).rejects.toThrow(
      /project required/i,
    );
  });
});

describe("unbindProject", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("removes existing cwd binding", async () => {
    await bindProject("/a/b", { workspace: "ws", project: "p" }, TEST_PATH);
    await bindProject("/c/d", { workspace: "ws2", project: "p2" }, TEST_PATH);
    await unbindProject("/a/b", TEST_PATH);
    const config = await loadConfig(TEST_PATH, NONEXISTENT_PATH);
    expect(config.projects["/a/b"]).toBeUndefined();
    expect(config.projects["/c/d"]).toBeDefined();
  });

  it("is no-op when cwd does not exist", async () => {
    await bindProject("/a/b", { workspace: "ws", project: "p" }, TEST_PATH);
    await expect(unbindProject("/nonexistent", TEST_PATH)).resolves.toBeUndefined();
    const config = await loadConfig(TEST_PATH, NONEXISTENT_PATH);
    expect(config.projects["/a/b"]).toBeDefined();
  });
});

describe("resolveByCwd — longest-prefix match", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });
  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("exact match returns binding", async () => {
    await bindProject("/a/b", { workspace: "ws", project: "p" }, TEST_PATH);
    const result = await resolveByCwd("/a/b", TEST_PATH);
    expect(result).toEqual({ workspace: "ws", project: "p" });
  });

  it("prefix match (cwd deeper than binding)", async () => {
    await bindProject("/a/b", { workspace: "ws", project: "p" }, TEST_PATH);
    const result = await resolveByCwd("/a/b/c", TEST_PATH);
    expect(result).toEqual({ workspace: "ws", project: "p" });
  });

  it("longest-prefix wins when multiple match", async () => {
    await bindProject("/a", { workspace: "short", project: "p1" }, TEST_PATH);
    await bindProject("/a/b", { workspace: "long", project: "p2" }, TEST_PATH);
    const result = await resolveByCwd("/a/b/c", TEST_PATH);
    expect(result).toEqual({ workspace: "long", project: "p2" });
  });

  it("returns undefined when no match", async () => {
    await bindProject("/a/b", { workspace: "ws", project: "p" }, TEST_PATH);
    const result = await resolveByCwd("/x/y", TEST_PATH);
    expect(result).toBeUndefined();
  });

  it("segment-aligned: /a/b does NOT match /a/bcd", async () => {
    await bindProject("/a/b", { workspace: "ws", project: "p" }, TEST_PATH);
    const result = await resolveByCwd("/a/bcd", TEST_PATH);
    expect(result).toBeUndefined();
  });

  it("normalizes cwd before match (./, trailing /)", async () => {
    await bindProject("/a/b", { workspace: "ws", project: "p" }, TEST_PATH);
    const result = await resolveByCwd("/a/./b/", TEST_PATH);
    expect(result).toEqual({ workspace: "ws", project: "p" });
  });

  it("root binding / matches any cwd", async () => {
    await bindProject("/", { workspace: "root", project: "p" }, TEST_PATH);
    const result = await resolveByCwd("/anything/deep", TEST_PATH);
    expect(result).toEqual({ workspace: "root", project: "p" });
  });

  it("returns undefined when projects empty", async () => {
    const result = await resolveByCwd("/a/b", TEST_PATH);
    expect(result).toBeUndefined();
  });
});

describe("normalizePath", () => {
  it("resolves . and ..", () => {
    expect(normalizePath("/a/./b")).toBe("/a/b");
    expect(normalizePath("/a/../b")).toBe("/b");
  });

  it("strips trailing separator (except root)", () => {
    expect(normalizePath("/a/b/")).toBe("/a/b");
    expect(normalizePath("/")).toBe("/");
  });

  it("expands ~ to homedir", () => {
    const result = normalizePath("~/projects");
    expect(result).not.toContain("~");
    expect(result.length).toBeGreaterThan("/projects".length);
  });
});
