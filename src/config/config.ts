// ConfigStore — non-secret config global (transport toggle + cwd project binding).
// Design: 04-system.md §6, 01-vision.md §B.3 D3 (transport), §B.8 D8 (config.json format).
//
// transport = global toggle: 'ws' (default, connect persistent + pool) | 'rest' (stateless).
// projects = cwd (longest-prefix) → {workspace id-handle, project}.
//
// KHÔNG chmod 600 (non-secret, default perms OK — khác credentials.json).

import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

// Types

/** Transport global toggle (D3). */
export type Transport = "ws" | "rest";

/** Project binding entry: cwd → {workspace id-handle, project}. */
export type ProjectBinding = {
  workspace: string;
  project: string;
};

/** config.json root shape. */
export type Config = {
  version: 1;
  /** Transport global toggle. Default 'ws' (D3). */
  transport?: Transport;
  /** cwd → binding map. Key = absolute path (normalized). */
  projects: Record<string, ProjectBinding>;
  /** Connection pool config (ws only). */
  pool?: { maxSize?: number };
  /**
   * T-62 #67: Filter upstream console spam (no document found + WS error spam).
   * Default `true` — gate `console.warn/error/log` của @hcengineering trong scope
   * connect/warmPool. Set `false` để debug thật (xem upstream output nguyên bản).
   */
  quietUpstreamNoise?: boolean;
  /**
   * T-62 #67: Override default pattern registry. Mỗi entry là RegExp source
   * string (case-insensitive). Match first-arg string HOẶC structured log có
   * field `message`. Mặc định: [`/^no document found, failed to apply model transaction/i`].
   *
   * Empty array (`[]`) = no-op → fall về DEFAULT_UPSTREAM_NOISE_PATTERNS (KHÔNG
   * disable filter). Để disable filter hoàn toàn, dùng `quietUpstreamNoise: false`.
   */
  upstreamNoisePatterns?: string[];
};

/** Path tới config.json (omp, ~/.omp/agent/huly/). */
export const CONFIG_DIR = join(homedir(), ".omp", "agent", "huly");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");
export const LEGACY_CONFIG_PATH = join(homedir(), ".pi", "agent", "huly", "config.json");

/** Default config khi file không tồn tại hoặc thiếu transport field. */
export const DEFAULT_CONFIG: Config = {
  version: 1,
  transport: "ws",
  projects: {},
};

/**
 * Normalize path: resolve `.`, `..`, expand `~`, strip trailing separator (except root).
 * Cross-platform qua path.resolve (auto platform separator).
 */
export function normalizePath(p: string): string {
  let expanded = p;
  if (expanded.startsWith("~")) {
    expanded = join(homedir(), expanded.slice(1));
  }
  const resolved = resolve(expanded);
  // Strip trailing separator except root (vd '/a/b/' → '/a/b', '/' giữ '/')
  if (resolved.length > 1 && resolved.endsWith(sep)) {
    return resolved.slice(0, -1);
  }
  return resolved;
}

/**
 * Load config từ file (global path mặc định, hoặc path override cho test).
 * - File không tồn tại → return DEFAULT_CONFIG
 * - File malformed/schema invalid → throw
 * - transport thiếu → default 'ws'
 * - Legacy ~/.pi config merged if exists (omp wins on collision)
 */
export async function loadConfig(
  filePath: string = CONFIG_PATH,
  legacyPath: string = LEGACY_CONFIG_PATH,
): Promise<Config> {
  let ompCfg: Config;
  if (!existsSync(filePath)) {
    ompCfg = { ...DEFAULT_CONFIG, projects: {} };
  } else {
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (e) {
      throw new Error(`config.json read failed: ${(e as Error).message}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error(`config.json malformed JSON: ${(e as Error).message}`);
    }
    ompCfg = validateConfig(parsed);
  }

  // Try migrating from legacy ~/.pi config
  if (existsSync(legacyPath)) {
    try {
      let raw: string;
      try {
        raw = await readFile(legacyPath, "utf8");
      } catch (e) {
        throw new Error(`legacy config.json read failed: ${(e as Error).message}`);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        throw new Error(`legacy config.json malformed JSON: ${(e as Error).message}`);
      }
      const legacyCfg = validateConfig(parsed);

      let migrated = false;

      // Merge legacy projects missing from omp (omp wins on key collision)
      for (const [cwd, binding] of Object.entries(legacyCfg.projects)) {
        if (!(cwd in ompCfg.projects)) {
          ompCfg.projects[cwd] = binding;
          migrated = true;
        }
      }

      // Merge transport only if absent in omp (omp wins)
      if (ompCfg.transport === DEFAULT_CONFIG.transport && legacyCfg.transport !== DEFAULT_CONFIG.transport) {
        ompCfg.transport = legacyCfg.transport;
        migrated = true;
      }

      // Merge pool only if absent in omp (omp wins)
      if (legacyCfg.pool && !ompCfg.pool) {
        ompCfg.pool = legacyCfg.pool;
        migrated = true;
      }

      // Merge quietUpstreamNoise only if absent in omp (omp wins)
      if (legacyCfg.quietUpstreamNoise !== undefined && ompCfg.quietUpstreamNoise === undefined) {
        ompCfg.quietUpstreamNoise = legacyCfg.quietUpstreamNoise;
        migrated = true;
      }

      // Merge upstreamNoisePatterns only if absent in omp (omp wins)
      if (legacyCfg.upstreamNoisePatterns && !ompCfg.upstreamNoisePatterns) {
        ompCfg.upstreamNoisePatterns = legacyCfg.upstreamNoisePatterns;
        migrated = true;
      }

      // Persist merged config if anything changed
      if (migrated) {
        await saveConfig(ompCfg, filePath);
      }
    } catch (e) {
      // Silently ignore legacy migration errors — omp config takes precedence
      console.warn(`Failed to migrate legacy config from ${legacyPath}: ${(e as Error).message}`);
    }
  }

  return ompCfg;
}

/** Validate + normalize parsed config object. */
function validateConfig(parsed: unknown): Config {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("config.json schema invalid: root must be an object");
  }
  const root = parsed as Record<string, unknown>;
  if (root.version !== 1) {
    throw new Error(`config.json schema invalid: version must be 1 (got ${root.version})`);
  }
  // transport optional, default 'ws'
  let transport: Transport | undefined;
  if (root.transport !== undefined) {
    if (root.transport !== "ws" && root.transport !== "rest") {
      throw new Error(
        `config.json schema invalid: transport must be 'ws' or 'rest' (got ${root.transport})`,
      );
    }
    transport = root.transport;
  }
  if (typeof root.projects !== "object" || root.projects === null) {
    throw new Error("config.json schema invalid: projects must be an object");
  }
  const projects = root.projects as Record<string, unknown>;
  const normalizedProjects: Record<string, ProjectBinding> = {};
  for (const [cwd, binding] of Object.entries(projects)) {
    if (typeof binding !== "object" || binding === null) {
      throw new Error(`config.json schema invalid: projects["${cwd}"] must be an object`);
    }
    const b = binding as Record<string, unknown>;
    if (typeof b.workspace !== "string" || b.workspace.length === 0) {
      throw new Error(`config.json schema invalid: projects["${cwd}"].workspace required`);
    }
    if (typeof b.project !== "string" || b.project.length === 0) {
      throw new Error(`config.json schema invalid: projects["${cwd}"].project required`);
    }
    normalizedProjects[normalizePath(cwd)] = { workspace: b.workspace, project: b.project };
  }
  let pool: { maxSize?: number } | undefined;
  if (root.pool !== undefined) {
    if (typeof root.pool !== "object" || root.pool === null) {
      throw new Error("config.json schema invalid: pool must be an object");
    }
    const p = root.pool as Record<string, unknown>;
    if (p.maxSize !== undefined) {
      if (typeof p.maxSize !== "number" || p.maxSize < 1) {
        throw new Error("config.json schema invalid: pool.maxSize must be positive number");
      }
      pool = { maxSize: p.maxSize };
    }
  }
  // T-62 #67: quietUpstreamNoise (boolean, default true) + upstreamNoisePatterns
  // (string[] — RegExp source, case-insensitive).
  let quietUpstreamNoise: boolean | undefined;
  if (root.quietUpstreamNoise !== undefined) {
    if (typeof root.quietUpstreamNoise !== "boolean") {
      throw new Error(
        "config.json schema invalid: quietUpstreamNoise must be boolean (got " +
          `${typeof root.quietUpstreamNoise})`,
      );
    }
    quietUpstreamNoise = root.quietUpstreamNoise;
  }
  let upstreamNoisePatterns: string[] | undefined;
  if (root.upstreamNoisePatterns !== undefined) {
    if (!Array.isArray(root.upstreamNoisePatterns)) {
      throw new Error("config.json schema invalid: upstreamNoisePatterns must be array");
    }
    for (const [i, p] of root.upstreamNoisePatterns.entries()) {
      if (typeof p !== "string") {
        throw new Error(`config.json schema invalid: upstreamNoisePatterns[${i}] must be string`);
      }
      // Validate RegExp compilable — KHÔNG crash sau load.
      try {
        new RegExp(p, "i");
      } catch (e) {
        throw new Error(
          `config.json schema invalid: upstreamNoisePatterns[${i}] not valid RegExp: ` +
            `${(e as Error).message}`,
        );
      }
    }
    upstreamNoisePatterns = root.upstreamNoisePatterns;
  }
  return {
    version: 1,
    transport: transport ?? "ws",
    projects: normalizedProjects,
    ...(pool !== undefined ? { pool } : {}),
    ...(quietUpstreamNoise !== undefined ? { quietUpstreamNoise } : {}),
    ...(upstreamNoisePatterns !== undefined ? { upstreamNoisePatterns } : {}),
  };
}

/**
 * Save config atomic (temp + rename). KHÔNG chmod (non-secret).
 */
export async function saveConfig(config: Config, filePath: string = CONFIG_PATH): Promise<void> {
  if (config.version !== 1) {
    throw new Error(`config.json schema invalid: version must be 1 (got ${config.version})`);
  }
  if (config.transport !== undefined && config.transport !== "ws" && config.transport !== "rest") {
    throw new Error(`config.json schema invalid: transport must be 'ws' or 'rest'`);
  }
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const json = `${JSON.stringify(config, null, 2)}\n`;
  const tmpPath = join(dir, `.config.json.tmp.${process.pid}`);
  await writeFile(tmpPath, json, "utf8");
  try {
    await rename(tmpPath, filePath);
  } catch (e) {
    // Cleanup temp file nếu rename fail (cross-device, permission) — tránh leak
    await rm(tmpPath, { force: true });
    throw e;
  }
}

/**
 * Bind cwd → {workspace, project} (upsert).
 */
export async function bindProject(
  cwd: string,
  binding: ProjectBinding,
  filePath: string = CONFIG_PATH,
): Promise<void> {
  if (typeof binding.workspace !== "string" || binding.workspace.length === 0) {
    throw new Error("bindProject: workspace required");
  }
  if (typeof binding.project !== "string" || binding.project.length === 0) {
    throw new Error("bindProject: project required");
  }
  const config = await loadConfig(filePath, "");
  config.projects[normalizePath(cwd)] = binding;
  await saveConfig(config, filePath);
}

/**
 * Unbind cwd. No-op nếu cwd không tồn tại.
 */
export async function unbindProject(cwd: string, filePath: string = CONFIG_PATH): Promise<void> {
  const config = await loadConfig(filePath, "");
  const normalized = normalizePath(cwd);
  if (!(normalized in config.projects)) return;
  delete config.projects[normalized];
  await saveConfig(config, filePath);
}

/**
 * Resolve cwd → binding via longest-prefix match.
 * - Sort binding paths by segment count desc
 * - Return first binding where cwd starts with binding path (segment-aligned)
 * - No match → undefined
 *
 * Segment-aligned: `/a/b` match `/a/b/c` (ok) nhưng KHÔNG match `/a/bcd` (khác segment).
 */
export async function resolveByCwd(
  cwd: string,
  filePath: string = CONFIG_PATH,
): Promise<ProjectBinding | undefined> {
  const config = await loadConfig(filePath, "");
  const normalizedCwd = normalizePath(cwd);
  const bindings = Object.entries(config.projects);
  if (bindings.length === 0) return undefined;
  // Sort by path depth desc (longest first)
  bindings.sort((a, b) => pathDepth(b[0]) - pathDepth(a[0]));
  for (const [bindingPath, binding] of bindings) {
    if (isPathPrefix(bindingPath, normalizedCwd)) {
      return binding;
    }
  }
  return undefined;
}

/** Count path segments (vd '/a/b/c' = 3, '/' = 0). */
function pathDepth(p: string): number {
  if (p === "/" || p === "") return 0;
  return p.split(sep).filter(Boolean).length;
}

/**
 * Check if `prefix` is a segment-aligned prefix of `path`.
 * - '/a/b' prefix of '/a/b/c' → true
 * - '/a/b' prefix of '/a/b' → true (exact)
 * - '/a/b' prefix of '/a/bcd' → false (segment mismatch)
 * - '/' prefix of anything → true
 */
function isPathPrefix(prefix: string, path: string): boolean {
  if (prefix === "/" || prefix === "") return true;
  if (prefix === path) return true;
  // path must start with prefix + separator
  return path.startsWith(prefix + sep);
}
