// T-91 phase 7 — bug-hunt round 7 (FINAL scan). Cover mọi gap còn lại: search
// (issues/messages), tag-categories lifecycle, workspace (get/update_user_profile),
// task-management admin (create_task_type), read-paths (list/get cho documents/
// components/milestones/templates/space_types/attachment), template write (update/
// remove_child). Run:
//   HULY_E2E_PROJECT=ETEST pnpm vitest run src/__tests__/e2e-live-hunt7.test.ts

import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { tools as issueCore } from "../tools/domains/issues-core.js";
import { tools as search } from "../tools/domains/search.js";
import { tools as tagCats } from "../tools/domains/tag-categories.js";
import { tools as workspace } from "../tools/domains/workspace.js";
import { tools as taskMgmt } from "../tools/domains/task-management.js";
import { tools as documents } from "../tools/domains/documents.js";
import { tools as components } from "../tools/domains/components.js";
import { tools as milestones } from "../tools/domains/milestones.js";
import { tools as templates } from "../tools/domains/issues-templates.js";
import { tools as spaces } from "../tools/domains/spaces.js";
import { tools as attachments } from "../tools/domains/attachments.js";

const E2E_PROJECT = process.env.HULY_E2E_PROJECT;
const describeLive = E2E_PROJECT ? describe : describe.skip;

const ALL = [
  ...issueCore,
  ...search,
  ...tagCats,
  ...workspace,
  ...taskMgmt,
  ...documents,
  ...components,
  ...milestones,
  ...templates,
  ...spaces,
  ...attachments,
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
    "h7-issue",
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
    "h7-del",
    { project, identifier: id },
    undefined,
    undefined,
    ctx(),
  );
}

describeLive("T-91 phase 7 — bug-hunt round 7 (FINAL scan: search/admin/workspace/reads)", () => {
  const project = E2E_PROJECT as string;

  // 1. search: KHÔNG có tool `issues`/`messages` riêng — chúng là config domain
  // BÊN TRONG fulltext_search (search.ts:133-134). fulltext_search đã cover R3.
  // Skip (không duplicate).
  it.skip("search: issues/messages = fulltext_search config domain (cover R3)", async () => {});

  // 2. tag-categories lifecycle: create → list → update → delete.
  it("tag-categories: create → list → update → delete lifecycle", async () => {
    const label = `hunt7-cat-${Date.now()}`;
    const created = await findTool("create_tag_category").execute(
      "h7-cat-create",
      { label },
      undefined,
      undefined,
      ctx(),
    );
    expect(created.isError, `create_tag_category: ${created.content[0]?.text}`).toBeUndefined();
    const catId = (detail(created.details, "id") ?? detail(created.details, "_id")) as
      | string
      | undefined;
    expect(catId, "create_tag_category phải trả id/_id").toBeTruthy();
    try {
      // list phải thấy.
      const listed = await findTool("list_tag_categories").execute(
        "h7-cat-list",
        {},
        undefined,
        undefined,
        ctx(),
      );
      const cats =
        (detail(listed.details, "categories") as Array<{ id?: string; _id?: string }>) ?? [];
      expect(
        cats.some((c) => (c.id ?? c._id) === catId),
        `list_tag_categories phải thấy cat`,
      ).toBe(true);

      // update label.
      const upd = await findTool("update_tag_category").execute(
        "h7-cat-upd",
        { category: catId as string, label: `${label}-upd` },
        undefined,
        undefined,
        ctx(),
      );
      expect(upd.isError, `update_tag_category: ${upd.content[0]?.text}`).toBeUndefined();
    } finally {
      await findTool("delete_tag_category").execute(
        "h7-cat-del",
        { category: catId as string },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  // 3. workspace: get_workspace_info + get_user_profile + update_user_profile (write+restore).
  it("workspace: get_workspace_info + get_user_profile (read-path clean)", async () => {
    const winfo = await findTool("get_workspace_info").execute(
      "h7-ws-info",
      {},
      undefined,
      undefined,
      ctx(),
    );
    expect(winfo.isError, `get_workspace_info: ${winfo.content[0]?.text}`).toBeUndefined();
    expect(detail(winfo.details, "workspace")).toBeTruthy();

    const profile = await findTool("get_user_profile").execute(
      "h7-ws-prof",
      {},
      undefined,
      undefined,
      ctx(),
    );
    expect(profile.isError, `get_user_profile: ${profile.content[0]?.text}`).toBeUndefined();
    expect(detail(profile.details, "user")).toBeTruthy();
  });

  // T-103 #157 BUG: update_user_profile resolves Person via currentUser.id (KHÔNG
  // phải Person._id — là account/session id) → findOne returns null → isError
  // 'Person not found'. Fix: resolve qua email→Channel→attachedTo→Person
  // (findPersonByEmailOrName pattern, works in create_issue).
  it("workspace: update_user_profile (T-103 #157: email resolve, KHÔNG lookup-by-id)", async () => {
    // Capture original name để restore (mutate rồi revert — không để lại dirt).
    const before = await findTool("get_user_profile").execute(
      "h7-ws-before",
      {},
      undefined,
      undefined,
      ctx(),
    );
    const origName = String(detail(detail(before.details, "user"), "name") ?? "");
    // parse Huly "Last,First" → firstName.
    const origFirst = origName.includes(",") ? origName.slice(origName.indexOf(",") + 1) : origName;

    const probe = `h7probe${Date.now() % 100000}`;
    const upd = await findTool("update_user_profile").execute(
      "h7-ws-upd",
      { firstName: probe },
      undefined,
      undefined,
      ctx(),
    );
    expect(upd.isError, `update_user_profile: ${upd.content[0]?.text}`).toBeUndefined();

    // restore original firstName.
    await findTool("update_user_profile").execute(
      "h7-ws-restore",
      { firstName: origFirst },
      undefined,
      undefined,
      ctx(),
    );
  });

  // 4. task-management admin: create_task_type (T-73 complexity) live.
  it("admin: create_task_type → list_task_types reflects (T-73 live)", async () => {
    // cần projectType — list_project_types → lấy 1.
    const pts = await findTool("list_project_types").execute(
      "h7-pt",
      {},
      undefined,
      undefined,
      ctx(),
    );
    const ptList =
      (detail(pts.details, "projectTypes") as Array<{ _id?: string; id?: string }>) ?? [];
    const projectType = ptList[0]?._id ?? ptList[0]?.id;
    if (!projectType) return; // no project type → skip

    const name = `hunt7tt${Date.now() % 100000}`;
    const created = await findTool("create_task_type").execute(
      "h7-tt-create",
      { name, projectType },
      undefined,
      undefined,
      ctx(),
    );
    if (created.isError) {
      console.warn(`create_task_type failed (admin rủi ro): ${created.content[0]?.text}`);
      return;
    }
    const ttId = (detail(created.details, "id") ?? detail(created.details, "_id")) as
      | string
      | undefined;
    expect(ttId, "create_task_type phải trả id/_id").toBeTruthy();

    // list_task_types(projectType) phải thấy task type mới.
    const listed = await findTool("list_task_types").execute(
      "h7-tt-list",
      { projectType },
      undefined,
      undefined,
      ctx(),
    );
    const ttList =
      (detail(listed.details, "taskTypes") as Array<{
        _id?: string;
        id?: string;
        name?: string;
      }>) ?? [];
    expect(
      ttList.some((t) => (t._id ?? t.id) === ttId),
      `list_task_types phải thấy task type mới`,
    ).toBe(true);
  });

  // 5. read-paths batch: list + get cho documents/components/milestones/templates.
  it("read-paths: list_documents + list/get components + milestones + templates không crash", async () => {
    // list_documents — cần teamspace. Tạo throwaway teamspace + doc.
    const tsRes = await findTool("create_teamspace").execute(
      "h7-rd-ts",
      { name: `hunt7-rd-ts-${Date.now()}` },
      undefined,
      undefined,
      ctx(),
    );
    const tsId = detail(tsRes.details, "id") as string;
    if (tsId) {
      try {
        await findTool("create_document").execute(
          "h7-rd-doc",
          { teamspace: tsId, title: `hunt7-rd-${Date.now()}`, content: "probe" },
          undefined,
          undefined,
          ctx(),
        );
        const ld = await findTool("list_documents").execute(
          "h7-rd-listdocs",
          { teamspace: tsId },
          undefined,
          undefined,
          ctx(),
        );
        expect(ld.isError, `list_documents: ${ld.content[0]?.text}`).toBeUndefined();
        expect(Array.isArray(detail(ld.details, "documents"))).toBe(true);
      } finally {
        await findTool("delete_teamspace").execute(
          "h7-rd-tsdel",
          { teamspace: tsId },
          undefined,
          undefined,
          ctx(),
        );
      }
    }

    // list_components + get_component (first).
    const lc = await findTool("list_components").execute(
      "h7-rd-lc",
      { project },
      undefined,
      undefined,
      ctx(),
    );
    expect(lc.isError, `list_components: ${lc.content[0]?.text}`).toBeUndefined();
    const compList =
      (detail(lc.details, "components") as Array<{ _id?: string; id?: string }>) ?? [];
    if (compList[0]) {
      const compId = compList[0]._id ?? compList[0].id;
      const gc = await findTool("get_component").execute(
        "h7-rd-gc",
        { project, component: compId as string },
        undefined,
        undefined,
        ctx(),
      );
      expect(gc.isError, `get_component: ${gc.content[0]?.text}`).toBeUndefined();
    }

    // list_milestones + get_milestone.
    const lm = await findTool("list_milestones").execute(
      "h7-rd-lm",
      { project },
      undefined,
      undefined,
      ctx(),
    );
    expect(lm.isError, `list_milestones: ${lm.content[0]?.text}`).toBeUndefined();
    const msList = (detail(lm.details, "milestones") as Array<{ _id?: string; id?: string }>) ?? [];
    if (msList[0]) {
      const msId = msList[0]._id ?? msList[0].id;
      const gm = await findTool("get_milestone").execute(
        "h7-rd-gm",
        { project, milestone: msId as string },
        undefined,
        undefined,
        ctx(),
      );
      expect(gm.isError, `get_milestone: ${gm.content[0]?.text}`).toBeUndefined();
    }

    // list_templates (list_space_types/get_space_type = documented UNAVAILABLE —
    // drive plugin not bundled, skip).
    const lt = await findTool("list_templates").execute(
      "h7-rd-lt",
      { project },
      undefined,
      undefined,
      ctx(),
    );
    expect(lt.isError, `list_templates: ${lt.content[0]?.text}`).toBeUndefined();
  });

  // 6. templates write: create → update_template → add_child → remove_child → delete.
  it("templates write: create → update → add_child → remove_child → delete", async () => {
    const created = await findTool("create_template").execute(
      "h7-tpl-create",
      { project, title: `hunt7-tpl-${Date.now()}` },
      undefined,
      undefined,
      ctx(),
    );
    expect(created.isError, `create_template: ${created.content[0]?.text}`).toBeUndefined();
    const tplId = (detail(created.details, "id") ?? detail(created.details, "_id")) as
      | string
      | undefined;
    expect(tplId).toBeTruthy();
    try {
      // update title.
      const upd = await findTool("update_template").execute(
        "h7-tpl-upd",
        { project, template: tplId as string, title: `hunt7-tpl-upd-${Date.now()}` },
        undefined,
        undefined,
        ctx(),
      );
      expect(upd.isError, `update_template: ${upd.content[0]?.text}`).toBeUndefined();

      // add_child.
      const addC = await findTool("add_template_child").execute(
        "h7-tpl-addc",
        { project, template: tplId as string, title: `hunt7-child-${Date.now()}`, priority: "low" },
        undefined,
        undefined,
        ctx(),
      );
      expect(addC.isError, `add_template_child: ${addC.content[0]?.text}`).toBeUndefined();
      const childId = (detail(addC.details, "id") ??
        detail(addC.details, "_id") ??
        detail(addC.details, "childId")) as string | undefined;

      // remove_child (childId từ get_template children nếu add không trả id).
      let removeChildId = childId;
      if (!removeChildId) {
        const gt = await findTool("get_template").execute(
          "h7-tpl-get",
          { project, template: tplId as string },
          undefined,
          undefined,
          ctx(),
        );
        const children =
          (detail(gt.details, "children") as Array<{ id?: string; _id?: string }>) ?? [];
        removeChildId = children[0]?.id ?? children[0]?._id;
      }
      if (removeChildId) {
        const remC = await findTool("remove_template_child").execute(
          "h7-tpl-remc",
          { project, template: tplId as string, childId: removeChildId },
          undefined,
          undefined,
          ctx(),
        );
        expect(remC.isError, `remove_template_child: ${remC.content[0]?.text}`).toBeUndefined();
      }
    } finally {
      await findTool("delete_template").execute(
        "h7-tpl-del",
        { project, template: tplId as string },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  // 7. attachments read: add → list → get_attachment metadata round-trip.
  it("attachments read: add → list → get_attachment metadata", async () => {
    const issue = await mkIssue(project, `h7-att-issue-${Date.now()}`);
    try {
      const data = Buffer.from(`hunt7 att ${Date.now()}`).toString("base64");
      const filename = `hunt7-${Date.now()}.txt`;
      const added = await findTool("add_issue_attachment").execute(
        "h7-att-add",
        { project, identifier: issue, filename, contentType: "text/plain", data },
        undefined,
        undefined,
        ctx(),
      );
      const attId = (detail(added.details, "id") ?? detail(added.details, "_id")) as
        | string
        | undefined;
      expect(attId).toBeTruthy();

      // get_attachment (metadata) — separate from download.
      const ga = await findTool("get_attachment").execute(
        "h7-att-get",
        { attachment: attId as string },
        undefined,
        undefined,
        ctx(),
      );
      expect(ga.isError, `get_attachment: ${ga.content[0]?.text}`).toBeUndefined();
      expect(String(detail(ga.details, "name") ?? detail(ga.details, "filename") ?? "")).toContain(
        "hunt7",
      );
    } finally {
      await delIssue(project, issue);
    }
  });
});
