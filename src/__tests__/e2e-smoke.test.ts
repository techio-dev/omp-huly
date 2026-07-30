// T-36 — e2e self-host smoke (RESCOPED: integration CI; runtime deferred).
//
// STATUS: integration smoke — KHÔNG runtime real-Huly e2e.
// Spec gốc (08-non-functional §"e2e 5%"): "real self-host Huly (CI secret,
// optional/manual) — smoke ~10 critical tools". Audit T-36 (2026-07-27):
//   - KHÔNG có self-host Huly available (no env HULY_*, user KHÔNG confirm).
//   - Release doc 10 §D liệt kê runtime verify = post-deploy prod step, KHÔNG CI gate.
//
// → Rescope (spec mismatch — self-resolvable, KHÔNG design conflict):
//   - IN-SCOPE CI: invoke `tool.execute()` chain cho 10 critical tools với
//     in-memory MockHulyStore. Verify FULL builder seam (resolver → getClient →
//     currentUser → confirm gate → handler → sanitize → AgentToolResult shape).
//   - DEFERRED: actual real-Huly round-trip — post-deploy prod verify (10 §D)
//     HOẶC task mới khi maintainer có self-host instance.
//
// Mock fidelity note: MockHulyStore KHÔNG = real Huly WS/REST semantics
// (reconnect, latency, serialization). Test này verify integration glue, KHÔNG
// claim runtime e2e pass.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";

// === Mock resolver + pool + client factory BEFORE import tool definitions ===
// Builder import pool.getClient + resolver.resolveWorkspace/resolveProject +
// client factory. Mock để inject MockHulyStore vào handler, KHÔNG touch fs.

vi.mock("../config/credentials.js", () => ({
  getWorkspace: vi.fn(),
  findByName: vi.fn().mockResolvedValue([]),
}));

vi.mock("../config/config.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: 1,
    transport: "ws",
    projects: { "/test/cwd": { workspace: "myteam", project: "PD" } },
  }),
  resolveByCwd: vi.fn().mockReturnValue({ workspace: "myteam", project: "PD" }),
}));

// Mock pool.getClient — builder import trực tiếp từ client/pool.js. Trả về
// MockHulyStore (inject từ test, set qua mockResolvedValue trong beforeEach).
vi.mock("../client/pool.js", () => ({
  getClient: vi.fn(),
  closeAll: vi.fn(),
}));

// Mock resolver functions — builder import trực tiếp từ config/resolver.js
// Trả về workspace/project cố định (cwd-map đã resolve).
vi.mock("../config/resolver.js", async (importOriginal) => {
  const orig = (await importOriginal()) as Record<string, unknown>;
  return {
    ...orig,
    resolveWorkspace: vi.fn().mockResolvedValue("myteam"),
    resolveProject: vi.fn().mockResolvedValue("PD"),
  };
});

import { getClient } from "../client/pool.js";
import { tools as issueCoreTools } from "../tools/domains/issues-core.js";
import { tools as documentTools } from "../tools/domains/documents.js";
import { tools as milestoneTools } from "../tools/domains/milestones.js";
import { tools as commentTools } from "../tools/domains/comments.js";
import { tools as searchTools } from "../tools/domains/search.js";

// === MockHulyStore — in-memory stateful HulyClient ===

/**
 * In-memory HulyClient mock. Stateful: createDoc insert doc thật, findAll
 * trả list thật (filter theo query match), updateDoc mutate field thật.
 * Mô phỏng Huly CRUD semantics đủ cho integration glue verify.
 *
 * LIMITATIONS (mock fidelity — KHÔNG = real Huly):
 *   - `$like` pattern: simplified substring/regex match, KHÔNG PostgreSQL LIKE
 *     full semantics (wildcards `_` NOT processed).
 *   - `$push`/`$pull` array ops: KHÔNG support — Object.assign literal.
 *     Smoke 10 tool không chạm; nếu sau này add test label tools → extend mock.
 *   - createDoc id param (4th) ignored — luôn gen random.
 */
class MockHulyStore {
  private docs = new Map<string, Record<string, unknown>>();
  private counter = 0;
  readonly transport = "ws" as const;

  private genId(prefix: string): string {
    this.counter++;
    return `${prefix}-${this.counter}`;
  }

  /** Match query ops đơn giản: {$like: pattern}, field exact, {} = all. */
  private matches(doc: Record<string, unknown>, query: Record<string, unknown>): boolean {
    for (const [field, cond] of Object.entries(query)) {
      if (
        field === "$like" ||
        (cond !== null && typeof cond === "object" && "$like" in (cond as object))
      ) {
        const pattern = field === "$like" ? (cond as string) : (cond as { $like: string }).$like;
        const value = String(doc[field] ?? "");
        const regex = pattern.replace(/[\\%]/g, "").replace(/%/g, ".*");
        if (!new RegExp(regex).test(value)) return false;
      } else {
        if (doc[field] !== cond) return false;
      }
    }
    return true;
  }

  async findOne(
    _class: string,
    query: Record<string, unknown>,
  ): Promise<Record<string, unknown> | undefined> {
    for (const doc of this.docs.values()) {
      if (doc._class === _class && this.matches(doc, query)) {
        return { ...doc };
      }
    }
    return undefined;
  }

  async findAll(
    _class: string,
    query: Record<string, unknown>,
    opts?: { limit?: number },
  ): Promise<Record<string, unknown>[]> {
    const limit = opts?.limit ?? 50;
    const result: Record<string, unknown>[] = [];
    for (const doc of this.docs.values()) {
      if (doc._class === _class && this.matches(doc, query)) {
        result.push({ ...doc });
      }
    }
    return result.slice(0, limit);
  }

  async createDoc(
    _class: string,
    _space: unknown,
    attrs: Record<string, unknown>,
  ): Promise<string> {
    const id = this.genId(_class.split(":").pop() ?? "doc");
    const doc: Record<string, unknown> = {
      _id: id,
      _class,
      space: _space,
      ...attrs,
    };
    this.docs.set(id, doc);
    return id;
  }

  async updateDoc(
    _class: string,
    _space: unknown,
    objectId: string,
    ops: Record<string, unknown>,
  ): Promise<{ ok: true }> {
    const doc = this.docs.get(objectId);
    if (!doc) throw new Error(`updateDoc: ${objectId} not found`);
    Object.assign(doc, ops);
    return { ok: true };
  }

  async removeDoc(): Promise<{ ok: true }> {
    return { ok: true };
  }

  async addCollection(
    _class: string,
    _space: unknown,
    _attachedTo: string,
    _attachedToClass: unknown,
    _collection: string,
    attrs: Record<string, unknown>,
  ): Promise<string> {
    // Comment attached — create standalone doc (simplified)
    return this.createDoc(_class, _space, attrs);
  }

  async createMixin(): Promise<{ ok: true }> {
    return { ok: true };
  }

  async getAccount(): Promise<{
    uuid: string;
    primarySocialId: string;
    socialIds: string[];
  }> {
    return {
      uuid: "user-uuid-1",
      primarySocialId: "user@example.com",
      socialIds: ["user@example.com"],
    };
  }

  async getCurrentUser(): Promise<{ id: string; name: string; email: string }> {
    return { id: "user-uuid-1", name: "user@example.com", email: "user@example.com" };
  }

  async close(): Promise<void> {}

  // T-66: markup ops mock — fetchMarkup echo, uploadMarkup return ref.
  async fetchMarkup(
    _c: string,
    _id: string,
    _attr: string,
    _ref: unknown,
    _format: string,
  ): Promise<string> {
    return "# mock content";
  }
  async uploadMarkup(
    _c: string,
    _id: string,
    _attr: string,
    _markup: string,
    _format: string,
  ): Promise<{ blob: string }> {
    return { blob: `blob-${_id.slice(0, 8)}` };
  }
  // T-103 #156: updateMarkup mock (edit existing doc content).
  async updateMarkup(
    _c: string,
    _id: string,
    _attr: string,
    _markup: string,
    _format: string,
  ): Promise<void> {
    // no-op (smoke test — content persistence verified live e2e).
  }

  /** Seed helper — inject doc directly (bypass createDoc cho test setup). */
  seed(_class: string, doc: Record<string, unknown>): string {
    const id = (doc._id as string) ?? this.genId(_class.split(":").pop() ?? "seed");
    this.docs.set(id, { _id: id, _class, ...doc });
    return id;
  }

  /** Read doc (verify side-effect từ test). */
  peek(id: string | undefined): Record<string, unknown> | undefined {
    if (!id) return undefined;
    const d = this.docs.get(id);
    return d ? { ...d } : undefined;
  }
}

/** Build ExtensionContext stub (builder cần ctx.cwd + ctx.hasUI). */
function makeCtx(cwd = "/test/cwd"): ExtensionContext {
  return {
    cwd,
    hasUI: false,
    // builder KHÔNG call ctx.confirm (only confirm.ts via ctx.ui.confirm —
    // chỉ khi destructive; smoke test dùng non-destructive tools).
  } as never as ExtensionContext;
}

/** Tìm tool theo name trong danh sách. */
function findTool(list: unknown[], name: string) {
  const t = list.find((x) => (x as { name: string }).name === name);
  if (!t) throw new Error(`tool ${name} not registered`);
  return t as {
    name: string;
    execute: (
      id: string,
      params: Record<string, unknown>,
      signal: AbortSignal | undefined,
      onUpdate: undefined,
      ctx: ExtensionContext,
    ) => Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: Record<string, unknown>;
      isError?: true;
    }>;
  };
}

describe("T-36 e2e smoke — 10 critical tools (integration, in-memory mock)", () => {
  let store: MockHulyStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new MockHulyStore();
    // getClient luôn return cùng store (D14 single connection)
    vi.mocked(getClient).mockResolvedValue(store as never);
  });

  // 1. huly_create_issue
  it("create_issue: creates issue doc + returns id + auto-resolve assignee (D15)", async () => {
    // Seed project để handler resolve
    store.seed("tracker:class:Project", {
      identifier: "PD",
      space: "space-pd",
    });
    const tool = findTool(issueCoreTools, "huly_create_issue");
    const result = await tool.execute(
      "call-1",
      // KHÔNG truyền assignee → builder auto-fill currentUser.email (D15 FR-18)
      { title: "Smoke test issue", priority: "high" },
      undefined,
      undefined,
      makeCtx(),
    );
    expect(result.isError, "create should succeed").toBeUndefined();
    expect(result.content[0]?.text).toMatch(/Created issue/);
    expect(result.details).toMatchObject({ title: "Smoke test issue" });
    // Side-effect: issue doc thật được insert
    const inserted = store.peek(result.details.id as string | undefined);
    expect(inserted).toBeDefined();
    // T-95 (#141): assignee resolve email→Person._id (KHÔNG raw email). Mock
    // MockHulyStore KHÔNG seed Person/Channel cho user@example.com → default
    // fallback null (unassigned, KHÔNG garbage). Happy-path resolve→Person._id
    // verify bởi e2e-live.test.ts (workspace thật có Person).
    expect(inserted?.assignee).toBe(null);
  });

  // 2. huly_list_issues
  it("list_issues: returns seeded issues", async () => {
    store.seed("tracker:class:Project", { identifier: "PD", _id: "space-pd" });
    store.seed("tracker:class:Issue", {
      _id: "i-1",
      identifier: "PD-1",
      title: "Seeded issue",
      status: "Active",
      space: "space-pd",
    });
    const tool = findTool(issueCoreTools, "huly_list_issues");
    const result = await tool.execute("call-2", {}, undefined, undefined, makeCtx());
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toMatch(/Found \d+ issue/);
    expect(result.details.count).toBeGreaterThan(0);
  });

  // 3. huly_get_issue
  it("get_issue: returns issue detail", async () => {
    store.seed("tracker:class:Issue", {
      identifier: "PD-42",
      title: "Detail issue",
      status: "Active",
      priority: "high",
    });
    const tool = findTool(issueCoreTools, "huly_get_issue");
    const result = await tool.execute(
      "call-3",
      { identifier: "PD-42" },
      undefined,
      undefined,
      makeCtx(),
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain("PD-42");
    expect(result.details).toMatchObject({ identifier: "PD-42", title: "Detail issue" });
  });

  // 4. huly_create_document — T-66: ENABLED (DOCUMENT_CLASS + uploadMarkup)
  it("create_document: creates document + returns id", async () => {
    store.seed("document:class:Teamspace", { _id: "ts-1", name: "Docs" });
    const tool = findTool(documentTools, "huly_create_document");
    const result = await tool.execute(
      "call-4",
      { teamspace: "ts-1", title: "Smoke doc", content: "# Hello world" },
      undefined,
      undefined,
      makeCtx(),
    );
    expect(result.isError).toBeUndefined();
    expect(result.details).toMatchObject({ title: "Smoke doc" });
    expect(result.details.id).toBeTruthy();
  });

  // 5. huly_edit_document — T-66: ENABLED (search-replace)
  it("edit_document: updates content via search-replace", async () => {
    store.seed("document:class:Document", {
      _id: "doc-1",
      title: "Smoke",
      content: { blob: "ref-1" },
      space: "ts-1",
    });
    const tool = findTool(documentTools, "huly_edit_document");
    const result = await tool.execute(
      "call-5",
      { document: "doc-1", old_text: "mock", new_text: "updated" },
      undefined,
      undefined,
      makeCtx(),
    );
    expect(result.isError).toBeUndefined();
    expect(result.details).toMatchObject({ updated: true, mode: "search-replace" });
  });

  // 6. huly_create_milestone
  it("create_milestone: creates milestone doc + returns id", async () => {
    store.seed("tracker:class:Project", { identifier: "PD", space: "space-pd" });
    const tool = findTool(milestoneTools, "huly_create_milestone");
    const result = await tool.execute(
      "call-6",
      { label: "M5 Hardening", targetDate: 1800000000000 },
      undefined,
      undefined,
      makeCtx(),
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toMatch(/Created milestone/);
    expect(result.details).toMatchObject({ label: "M5 Hardening" });
  });

  // 7. huly_set_issue_milestone
  it("set_issue_milestone: updates issue.milestone", async () => {
    store.seed("tracker:class:Issue", {
      identifier: "PD-7",
      title: "Issue to milestone",
      space: "space-pd",
    });
    // T-52 #42: validate milestone tồn tại trước khi set ref.
    store.seed("tracker:class:Milestone", {
      _id: "ms-99",
      label: "MVP",
      space: "space-pd",
    });
    const tool = findTool(milestoneTools, "huly_set_issue_milestone");
    const result = await tool.execute(
      "call-7",
      { identifier: "PD-7", milestone: "ms-99" },
      undefined,
      undefined,
      makeCtx(),
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toMatch(/Set PD-7 → milestone/);
  });

  // 8. huly_add_comment
  it("add_comment: attaches comment to issue", async () => {
    store.seed("tracker:class:Issue", {
      identifier: "PD-8",
      title: "Commented issue",
      space: "space-pd",
    });
    const tool = findTool(commentTools, "huly_add_comment");
    const result = await tool.execute(
      "call-8",
      { identifier: "PD-8", body: "Smoke comment" },
      undefined,
      undefined,
      makeCtx(),
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toMatch(/Comment added to PD-8/);
    expect(result.details).toMatchObject({ identifier: "PD-8" });
    // Side-effect: comment doc thật được insert qua addCollection
    expect(store.peek(result.details.id as string | undefined)).toBeDefined();
  });

  // 9. huly_fulltext_search
  it("fulltext_search: returns matching results", async () => {
    store.seed("tracker:class:Issue", {
      identifier: "PD-9",
      title: "Smoke searchable issue",
    });
    const tool = findTool(searchTools, "huly_fulltext_search");
    const result = await tool.execute(
      "call-9",
      { query: "searchable" },
      undefined,
      undefined,
      makeCtx(),
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toMatch(/Found \d+ result/);
    expect(result.details.count).toBeGreaterThan(0);
  });

  // 10. /huly init (command bind) — verify resolver wiring returns workspace/project
  //     (Full command smoke cần ExtensionCommandContext + UI mock — covered T-31 unit.
  //     T-36 verify "binding resolves correctly" cho tool chain — nếu cwd-map
  //     resolves, 9 tools trên đều work. Test này assert resolver contract.)
  it("/huly init binding: cwd-map resolves workspace + project (D11)", async () => {
    // Resolver đã mock resolveWorkspace → myteam, resolveProject → PD.
    // Verify contract: mọi tool ở trên gọi mà KHÔNG truyền workspace/project
    // đều resolve qua cwd-map (binding effect). Đây là điều kiện tiền đề
    // cho /huly init hoạt động đúng.
    store.seed("tracker:class:Project", { identifier: "PD", space: "space-pd" });
    const tool = findTool(issueCoreTools, "huly_create_issue");
    const result = await tool.execute(
      "call-10",
      { title: "Binding test" },
      undefined,
      undefined,
      makeCtx("/test/cwd"),
    );
    expect(result.isError).toBeUndefined();
    expect(result.details).toMatchObject({ title: "Binding test" });
    // Pool getClient gọi đúng 1 lần (D14 single connection share)
    expect(getClient).toHaveBeenCalledTimes(1);
  });

  // Cross-cutting: builder → getClient contract — mỗi tool execute gọi getClient
  // đúng 1 lần (builder resolve pool trên mỗi call). Pool cache itself đã verify
  // trong pool.test.ts (T-06 + T-35 R7 precondition). Test này verify builder
  // wiring: KHÔNG skip getClient, KHÔNG gọi 2 lần/tool.
  it("builder contract: mỗi tool execute gọi getClient đúng 1 lần", async () => {
    store.seed("tracker:class:Project", { identifier: "PD", space: "space-pd" });
    store.seed("tracker:class:Issue", { identifier: "PD-x", title: "Seed" });
    const tool = findTool(issueCoreTools, "huly_list_issues");
    vi.clearAllMocks();
    vi.mocked(getClient).mockResolvedValue(store as never);

    await tool.execute("pool-call", {}, undefined, undefined, makeCtx());

    // Builder resolve getClient đúng 1 lần cho 1 tool execute (KHÔNG skip, KHÔNG double)
    expect(getClient).toHaveBeenCalledTimes(1);
    expect(getClient).toHaveBeenCalledWith("myteam");
  });

  // No-leak: sanitize strip secret pattern thật (LEAK_PATTERNS centralized).
  // Test pass title chứa "token=<value>" — sanitize phải redact trước khi return.
  it("no-leak: sanitize strip secret khỏi tool result content (NFR-04)", async () => {
    store.seed("tracker:class:Project", { identifier: "PD", space: "space-pd" });
    const tool = findTool(issueCoreTools, "huly_create_issue");
    const result = await tool.execute(
      "leak-call",
      // Title chứa generic token assignment (match LEAK_PATTERNS[0])
      { title: "Title with token=supersecret123abc" },
      undefined,
      undefined,
      makeCtx(),
    );
    // "token=supersecret123abc" phải bị redact → KHÔNG còn raw secret
    expect(result.content[0]?.text).not.toMatch(/token=supersecret123abc/i);
    expect(result.content[0]?.text).toMatch(/\[REDACTED\]/);
  });

  // Error path: get_issue not found → clear isError
  it("error path: get_issue unknown identifier → isError", async () => {
    const tool = findTool(issueCoreTools, "huly_get_issue");
    const result = await tool.execute(
      "err-call",
      { identifier: "PD-999" },
      undefined,
      undefined,
      makeCtx(),
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/not found/i);
  });
});
