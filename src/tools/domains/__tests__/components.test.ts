// Test T-51 #41 cho components domain — silent space fallback fix.
// Cover: create_component project-null → isError (KHÔNG fallback workspace),
// create_component project-exists → createDoc dùng project.space.

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
import { tools } from "../components.js";

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
    createDoc: vi.fn().mockResolvedValue("comp-id-1"),
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

describe("T-51 #41: create_component project space resolve (no silent fallback)", () => {
  it("project null → isError + createDoc KHÔNG gọi (no orphan document)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue(undefined); // project not found
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_component");
    const result = await tool.execute(
      "tc1",
      { label: "Backend", description: "Backend components" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/not found/i);
    expect(text).toMatch(/huly init/i);
    // createDoc KHÔNG gọi (no orphan document)
    expect(client.createDoc).not.toHaveBeenCalled();
  });

  it("project exists → createDoc dùng project._id (KHÔNG fallback workspace)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({ _id: "proj-1", space: "proj-space-abc" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_component");
    const result = await tool.execute(
      "tc1",
      { label: "Backend", description: "Backend components" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(client.createDoc).toHaveBeenCalledTimes(1);
    const call = client.createDoc.mock.calls[0];
    // T-97 (#143): arg 2 = space = project._id ("proj-1"), KHÔNG project.space
    // (T-67 assumption sai) và KHÔNG workspace ("ws1").
    expect(call?.[1]).toBe("proj-1");
    expect(call?.[1]).not.toBe("ws1");
  });
});

describe("T-52 #42: set_issue_component FK validate", () => {
  it("component KHÔNG tồn tại → isError + updateDoc KHÔNG gọi", async () => {
    const client = makeClient();
    // findOne: issue (found), component (not found)
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1" })
      .mockResolvedValueOnce(undefined); // component not found
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_set_issue_component");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", component: "comp-missing" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/component.*not found/i);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });

  it("component tồn tại → updateDoc với _id resolved (KHÔNG raw idRef)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1" }) // issue
      .mockResolvedValueOnce({ _id: "comp-1", label: "Backend" }); // component
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_set_issue_component");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", component: "comp-1" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const call = client.updateDoc.mock.calls[0];
    const ops = call?.[3] as { component: string };
    // component = resolved _id từ findOne (KHÔNG raw idRef(params.component))
    expect(ops.component).toBe("comp-1");
  });
});

describe("T-103 #160: create_component label guard (non-empty)", () => {
  it("empty label → isError, createDoc KHÔNG gọi", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);
    const r = await findTool("huly_create_component").execute(
      "t1",
      { label: "" },
      undefined,
      undefined,
      ctx,
    );
    expect(r.isError).toBe(true);
    expect(client.createDoc).not.toHaveBeenCalled();
  });
});
