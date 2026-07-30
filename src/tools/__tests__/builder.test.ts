// Test T-09 defineHulyTool — single seam: prefix, resolve, getClient, error map,
// confirm gate, assignee default, handler convert.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Mock dependencies BEFORE import builder.ts
vi.mock("../../client/pool.js", () => ({ getClient: vi.fn() }));
vi.mock("../../config/resolver.js", () => {
  class NeedsInitError extends Error {
    constructor(m = "needs init") {
      super(m);
      this.name = "NeedsInitError";
    }
  }
  class NeedsDisambiguationError extends Error {
    readonly matches: Array<{ id: string; url: string; workspace: string }>;
    constructor(matches: Array<{ id: string; url: string; workspace: string }>) {
      super("ambiguous");
      this.name = "NeedsDisambiguationError";
      this.matches = matches;
    }
  }
  return {
    resolveWorkspace: vi.fn(),
    resolveProject: vi.fn(),
    NeedsInitError,
    NeedsDisambiguationError,
  };
});
vi.mock("../../client/errors.js", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("../../client/errors.js");
  // Real sanitize + LEAK_PATTERNS (test verify leak strip thật), mock chỉ mapError
  // để test kiểm soát error class trả về. Mock delegate domain-not-found pattern
  // sang real matchDomainNotFound (T-57) — test builder render honest message.
  class HulyError extends Error {
    readonly class: string;
    constructor(c: string, m: string) {
      super(m);
      this.name = `${c}Error`;
      this.class = c;
    }
  }
  return {
    ...actual,
    HulyError,
    mapError: vi.fn((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof Error && /network/i.test(msg)) {
        return new HulyError("Connection", `Huly unreachable: ${msg}`);
      }
      // T-57: delegate sang real matchDomainNotFound để builder test verify render.
      const cls = actual.matchDomainNotFound(msg);
      if (cls !== null) {
        const err = new HulyError(
          "Unavailable",
          `Class "${cls}" không khả dụng trong workspace này.`,
        );
        Object.assign(err, { hulyClass: cls });
        return err as never;
      }
      return new HulyError("Internal", String(e));
    }),
  };
});
vi.mock("../../client/client.js", () => ({}));

import { getClient } from "../../client/pool.js";
import { resolveWorkspace, resolveProject, NeedsInitError } from "../../config/resolver.js";
import { defineHulyTool } from "../builder.js";

function makeMockClient() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "User", email: "u@x.com" }),
  };
}

function makeCtx(hasUI = false, confirmResult = true) {
  return {
    hasUI,
    cwd: "/proj",
    ui: { confirm: vi.fn().mockResolvedValue(confirmResult) },
  } as unknown as Parameters<ReturnType<typeof defineHulyTool>["execute"]>[4];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue(makeMockClient() as never);
  vi.mocked(resolveWorkspace).mockResolvedValue("ws1");
  vi.mocked(resolveProject).mockResolvedValue("PD");
});

describe("defineHulyTool — prefix huly_ (D5 FR-02)", () => {
  it("prefixes name with huly_", () => {
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List issues",
      description: "list",
      parameters: z.object({}),
      handler: async () => ({ content: "ok" }),
    });
    expect(tool.name).toBe("huly_list_issues");
  });
});

describe("defineHulyTool execute — resolve + getClient + handler", () => {
  it("resolves workspace từ params.workspace", async () => {
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List",
      description: "list",
      parameters: z.object({ workspace: z.optional(z.string()) }),
      handler: async (_params, tctx) => ({
        content: `ws=${tctx.workspace} project=${tctx.project ?? "n/a"}`,
      }),
    });
    const result = await tool.execute(
      "tc1",
      { workspace: "explicit" },
      undefined,
      undefined,
      makeCtx(),
    );
    expect(resolveWorkspace).toHaveBeenCalledWith("explicit", { cwd: "/proj" });
    expect(result.content[0]?.text).toBe("ws=ws1 project=n/a");
  });

  it("needsProject → resolve project từ params.project", async () => {
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List",
      description: "list",
      parameters: z.object({ project: z.optional(z.string()) }),
      needsProject: true,
      handler: async (_params, tctx) => ({ content: `project=${tctx.project}` }),
    });
    const result = await tool.execute("tc1", { project: "WEB" }, undefined, undefined, makeCtx());
    expect(resolveProject).toHaveBeenCalledWith("WEB", { cwd: "/proj" });
    expect(result.content[0]?.text).toBe("project=PD"); // resolveProject mock returns PD regardless; project=WEB passed in
  });
});

describe("defineHulyTool execute — error mapping (FR-14)", () => {
  it("NeedsInitError → isError=true + clear hint", async () => {
    vi.mocked(resolveWorkspace).mockRejectedValueOnce(new NeedsInitError());
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List",
      description: "list",
      parameters: z.object({}),
      handler: async () => ({ content: "ok" }),
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx());
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/needs init/);
    expect(result.details).toMatchObject({ errorClass: "Auth", kind: "NeedsInit" });
  });

  it("handler throw → mapError → isError=true + sanitized", async () => {
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List",
      description: "list",
      parameters: z.object({}),
      handler: async () => {
        throw new Error("network down");
      },
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx());
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/ConnectionError/);
    expect(result.details).toMatchObject({ errorClass: "Connection" });
  });

  it("token leak trong message → strip [REDACTED] (08 §A NFR-04)", async () => {
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List",
      description: "list",
      parameters: z.object({}),
      handler: async () => {
        throw new Error("token=abc123secret456 network down");
      },
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx());
    expect(result.content[0]?.text).not.toContain("abc123secret456");
    expect(result.content[0]?.text).toContain("[REDACTED]");
  });
});

describe("defineHulyTool execute — confirm gate (FR-09 D9)", () => {
  it("destructive=true + non-TUI → auto-deny + isError cancelled", async () => {
    const handler = vi.fn().mockResolvedValue({ content: "deleted" });
    const tool = defineHulyTool({
      name: "delete_issue",
      label: "Delete",
      description: "delete",
      parameters: z.object({}),
      destructive: true,
      handler,
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx(false));
    expect(handler).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/Cancelled/);
  });

  it("destructive=true + TUI confirm → handler chạy", async () => {
    const handler = vi.fn().mockResolvedValue({ content: "deleted PD-1" });
    const tool = defineHulyTool({
      name: "delete_issue",
      label: "Delete",
      description: "delete",
      parameters: z.object({}),
      destructive: true,
      destructiveContext: () => ({ type: "issue", id: "PD-1" }),
      handler,
    });
    const ctx = makeCtx(true, true);
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);
    expect(ctx.ui.confirm).toHaveBeenCalledWith("Delete issue", 'Delete issue "PD-1"?');
    expect(handler).toHaveBeenCalled();
    expect(result.content[0]?.text).toBe("deleted PD-1");
  });

  it("destructive=true + TUI deny → handler KHÔNG chạy", async () => {
    const handler = vi.fn().mockResolvedValue({ content: "deleted" });
    const tool = defineHulyTool({
      name: "delete_issue",
      label: "Delete",
      description: "delete",
      parameters: z.object({}),
      destructive: true,
      handler,
    });
    const ctx = makeCtx(true, false);
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);
    expect(handler).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
  });
});

describe("defineHulyTool execute — assignee default (D15 FR-18)", () => {
  it("needsAssignee + assignee absent → fill currentUser email trực tiếp", async () => {
    const handler = vi.fn().mockResolvedValue({ content: "ok" });
    const tool = defineHulyTool({
      name: "create_issue",
      label: "Create",
      description: "create",
      parameters: z.object({
        title: z.string(),
        assignee: z.optional(z.string()),
      }),
      needsAssignee: true,
      handler,
    });
    await tool.execute("tc1", { title: "T" }, undefined, undefined, makeCtx());
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ assignee: "u@x.com" }),
      expect.anything(),
    );
  });

  it("needsAssignee + assignee present → giữ nguyên KHÔNG override", async () => {
    const handler = vi.fn().mockResolvedValue({ content: "ok" });
    const tool = defineHulyTool({
      name: "create_issue",
      label: "Create",
      description: "create",
      parameters: z.object({
        title: z.string(),
        assignee: z.optional(z.string()),
      }),
      needsAssignee: true,
      handler,
    });
    await tool.execute("tc1", { title: "T", assignee: "x@y.com" }, undefined, undefined, makeCtx());
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ assignee: "x@y.com" }),
      expect.anything(),
    );
  });

  it("needsAssignee + custom assigneeField 'owner' → fill owner khi absent", async () => {
    const handler = vi.fn().mockResolvedValue({ content: "ok" });
    const tool = defineHulyTool({
      name: "log_time",
      label: "Log",
      description: "log",
      parameters: z.object({
        owner: z.optional(z.string()),
      }),
      needsAssignee: true,
      assigneeField: "owner",
      handler,
    });
    await tool.execute("tc1", {}, undefined, undefined, makeCtx());
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "u@x.com" }),
      expect.anything(),
    );
  });
});

describe("defineHulyTool execute — error gate coverage (FR-14)", () => {
  it("NeedsDisambiguationError → isError=true + matches propagate", async () => {
    const { NeedsDisambiguationError } = await import("../../config/resolver.js");
    vi.mocked(resolveWorkspace).mockRejectedValueOnce(
      new NeedsDisambiguationError([
        { id: "ws-a", url: "https://a.io", workspace: "team" },
        { id: "ws-b", url: "https://b.io", workspace: "team" },
      ]),
    );
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List",
      description: "list",
      parameters: z.object({}),
      handler: async () => ({ content: "ok" }),
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx());
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("ws-a");
    expect(result.content[0]?.text).toContain("https://a.io");
    expect(result.content[0]?.text).toContain("ws-b");
    expect(result.details).toMatchObject({
      errorClass: "Auth",
      kind: "NeedsDisambiguation",
    });
  });

  it("getClient throw → mapError → isError=true", async () => {
    vi.mocked(getClient).mockRejectedValueOnce(new Error("network unreachable"));
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List",
      description: "list",
      parameters: z.object({}),
      handler: async () => ({ content: "ok" }),
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx());
    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ errorClass: "Connection" });
  });

  it("getCurrentUser throw → mapError → isError=true", async () => {
    vi.mocked(getClient).mockResolvedValueOnce({
      getCurrentUser: vi.fn().mockRejectedValue(new Error("network auth fail")),
    } as never);
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List",
      description: "list",
      parameters: z.object({}),
      handler: async () => ({ content: "ok" }),
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx());
    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ errorClass: "Connection" });
  });

  it("success path có token → sanitize strip [REDACTED] (08 §A)", async () => {
    const tool = defineHulyTool({
      name: "get_issue",
      label: "Get",
      description: "get",
      parameters: z.object({}),
      handler: async () => ({
        content: "Issue desc: Authorization=Bearer-abc123secret456 here",
      }),
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx());
    expect(result.content[0]?.text).not.toContain("abc123secret456");
    expect(result.content[0]?.text).toContain("[REDACTED]");
  });

  it("AWS key trong success → strip", async () => {
    const tool = defineHulyTool({
      name: "get_doc",
      label: "Doc",
      description: "get",
      parameters: z.object({}),
      handler: async () => ({
        content: "config AKIAIOSFODNN7EXAMPLE was here",
      }),
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx());
    expect(result.content[0]?.text).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  // T-57 #61: handler throw "domain not found" → UnavailableError, render
  // honest message với class ref + recovery hint (KHÔNG generic InternalError).
  it("handler throw 'domain not found' → UnavailableError + recovery hint (T-57)", async () => {
    const tool = defineHulyTool({
      name: "list_documents",
      label: "List docs",
      description: "list",
      parameters: z.object({}),
      handler: async () => {
        throw new Error("domain not found: tracker:class:Document");
      },
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx());
    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({
      errorClass: "Unavailable",
      hulyClass: "tracker:class:Document",
    });
    expect(result.content[0]?.text).toContain("[UnavailableError]");
    expect(result.content[0]?.text).toContain("tracker:class:Document");
    expect(result.content[0]?.text).toContain("Recovery:");
  });

  it("handler throw generic error → vẫn InternalError (no false Unavailable)", async () => {
    // Regression guard: KHÔNG over-eager classify mọi error thành Unavailable.
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List",
      description: "list",
      parameters: z.object({}),
      handler: async () => {
        throw new Error("unexpected runtime glitch");
      },
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx());
    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ errorClass: "Internal" });
    expect(result.content[0]?.text).toContain("[InternalError]");
  });
});

describe("defineHulyTool execute — destructiveContext safety", () => {
  it("destructiveContext throw → fallback safe defaults (KHÔNG crash execute)", async () => {
    const handler = vi.fn().mockResolvedValue({ content: "deleted" });
    const tool = defineHulyTool({
      name: "delete_issue",
      label: "Delete",
      description: "delete",
      parameters: z.object({}),
      destructive: true,
      destructiveContext: () => {
        throw new Error("domain bug");
      },
      handler,
    });
    const ctx = makeCtx(true, true);
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);
    // Confirm vẫn chạy với fallback defaults
    expect(ctx.ui.confirm).toHaveBeenCalled();
    expect(handler).toHaveBeenCalled();
    expect(result.content[0]?.text).toBe("deleted");
  });
});

describe("defineHulyTool execute — result convert", () => {
  it("HulyToolResult → AgentToolResult shape (content + details)", async () => {
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List",
      description: "list",
      parameters: z.object({}),
      handler: async () => ({
        content: "Found 3 issues",
        // scalar-only details (no array/id) → append no-op → content shape sạch
        details: { count: 3 },
      }),
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx(true));
    expect(result.content).toEqual([{ type: "text", text: "Found 3 issues" }]);
    expect(result.details).toEqual({ count: 3 });
    expect(result.isError).toBeUndefined();
  });

  it("HulyToolResult isError=true → propagate", async () => {
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List",
      description: "list",
      parameters: z.object({}),
      handler: async () => ({ content: "Not found", isError: true }),
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx());
    expect(result.isError).toBe(true);
  });
});

// T-40: non-TUI path (hasUI=false) — append details → content để LLM thấy array + id
describe("defineHulyTool execute — non-TUI surface details (T-40 #22 #26)", () => {
  it("hasUI=false + details có array → content text append array data (#22)", async () => {
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List",
      description: "list",
      parameters: z.object({}),
      handler: async () => ({
        content: "Found 2 issue(s).",
        details: {
          count: 2,
          issues: [
            { identifier: "PD-1", title: "First", status: "In Progress" },
            { identifier: "PD-2", title: "Second", status: "Done" },
          ],
        },
      }),
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx(false));
    const text = result.content[0]?.text ?? "";
    // Content gốc giữ nguyên + append data
    expect(text).toContain("Found 2 issue(s).");
    expect(text).toContain("PD-1");
    expect(text).toContain("PD-2");
    expect(text).toContain("First");
    expect(text).toContain("In Progress");
    // details vẫn nguyên vẹn cho render layer (không break TUI)
    expect(result.details).toMatchObject({ count: 2 });
  });

  it("hasUI=false + details có id/identifier → content text append id (#26)", async () => {
    const tool = defineHulyTool({
      name: "create_issue",
      label: "Create",
      description: "create",
      parameters: z.object({}),
      handler: async () => ({
        content: 'Created issue "Test".',
        details: { id: "abc123", identifier: "PD-42", title: "Test" },
      }),
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx(false));
    const text = result.content[0]?.text ?? "";
    expect(text).toContain('Created issue "Test".');
    expect(text).toContain("abc123");
    expect(text).toContain("PD-42");
  });

  it("hasUI=false + details rỗng/undefined → content KHÔNG append gì thêm", async () => {
    const tool = defineHulyTool({
      name: "noop_tool",
      label: "Noop",
      description: "noop",
      parameters: z.object({}),
      handler: async () => ({ content: "Done." }),
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx(false));
    expect(result.content[0]?.text).toBe("Done.");
  });

  // T-92 (#138): TUI mode (hasUI=true) GIỜ cũng append details vào content —
  // trước đây gate `hasUI !== true` drop details cho ~99 tool, model thấy
  // count-only → không drive được tool follow-up. Fix: luôn append.
  it("hasUI=true (TUI mode) → content append details (T-92 fix #138)", async () => {
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List",
      description: "list",
      parameters: z.object({}),
      handler: async () => ({
        content: "Found 1 issue(s).",
        details: { count: 1, issues: [{ identifier: "PD-1", title: "X" }] },
      }),
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx(true));
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Found 1 issue(s).");
    expect(text).toContain("PD-1"); // T-92: identifier giờ lọt vào content
    expect(text).toContain("X");
    // details vẫn nguyên vẹn cho render layer
    expect(result.details).toMatchObject({ count: 1 });
  });

  // T-92 (#138): mutation create result (scalar id, no array) trong TUI mode →
  // created id phải surface cho LLM follow-up (add_comment/create_todo trước đây
  // trả "Comment added." không id → không update/delete được).
  it("hasUI=true + create result (scalar id) → content append id (T-92 #138)", async () => {
    const tool = defineHulyTool({
      name: "add_comment",
      label: "Comment",
      description: "add",
      parameters: z.object({}),
      handler: async () => ({
        content: "Comment added to PD-1.",
        details: { id: "comment-xyz", identifier: "PD-1" },
      }),
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx(true));
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Comment added to PD-1.");
    expect(text).toContain("comment-xyz"); // T-92: created id surface cho LLM
  });

  // T-48 #37: hasUI=undefined (agent runtime omit field hoặc detect heuristic miss)
  // → phải append details (LLM cần data). Strict `=== false` miss case này →
  // list_* chỉ trả count. Defensive: `!== true` (chỉ TUI thật mới skip append).
  it("hasUI=undefined (runtime omit field) → append details như non-TUI (#37 defensive)", async () => {
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List",
      description: "list",
      parameters: z.object({}),
      handler: async () => ({
        content: "Found 1 issue(s).",
        details: { count: 1, issues: [{ identifier: "PD-1", title: "X" }] },
      }),
    });
    const ctx = {
      // hasUI omitted — agent runtime có thể không set field
      cwd: "/proj",
      ui: { confirm: vi.fn() },
    } as never;
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);
    const text = result.content[0]?.text ?? "";
    // Append vẫn trigger (undefined !== true) → LLM thấy array data
    expect(text).toContain("PD-1");
    expect(text).toContain("Found 1 issue(s).");
    // details vẫn nguyên vẹn cho render layer (full non-TUI contract)
    expect(result.details).toMatchObject({ count: 1 });
  });

  it("hasUI=false + array lớn → cap tránh bloat context (top items + '... và N khác')", async () => {
    const big = Array.from({ length: 60 }, (_, i) => ({
      identifier: `PD-${i + 1}`,
      title: `Issue ${i + 1}`,
    }));
    const tool = defineHulyTool({
      name: "list_issues",
      label: "List",
      description: "list",
      parameters: z.object({}),
      handler: async () => ({
        content: "Found 60 issue(s).",
        details: { count: 60, issues: big },
      }),
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx(false));
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Found 60 issue(s).");
    expect(text).toContain("PD-1");
    expect(text).toContain("PD-30");
    expect(text).not.toContain("PD-31"); // capped
    expect(text).toMatch(/\.\.\.|and \d+ more|\d+ khác/i);
  });

  it("hasUI=false + error result → content error message KHÔNG append details rác", async () => {
    const tool = defineHulyTool({
      name: "create_issue",
      label: "Create",
      description: "create",
      parameters: z.object({}),
      handler: async () => ({
        content: "Issue not found.",
        isError: true,
        details: { identifier: "PD-999" },
      }),
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx(false));
    const text = result.content[0]?.text ?? "";
    expect(result.isError).toBe(true);
    expect(text).toContain("Issue not found.");
    // Error path KHÔNG append details (guard isError !== true) — regression test
    // phải verify thực tế, KHÔNG chỉ check contains content gốc
    expect(text).not.toContain("PD-999");
    expect(text).not.toContain("identifier:");
  });

  it("hasUI=false + details: null → content KHÔNG append (early return)", async () => {
    const tool = defineHulyTool({
      name: "noop",
      label: "N",
      description: "n",
      parameters: z.object({}),
      handler: async () => ({ content: "Done.", details: null }),
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx(false));
    expect(result.content[0]?.text).toBe("Done.");
  });

  it("hasUI=false + details: {} empty object → content KHÔNG append", async () => {
    const tool = defineHulyTool({
      name: "noop",
      label: "N",
      description: "n",
      parameters: z.object({}),
      handler: async () => ({ content: "Done.", details: {} }),
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx(false));
    expect(result.content[0]?.text).toBe("Done.");
  });

  it("hasUI=false + primitive array (tags/labels) → serialize String(item)", async () => {
    const tool = defineHulyTool({
      name: "list_tags",
      label: "T",
      description: "t",
      parameters: z.object({}),
      handler: async () => ({
        content: "Found 2 tag(s).",
        details: { count: 2, tags: ["bug", "urgent"] },
      }),
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx(false));
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Found 2 tag(s).");
    expect(text).toContain("bug");
    expect(text).toContain("urgent");
  });

  it("hasUI=false + multiple arrays → serialize cả 2 (seenArrays accumulation)", async () => {
    const tool = defineHulyTool({
      name: "search",
      label: "S",
      description: "s",
      parameters: z.object({}),
      handler: async () => ({
        content: "Search results.",
        details: {
          issues: [{ identifier: "PD-1", title: "A" }],
          documents: [{ identifier: "doc-1", title: "Doc" }],
        },
      }),
    });
    const result = await tool.execute("tc1", {}, undefined, undefined, makeCtx(false));
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("PD-1");
    expect(text).toContain("doc-1");
    expect(text).toContain("Search results.");
  });
});
