// T-46 create_todo (#28) + T-79 todos data model fix (#102).
// T-79 supersedes T-46 audit §5 assumptions: issue-attached todo = ProjectToDo
// (KHÔNG base ToDo); doneOn:Timestamp|null (KHÔNG `done` bool); description =
// MarkupBlobRef qua uploadMarkup (KHÔNG JSON.stringify); attachedTo/Class =
// positional addCollection args (KHÔNG trong data); issue.todos = counter
// (KHÔNG array) → list_todos dùng findAll.

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
  markupToMd: vi.fn((s: unknown) => `md(${JSON.stringify(s).slice(0, 20)})`),
}));

import { getClient } from "../../../client/pool.js";
import { tools } from "../todos.js";

const ctx = {
  hasUI: false,
  cwd: "/proj",
  ui: { confirm: vi.fn() },
} as never;

// Destructive tools (delete_todo) cần hasUI:true + confirm=true.
const ctxConfirmed = {
  hasUI: true,
  cwd: "/proj",
  ui: { confirm: vi.fn().mockResolvedValue(true) },
} as never;

function makeClient() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: "emp-1", name: "User", email: "u@x.com" }),
    findAll: vi.fn().mockResolvedValue([]),
    findOne: vi.fn(),
    createDoc: vi.fn().mockResolvedValue("new-id"),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    removeDoc: vi.fn().mockResolvedValue(undefined),
    addCollection: vi.fn().mockResolvedValue("new-todo-id"),
    uploadMarkup: vi.fn().mockResolvedValue({ type: "blob", blobId: "b1" }),
    updateMarkup: vi.fn().mockResolvedValue(undefined),
    createMixin: vi.fn(),
    fetchMarkup: vi.fn(),
    getAccount: vi.fn(),
  };
}

function findTool(name: string) {
  return tools.find((t) => t.name === name)!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-79: create_todo ProjectToDo data model (#102)", () => {
  it("addCollection dùng class time:class:ProjectToDo (KHÔNG base ToDo)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "issue-1",
      space: "sp1",
      identifier: "PD-1",
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_todo");
    await tool.execute(
      "tc1",
      { identifier: "PD-1", title: "Write tests" },
      undefined,
      undefined,
      ctx,
    );

    const call = client.addCollection.mock.calls[0];
    expect(call?.[0]).toBe("time:class:ProjectToDo");
  });

  it("addCollection space = time:space:ToDos (KHÔNG issue.space)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "issue-1",
      space: "sp1",
      identifier: "PD-1",
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_todo");
    await tool.execute(
      "tc1",
      { identifier: "PD-1", title: "Write tests" },
      undefined,
      undefined,
      ctx,
    );

    const call = client.addCollection.mock.calls[0];
    expect(call?.[1]).toBe("time:space:ToDos");
  });

  it("addCollection positional: attachedTo=issue._id, attachedToClass=Issue, collection='todos'", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "issue-1",
      space: "sp1",
      identifier: "PD-1",
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_todo");
    await tool.execute(
      "tc1",
      { identifier: "PD-1", title: "Write tests" },
      undefined,
      undefined,
      ctx,
    );

    const call = client.addCollection.mock.calls[0];
    expect(call?.[2]).toBe("issue-1"); // attachedTo
    expect(call?.[3]).toBe("tracker:class:Issue"); // attachedToClass
    expect(call?.[4]).toBe("todos"); // collection
  });

  it("data có doneOn:null + đầy đủ required fields, KHÔNG attachedTo/attachedToClass", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "issue-1",
      space: "sp1",
      identifier: "PD-1",
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_todo");
    await tool.execute(
      "tc1",
      { identifier: "PD-1", title: "Write tests", description: "desc" },
      undefined,
      undefined,
      ctx,
    );

    const attrs = client.addCollection.mock.calls[0]?.[5];
    expect(attrs).toMatchObject({
      title: "Write tests",
      attachedSpace: "sp1",
      user: "emp-1",
      priority: expect.any(Number),
      visibility: "Public",
      rank: expect.any(String),
      workslots: 0,
      doneOn: null,
    });
    // attachedTo/attachedToClass KHÔNG trong data (positional args)
    expect(attrs).not.toHaveProperty("attachedTo");
    expect(attrs).not.toHaveProperty("attachedToClass");
  });

  it("description = MarkupBlobRef qua uploadMarkup (KHÔNG JSON.stringify mdToMarkup)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "issue-1",
      space: "sp1",
      identifier: "PD-1",
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_todo");
    await tool.execute(
      "tc1",
      { identifier: "PD-1", title: "Write tests", description: "desc" },
      undefined,
      undefined,
      ctx,
    );

    // uploadMarkup gọi trước addCollection với ProjectToDo class + "description" field
    expect(client.uploadMarkup).toHaveBeenCalledWith(
      "time:class:ProjectToDo",
      expect.any(String),
      "description",
      "desc",
      "markdown",
    );
    // description = ref trả về (KHÔNG JSON.stringify(mdToMarkup(...)))
    const attrs = client.addCollection.mock.calls[0]?.[5];
    expect(attrs).toMatchObject({ description: { type: "blob", blobId: "b1" } });
  });

  it("priority param → ToDoPriority number enum (urgent=4)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "issue-1",
      space: "sp1",
      identifier: "PD-1",
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_todo");
    await tool.execute(
      "tc1",
      { identifier: "PD-1", title: "Urgent todo", priority: "urgent" },
      undefined,
      undefined,
      ctx,
    );

    const attrs = client.addCollection.mock.calls[0]?.[5];
    expect(attrs).toMatchObject({ priority: 4 });
  });

  it("issue không tồn tại → isError, addCollection KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_todo");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-999", title: "test" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(client.addCollection).not.toHaveBeenCalled();
  });

  it("addCollection fail → wrap context rõ ràng (mention ProjectToDo)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "issue-1",
      space: "sp1",
      identifier: "PD-1",
    });
    client.addCollection = vi.fn().mockRejectedValue(new Error("platform:status:UnknownError"));
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_todo");
    const result = await tool.execute(
      "tc1",
      { identifier: "PD-1", title: "test" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/todo|create_todo/i);
    expect(text).toContain("PD-1");
    expect(text).toContain("time:class:ProjectToDo");
  });
});

describe("T-79: list_todos findAll query (#102)", () => {
  it("list_todos dùng findAll(ToDo, {attachedTo:issue._id}) — KHÔNG đọc issue.todos array", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "issue-1",
      space: "sp1",
      identifier: "PD-1",
      todos: 5, // CollectionSize counter (number), KHÔNG array
    });
    client.findAll = vi.fn().mockResolvedValue([
      { _id: "t1", title: "Task A", doneOn: 1700000000000 },
      { _id: "t2", title: "Task B", doneOn: null },
    ]);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_list_todos");
    const result = await tool.execute("tc1", { identifier: "PD-1" }, undefined, undefined, ctx);

    expect(client.findAll).toHaveBeenCalledWith("time:class:ToDo", { attachedTo: "issue-1" });
    const details = result.details as { count: number; todos: unknown[] };
    expect(details.count).toBe(2);
    expect(details.todos).toEqual([
      { _id: "t1", title: "Task A", done: true },
      { _id: "t2", title: "Task B", done: false },
    ]);
  });
});

describe("T-79: get_todo doneOn field (#102)", () => {
  it("get_todo trả doneOn + derive done (KHÔNG field `done` from server)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "t1",
      title: "Task A",
      doneOn: 1700000000000,
      user: "emp-1",
      dueDate: 1800000000000,
      priority: 0,
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_get_todo");
    const result = await tool.execute("tc1", { todo: "t1" }, undefined, undefined, ctx);

    expect(result.details).toMatchObject({
      _id: "t1",
      doneOn: 1700000000000,
      done: true,
      owner: "emp-1",
      dueDate: 1800000000000,
      priority: "no-priority", // T-103 #164: numeric 0 → label
    });
  });

  it("get_todo open (doneOn null) → done:false", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "t2",
      title: "Open task",
      doneOn: null,
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_get_todo");
    const result = await tool.execute("tc1", { todo: "t2" }, undefined, undefined, ctx);

    expect(result.details).toMatchObject({ doneOn: null, done: false });
  });
});

describe("T-79: complete/reopen doneOn (#102)", () => {
  it("complete_todo sets doneOn: timestamp (KHÔNG done:true)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "t1",
      space: "sp1",
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const before = Date.now();
    const tool = findTool("huly_complete_todo");
    await tool.execute("tc1", { todo: "t1" }, undefined, undefined, ctx);
    const after = Date.now();

    const call = client.updateDoc.mock.calls[0]!;
    expect(call[0]).toBe("time:class:ToDo");
    expect(call[3]).toMatchObject({ doneOn: expect.any(Number) });
    const ts = (call[3] as { doneOn: number }).doneOn;
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("reopen_todo sets doneOn: null (KHÔNG done:false)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "t1",
      space: "sp1",
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_reopen_todo");
    await tool.execute("tc1", { todo: "t1" }, undefined, undefined, ctx);

    const call = client.updateDoc.mock.calls[0];
    expect(call?.[3]).toEqual({ doneOn: null });
  });
});

describe("T-79: delete_todo ProjectToDo class + counter dec (#102)", () => {
  it("delete issue-todo: removeDoc(ProjectToDo) + dec issue.todos counter", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "t1",
      space: "time-space",
      attachedTo: "issue-1",
      attachedToClass: "tracker:class:Issue",
      attachedSpace: "sp1",
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_delete_todo");
    await tool.execute("tc1", { todo: "t1" }, undefined, undefined, ctxConfirmed);

    // removeDoc dùng ProjectToDo class
    expect(client.removeDoc).toHaveBeenCalledWith("time:class:ProjectToDo", "time-space", "t1");
    // dec issue counter: updateDoc(Issue, attachedSpace, attachedTo, $inc todos:-1)
    expect(client.updateDoc).toHaveBeenCalledWith("tracker:class:Issue", "sp1", "issue-1", {
      $inc: { todos: -1 },
    });
  });

  it("delete personal todo (non-issue): removeDoc base ToDo class, KHÔNG dec counter", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({
      _id: "t9",
      space: "time-space",
      attachedTo: "",
      attachedToClass: "time:class:ToDo",
    });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_delete_todo");
    await tool.execute("tc1", { todo: "t9" }, undefined, undefined, ctxConfirmed);

    expect(client.removeDoc).toHaveBeenCalledWith("time:class:ToDo", "time-space", "t9");
    expect(client.updateDoc).not.toHaveBeenCalled();
  });
});

describe("T-103 #162: update_todo description uploadMarkup + ops.description", () => {
  it("description → uploadMarkup ref + ops.description (mirror update_issue)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({ _id: "t1", space: "sp1" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_todo");
    const result = await tool.execute(
      "tc1",
      { todo: "t1", description: "new desc text" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    // #162: uploadMarkup (createContent rpc) creates new blob + swap ref via updateDoc.
    // updateMarkup (updateContent) chỉ EDIT existing blob — fail khi todo chưa có desc.
    expect(client.uploadMarkup).toHaveBeenCalledWith(
      "time:class:ToDo",
      "t1",
      "description",
      "new desc text",
      "markdown",
    );
    expect(client.updateMarkup).not.toHaveBeenCalled();
    // description vào ops → updateDoc gọi (KHÔNG in-place markup-only).
    const ops = client.updateDoc.mock.calls[0]?.[3] as { description?: unknown } | undefined;
    expect(ops?.description).toEqual({
      type: "blob",
      blobId: "b1",
    });
    expect((result.details as { fields: string[] }).fields).toContain("description");
  });

  it("title + priority + visibility → updateDoc ops (non-markup fields)", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({ _id: "t1", space: "sp1" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_todo");
    await tool.execute(
      "tc1",
      { todo: "t1", title: "Renamed", priority: "high", visibility: "private" },
      undefined,
      undefined,
      ctx,
    );

    const call = client.updateDoc.mock.calls[0];
    expect(call?.[3]).toMatchObject({
      title: "Renamed",
      priority: 3, // TODO_PRIORITY_MAP["high"] (#164: high=3, KHÔNG 0)
      visibility: "Private",
    });
  });

  it("dueDate=null → $unset clear", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({ _id: "t1", space: "sp1" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_update_todo");
    await tool.execute("tc1", { todo: "t1", dueDate: null }, undefined, undefined, ctx);

    const call = client.updateDoc.mock.calls[0];
    expect(call?.[3]).toEqual({ $unset: { dueDate: "" } });
  });
});

describe("T-103 #160: create_todo title guard (non-empty)", () => {
  it("empty title → isError, addCollection KHÔNG gọi", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);
    const r = await findTool("huly_create_todo").execute(
      "t1",
      { title: "", identifier: "PD-1" },
      undefined,
      undefined,
      ctx,
    );
    expect(r.isError).toBe(true);
    expect(client.addCollection).not.toHaveBeenCalled();
  });
});
