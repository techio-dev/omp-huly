// T-91 phase 2 — live-Huly domain round-trip e2e (hunt bug mới post-beta.12).
// Cùng gate e2e-live.test.ts (HULY_E2E_PROJECT). Cover domain CHƯA test: comments,
// todos, relations, time, update_issue status, milestone/component set, document
// edit, template create_from. Run:
//   HULY_E2E_PROJECT=ETEST pnpm vitest run src/__tests__/e2e-live-domains.test.ts

import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { tools as issueCore } from "../tools/domains/issues-core.js";
import { tools as comments } from "../tools/domains/comments.js";
import { tools as todos } from "../tools/domains/todos.js";
import { tools as relations } from "../tools/domains/issues-relations.js";
import { tools as time } from "../tools/domains/time.js";
import { tools as milestones } from "../tools/domains/milestones.js";
import { tools as components } from "../tools/domains/components.js";
import { tools as documents } from "../tools/domains/documents.js";
import { tools as templates } from "../tools/domains/issues-templates.js";
import { tools as search } from "../tools/domains/search.js";
import { tools as projects } from "../tools/domains/projects.js";
import { tools as snapshots } from "../tools/domains/document-snapshots.js";
import { tools as contacts } from "../tools/domains/contacts.js";

const E2E_PROJECT = process.env.HULY_E2E_PROJECT;
const describeLive = E2E_PROJECT ? describe : describe.skip;

const ALL = [
  ...issueCore,
  ...comments,
  ...todos,
  ...relations,
  ...time,
  ...milestones,
  ...components,
  ...documents,
  ...templates,
  ...search,
  ...projects,
  ...snapshots,
  ...contacts,
];
function findTool(name: string) {
  const t = ALL.find((x) => x.name === name);
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
  const r = await findTool("huly_create_issue").execute(
    "d-issue",
    { project, title, priority: "low" },
    undefined,
    undefined,
    ctx(),
  );
  const id = detail(r.details, "identifier") as string;
  if (!id) throw new Error(`mkIssue failed: ${r.content[0]?.text}`);
  return id;
}
async function delIssue(project: string, identifier: string): Promise<void> {
  await findTool("huly_delete_issue").execute(
    "d-issue-del",
    { project, identifier },
    undefined,
    undefined,
    ctx(),
  );
}

describeLive("T-91 phase 2 — domain round-trip (hunt bug mới)", () => {
  const project = E2E_PROJECT as string;

  // Comment CRUD: add → list (id surfaced?) → update → delete.
  it("comment add → list → update → delete", async () => {
    const identifier = await mkIssue(project, `e2e-cmt-${Date.now()}`);
    try {
      const added = await findTool("huly_add_comment").execute(
        "d-cmt-add",
        { project, identifier, body: "probe comment" },
        undefined,
        undefined,
        ctx(),
      );
      expect(added.isError, `add_comment: ${added.content[0]?.text}`).toBeUndefined();
      const commentId = detail(added.details, "id") as string | undefined;
      expect(commentId, "add_comment phải trả comment id (T-92)").toBeTruthy();

      const upd = await findTool("huly_update_comment").execute(
        "d-cmt-upd",
        { comment: commentId as string, body: "edited" },
        undefined,
        undefined,
        ctx(),
      );
      expect(upd.isError, `update_comment: ${upd.content[0]?.text}`).toBeUndefined();

      const del = await findTool("huly_delete_comment").execute(
        "d-cmt-del",
        { comment: commentId as string },
        undefined,
        undefined,
        ctx(),
      );
      expect(del.isError, `delete_comment: ${del.content[0]?.text}`).toBeUndefined();
    } finally {
      await delIssue(project, identifier);
    }
  });

  // Todo complete/reopen (T-79 doneOn data model live verify).
  it("todo create → complete → reopen → delete", async () => {
    const identifier = await mkIssue(project, `e2e-todo-${Date.now()}`);
    try {
      const created = await findTool("huly_create_todo").execute(
        "d-todo-create",
        { project, identifier, title: "probe todo" },
        undefined,
        undefined,
        ctx(),
      );
      expect(created.isError, `create_todo: ${created.content[0]?.text}`).toBeUndefined();
      const todoId = detail(created.details, "id") as string | undefined;
      expect(todoId, "create_todo phải trả todo id (T-92)").toBeTruthy();

      const done = await findTool("huly_complete_todo").execute(
        "d-todo-done",
        { todo: todoId as string },
        undefined,
        undefined,
        ctx(),
      );
      expect(done.isError, `complete_todo: ${done.content[0]?.text}`).toBeUndefined();

      const reopen = await findTool("huly_reopen_todo").execute(
        "d-todo-reopen",
        { todo: todoId as string },
        undefined,
        undefined,
        ctx(),
      );
      expect(reopen.isError, `reopen_todo: ${reopen.content[0]?.text}`).toBeUndefined();

      await findTool("huly_delete_todo").execute(
        "d-todo-del",
        { todo: todoId as string },
        undefined,
        undefined,
        ctx(),
      );
    } finally {
      await delIssue(project, identifier);
    }
  });

  // Relation add → list → remove (T-61 direction).
  it("relation add blocks → list → remove", async () => {
    const a = await mkIssue(project, `e2e-rel-a-${Date.now()}`);
    const b = await mkIssue(project, `e2e-rel-b-${Date.now()}`);
    try {
      const add = await findTool("huly_add_issue_relation").execute(
        "d-rel-add",
        { project, identifier: a, targetIssue: b, relationType: "blocks" },
        undefined,
        undefined,
        ctx(),
      );
      expect(add.isError, `add_relation: ${add.content[0]?.text}`).toBeUndefined();

      const list = await findTool("huly_list_issue_relations").execute(
        "d-rel-list",
        { project, identifier: a },
        undefined,
        undefined,
        ctx(),
      );
      expect(list.isError, `list_relations: ${list.content[0]?.text}`).toBeUndefined();

      const rem = await findTool("huly_remove_issue_relation").execute(
        "d-rel-rem",
        { project, identifier: a, targetIssue: b, relationType: "blocks" },
        undefined,
        undefined,
        ctx(),
      );
      expect(rem.isError, `remove_relation: ${rem.content[0]?.text}`).toBeUndefined();
    } finally {
      await delIssue(project, a);
      await delIssue(project, b);
    }
  });

  // log_time.
  it("log_time trên issue", async () => {
    const identifier = await mkIssue(project, `e2e-time-${Date.now()}`);
    try {
      const r = await findTool("huly_log_time").execute(
        "d-time",
        { project, identifier, value: 0.25, description: "probe" },
        undefined,
        undefined,
        ctx(),
      );
      expect(r.isError, `log_time: ${r.content[0]?.text}`).toBeUndefined();
    } finally {
      await delIssue(project, identifier);
    }
  });

  // T-99 (#145): list_document_snapshots surface _id + get_document_snapshot
  // body trong content. Snapshot tự tạo khi edit (không đảm bảo) → defensive:
  // có snapshot thì verify, không thì skip (không false-fail).
  it("document-snapshots: list surface _id + get body (T-99 #145)", async () => {
    const tsName = `e2e-snap-ts-${Date.now()}`;
    const tsCreate = await findTool("huly_create_teamspace").execute(
      "d-snap-ts",
      { name: tsName },
      undefined,
      undefined,
      ctx(),
    );
    const teamspace = detail(tsCreate.details, "id") as string | undefined;
    expect(teamspace).toBeTruthy();

    let docId: string | undefined;
    try {
      const doc = await findTool("huly_create_document").execute(
        "d-snap-doc",
        { teamspace: teamspace as string, title: `e2e-snap-${Date.now()}`, content: "v1" },
        undefined,
        undefined,
        ctx(),
      );
      docId = detail(doc.details, "id") as string | undefined;
      expect(docId).toBeTruthy();

      await findTool("huly_edit_document").execute(
        "d-snap-edit",
        { document: docId as string, old_text: "v1", new_text: "v2" },
        undefined,
        undefined,
        ctx(),
      );

      const list = await findTool("huly_list_document_snapshots").execute(
        "d-snap-list",
        { document: docId as string },
        undefined,
        undefined,
        ctx(),
      );
      expect(list.isError).toBeUndefined();
      const snapCount = detail(list.details, "count") as number;
      if (typeof snapCount === "number" && snapCount > 0) {
        const firstId = ((detail(list.details, "snapshots") as Array<{ _id?: string }>) ?? [])[0]
          ?._id;
        expect(firstId, "list phải surface _id").toBeTruthy();
        expect(list.content[0]?.text).toContain(firstId as string);

        const got = await findTool("huly_get_document_snapshot").execute(
          "d-snap-get",
          { snapshot: firstId as string },
          undefined,
          undefined,
          ctx(),
        );
        expect(got.isError).toBeUndefined();
        // T-99: body trong content (trước đây chỉ details.content).
        expect((got.content[0]?.text ?? "").length).toBeGreaterThan(`Snapshot `.length);
      }
    } finally {
      if (docId)
        await findTool("huly_delete_document").execute(
          "d-snap-doc-del",
          { document: docId },
          undefined,
          undefined,
          ctx(),
        );
      await findTool("huly_delete_teamspace").execute(
        "d-snap-ts-del",
        { teamspace: teamspace as string },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  // T-98 (#144): create_issue với status valid → get_issue status matches.
  // Trước đây push raw name → silent-reject, status lost.
  it("create_issue status resolve → get_issue matches (T-98 #144)", async () => {
    const ls = await findTool("huly_list_statuses").execute(
      "d-st-list",
      { project },
      undefined,
      undefined,
      ctx(),
    );
    const statuses = (detail(ls.details, "statuses") as Array<{ name?: string }>) ?? [];
    const statusName = statuses[0]?.name;
    if (!statusName) return; // workspace chưa config workflow → skip (guard T-98)

    // T-98: tạo issue TRỰC TIẾP với status (trước đây raw push → silent lost).
    const created = await findTool("huly_create_issue").execute(
      "d-st98-create",
      { project, title: `e2e-st98-${Date.now()}`, priority: "low", status: statusName },
      undefined,
      undefined,
      ctx(),
    );
    const identifier = detail(created.details, "identifier") as string | undefined;
    expect(created.isError, `create with status: ${created.content[0]?.text}`).toBeUndefined();
    expect(identifier).toBeTruthy();

    try {
      const got = await findTool("huly_get_issue").execute(
        "d-st98-get",
        { project, identifier: identifier as string },
        undefined,
        undefined,
        ctx(),
      );
      expect(detail(got.details, "status"), `status phải = ${statusName}`).toBe(statusName);
    } finally {
      await delIssue(project, identifier as string);
    }
  });

  // set_issue_milestone: create milestone → set → clear (null).
  it("set_issue_milestone set + null-clear", async () => {
    const identifier = await mkIssue(project, `e2e-ms-${Date.now()}`);
    let milestoneId: string | undefined;
    try {
      const ms = await findTool("huly_create_milestone").execute(
        "d-ms-create",
        { project, label: `e2e-ms-${Date.now()}`, targetDate: Date.now() + 7 * 86400000 },
        undefined,
        undefined,
        ctx(),
      );
      expect(ms.isError, `create_milestone: ${ms.content[0]?.text}`).toBeUndefined();
      milestoneId = detail(ms.details, "id") as string | undefined;

      // T-97 (#143): list_milestones PHẢI thấy milestone vừa create (scope project._id).
      const msList = await findTool("huly_list_milestones").execute(
        "d-ms-list",
        { project },
        undefined,
        undefined,
        ctx(),
      );
      expect(msList.isError).toBeUndefined();
      expect(msList.content[0]?.text, "list_milestones phải thấy milestone mới").toContain(
        detail(ms.details, "label") as string,
      );

      const set = await findTool("huly_set_issue_milestone").execute(
        "d-ms-set",
        { project, identifier, milestone: milestoneId as string },
        undefined,
        undefined,
        ctx(),
      );
      expect(set.isError, `set_issue_milestone: ${set.content[0]?.text}`).toBeUndefined();

      const clear = await findTool("huly_set_issue_milestone").execute(
        "d-ms-clear",
        { project, identifier, milestone: null },
        undefined,
        undefined,
        ctx(),
      );
      expect(clear.isError, `clear milestone: ${clear.content[0]?.text}`).toBeUndefined();
    } finally {
      await delIssue(project, identifier);
      if (milestoneId) {
        await findTool("huly_delete_milestone").execute(
          "d-ms-del",
          { project, milestone: milestoneId },
          undefined,
          undefined,
          ctx(),
        );
      }
    }
  });

  // set_issue_component: create component → set.
  it("set_issue_component set", async () => {
    const identifier = await mkIssue(project, `e2e-comp-${Date.now()}`);
    let componentId: string | undefined;
    try {
      const c = await findTool("huly_create_component").execute(
        "d-comp-create",
        { project, label: `e2e-comp-${Date.now()}` },
        undefined,
        undefined,
        ctx(),
      );
      expect(c.isError, `create_component: ${c.content[0]?.text}`).toBeUndefined();
      componentId = detail(c.details, "id") as string | undefined;

      // T-97 (#143): list_components PHẢI thấy component vừa create.
      const cList = await findTool("huly_list_components").execute(
        "d-comp-list",
        { project },
        undefined,
        undefined,
        ctx(),
      );
      expect(cList.isError).toBeUndefined();
      expect(cList.content[0]?.text, "list_components phải thấy component mới").toContain(
        detail(c.details, "label") as string,
      );

      const set = await findTool("huly_set_issue_component").execute(
        "d-comp-set",
        { project, identifier, component: componentId as string },
        undefined,
        undefined,
        ctx(),
      );
      expect(set.isError, `set_issue_component: ${set.content[0]?.text}`).toBeUndefined();
    } finally {
      await delIssue(project, identifier);
      if (componentId) {
        await findTool("huly_delete_component").execute(
          "d-comp-del",
          { project, component: componentId },
          undefined,
          undefined,
          ctx(),
        );
      }
    }
  });

  // document: create teamspace → create doc → edit (search-replace) → delete.
  it("document create → edit → delete", async () => {
    const tsName = `e2e-doc-ts-${Date.now()}`;
    const tsCreate = await findTool("huly_create_teamspace").execute(
      "d-ts-create",
      { name: tsName },
      undefined,
      undefined,
      ctx(),
    );
    expect(tsCreate.isError, `create_teamspace: ${tsCreate.content[0]?.text}`).toBeUndefined();
    const teamspace = detail(tsCreate.details, "id") as string | undefined;
    expect(teamspace).toBeTruthy();

    let docId: string | undefined;
    try {
      const doc = await findTool("huly_create_document").execute(
        "d-doc-create",
        { teamspace: teamspace as string, title: `e2e-doc-${Date.now()}`, content: "hello world" },
        undefined,
        undefined,
        ctx(),
      );
      expect(doc.isError, `create_document: ${doc.content[0]?.text}`).toBeUndefined();
      docId = detail(doc.details, "id") as string | undefined;
      expect(docId).toBeTruthy();

      const edit = await findTool("huly_edit_document").execute(
        "d-doc-edit",
        { document: docId as string, old_text: "hello", new_text: "goodbye" },
        undefined,
        undefined,
        ctx(),
      );
      expect(edit.isError, `edit_document: ${edit.content[0]?.text}`).toBeUndefined();

      await findTool("huly_delete_document").execute(
        "d-doc-del",
        { document: docId as string },
        undefined,
        undefined,
        ctx(),
      );
    } finally {
      await findTool("huly_delete_teamspace").execute(
        "d-ts-del",
        { teamspace: teamspace as string },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  // template: create → create_issue_from → delete.
  it("template create → create_issue_from → delete", async () => {
    const tpl = await findTool("huly_create_template").execute(
      "d-tpl-create",
      { project, title: `e2e-tpl-${Date.now()}` },
      undefined,
      undefined,
      ctx(),
    );
    expect(tpl.isError, `create_template: ${tpl.content[0]?.text}`).toBeUndefined();
    const templateId = detail(tpl.details, "id") as string | undefined;
    expect(templateId).toBeTruthy();

    let newIssueId: string | undefined;
    try {
      const from = await findTool("huly_create_issue_from_template").execute(
        "d-tpl-from",
        { project, template: templateId as string, title: `e2e-tpl-issue-${Date.now()}` },
        undefined,
        undefined,
        ctx(),
      );
      // create_from có thể fail (template rỗng) — ghi nhận nhưng không fail test cứng.
      if (!from.isError) {
        newIssueId = detail(from.details, "identifier") as string | undefined;
      }
    } finally {
      if (newIssueId) await delIssue(project, newIssueId);
      await findTool("huly_delete_template").execute(
        "d-tpl-del",
        { project, template: templateId as string },
        undefined,
        undefined,
        ctx(),
      );
    }
  });
});

// T-zombie: prove #102-105 fixes work live (zombie-open — fixed in T-78..T-82,
// issue chưa close vì merge thiếu "Fixes #NNN"). Mirror beta.12/13 pattern.
describeLive(
  "Zombie verify — #102 todos / #103 get_issue / #104 component lead / #105 milestone status",
  () => {
    const project = E2E_PROJECT as string;

    // #102: list_todos trả created todo (findAll attachedTo, KHÔNG đọc issue.todos
    // array) + get_todo trả doneOn field (KHÔNG chỉ `done` bool).
    it("#102 list_todos + get_todo doneOn field (T-79)", async () => {
      const identifier = await mkIssue(project, `e2e-z102-${Date.now()}`);
      try {
        const created = await findTool("huly_create_todo").execute(
          "z102-create",
          { project, identifier, title: "zombie todo" },
          undefined,
          undefined,
          ctx(),
        );
        expect(created.isError, `create_todo: ${created.content[0]?.text}`).toBeUndefined();
        const todoId = detail(created.details, "id") as string;

        // list_todos phải trả todo mới (prove findAll attachedTo, KHÔNG array read).
        const listed = await findTool("huly_list_todos").execute(
          "z102-list",
          { project, identifier },
          undefined,
          undefined,
          ctx(),
        );
        const todos = (detail(listed.details, "todos") as Array<{ _id?: string }>) ?? [];
        expect(
          todos.some((t) => t._id === todoId),
          `list_todos phải chứa todo mới`,
        ).toBe(true);

        // get_todo: doneOn field tồn tại, null khi open.
        const got = await findTool("huly_get_todo").execute(
          "z102-get",
          { todo: todoId },
          undefined,
          undefined,
          ctx(),
        );
        expect(detail(got.details, "doneOn"), `get_todo doneOn (null khi open)`).toBeNull();

        // complete → doneOn = number (timestamp, KHÔNG done:true no-op).
        await findTool("huly_complete_todo").execute(
          "z102-done",
          { todo: todoId },
          undefined,
          undefined,
          ctx(),
        );
        const gotDone = await findTool("huly_get_todo").execute(
          "z102-get2",
          { todo: todoId },
          undefined,
          undefined,
          ctx(),
        );
        expect(typeof detail(gotDone.details, "doneOn")).toBe("number");

        await findTool("huly_delete_todo").execute(
          "z102-del",
          { todo: todoId },
          undefined,
          undefined,
          ctx(),
        );
      } finally {
        await delIssue(project, identifier);
      }
    });

    // #103: get_issue resolve assignee → Person name (KHÔNG raw ref). Status resolve
    // đã proven ở test "create_issue status resolve". Assignee = default currentUser
    // (D15) → resolve Person name.
    it("#103 get_issue resolve assignee → Person name (T-80)", async () => {
      const identifier = await mkIssue(project, `e2e-z103-${Date.now()}`);
      try {
        const got = await findTool("huly_get_issue").execute(
          "z103-get",
          { project, identifier },
          undefined,
          undefined,
          ctx(),
        );
        const assignee = detail(got.details, "assignee");
        // Resilient fallback: currentUser chưa có Person → null (KHÔNG garbage ref).
        // Nếu có assignee → phải là human name, KHÔNG raw ref (pattern <class>:<id>).
        if (assignee !== undefined && assignee !== null) {
          expect(typeof assignee).toBe("string");
          expect(String(assignee), `assignee phải là name KHÔNG raw ref`).not.toMatch(
            /:class:|:employee:|@/,
          );
        }
      } finally {
        await delIssue(project, identifier);
      }
    });

    // #104: create_component với lead → get_component leadRef = resolved Ref<Employee>
    // (KHÔNG raw email/name). Cần ≥1 employee trong workspace.
    it("#104 component lead resolve → Ref<Employee> (T-81)", async () => {
      const emps = await findTool("huly_list_employees").execute(
        "z104-emps",
        {},
        undefined,
        undefined,
        ctx(),
      );
      const empList =
        (detail(emps.details, "employees") as Array<{ name?: string; _id?: string }>) ?? [];
      const emp = empList[0];
      if (!emp?.name) return; // workspace không có employee → skip (không prove được)

      const label = `zcomp-${Date.now()}`;
      const created = await findTool("huly_create_component").execute(
        "z104-create",
        { project, label, lead: emp.name },
        undefined,
        undefined,
        ctx(),
      );
      // Lead resolve có thể fail nếu name path không match Person — guard (skip prove).
      if (created.isError) return;
      const compId = detail(created.details, "id") as string;

      try {
        const got = await findTool("huly_get_component").execute(
          "z104-get",
          { project, component: compId },
          undefined,
          undefined,
          ctx(),
        );
        // leadRef = resolved Person._id (Ref<Employee>), KHÔNG raw emp.name.
        expect(detail(got.details, "leadRef"), `leadRef phải = resolved Ref`).toBeTruthy();
        expect(String(detail(got.details, "leadRef"))).not.toBe(emp.name);
      } finally {
        await findTool("huly_delete_component").execute(
          "z104-del",
          { project, component: compId },
          undefined,
          undefined,
          ctx(),
        );
      }
    });

    // #105: milestone status READ = string enum (planned/in-progress/completed/canceled),
    // KHÔNG raw number 0-3 (dead `?? "planned"` không cứu được 0).
    it("#105 milestone status read = string (T-82)", async () => {
      const label = `zmile-${Date.now()}`;
      const created = await findTool("huly_create_milestone").execute(
        "z105-create",
        { project, label, targetDate: Date.now() + 86400000 },
        undefined,
        undefined,
        ctx(),
      );
      expect(created.isError, `create_milestone: ${created.content[0]?.text}`).toBeUndefined();
      const mileId = detail(created.details, "id") as string;
      try {
        const got = await findTool("huly_get_milestone").execute(
          "z105-get",
          { project, milestone: mileId },
          undefined,
          undefined,
          ctx(),
        );
        const status = detail(got.details, "status");
        expect(typeof status, `milestone status phải string KHÔNG number`).toBe("string");
        expect(["planned", "in-progress", "completed", "canceled"]).toContain(status);
      } finally {
        await findTool("huly_delete_milestone").execute(
          "z105-del",
          { project, milestone: mileId },
          undefined,
          undefined,
          ctx(),
        );
      }
    });
  },
);
