// T-79G: update_todo completeness enhancement (#106).
// - Add fields: owner (→user Ref<Employee>), priority (ToDoPriority), visibility.
// - description via uploadMarkup/updateMarkup (KHÔNG raw string).
// - dueDate=null → $unset clear.

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
vi.mock("../../../markup/markup.js", () => ({
  mdToMarkup: vi.fn((s: string) => `markup(${s})`),
  markupToMd: vi.fn(),
}));

import { getClient } from "../../../client/pool.js";
import { tools } from "../todos.js";

const ctx = { hasUI: false, cwd: "/proj", ui: { confirm: vi.fn() } } as never;

function makeClient() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "U", email: "u@x.com" }),
    findAll: vi.fn().mockResolvedValue([]),
    findOne: vi.fn(),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    removeDoc: vi.fn().mockResolvedValue(undefined),
    uploadMarkup: vi.fn().mockResolvedValue({ blob: "ref-new" }),
    updateMarkup: vi.fn().mockResolvedValue(undefined),
  };
}

function findTool(name: string) {
  return tools.find((t) => t.name === name)!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-79G: update_todo owner/priority/visibility (#106)", () => {
  it("owner email/name → resolve Person._id → ops.user", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "t1", space: "sp1" }) // todo
      .mockResolvedValueOnce({ _id: "person-3", name: "Doe, Jane" }); // findPersonByEmailOrName
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_todo");
    await tool.execute("tc1", { todo: "t1", owner: "Doe, Jane" }, undefined, undefined, ctx);

    const ops = client.updateDoc.mock.calls[0]?.[3];
    expect(ops).toMatchObject({ user: "person-3" });
  });

  it("priority string → ToDoPriority number (urgent=4)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({ _id: "t1", space: "sp1" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_todo");
    await tool.execute("tc1", { todo: "t1", priority: "urgent" }, undefined, undefined, ctx);

    expect(client.updateDoc.mock.calls[0]?.[3]).toMatchObject({ priority: 4 });
  });

  it("visibility string → Huly Visibility (capitalized)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({ _id: "t1", space: "sp1" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_todo");
    await tool.execute("tc1", { todo: "t1", visibility: "freeBusy" }, undefined, undefined, ctx);

    expect(client.updateDoc.mock.calls[0]?.[3]).toMatchObject({ visibility: "FreeBusy" });
  });
});

describe("T-79G: update_todo description markup (#106)", () => {
  it("description → updateMarkup (T-103 #156: updateContent rpc, KHÔNG uploadMarkup)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({
      _id: "t1",
      space: "sp1",
      description: "existing-ref",
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_todo");
    const result = await tool.execute(
      "tc1",
      { todo: "t1", description: "new text" },
      undefined,
      undefined,
      ctx,
    );

    // #156: updateMarkup (updateContent rpc), KHÔNG uploadMarkup/createMarkup.
    expect(client.updateMarkup).toHaveBeenCalledWith(
      "time:class:ToDo",
      "t1",
      "description",
      "new text",
      "markdown",
    );
    expect(client.uploadMarkup).not.toHaveBeenCalled();
    // description-only → KHÔNG updateDoc (markup updated in-place).
    expect(client.updateDoc).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({ updated: true });
    expect((result.details as { fields: string[] }).fields).toContain("description");
  });

  it("description (no existing ref) → updateMarkup creates version in-place", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({ _id: "t1", space: "sp1" }); // no description
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_todo");
    await tool.execute("tc1", { todo: "t1", description: "first text" }, undefined, undefined, ctx);

    expect(client.updateMarkup).toHaveBeenCalledWith(
      "time:class:ToDo",
      "t1",
      "description",
      "first text",
      "markdown",
    );
    expect(client.uploadMarkup).not.toHaveBeenCalled();
  });
});

describe("T-79G: update_todo dueDate null clear (#106)", () => {
  it("dueDate=null → $unset clear", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({ _id: "t1", space: "sp1" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_todo");
    await tool.execute("tc1", { todo: "t1", dueDate: null }, undefined, undefined, ctx);

    expect(client.updateDoc.mock.calls[0]?.[3]).toEqual({ $unset: { dueDate: "" } });
  });

  it("dueDate=number → ops.dueDate set", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({ _id: "t1", space: "sp1" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_todo");
    await tool.execute("tc1", { todo: "t1", dueDate: 1800000000000 }, undefined, undefined, ctx);

    expect(client.updateDoc.mock.calls[0]?.[3]).toEqual({ dueDate: 1800000000000 });
  });
});
