// T-91 phase 6 — bug-hunt round 6. Cover: comments round-trip, components/milestones
// lifecycle, attachments add→download, tags create/update/delete, projects create/delete.
// Run: HULY_E2E_PROJECT=ETEST pnpm vitest run src/__tests__/e2e-live-hunt6.test.ts

import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { tools as issueCore } from "../tools/domains/issues-core.js";
import { tools as comments } from "../tools/domains/comments.js";
import { tools as attachments } from "../tools/domains/attachments.js";
import { tools as components } from "../tools/domains/components.js";
import { tools as milestones } from "../tools/domains/milestones.js";
import { tools as tags } from "../tools/domains/tags.js";
import { tools as projects } from "../tools/domains/projects.js";

const E2E_PROJECT = process.env.HULY_E2E_PROJECT;
const describeLive = E2E_PROJECT ? describe : describe.skip;

const ALL = [
  ...issueCore,
  ...comments,
  ...attachments,
  ...components,
  ...milestones,
  ...tags,
  ...projects,
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
    "h6-issue",
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
    "h6-del",
    { project, identifier: id },
    undefined,
    undefined,
    ctx(),
  );
}

describeLive(
  "T-91 phase 6 — bug-hunt round 6 (comments/components/milestones/attachments/tags/projects)",
  () => {
    const project = E2E_PROJECT as string;

    // 1. comments round-trip: add → list → update → list → delete → list reflects.
    it("comments: add → list → update → delete round-trip", async () => {
      const issue = await mkIssue(project, `h6-cmt-issue-${Date.now()}`);
      try {
        const added = await findTool("add_comment").execute(
          "h6-cmt-add",
          { project, identifier: issue, body: `hunt6 comment ${Date.now()}` },
          undefined,
          undefined,
          ctx(),
        );
        expect(added.isError, `add_comment: ${added.content[0]?.text}`).toBeUndefined();
        const commentId = detail(added.details, "id") as string | undefined;
        expect(commentId, "add_comment phải trả id").toBeTruthy();

        // list phải thấy.
        const listed = await findTool("list_comments").execute(
          "h6-cmt-list",
          { project, identifier: issue },
          undefined,
          undefined,
          ctx(),
        );
        const cmts =
          (detail(listed.details, "comments") as Array<{ id?: string; _id?: string }>) ?? [];
        expect(
          cmts.some((c) => (c.id ?? c._id) === commentId),
          `list_comments phải thấy comment`,
        ).toBe(true);

        // update.
        const updBody = `updated comment ${Date.now()}`;
        const upd = await findTool("update_comment").execute(
          "h6-cmt-upd",
          { comment: commentId as string, body: updBody },
          undefined,
          undefined,
          ctx(),
        );
        expect(upd.isError, `update_comment: ${upd.content[0]?.text}`).toBeUndefined();

        // delete.
        const del = await findTool("delete_comment").execute(
          "h6-cmt-del",
          { comment: commentId as string },
          undefined,
          undefined,
          ctx(),
        );
        expect(del.isError, `delete_comment: ${del.content[0]?.text}`).toBeUndefined();

        // list không còn.
        const listed2 = await findTool("list_comments").execute(
          "h6-cmt-list2",
          { project, identifier: issue },
          undefined,
          undefined,
          ctx(),
        );
        const cmts2 =
          (detail(listed2.details, "comments") as Array<{ id?: string; _id?: string }>) ?? [];
        expect(
          cmts2.some((c) => (c.id ?? c._id) === commentId),
          `comment phải gone sau delete`,
        ).toBe(false);
      } finally {
        await delIssue(project, issue);
      }
    });

    // 2. components lifecycle: create → update → set_issue_component → get reflects → delete.
    it("components: create → update → set_issue_component → get → delete", async () => {
      const label = `hunt6-comp-${Date.now()}`;
      const created = await findTool("create_component").execute(
        "h6-comp-create",
        { project, label, description: "probe" },
        undefined,
        undefined,
        ctx(),
      );
      expect(created.isError, `create_component: ${created.content[0]?.text}`).toBeUndefined();
      const compId = (detail(created.details, "id") ?? detail(created.details, "_id")) as
        | string
        | undefined;
      expect(compId, "create_component phải trả id/_id").toBeTruthy();
      const issue = await mkIssue(project, `h6-comp-issue-${Date.now()}`);
      try {
        // update description.
        const upd = await findTool("update_component").execute(
          "h6-comp-upd",
          { project, component: compId as string, description: "updated desc" },
          undefined,
          undefined,
          ctx(),
        );
        expect(upd.isError, `update_component: ${upd.content[0]?.text}`).toBeUndefined();

        // set_issue_component → get_issue reflects.
        const setComp = await findTool("set_issue_component").execute(
          "h6-comp-set",
          { project, identifier: issue, component: compId as string },
          undefined,
          undefined,
          ctx(),
        );
        expect(setComp.isError, `set_issue_component: ${setComp.content[0]?.text}`).toBeUndefined();
        const got = await findTool("get_issue").execute(
          "h6-comp-get",
          { project, identifier: issue },
          undefined,
          undefined,
          ctx(),
        );
        // component field phải resolve → match label hoặc id.
        const compField = String(detail(got.details, "component") ?? "");
        expect(compField.length > 0, `get_issue component phải reflect (got "${compField}")`).toBe(
          true,
        );
      } finally {
        await delIssue(project, issue);
        // delete component (cleanup — destructive, UI confirm).
        await findTool("delete_component").execute(
          "h6-comp-del",
          { project, component: compId as string },
          undefined,
          undefined,
          ctx(),
        );
      }
    });

    // 3. milestones lifecycle: create → update → set_issue_milestone → get reflects → delete.
    it("milestones: create → update → set_issue_milestone → get → delete", async () => {
      const label = `hunt6-ms-${Date.now()}`;
      const target = Date.now() + 86400000;
      const created = await findTool("create_milestone").execute(
        "h6-ms-create",
        { project, label, targetDate: target, description: "probe" },
        undefined,
        undefined,
        ctx(),
      );
      expect(created.isError, `create_milestone: ${created.content[0]?.text}`).toBeUndefined();
      const msId = (detail(created.details, "id") ?? detail(created.details, "_id")) as
        | string
        | undefined;
      expect(msId, "create_milestone phải trả id/_id").toBeTruthy();
      const issue = await mkIssue(project, `h6-ms-issue-${Date.now()}`);
      try {
        // update label.
        const upd = await findTool("update_milestone").execute(
          "h6-ms-upd",
          { project, milestone: msId as string, label: `${label}-upd` },
          undefined,
          undefined,
          ctx(),
        );
        expect(upd.isError, `update_milestone: ${upd.content[0]?.text}`).toBeUndefined();

        // set_issue_milestone → get reflects.
        const setMs = await findTool("set_issue_milestone").execute(
          "h6-ms-set",
          { project, identifier: issue, milestone: msId as string },
          undefined,
          undefined,
          ctx(),
        );
        expect(setMs.isError, `set_issue_milestone: ${setMs.content[0]?.text}`).toBeUndefined();
        const got = await findTool("get_issue").execute(
          "h6-ms-get",
          { project, identifier: issue },
          undefined,
          undefined,
          ctx(),
        );
        const msField = String(detail(got.details, "milestone") ?? "");
        expect(msField.length > 0, `get_issue milestone phải reflect (got "${msField}")`).toBe(
          true,
        );
      } finally {
        await delIssue(project, issue);
        await findTool("delete_milestone").execute(
          "h6-ms-del",
          { project, milestone: msId as string },
          undefined,
          undefined,
          ctx(),
        );
      }
    });

    // 4. attachments: add_issue_attachment → list → download (content round-trip).
    it("attachments: add_issue_attachment → list → download round-trip", async () => {
      const issue = await mkIssue(project, `h6-att-issue-${Date.now()}`);
      try {
        const payload = `hunt6 attachment probe ${Date.now()}`;
        const data = Buffer.from(payload).toString("base64");
        const filename = `hunt6-${Date.now()}.txt`;
        const added = await findTool("add_issue_attachment").execute(
          "h6-att-add",
          {
            project,
            identifier: issue,
            filename,
            contentType: "text/plain",
            data,
          },
          undefined,
          undefined,
          ctx(),
        );
        expect(added.isError, `add_issue_attachment: ${added.content[0]?.text}`).toBeUndefined();
        const attId = (detail(added.details, "id") ?? detail(added.details, "_id")) as
          | string
          | undefined;
        expect(attId, "add_issue_attachment phải trả id/_id").toBeTruthy();

        // list phải thấy.
        const listed = await findTool("list_attachments").execute(
          "h6-att-list",
          { project, identifier: issue },
          undefined,
          undefined,
          ctx(),
        );
        const atts =
          (detail(listed.details, "attachments") as Array<{ id?: string; _id?: string }>) ?? [];
        expect(
          atts.some((a) => (a.id ?? a._id) === attId),
          `list_attachments phải thấy attachment`,
        ).toBe(true);

        // download → content round-trip.
        const dl = await findTool("download_attachment").execute(
          "h6-att-dl",
          { attachment: attId as string },
          undefined,
          undefined,
          ctx(),
        );
        expect(dl.isError, `download_attachment: ${dl.content[0]?.text}`).toBeUndefined();
        const dlData = detail(dl.details, "data") as string | undefined;
        const decoded = dlData ? Buffer.from(dlData, "base64").toString("utf8") : "";
        expect(decoded, `download content phải round-trip payload`).toContain(
          "hunt6 attachment probe",
        );
      } finally {
        await delIssue(project, issue);
      }
    });

    // 5. tags lifecycle: create_tag → update → list → delete (cleanup).
    it("tags: create → update → list → delete lifecycle", async () => {
      const title = `hunt6tag${Date.now()}`;
      const created = await findTool("create_tag").execute(
        "h6-tag-create",
        { project, title, color: "#ff0000" },
        undefined,
        undefined,
        ctx(),
      );
      expect(created.isError, `create_tag: ${created.content[0]?.text}`).toBeUndefined();
      const tagId = (detail(created.details, "id") ?? detail(created.details, "_id")) as
        | string
        | undefined;
      expect(tagId, "create_tag phải trả id/_id").toBeTruthy();
      try {
        // update color.
        const upd = await findTool("update_tag").execute(
          "h6-tag-upd",
          { project, tag: tagId as string, color: "#00ff00" },
          undefined,
          undefined,
          ctx(),
        );
        expect(upd.isError, `update_tag: ${upd.content[0]?.text}`).toBeUndefined();

        // list phải thấy.
        const listed = await findTool("list_tags").execute(
          "h6-tag-list",
          { project },
          undefined,
          undefined,
          ctx(),
        );
        const tagList =
          (detail(listed.details, "tags") as Array<{
            id?: string;
            _id?: string;
            title?: string;
          }>) ?? [];
        expect(
          tagList.some((t) => (t.id ?? t._id) === tagId),
          `list_tags phải thấy tag`,
        ).toBe(true);
      } finally {
        await findTool("delete_tag").execute(
          "h6-tag-del",
          { project, tag: tagId as string },
          undefined,
          undefined,
          ctx(),
        );
      }
    });

    // 6. projects lifecycle: create_project → get → delete (dedicated throwaway).
    it("projects: create_project → get → delete lifecycle", async () => {
      const ident = `H6${(Date.now() % 100000).toString(36).toUpperCase().slice(0, 4)}`;
      const name = `hunt6-proj-${Date.now()}`;
      const created = await findTool("create_project").execute(
        "h6-proj-create",
        { name, identifier: ident, description: "hunt6 throwaway" },
        undefined,
        undefined,
        ctx(),
      );
      expect(created.isError, `create_project: ${created.content[0]?.text}`).toBeUndefined();

      // get phải thấy.
      const got = await findTool("get_project").execute(
        "h6-proj-get",
        { project: ident },
        undefined,
        undefined,
        ctx(),
      );
      expect(got.isError, `get_project: ${got.content[0]?.text}`).toBeUndefined();
      expect(detail(got.details, "identifier")).toBe(ident);

      // delete (cleanup — destructive).
      await findTool("delete_project").execute(
        "h6-proj-del",
        { project: ident },
        undefined,
        undefined,
        ctx(),
      );

      // verify gone.
      const gone = await findTool("get_project").execute(
        "h6-proj-get2",
        { project: ident },
        undefined,
        undefined,
        ctx(),
      );
      expect(gone.isError, `project phải gone sau delete`).toBe(true);
    });
  },
);
