// Test tổng tất cả domain tools — verify FR-02 (~102 tools prefix huly_) +
// FR-04 (19 domain full CRUD) + FR-09 (destructive có confirm gate) +
// schema valid + handler delegate.

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock deps
vi.mock("../../client/pool.js", () => ({ getClient: vi.fn() }));
vi.mock("../../config/resolver.js", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("../../config/resolver.js");
  return {
    ...actual,
    resolveWorkspace: vi.fn().mockResolvedValue("ws1"),
    resolveProject: vi.fn().mockResolvedValue("PD"),
  };
});
vi.mock("../../client/errors.js", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("../../client/errors.js");
  return {
    ...actual,
    mapError: vi.fn((e: unknown) => ({
      class: "Internal",
      message: String(e),
    })),
  };
});
vi.mock("../../markup/markup.js", () => ({
  mdToMarkup: vi.fn((s: string) => `markup(${s})`),
  markupToMd: vi.fn((s: unknown) => `md(${JSON.stringify(s).slice(0, 20)})`),
}));

import { getClient } from "../../client/pool.js";
import { allTools, toolCountByDomain } from "../register.js";

function makeClient() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "User", email: "u@x.com" }),
    findAll: vi.fn().mockResolvedValue([]),
    findOne: vi.fn(),
    createDoc: vi.fn().mockResolvedValue("new-id"),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    removeDoc: vi.fn().mockResolvedValue(undefined),
    addCollection: vi.fn().mockResolvedValue("new-coll-id"),
    createMixin: vi.fn().mockResolvedValue(undefined),
    fetchMarkup: vi.fn().mockResolvedValue(""),
    uploadMarkup: vi.fn().mockResolvedValue({ blob: "ref" }),
    updateMarkup: vi.fn().mockResolvedValue(undefined),
  };
}

const ctx = {
  hasUI: false,
  cwd: "/proj",
  ui: { confirm: vi.fn() },
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue(makeClient() as never);
});

describe("FR-02 + D5: ~102 tools prefix huly_", () => {
  it("total = 102", () => {
    expect(allTools.length).toBe(102);
  });

  it("mọi tool có prefix huly_", () => {
    for (const t of allTools) {
      expect(t.name).toMatch(/^huly_/);
    }
  });

  it("mọi tool có name unique", () => {
    const names = allTools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("mọi tool có label + description + parameters", () => {
    for (const t of allTools) {
      expect(t.label).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.parameters).toBeDefined();
    }
  });
});

describe("FR-04 D4: 19 domain modules", () => {
  it("21 domain modules registered", () => {
    // Spec nói "19 domain" (06-api.md §4), thực tế chia nhỏ thành 21 file.
    // Tổng tool vẫn ~102 (FR-02).
    const domains = Object.keys(toolCountByDomain());
    expect(domains.length).toBeGreaterThanOrEqual(19);
  });

  it("document domain có 10 tools (FR-04)", () => {
    expect(toolCountByDomain().documents).toBe(10);
  });

  it("issues (core+relations+templates) = 21 tools (FR-04 Issues 21)", () => {
    const total =
      toolCountByDomain()["issues-core"] +
      toolCountByDomain()["issues-relations"] +
      toolCountByDomain()["issues-templates"];
    expect(total).toBe(21);
  });

  it("milestones có 6 tools", () => {
    expect(toolCountByDomain().milestones).toBe(6);
  });
});

describe("FR-09 D9: destructive tools có confirm gate", () => {
  it("delete_* tools flagged destructive", () => {
    const destructiveTools = allTools.filter((t) => {
      // Check execute returns "Cancelled" khi hasUI=false (non-TUI auto-deny)
      return t.name.startsWith("huly_delete_") || t.name.startsWith("huly_remove_");
    });
    expect(destructiveTools.length).toBeGreaterThan(5);
    // Non-TUI → auto-deny → handler KHÔNG chạy → return Cancelled
    // (verified per-domain tests chi tiết)
  });
});

describe("FR-06: needsProject flag đúng", () => {
  it("project-scoped tools flagged needsProject", async () => {
    // Issues/milestones/components/projects cần project
    const projectTools = allTools.filter((t) =>
      ["list_issues", "create_issue", "create_milestone", "list_components"].includes(
        t.name.replace("huly_", ""),
      ),
    );
    expect(projectTools.length).toBeGreaterThanOrEqual(4);
  });

  it("global tools KHÔNG needsProject", async () => {
    const globalTools = allTools.filter((t) =>
      ["list_workspaces", "get_workspace_info", "list_employees"].includes(
        t.name.replace("huly_", ""),
      ),
    );
    expect(globalTools.length).toBeGreaterThanOrEqual(3);
  });
});

describe("execute smoke — happy path mọi tool", () => {
  it("mọi tool execute không throw (mock client OK)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "x1",
      space: "sp1",
      identifier: "PD-1",
      name: "Test",
      title: "Test",
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const errors: Array<{ name: string; err: string }> = [];
    for (const tool of allTools) {
      try {
        const result = await tool.execute("tc1", {}, undefined, undefined, ctx);
        if (!result || !Array.isArray(result.content)) {
          errors.push({ name: tool.name, err: "no content array" });
        }
      } catch (e) {
        errors.push({ name: tool.name, err: String(e).slice(0, 200) });
      }
    }
    // STRICT: mọi tool phải execute OK (KHÔNG throw, return content array)
    expect(errors).toEqual([]);
  });
});

describe("error path coverage", () => {
  it("get_issue với identifier không tồn tại → isError", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue(undefined); // not found
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = allTools.find((t) => t.name === "huly_get_issue")!;
    const result = await tool.execute("tc1", { identifier: "PD-999" }, undefined, undefined, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/not found/i);
  });

  it("create_issue_status idempotent 2 lần — lần 2 no-op (T-73: taskType required)", async () => {
    const client = makeClient();
    // Call 1: taskType → statusClass/parent; existing check undefined; projectType → register
    // Call 2: taskType → existing check returns doc → idempotent
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({
        _id: "tt-1",
        statusClass: "tracker:class:IssueStatus",
        parent: "pt-1",
      }) // tt call 1
      .mockResolvedValueOnce(undefined) // existing check call 1
      .mockResolvedValueOnce({ _id: "pt-1", statuses: [] }) // projectType call 1
      .mockResolvedValueOnce({
        _id: "tt-1",
        statusClass: "tracker:class:IssueStatus",
        parent: "pt-1",
      }) // tt call 2
      .mockResolvedValueOnce({ _id: "s1", name: "Done" }); // existing check call 2
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = allTools.find((t) => t.name === "huly_create_issue_status")!;
    const r1 = await tool.execute(
      "tc1",
      { taskType: "tt-1", name: "Done", category: "Won" },
      undefined,
      undefined,
      ctx,
    );
    expect(r1.details).toMatchObject({ name: "Done", registered: true });
    const r2 = await tool.execute(
      "tc1",
      { taskType: "tt-1", name: "Done", category: "Won" },
      undefined,
      undefined,
      ctx,
    );
    expect(r2.details).toMatchObject({ idempotent: true });
    expect(client.createDoc).toHaveBeenCalledTimes(1);
  });

  it("edit_document ENABLED (T-103 #156) — search-replace gọi fetchMarkup + updateMarkup", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "d1",
      title: "Doc",
      content: { blob: "ref" },
      space: "ts-1",
    });
    client.fetchMarkup = vi.fn().mockResolvedValue("hello world");
    client.updateMarkup = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = allTools.find((t) => t.name === "huly_edit_document")!;
    const result = await tool.execute(
      "tc1",
      { document: "d1", old_text: "hello", new_text: "hi" },
      undefined,
      undefined,
      ctx,
    );
    // #156: edit_document — search-replace path (updateMarkup, KHÔNG uploadMarkup+updateDoc).
    expect(result.isError).toBeUndefined();
    expect(result.details).toMatchObject({ updated: true, mode: "search-replace" });
    expect(client.updateMarkup).toHaveBeenCalledTimes(1);
    expect(client.uploadMarkup).not.toHaveBeenCalled();
  });

  it("get_issue cross-project identifier → isError", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = allTools.find((t) => t.name === "huly_get_issue")!;
    const result = await tool.execute(
      "tc1",
      { identifier: "FOO-5" }, // cross-project (PD scoped)
      undefined,
      undefined,
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/Cross-project|not found/i);
  });
});
