// Test T-51 #41 cho issues-templates domain — silent space fallback fix.
// Cover: create_template + create_issue_from_template. Tool sau có 2 findOne
// (template + project) → 2 error paths khác nhau cần test riêng.

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
import { tools } from "../issues-templates.js";

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
    createDoc: vi.fn().mockResolvedValue("tpl-id-1"),
    addCollection: vi.fn().mockResolvedValue("issue-id-1"),
    updateDoc: vi.fn().mockResolvedValue({ object: { sequence: 42 } }),
    removeDoc: vi.fn().mockResolvedValue(undefined),
    uploadMarkup: vi.fn().mockResolvedValue("desc-ref"),
    fetchMarkup: vi.fn().mockResolvedValue("# template desc"),
  };
}

function findTool(name: string) {
  return tools.find((t) => t.name === name)!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-51 #41: create_template project space resolve", () => {
  it("project null → isError + createDoc KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_template");
    const result = await tool.execute("tc1", { title: "Bug template" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/not found/i);
    expect(text).toMatch(/huly init/i);
    expect(client.createDoc).not.toHaveBeenCalled();
  });

  it("project exists → createDoc dùng project._id", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue({ _id: "proj-1", space: "tpl-space" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_template");
    const result = await tool.execute("tc1", { title: "Bug template" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    const call = client.createDoc.mock.calls[0];
    // T-97 (#143): space = project._id ("proj-1"), KHÔNG project.space.
    expect(call?.[1]).toBe("proj-1");
    expect(call?.[1]).not.toBe("ws1");
  });
});

describe("T-51 #41: create_issue_from_template (2 lookup paths)", () => {
  it("template not found → isError (regression — KHÔNG regress existing behavior)", async () => {
    const client = makeClient();
    // T-100: project-first → project OK, tpl undefined (template not found)
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "proj-1", identifier: "PD", space: "proj-1" })
      .mockResolvedValueOnce(undefined); // tpl not found
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_issue_from_template");
    const result = await tool.execute("tc1", { template: "tpl-123" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/template.*not found/i);
    expect(client.createDoc).not.toHaveBeenCalled();
  });

  it("template exists + project null → isError MỚI + createDoc KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce(undefined); // T-100: project-first, project null
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_issue_from_template");
    const result = await tool.execute("tc1", { template: "tpl-123" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/project.*not found/i);
    expect(text).toMatch(/huly init/i);
    expect(client.createDoc).not.toHaveBeenCalled();
  });

  it("happy path (cả 2 tồn tại) → addCollection (KHÔNG createDoc — T-103 #155 Issue=AttachedDoc) + identifier", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "proj-1", identifier: "PD", space: "happy-space" }) // project (T-100 project-first)
      .mockResolvedValueOnce({ _id: "tpl-123", title: "Bug", description: "{}", priority: "low" }); // template
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = findTool("huly_create_issue_from_template");
    const result = await tool.execute("tc1", { template: "tpl-123" }, undefined, undefined, ctx);

    expect(result.isError).toBeUndefined();
    // #155: Issue = AttachedDoc → phải addCollection, KHÔNG createDoc.
    expect(client.addCollection).toHaveBeenCalledTimes(1);
    expect(client.createDoc).not.toHaveBeenCalled();
    // space = project._id (T-97 #143).
    expect(client.addCollection.mock.calls[0]?.[1]).toBe("proj-1");
    // identifier computed từ sequence (PD-42).
    expect(result.details).toMatchObject({
      identifier: "PD-42",
      title: "Bug",
      template: "tpl-123",
    });
  });
});

// T-76: add/remove_template_child object shape + create_template defaults + create_from fields.
describe("T-76: add_template_child builds IssueTemplateChild object + replaces array", () => {
  it("add → updateDoc với children = [...existing, {id,title,...}] (KHÔNG $push raw string)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "proj-1", identifier: "PD", space: "proj-1" }) // project (T-100 getProjectSpace)
      .mockResolvedValueOnce({ _id: "tpl-1", space: "sp1", children: [] });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = tools.find((t) => t.name === "huly_add_template_child")!;
    const result = await tool.execute(
      "tc1",
      { template: "tpl-1", title: "Sub task", priority: "high", estimation: 120 },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const ops = client.updateDoc.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(ops.$push).toBeUndefined(); // KHÔNG $push
    expect(ops.children as Array<Record<string, unknown>>).toHaveLength(1);
    expect((ops.children as Array<Record<string, unknown>>)[0]).toMatchObject({
      title: "Sub task",
      priority: "high",
      estimation: 120,
    });
    const children = ops.children as Array<Record<string, unknown>>;
    expect(typeof children[0]?.id).toBe("string"); // generated id
  });

  it("add with assignee+component → child stores resolved _id refs (T-101 #147)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "proj-1", identifier: "PD", space: "proj-1" }) // project (T-100 getProjectSpace)
      .mockResolvedValueOnce({ _id: "tpl-1", space: "sp1", children: [] }) // template
      .mockResolvedValueOnce({ _id: "person-1", name: "Alice" }) // Person (assignee name)
      .mockResolvedValueOnce({ _id: "comp-1", label: "Backend" }); // Component
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = tools.find((t) => t.name === "huly_add_template_child")!;
    const result = await tool.execute(
      "tc1",
      { template: "tpl-1", title: "Sub", assignee: "Alice", component: "Backend" },
      undefined,
      undefined,
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const ops = client.updateDoc.mock.calls[0]?.[3] as Record<string, unknown>;
    const child = (ops.children as Array<Record<string, unknown>>)[0];
    expect(child.assignee).toBe("person-1"); // T-101: resolved Person._id (KHÔNG raw "Alice")
    expect(child.component).toBe("comp-1"); // T-101: resolved Component._id (KHÔNG raw "Backend")
  });

  it("template not found → isError", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce(undefined);
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = tools.find((t) => t.name === "huly_add_template_child")!;
    const result = await tool.execute(
      "tc1",
      { template: "x", title: "y" },
      undefined,
      undefined,
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });
});

describe("T-76: remove_template_child find by id + replace array", () => {
  it("remove → find by childId, filter out, replace children array", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "proj-1", identifier: "PD", space: "proj-1" }) // project (T-100 getProjectSpace)
      .mockResolvedValueOnce({
        _id: "tpl-1",
        space: "sp1",
        children: [
          { id: "c-1", title: "A" },
          { id: "c-2", title: "B" },
        ],
      });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = tools.find((t) => t.name === "huly_remove_template_child")!;
    const result = await tool.execute(
      "tc1",
      { template: "tpl-1", childId: "c-1" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const ops = client.updateDoc.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(ops.$pull).toBeUndefined();
    expect(ops.children as Array<Record<string, unknown>>).toHaveLength(1);
    expect((ops.children as Array<Record<string, unknown>>)[0].id).toBe("c-2");
  });

  it("childId not found → isError", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({ _id: "tpl-1", children: [{ id: "c-1" }] });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = tools.find((t) => t.name === "huly_remove_template_child")!;
    const result = await tool.execute(
      "tc1",
      { template: "tpl-1", childId: "missing" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });
});

describe("T-76: create_template default fields", () => {
  it("create → createDoc với priority/assignee/component/estimation/children/comments defaults", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValueOnce({ _id: "p-1", identifier: "PD", space: "sp1" });
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = tools.find((t) => t.name === "huly_create_template")!;
    await tool.execute("tc1", { title: "My Template" }, undefined, undefined, ctx);

    const attrs = client.createDoc.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(attrs.priority).toBe("no-priority");
    expect(attrs.assignee).toBeNull();
    expect(attrs.component).toBeNull();
    expect(attrs.estimation).toBe(0);
    expect(attrs.children).toEqual([]);
    expect(attrs.comments).toBe(0);
  });
});

describe("T-76: create_issue_from_template copies priority/assignee/component", () => {
  it("create_from → addCollection copies template fields (T-103 #155: Issue=AttachedDoc)", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "p-1", identifier: "PD", space: "sp1" }) // project (T-100 project-first)
      .mockResolvedValueOnce({
        _id: "tpl-1",
        title: "Tpl",
        description: "desc",
        priority: "high",
        assignee: "person-1",
        component: "comp-1",
      }); // template
    vi.mocked(getClient).mockResolvedValue(client as never);

    const tool = tools.find((t) => t.name === "huly_create_issue_from_template")!;
    await tool.execute("tc1", { template: "tpl-1" }, undefined, undefined, ctx);

    // #155: addCollection doc = call[5] (class, space, attachedTo, attachedToClass, collection, doc).
    const attrs = client.addCollection.mock.calls[0]?.[5] as Record<string, unknown>;
    expect(attrs.priority).toBe("high"); // copied from template
    expect(attrs.assignee).toBe("person-1");
    expect(attrs.component).toBe("comp-1");
  });
});

describe("T-89: list/get_templates sort + output fields (#124)", () => {
  it("list_templates → sort modifiedOn Desc + priority/modifiedOn/childrenCount", async () => {
    const client = makeClient();
    // getProjectSpace → findOne PROJECT_CLASS (space resolve).
    client.findOne = vi.fn().mockResolvedValueOnce({ _id: "p1", space: "sp1" });
    client.findAll = vi.fn().mockResolvedValue([
      { _id: "t2", title: "B", priority: "high", modifiedOn: 2000, children: [{ id: "c1" }] },
      { _id: "t1", title: "A", priority: "low", modifiedOn: 1000, children: [] },
    ]);
    vi.mocked(getClient).mockResolvedValue(client as never);
    const result = await findTool("huly_list_templates").execute(
      "tc1",
      { project: "PD" },
      undefined,
      undefined,
      ctx,
    );
    const findOpts = client.findAll.mock.calls[0]?.[2];
    expect(findOpts).toMatchObject({ sort: { modifiedOn: -1 } });
    const list =
      (result as { details?: { templates?: Array<Record<string, unknown>> } }).details?.templates ??
      [];
    expect(list[0]).toMatchObject({
      _id: "t2",
      priority: "high",
      modifiedOn: 2000,
      childrenCount: 1,
    });
    expect(list[1]).toMatchObject({ _id: "t1", childrenCount: 0 });
  });

  it("get_template → resolve description markdown + assignee name + component label + fields", async () => {
    const client = makeClient();
    client.findOne = vi
      .fn()
      .mockResolvedValueOnce({ _id: "proj-1", identifier: "PD", space: "proj-1" }) // project (T-100 getProjectSpace)
      .mockResolvedValueOnce({
        // template
        _id: "t1",
        title: "Bug template",
        description: { blob: "ref" },
        priority: "high",
        assignee: "person-1",
        component: "comp-1",
        estimation: 120,
        modifiedOn: 5000,
        createdOn: 1000,
        children: [{ id: "c1", title: "Sub" }],
      })
      .mockResolvedValueOnce({ _id: "person-1", name: "Alice" }) // Person resolve
      .mockResolvedValueOnce({ _id: "comp-1", label: "Backend" }); // Component resolve
    vi.mocked(getClient).mockResolvedValue(client as never);
    const result = await findTool("huly_get_template").execute(
      "tc1",
      { project: "PD", template: "t1" },
      undefined,
      undefined,
      ctx,
    );
    const details = (result as { details?: Record<string, unknown> }).details ?? {};
    expect(details).toMatchObject({
      title: "Bug template",
      description: "# template desc", // resolved markdown
      priority: "high",
      assignee: "Alice", // resolved name
      component: "Backend", // resolved label
      estimation: 120,
      modifiedOn: 5000,
      createdOn: 1000,
    });
    expect(Array.isArray(details.children)).toBe(true);
  });
});

describe("T-103 #160: create_template title guard (non-empty)", () => {
  it("empty title → isError, createDoc KHÔNG gọi", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValue(client as never);
    const r = await findTool("huly_create_template").execute(
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
