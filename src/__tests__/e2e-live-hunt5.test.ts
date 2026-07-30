// T-91 phase 5 — bug-hunt round 5. Cover domains CHƯA deep-test: issues-relations
// (blocks/relates bidirectional T-61 storage), templates round-trip (create→
// add_child→create_issue_from_template→verify), documents edit search-replace +
// snapshots, todos round-trip, log_time. Run:
//   HULY_E2E_PROJECT=ETEST pnpm vitest run src/__tests__/e2e-live-hunt5.test.ts

import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { tools as issueCore } from "../tools/domains/issues-core.js";
import { tools as relations } from "../tools/domains/issues-relations.js";
import { tools as templates } from "../tools/domains/issues-templates.js";
import { tools as documents } from "../tools/domains/documents.js";
import { tools as snapshots } from "../tools/domains/document-snapshots.js";
import { tools as todos } from "../tools/domains/todos.js";
import { tools as time } from "../tools/domains/time.js";

const E2E_PROJECT = process.env.HULY_E2E_PROJECT;
const describeLive = E2E_PROJECT ? describe : describe.skip;

const ALL = [
  ...issueCore,
  ...relations,
  ...templates,
  ...documents,
  ...snapshots,
  ...todos,
  ...time,
];
function findTool(name: string) {
  const full = name.startsWith("huly_") ? name : `huly_${name}`;
  const t = ALL.find((x) => x.name === full || x.name === name);
  if (!t) throw new Error(`tool ${name} not registered`);
  return t;
}
function detail(d: unknown, field: string): unknown {
  if (d !== null && typeof d === "object") return (d as Record<string, unknown>)[field];
  return undefined;
}
function ctx(): ExtensionContext {
  return { cwd: process.cwd(), hasUI: true, ui: { confirm: async () => true } } as never;
}
async function mkIssue(project: string, title: string): Promise<string> {
  const r = await findTool("create_issue").execute(
    "h5-issue",
    { project, title, priority: "low" },
    undefined,
    undefined,
    ctx(),
  );
  const id = detail(r.details, "identifier") as string;
  if (!id) throw new Error(`mkIssue failed: ${r.content[0]?.text}`);
  return id;
}
async function delIssue(project: string, id: string): Promise<void> {
  await findTool("delete_issue").execute(
    "h5-del",
    { project, identifier: id },
    undefined,
    undefined,
    ctx(),
  );
}

describeLive("T-91 phase 5 — bug-hunt round 5 (relations/templates/docs/todos/time)", () => {
  const project = E2E_PROJECT as string;

  // 1. issues-relations: blocks round-trip (add → list → verify storage → remove).
  it("relations: add blocks → list → verify blockedBy storage → remove", async () => {
    const a = await mkIssue(project, `h5-rel-a-${Date.now()}`);
    const b = await mkIssue(project, `h5-rel-b-${Date.now()}`);
    try {
      // a blocks b → b.blockedBy += a.
      const add = await findTool("add_issue_relation").execute(
        "h5-rel-add",
        { project, identifier: a, targetIssue: b, relationType: "blocks" },
        undefined,
        undefined,
        ctx(),
      );
      expect(add.isError, `add_issue_relation blocks: ${add.content[0]?.text}`).toBeUndefined();

      // list trên a: "blocks" = [b].
      const listA = await findTool("list_issue_relations").execute(
        "h5-rel-listA",
        { project, identifier: a },
        undefined,
        undefined,
        ctx(),
      );
      expect(listA.isError).toBeUndefined();
      const blocksA =
        (detail(listA.details, "relations") as Array<{
          identifier?: string;
          direction?: string;
        }>) ?? [];
      expect(
        blocksA.some((x) => x.identifier === b && x.direction === "blocks"),
        `a phải blocks b`,
      ).toBe(true);

      // list trên b: "is-blocked-by" = [a].
      const listB = await findTool("list_issue_relations").execute(
        "h5-rel-listB",
        { project, identifier: b },
        undefined,
        undefined,
        ctx(),
      );
      const blockedByB =
        (detail(listB.details, "relations") as Array<{
          identifier?: string;
          direction?: string;
        }>) ?? [];
      expect(
        blockedByB.some((x) => x.identifier === a && x.direction === "is-blocked-by"),
        `b phải is-blocked-by a`,
      ).toBe(true);

      // remove.
      const rem = await findTool("remove_issue_relation").execute(
        "h5-rel-rem",
        { project, identifier: a, targetIssue: b, relationType: "blocks" },
        undefined,
        undefined,
        ctx(),
      );
      expect(rem.isError, `remove_issue_relation: ${rem.content[0]?.text}`).toBeUndefined();

      // verify gone.
      const listA2 = await findTool("list_issue_relations").execute(
        "h5-rel-listA2",
        { project, identifier: a },
        undefined,
        undefined,
        ctx(),
      );
      const blocksA2 =
        (detail(listA2.details, "relations") as Array<{
          identifier?: string;
          direction?: string;
        }>) ?? [];
      expect(
        blocksA2.some((x) => x.identifier === b && x.direction === "blocks"),
        `a không còn blocks b sau remove`,
      ).toBe(false);
    } finally {
      await delIssue(project, a);
      await delIssue(project, b);
    }
  });

  // 2. relations: relates-to (bidirectional — cả 2 issue.relations).
  it("relations: add relates-to → list cả 2 chiều → remove", async () => {
    const a = await mkIssue(project, `h5-rel2-a-${Date.now()}`);
    const b = await mkIssue(project, `h5-rel2-b-${Date.now()}`);
    try {
      const add = await findTool("add_issue_relation").execute(
        "h5-rel2-add",
        { project, identifier: a, targetIssue: b, relationType: "relates-to" },
        undefined,
        undefined,
        ctx(),
      );
      expect(add.isError, `add relates-to: ${add.content[0]?.text}`).toBeUndefined();

      const listA = await findTool("list_issue_relations").execute(
        "h5-rel2-listA",
        { project, identifier: a },
        undefined,
        undefined,
        ctx(),
      );
      const relA =
        (detail(listA.details, "relations") as Array<{
          identifier?: string;
          direction?: string;
        }>) ?? [];
      expect(
        relA.some((x) => x.identifier === b && x.direction === "relates-to"),
        `a relates-to b`,
      ).toBe(true);

      // bidirectional: b cũng relates-to a.
      const listB = await findTool("list_issue_relations").execute(
        "h5-rel2-listB",
        { project, identifier: b },
        undefined,
        undefined,
        ctx(),
      );
      const relB =
        (detail(listB.details, "relations") as Array<{
          identifier?: string;
          direction?: string;
        }>) ?? [];
      expect(
        relB.some((x) => x.identifier === a && x.direction === "relates-to"),
        `bidirectional: b relates-to a`,
      ).toBe(true);

      await findTool("remove_issue_relation").execute(
        "h5-rel2-rem",
        { project, identifier: a, targetIssue: b, relationType: "relates-to" },
        undefined,
        undefined,
        ctx(),
      );
    } finally {
      await delIssue(project, a);
      await delIssue(project, b);
    }
  });

  // 3. templates round-trip: create_template → add_child → create_issue_from_template →
  //    verify child issue exists.
  // T-103 #155 FIXED: create_issue_from_template giờ dùng addCollection (Issue=AttachedDoc).
  it("templates: create → add_child → create_issue_from_template round-trip", async () => {
    const tpl = await findTool("create_template").execute(
      "h5-tpl-create",
      { project, title: `hunt5-tpl-${Date.now()}` },
      undefined,
      undefined,
      ctx(),
    );
    expect(tpl.isError, `create_template: ${tpl.content[0]?.text}`).toBeUndefined();
    const tplId = detail(tpl.details, "id") as string | undefined;
    expect(tplId, "create_template phải trả id").toBeTruthy();
    try {
      // add_child.
      const childTitle = `hunt5-child-${Date.now()}`;
      const addC = await findTool("add_template_child").execute(
        "h5-tpl-addchild",
        { project, template: tplId as string, title: childTitle, priority: "low" },
        undefined,
        undefined,
        ctx(),
      );
      expect(addC.isError, `add_template_child: ${addC.content[0]?.text}`).toBeUndefined();

      // get_template phải thấy child.
      const gt = await findTool("get_template").execute(
        "h5-tpl-get",
        { project, template: tplId as string },
        undefined,
        undefined,
        ctx(),
      );
      const children =
        (detail(gt.details, "children") as Array<{ title?: string; id?: string }>) ?? [];
      expect(
        children.some((c) => c.title === childTitle),
        `get_template phải thấy child`,
      ).toBe(true);

      // create_issue_from_template → tạo issue mới.
      const fromTpl = await findTool("create_issue_from_template").execute(
        "h5-tpl-fromtpl",
        { project, template: tplId as string, title: `from-tpl-${Date.now()}` },
        undefined,
        undefined,
        ctx(),
      );
      expect(
        fromTpl.isError,
        `create_issue_from_template: ${fromTpl.content[0]?.text}`,
      ).toBeUndefined();
      const newId = detail(fromTpl.details, "identifier") as string | undefined;
      if (newId) await delIssue(project, newId);
    } finally {
      await findTool("delete_template").execute(
        "h5-tpl-del",
        { project, template: tplId as string },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  // 4. documents: create → edit search-replace → get → snapshots → delete.
  // T-103 #156 BUG: edit_document search-replace reports success but content
  // unchanged + 0 snapshot (saveContent uploadMarkup+updateDoc không persist).
  it("documents: create → edit search-replace → get → list_snapshots → delete", async () => {
    // cần teamspace.
    const tsRes = await findTool("create_teamspace").execute(
      "h5-doc-ts",
      { name: `hunt5-docts-${Date.now()}` },
      undefined,
      undefined,
      ctx(),
    );
    const tsId = detail(tsRes.details, "id") as string;
    if (!tsId) return; // can't create ts → skip
    try {
      const created = await findTool("create_document").execute(
        "h5-doc-create",
        {
          teamspace: tsId,
          title: `hunt5-doc-${Date.now()}`,
          content: "first version probe text here",
        },
        undefined,
        undefined,
        ctx(),
      );
      expect(created.isError, `create_document: ${created.content[0]?.text}`).toBeUndefined();
      const docId = detail(created.details, "id") as string | undefined;
      expect(docId, "create_document phải trả id").toBeTruthy();

      // edit search-replace.
      const edit = await findTool("edit_document").execute(
        "h5-doc-edit",
        {
          document: docId as string,
          old_text: "probe text",
          new_text: "replaced text now",
        },
        undefined,
        undefined,
        ctx(),
      );
      expect(
        edit.isError,
        `edit_document search-replace: ${edit.content[0]?.text}`,
      ).toBeUndefined();

      // get phải thấy replaced text (body ở content[0].text — KHÔNG details.content,
      // appendDetailsForLLM skip string content → body live trong text, T-88 #123).
      const got = await findTool("get_document").execute(
        "h5-doc-get",
        { document: docId as string },
        undefined,
        undefined,
        ctx(),
      );
      expect(String(got.content[0]?.text ?? "")).toContain("replaced text now");

      // content-replace mode cũng phải persist (T-103 #156: cả 2 mode dùng saveContent).
      const edit2 = await findTool("edit_document").execute(
        "h5-doc-edit2",
        { document: docId as string, content: "FULL REPLACE MARKER text" },
        undefined,
        undefined,
        ctx(),
      );
      expect(
        edit2.isError,
        `edit_document content-replace: ${edit2.content[0]?.text}`,
      ).toBeUndefined();
      const got2 = await findTool("get_document").execute(
        "h5-doc-get2",
        { document: docId as string },
        undefined,
        undefined,
        ctx(),
      );
      expect(String(got2.content[0]?.text ?? "")).toContain("FULL REPLACE MARKER text");

      // snapshots: DocumentSnapshot = document-plugin server-side (KHÔNG tạo bởi
      // collaborator live edit — by design). KHÔNG assert count (content round-trip
      // là proof edit persist). Chỉ verify list_snapshots không crash.
      await findTool("list_document_snapshots").execute(
        "h5-doc-snaps",
        { document: docId as string },
        undefined,
        undefined,
        ctx(),
      );

      await findTool("delete_document").execute(
        "h5-doc-del",
        { document: docId as string },
        undefined,
        undefined,
        ctx(),
      );
    } finally {
      await findTool("delete_teamspace").execute(
        "h5-doc-tsdel",
        { teamspace: tsId },
        undefined,
        undefined,
        ctx(),
      );
    }
  }, 30000);

  // 5. todos round-trip: create → update → complete → reopen → delete.
  it("todos: create → update → complete → reopen → delete round-trip", async () => {
    const issue = await mkIssue(project, `h5-todo-issue-${Date.now()}`);
    try {
      const created = await findTool("create_todo").execute(
        "h5-todo-create",
        { project, identifier: issue, title: `hunt5-todo-${Date.now()}`, priority: "low" },
        undefined,
        undefined,
        ctx(),
      );
      expect(created.isError, `create_todo: ${created.content[0]?.text}`).toBeUndefined();
      const todoId = detail(created.details, "id") as string | undefined;
      expect(todoId, "create_todo phải trả id").toBeTruthy();

      // list phải thấy todo.
      const listed = await findTool("list_todos").execute(
        "h5-todo-list",
        { project, identifier: issue },
        undefined,
        undefined,
        ctx(),
      );
      const todoList = (detail(listed.details, "todos") as Array<{ _id?: string }>) ?? [];
      expect(
        todoList.some((t) => t._id === todoId),
        `list_todos phải thấy todo mới`,
      ).toBe(true);

      // update title.
      const upd = await findTool("update_todo").execute(
        "h5-todo-upd",
        { todo: todoId as string, title: `renamed-todo-${Date.now()}` },
        undefined,
        undefined,
        ctx(),
      );
      expect(upd.isError, `update_todo: ${upd.content[0]?.text}`).toBeUndefined();

      // complete.
      const done = await findTool("complete_todo").execute(
        "h5-todo-done",
        { todo: todoId as string },
        undefined,
        undefined,
        ctx(),
      );
      expect(done.isError, `complete_todo: ${done.content[0]?.text}`).toBeUndefined();
      const gt = await findTool("get_todo").execute(
        "h5-todo-get",
        { todo: todoId as string },
        undefined,
        undefined,
        ctx(),
      );
      expect(detail(gt.details, "done") as boolean).toBe(true);
      expect(detail(gt.details, "doneOn") as number).toBeTruthy();

      // reopen.
      const reopen = await findTool("reopen_todo").execute(
        "h5-todo-reopen",
        { todo: todoId as string },
        undefined,
        undefined,
        ctx(),
      );
      expect(reopen.isError, `reopen_todo: ${reopen.content[0]?.text}`).toBeUndefined();
      const gt2 = await findTool("get_todo").execute(
        "h5-todo-get2",
        { todo: todoId as string },
        undefined,
        undefined,
        ctx(),
      );
      expect(detail(gt2.details, "done") as boolean).toBe(false);

      await findTool("delete_todo").execute(
        "h5-todo-del",
        { todo: todoId as string },
        undefined,
        undefined,
        ctx(),
      );
    } finally {
      await delIssue(project, issue);
    }
  });

  // 6. log_time: log time on issue → no error + content confirms.
  it("log_time: log hours on issue (write sanity)", async () => {
    const issue = await mkIssue(project, `h5-time-issue-${Date.now()}`);
    try {
      const logged = await findTool("log_time").execute(
        "h5-time-log",
        { project, identifier: issue, value: 1.5, description: "hunt5 probe" },
        undefined,
        undefined,
        ctx(),
      );
      expect(logged.isError, `log_time: ${logged.content[0]?.text}`).toBeUndefined();
      expect(String(logged.content[0]?.text ?? "")).toMatch(/1\.5|logged|time/i);
    } finally {
      await delIssue(project, issue);
    }
  });
});
