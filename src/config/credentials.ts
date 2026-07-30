// CredentialStore — secret credentials per-workspace (global-only).
// Design: 04-system.md §6, 01-vision.md §B.8 D8, 08-non-functional.md §A.
//
// Auth union: mỗi workspace entry {url, workspace} + ({token} XOR {email,password}).
// `workspace` BẮT BUỘC (Huly workspace name truyền cho api-client connect/connectRest).
// Same-name diff-URL → id distinct (vd `corp-prod`), `workspace` giữ tên Huly thật.
//
// Security (08 §A):
// - chmod 600 verify on load (reject loose perms — Spoofing mitigation)
// - atomic write (temp + rename — Tampering mitigation)
// - schema validate on load + reject malformed
// - KHÔNG log token/password values

import { existsSync } from "node:fs";
import { readFile, rename, stat, writeFile, mkdir, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// Types

/** Auth union: token OR email+password (XOR — không cả 2, không thiếu). */
export type AuthMethod = { token: string } | { email: string; password: string };

/** Workspace credentials entry. `workspace` BẮT BUỘC. */
export type WorkspaceCreds = {
  url: string;
  workspace: string;
} & AuthMethod;

/** Credentials.json root shape. */
export type Credentials = {
  version: 1;
  workspaces: Record<string, WorkspaceCreds>;
};

/** Path tới credentials.json (omp, ~/.omp/agent/huly/). */
export const CREDENTIALS_DIR = join(homedir(), ".omp", "agent", "huly");
export const CREDENTIALS_PATH = join(CREDENTIALS_DIR, "credentials.json");
export const LEGACY_CREDENTIALS_PATH = join(homedir(), ".pi", "agent", "huly", "credentials.json");

/** File mode cho credentials.json (rw owner only — 08 §A Spoofing mitigation). */
const SECURE_MODE = 0o600;

/**
 * Validate workspace entry schema: required fields + auth union XOR.
 * Throws error với field name (KHÔNG leak value).
 */
function validateWorkspace(id: string, entry: unknown): asserts entry is WorkspaceCreds {
  if (typeof entry !== "object" || entry === null) {
    throw new Error(`credentials.json schema invalid: workspace "${id}" must be an object`);
  }
  const e = entry as Record<string, unknown>;
  if (typeof e.url !== "string" || e.url.length === 0) {
    throw new Error(`credentials.json schema invalid: workspace "${id}" — url required`);
  }
  if (typeof e.workspace !== "string" || e.workspace.length === 0) {
    throw new Error(`credentials.json schema invalid: workspace "${id}" — workspace required`);
  }
  const hasToken = typeof e.token === "string" && e.token.length > 0;
  const hasEmail = typeof e.email === "string" && e.email.length > 0;
  const hasPassword = typeof e.password === "string" && e.password.length > 0;
  const hasEmailPass = hasEmail && hasPassword;
  const hasAnyAuthField = hasToken || hasEmail || hasPassword;
  // XOR: exactly one complete auth method, NO extra fields (mirror TS union).
  // Reject cases:
  // - BOTH complete methods (token + email+password)
  // - partial email/password (one without the other) — field leak prevention
  // - token + any email/password field — extra field alongside valid token
  // - NEITHER method
  if (hasToken && hasEmailPass) {
    throw new Error(
      `credentials.json auth union XOR violated: workspace "${id}" has BOTH token and email+password`,
    );
  }
  if (hasToken && (hasEmail || hasPassword)) {
    throw new Error(
      `credentials.json auth union XOR violated: workspace "${id}" has token alongside partial email/password fields`,
    );
  }
  if (!hasToken && !hasEmailPass) {
    if (hasAnyAuthField) {
      throw new Error(
        `credentials.json auth union XOR violated: workspace "${id}" has partial email/password (both required if either present)`,
      );
    }
    throw new Error(
      `credentials.json auth union XOR violated: workspace "${id}" has NEITHER token nor email+password`,
    );
  }
}

/**
 * Verify file permissions secure (mode === 0o600, owner-only).
 * Windows skip (NTFS khác, ACL-based).
 */
async function verifySecureMode(filePath: string, st: { mode: number }): Promise<void> {
  if (process.platform === "win32") return;
  // Mask chỉ permission bits (lower 12 bits includes file type — chỉ lấy 9 bits permission).
  const permBits = st.mode & 0o777;
  if (permBits !== SECURE_MODE) {
    throw new Error(
      `credentials.json permissions too open (mode ${permBits.toString(8)}, expected 600)`,
    );
  }
}

/**
 * Load credentials từ file (global path mặc định, hoặc path override cho test).
 * - File không tồn tại → trả empty Credentials (KHÔNG throw)
 * - File loose perms → throw (08 §A)
 * - File malformed JSON → throw
 * - File schema invalid → throw
 * - Legacy ~/.pi credentials merged if exists (omp wins on collision)
 */
export async function loadCredentials(
  filePath: string = CREDENTIALS_PATH,
  legacyPath: string = LEGACY_CREDENTIALS_PATH,
): Promise<Credentials> {
  if (!existsSync(filePath)) {
    const ompCreds = { version: 1 as const, workspaces: {} as Record<string, WorkspaceCreds> };
    // Try migrating from legacy ~/.pi if omp store absent
    if (existsSync(legacyPath)) {
      try {
        const st = await stat(legacyPath);
        await verifySecureMode(legacyPath, st);
        let raw: string;
        try {
          raw = await readFile(legacyPath, "utf8");
        } catch (e) {
          throw new Error(`legacy credentials.json read failed: ${(e as Error).message}`);
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch (e) {
          throw new Error(`legacy credentials.json malformed JSON: ${(e as Error).message}`);
        }
        if (typeof parsed !== "object" || parsed === null) {
          throw new Error("legacy credentials.json schema invalid: root must be an object");
        }
        const root = parsed as Record<string, unknown>;
        if (root.version !== 1) {
          throw new Error(`legacy credentials.json schema invalid: version must be 1 (got ${root.version})`);
        }
        if (typeof root.workspaces !== "object" || root.workspaces === null) {
          throw new Error("legacy credentials.json schema invalid: workspaces must be an object");
        }
        const workspaces = root.workspaces as Record<string, unknown>;
        // Validate each legacy entry and migrate to omp store
        let migrated = false;
        for (const [id, entry] of Object.entries(workspaces)) {
          // Only migrate if not already in omp store (omp wins on collision)
          if (!(id in ompCreds.workspaces)) {
            validateWorkspace(id, entry);
            ompCreds.workspaces[id] = entry as WorkspaceCreds;
            migrated = true;
          }
        }
        // Persist migrated entries to omp store (atomic + chmod 600)
        if (migrated) {
          await saveCredentials(ompCreds, filePath);
        }
      } catch (e) {
        // Silently ignore legacy migration errors — omp store takes precedence
        console.warn(`Failed to migrate legacy credentials from ${legacyPath}: ${(e as Error).message}`);
      }
    }
    return ompCreds;
  }

  const st = await stat(filePath);
  await verifySecureMode(filePath, st);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (e) {
    throw new Error(`credentials.json read failed: ${(e as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`credentials.json malformed JSON: ${(e as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("credentials.json schema invalid: root must be an object");
  }
  const root = parsed as Record<string, unknown>;
  if (root.version !== 1) {
    throw new Error(`credentials.json schema invalid: version must be 1 (got ${root.version})`);
  }
  if (typeof root.workspaces !== "object" || root.workspaces === null) {
    throw new Error("credentials.json schema invalid: workspaces must be an object");
  }
  const workspaces = root.workspaces as Record<string, unknown>;
  // Validate mỗi entry
  for (const [id, entry] of Object.entries(workspaces)) {
    validateWorkspace(id, entry);
  }
  const ompCreds = { version: 1 as const, workspaces: workspaces as Record<string, WorkspaceCreds> };

  // After loading omp store, try migrating any missing entries from legacy
  if (existsSync(legacyPath)) {
    try {
      const st = await stat(legacyPath);
      await verifySecureMode(legacyPath, st);
      let raw: string;
      try {
        raw = await readFile(legacyPath, "utf8");
      } catch (e) {
        throw new Error(`legacy credentials.json read failed: ${(e as Error).message}`);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        throw new Error(`legacy credentials.json malformed JSON: ${(e as Error).message}`);
      }
      if (typeof parsed !== "object" || parsed === null) {
        throw new Error("legacy credentials.json schema invalid: root must be an object");
      }
      const root = parsed as Record<string, unknown>;
      if (root.version !== 1) {
        throw new Error(`legacy credentials.json schema invalid: version must be 1 (got ${root.version})`);
      }
      if (typeof root.workspaces !== "object" || root.workspaces === null) {
        throw new Error("legacy credentials.json schema invalid: workspaces must be an object");
      }
      const workspaces = root.workspaces as Record<string, unknown>;
      // Validate each legacy entry and merge missing ones into omp store
      let migrated = false;
      for (const [id, entry] of Object.entries(workspaces)) {
        // Only migrate if not already in omp store (omp wins on collision)
        if (!(id in ompCreds.workspaces)) {
          validateWorkspace(id, entry);
          ompCreds.workspaces[id] = entry as WorkspaceCreds;
          migrated = true;
        }
      }
      // Persist merged entries to omp store (atomic + chmod 600)
      if (migrated) {
        await saveCredentials(ompCreds, filePath);
      }
    } catch (e) {
      // Silently ignore legacy migration errors — omp store takes precedence
      console.warn(`Failed to migrate legacy credentials from ${legacyPath}: ${(e as Error).message}`);
    }
  }

  return ompCreds;
}

/**
 * Save credentials to file atomic + chmod 600.
 * Atomic: write to temp file (same dir → same volume) + rename.
 * Tighten perms: chmod 600 sau write (cover existing file với loose perms).
 */
export async function saveCredentials(
  creds: Credentials,
  filePath: string = CREDENTIALS_PATH,
): Promise<void> {
  // Validate all entries trước khi write (fail fast — KHÔNG write malformed)
  for (const [id, entry] of Object.entries(creds.workspaces)) {
    validateWorkspace(id, entry);
  }
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const json = `${JSON.stringify(creds, null, 2)}\n`;
  // Atomic: temp file cùng dir (same volume) + rename
  const tmpPath = join(dir, `.credentials.json.tmp.${process.pid}`);
  await writeFile(tmpPath, json, "utf8");
  await chmod(tmpPath, SECURE_MODE);
  await rename(tmpPath, filePath);
}

/**
 * Add/update workspace entry (upsert). `id` default = workspace name.
 * Mutates file: load → upsert → save atomic.
 */
export async function addWorkspace(
  id: string | undefined,
  entry: WorkspaceCreds,
  filePath: string = CREDENTIALS_PATH,
): Promise<void> {
  const resolvedId = id ?? entry.workspace;
  // Validate entry trước (throws nếu invalid — KHÔNG touch file)
  validateWorkspace(resolvedId, entry);
  const creds = await loadCredentials(filePath, "");
  creds.workspaces[resolvedId] = entry;
  await saveCredentials(creds, filePath);
}

/**
 * Remove workspace entry by id. No-op nếu id không tồn tại.
 * KHÔNG delete file khi empty (giữ file để loadCredentials không recreate).
 */
export async function removeWorkspace(
  id: string,
  filePath: string = CREDENTIALS_PATH,
): Promise<void> {
  const creds = await loadCredentials(filePath, "");
  if (!(id in creds.workspaces)) return;
  delete creds.workspaces[id];
  await saveCredentials(creds, filePath);
}

/**
 * Lookup workspace by id handle. Returns undefined nếu không tồn tại.
 */
export async function getWorkspace(
  id: string,
  filePath: string = CREDENTIALS_PATH,
): Promise<WorkspaceCreds | undefined> {
  const creds = await loadCredentials(filePath, "");
  return creds.workspaces[id];
}

/**
 * Find workspaces by Huly workspace name. Returns Array (có thể empty).
 * Same-name diff-URL → multiple results (disambiguate per D8).
 */
export async function findByName(
  name: string,
  filePath: string = CREDENTIALS_PATH,
): Promise<Array<WorkspaceCreds & { id: string }>> {
  const creds = await loadCredentials(filePath, "");
  return Object.entries(creds.workspaces)
    .filter(([, entry]) => entry.workspace === name)
    .map(([id, entry]) => ({ id, ...entry }));
}
