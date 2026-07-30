// T-103 #158: log_time value guard (KHÔNG non-positive time entry).

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../client/pool.js", () => ({ getClient: vi.fn() }));
vi.mock("../../../config/resolver.js", () => ({
  resolveWorkspace: vi.fn().mockResolvedValue("ws1"),
  resolveProject: vi.fn().mockResolvedValue("ETEST"),
}));
vi.mock("../../../client/errors.js", () => ({
  HulyError: class extends Error {},
  mapError: vi.fn((e: unknown) => ({ class: "Internal", message: String(e) })),
  sanitize: vi.fn((s: string) => s),
}));
vi.mock("../../../markup/markup.js", () => ({ mdToMarkup: vi.fn((s: string) => `m(${s})`) }));

import { getClient } from "../../../client/pool.js";
import { tools } from "../time.js";

const ctx = { hasUI: false, cwd: "/proj", ui: { confirm: vi.fn() } } as never;

function makeClient() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
    findAll: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue({ _id: "issue-1", space: "sp1" }),
    addCollection: vi.fn().mockResolvedValue("report-1"),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("T-103 #158: log_time value guard (non-positive rejected)", () => {
  it("value 0 → isError, addCollection KHÔNG gọi", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);
    const tool = tools.find((t) => t.name === "huly_log_time")!;
    const r = await tool.execute("t1", { identifier: "PD-1", value: 0 }, undefined, undefined, ctx);
    expect(r.isError).toBe(true);
    expect(String(r.content[0]?.text ?? "")).toMatch(/> 0/);
    expect(client.addCollection).not.toHaveBeenCalled();
  });

  it("value NEGATIVE → isError (KHÔNG corruption)", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);
    const tool = tools.find((t) => t.name === "huly_log_time")!;
    const r = await tool.execute(
      "t1",
      { identifier: "PD-1", value: -5 },
      undefined,
      undefined,
      ctx,
    );
    expect(r.isError).toBe(true);
    expect(client.addCollection).not.toHaveBeenCalled();
  });
});
