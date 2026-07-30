// Test T-52 #42 cho tags domain — attach_tag FK validate + shape fix.
// Cover: tag not found → isError; tag exists → $push TagReference object shape
// (KHÔNG raw string); idempotent dùng ref resolved (KHÔNG raw string).

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
import { tools } from "../tags.js";
import { TAG_REFERENCE_CLASS, ISSUE_CLASS } from "../_class-refs.js";

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
    createDoc: vi.fn().mockResolvedValue("tag-id-1"),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    removeDoc: vi.fn().mockResolvedValue(undefined),
    addCollection: vi.fn().mockResolvedValue("tagref-id-1"), // T-69
  };
}

function findTool(name: string) {
  return tools.find((t) => t.name === name)!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// T-69: attach_tag/detach_tag/list_attached_tags dùng TagReference AttachedDoc
// (addCollection/findAll/removeDoc) — KHÔNG $push/$pull inline array. Collection
// field = "labels" (KHÔNG "tags"). reality-checker CONFIRMED vs trusted.
describe('T-69: attach_tag dùng addCollection TagReference (collection="labels")', () => {
  it("tag KHÔNG tồn tại → isError + addCollection KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1" })
      .mockResolvedValueOnce(undefined); // tag not found
    client.findAll = vi.fn().mockResolvedValue([]); // idempotent check empty
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_attach_tag");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", tag: "tag-missing" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(client.addCollection).not.toHaveBeenCalled();
  });

  it('tag tồn tại → addCollection TAG_REFERENCE_CLASS collection="labels" + attrs {tag,title,color:Number}', async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1" })
      .mockResolvedValueOnce({ _id: "tag-1", title: "bug", color: 5 }); // tag (color number)
    client.findAll = vi.fn().mockResolvedValue([]); // chưa attached
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_attach_tag");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", tag: "tag-1" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(client.addCollection).toHaveBeenCalledTimes(1);
    const call = client.addCollection.mock.calls[0];
    expect(call?.[0]).toBe(TAG_REFERENCE_CLASS);
    expect(call?.[1]).toBe("sp1"); // space = issue.space
    expect(call?.[2]).toBe("i1"); // attachedTo
    expect(call?.[3]).toBe(ISSUE_CLASS); // attachedToClass
    expect(call?.[4]).toBe("labels"); // collection (KHÔNG "tags")
    const attrs = call?.[5] as Record<string, unknown>;
    expect(attrs.tag).toBe("tag-1");
    expect(attrs.title).toBe("bug");
    expect(attrs.color).toBe(5); // number (coerce)
  });

  it("tag đã có (idempotent findAll match) → no-op, addCollection KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1" })
      .mockResolvedValueOnce({ _id: "tag-1", title: "bug", color: 5 });
    // findAll returns existing TagReference with tag=tag-1 → idempotent
    client.findAll = vi.fn().mockResolvedValue([{ _id: "tr-1", tag: "tag-1", space: "sp1" }]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_attach_tag");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", tag: "tag-1" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/already|no-op|idempotent/i);
    expect(client.addCollection).not.toHaveBeenCalled();
  });
});

describe("T-69: detach_tag dùng findAll + removeDoc TagReference", () => {
  it('tag trên issue → findAll TagReference collection="labels" + removeDoc matching', async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1" })
      .mockResolvedValueOnce({ _id: "tag-1", title: "bug", color: 5 });
    client.findAll = vi.fn().mockResolvedValue([{ _id: "tr-1", tag: "tag-1", space: "sp1" }]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_detach_tag");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", tag: "tag-1" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const findCall = client.findAll.mock.calls[0];
    expect(findCall?.[0]).toBe(TAG_REFERENCE_CLASS);
    const query = findCall?.[1] as Record<string, unknown>;
    expect(query.attachedTo).toBe("i1");
    expect(query.collection).toBe("labels");
    expect(client.removeDoc).toHaveBeenCalledWith(TAG_REFERENCE_CLASS, "sp1", "tr-1");
  });

  it("tag KHÔNG có trên issue → idempotent no-op, removeDoc KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "i1", space: "sp1", identifier: "PD-1" })
      .mockResolvedValueOnce({ _id: "tag-1", title: "bug", color: 5 });
    client.findAll = vi.fn().mockResolvedValue([]); // không có TagReference
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_detach_tag");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", tag: "tag-1" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/no-op|idempotent|not on/i);
    expect(client.removeDoc).not.toHaveBeenCalled();
  });
});

describe("T-69: list_attached_tags dùng findAll TagReference (KHÔNG issue.tags inline)", () => {
  it('list_attached_tags → findAll TAG_REFERENCE_CLASS + collection="labels"', async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({ _id: "i1", space: "sp1", identifier: "PD-1" });
    client.findAll = vi
      .fn()
      .mockResolvedValue([{ _id: "tr-1", tag: "tag-1", title: "bug", color: 5 }]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_attached_tags");
    const result = await tool.execute("tc1", { identifier: "PD-1" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    const call = client.findAll.mock.calls[0];
    expect(call?.[0]).toBe(TAG_REFERENCE_CLASS);
    const query = call?.[1] as Record<string, unknown>;
    expect(query.attachedTo).toBe("i1");
    expect(query.attachedToClass).toBe(ISSUE_CLASS);
    expect(query.collection).toBe("labels");
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("1 tag");
  });

  it("issue not found → isError", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_attached_tags");
    const result = await tool.execute("tc1", { identifier: "x" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    expect(client.findAll).not.toHaveBeenCalled();
  });
});

// T-63 #68: schema drift guard — safeUpdateDoc/safeRemoveDoc migration regression.
// Helper test (_common.test.ts) cover guard logic; test này verify migration thật
// qua tool entry: findOne trả doc missing space/_id → isError + write KHÔNG gọi.
describe("T-63 #68: schema drift guard via safeUpdateDoc/safeRemoveDoc", () => {
  it("update_tag: tag doc missing space → isError, updateDoc KHÔNG gọi", async () => {
    const client = makeClient();
    // tag tồn tại NHƯNG space field missing (schema drift — data corruption).
    client.findOne = vi.fn().mockResolvedValueOnce({ _id: "tag-1", title: "bug", color: "#f00" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_tag");
    const result = await tool.execute(
      "tc1",
      { tag: "tag-1", title: "updated" } as never,
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/space/i);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });

  it("delete_tag: tag doc missing _id → isError, removeDoc KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({ space: "sp1", title: "bug" }); // _id missing
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_delete_tag");
    const result = await tool.execute("tc1", { tag: "tag-1" } as never, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    expect(client.removeDoc).not.toHaveBeenCalled();
  });
});

describe("T-103 #160: create_tag title guard (non-empty)", () => {
  it("empty title → isError, createDoc KHÔNG gọi", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);
    const r = await findTool("huly_create_tag").execute(
      "t1",
      { title: "" },
      undefined,
      undefined,
      ctx,
    );
    expect(r.isError).toBe(true);
    expect(client.createDoc).not.toHaveBeenCalled();
  });
});
