// Test T-51 #41 cho milestones domain — silent space fallback fix.
// Cover: create_milestone project-null → isError, project-exists → dùng space.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../client/pool.js", () => ({ getClient: vi.fn() }));
vi.mock("../../../config/resolver.js", () => ({
  resolveWorkspace: vi.fn().mockResolvedValue("ws1"),
  resolveProject: vi.fn().mockResolvedValue("PD"),
  NeedsInitError: class extends Error {},
  NeedsDisambiguationError: class extends Error {},
}));
vi.mock("../../../client/errors.js", () => ({
  HulyError: class extends Error {
    readonly class: string;
    constructor(c: string, m: string) {
      super(m);
      this.class = c;
    }
  },
  mapError: vi.fn((e: unknown) => ({ class: "Internal", message: String(e) })),
  sanitize: vi.fn((s: string) => s),
  LEAK_PATTERNS: [],
}));

import { getClient } from "../../../client/pool.js";
import { tools } from "../milestones.js";
import { MILESTONE_CLASS } from "../_class-refs.js";

const ctx = {
  hasUI: false,
  cwd: "/proj",
  ui: { confirm: vi.fn() },
} as never;

function makeClient() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "User", email: "u@x.com" }),
    findAll: vi.fn().mockResolvedValue([]),
    findOne: vi.fn(),
    createDoc: vi.fn().mockResolvedValue("mile-id-1"),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    removeDoc: vi.fn().mockResolvedValue(undefined),
  };
}

function findTool(name: string) {
  return tools.find((t) => t.name === name)!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-51 #41: create_milestone project space resolve (no silent fallback)", () => {
  it("project null → isError + createDoc KHÔNG gọi (no orphan document)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_milestone");
    const result = await tool.execute(
      "tc1",
      { label: "MVP", targetDate: 1700000000000 },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/not found/i);
    expect(text).toMatch(/huly init/i);
    expect(client.createDoc).not.toHaveBeenCalled();
  });

  it("project exists → createDoc dùng project._id (KHÔNG fallback workspace)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({ _id: "proj-1", space: "proj-space-xyz" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_milestone");
    const result = await tool.execute(
      "tc1",
      { label: "MVP", targetDate: 1700000000000 },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(client.createDoc).toHaveBeenCalledTimes(1);
    const call = client.createDoc.mock.calls[0];
    // T-97 (#143): arg 2 = space = project._id.
    expect(call?.[1]).toBe("proj-1");
    expect(call?.[1]).not.toBe("ws1");
  });
});

describe("T-67 #75: create_milestone status = MilestoneStatus.Planned (0)", () => {
  it("create_milestone pass status:0 (numeric enum, KHÔNG string)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({ _id: "proj-1", space: "sp1" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_milestone");
    await tool.execute(
      "tc1",
      { label: "M1", targetDate: 1700000000000 },
      undefined,
      undefined,
      ctx,
    );

    const call = client.createDoc.mock.calls[0];
    const attrs = call?.[2] as Record<string, unknown>;
    // T-67: status = 0 (MilestoneStatus.Planned numeric enum)
    expect(attrs.status).toBe(0);
    expect(attrs.status).not.toBe("planned");
  });
});

describe("T-52 #42: set_issue_milestone FK validate", () => {
  it("milestone KHÔNG tồn tại → isError + updateDoc KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1" })
      .mockResolvedValueOnce(undefined); // milestone not found
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_set_issue_milestone");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", milestone: "ms-missing" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/milestone.*not found/i);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });

  it("milestone tồn tại → updateDoc với _id resolved", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1" }) // issue
      .mockResolvedValueOnce({ _id: "ms-1", label: "MVP" }); // milestone
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_set_issue_milestone");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", milestone: "ms-1" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const call = client.updateDoc.mock.calls[0];
    const ops = call?.[3] as { milestone: string };
    expect(ops.milestone).toBe("ms-1");
  });
});

// T-72 #80: update_milestone status string → MilestoneStatus enum (numeric).
describe("T-72: update_milestone status enum conversion", () => {
  it("status 'completed' → ops.status = 2 (MilestoneStatus.Completed)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValue({ _id: "ms-1", space: "sp1", _class: MILESTONE_CLASS });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = tools.find((t) => t.name === "huly_update_milestone")!;
    const result = await tool.execute(
      "tc1",
      { milestone: "ms-1", status: "completed" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const ops = client.updateDoc.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(ops.status).toBe(2);
  });

  it("status 'in-progress' → ops.status = 1", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValue({ _id: "ms-1", space: "sp1", _class: MILESTONE_CLASS });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = tools.find((t) => t.name === "huly_update_milestone")!;
    await tool.execute(
      "tc1",
      { milestone: "ms-1", status: "in-progress" },
      undefined,
      undefined,
      ctx,
    );

    const ops = client.updateDoc.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(ops.status).toBe(1);
  });

  it("status invalid → isError + KHÔNG updateDoc", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValue({ _id: "ms-1", space: "sp1", _class: MILESTONE_CLASS });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = tools.find((t) => t.name === "huly_update_milestone")!;
    const result = await tool.execute(
      "tc1",
      { milestone: "ms-1", status: "bogus" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });
});

describe("T-103 #160: create_milestone label guard (non-empty)", () => {
  it("empty label → isError, createDoc KHÔNG gọi", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);
    const r = await findTool("huly_create_milestone").execute(
      "t1",
      { label: "", targetDate: Date.now() + 86400000 },
      undefined,
      undefined,
      ctx,
    );
    expect(r.isError).toBe(true);
    expect(client.createDoc).not.toHaveBeenCalled();
  });
});
