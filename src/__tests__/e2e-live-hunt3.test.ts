// T-91 phase 3 — bug-hunt round 3 (post-beta.13). Cover domains CHƯA deep-test:
// attachments round-trip, fulltext_search, move_issue hierarchy, preview_deletion,
// labels round-trip. Goal: FIND bug mới. Run:
//   HULY_E2E_PROJECT=ETEST pnpm vitest run src/__tests__/e2e-live-hunt3.test.ts

import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { tools as issueCore } from "../tools/domains/issues-core.js";
import { tools as attachments } from "../tools/domains/attachments.js";
import { tools as search } from "../tools/domains/search.js";
import { tools as deletion } from "../tools/domains/deletion.js";
import { tools as tags } from "../tools/domains/tags.js";
import { tools as comments } from "../tools/domains/comments.js";
import { tools as components } from "../tools/domains/components.js";
import { tools as projects } from "../tools/domains/projects.js";

const E2E_PROJECT = process.env.HULY_E2E_PROJECT;
const describeLive = E2E_PROJECT ? describe : describe.skip;

const ALL = [
  ...issueCore,
  ...attachments,
  ...search,
  ...deletion,
  ...tags,
  ...comments,
  ...components,
  ...projects,
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
    "h3-issue",
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
    "h3-del",
    { project, identifier },
    undefined,
    undefined,
    ctx(),
  );
}

describeLive("T-91 phase 3 — bug-hunt round 3 (domains chưa deep-test)", () => {
  const project = E2E_PROJECT as string;

  // 1. attachments round-trip: upload base64 → list → get → download → decode match.
  it("attachments: add_issue_attachment → list → get → download (base64 round-trip)", async () => {
    const identifier = await mkIssue(project, `h3-att-${Date.now()}`);
    try {
      const payload = "round-trip probe 🚀";
      const b64 = Buffer.from(payload, "utf-8").toString("base64");
      const filename = `hunt3-${Date.now()}.txt`;
      const added = await findTool("huly_add_issue_attachment").execute(
        "h3-att-add",
        { project, identifier, filename, contentType: "text/plain", data: b64 },
        undefined,
        undefined,
        ctx(),
      );
      expect(added.isError, `add_issue_attachment: ${added.content[0]?.text}`).toBeUndefined();
      const attId = detail(added.details, "id") as string;
      expect(attId, "add phải trả attachment id").toBeTruthy();

      // list_attachments phải thấy attachment mới.
      const listed = await findTool("huly_list_attachments").execute(
        "h3-att-list",
        { project, identifier },
        undefined,
        undefined,
        ctx(),
      );
      const atts = (detail(listed.details, "attachments") as Array<{ _id?: string }>) ?? [];
      expect(
        atts.some((a) => a._id === attId),
        `list_attachments phải chứa attachment`,
      ).toBe(true);

      // get_attachment metadata.
      const got = await findTool("huly_get_attachment").execute(
        "h3-att-get",
        { attachment: attId },
        undefined,
        undefined,
        ctx(),
      );
      expect(detail(got.details, "name"), `get_attachment name`).toBe(filename);

      // download → base64 decode phải = payload gốc.
      const dl = await findTool("huly_download_attachment").execute(
        "h3-att-dl",
        { attachment: attId },
        undefined,
        undefined,
        ctx(),
      );
      const dataB64 = detail(dl.details, "data") as string | undefined;
      expect(dataB64, `download phải trả data base64`).toBeTruthy();
      const decoded = Buffer.from(dataB64 as string, "base64").toString("utf-8");
      expect(decoded, `download base64 round-trip phải khớp payload`).toBe(payload);
    } finally {
      await delIssue(project, identifier);
    }
  });

  // 2. fulltext_search: issue unique title → search fragment → phải tìm thấy.
  it("fulltext_search: tạo issue unique title → search → tìm thấy", async () => {
    const marker = `hunt3fts${Date.now()}`;
    const identifier = await mkIssue(project, `e2e-fts-${marker}-needle`);
    try {
      const found = await findTool("huly_fulltext_search").execute(
        "h3-fts",
        { query: marker },
        undefined,
        undefined,
        ctx(),
      );
      expect(found.isError, `fulltext_search: ${found.content[0]?.text}`).toBeUndefined();
      const results = (detail(found.details, "results") as Array<{ identifier?: string }>) ?? [];
      expect(
        results.some((r) => r.identifier === identifier),
        `fulltext_search phải tìm thấy issue "${identifier}"`,
      ).toBe(true);
    } finally {
      await delIssue(project, identifier);
    }
  });

  // 3. move_issue hierarchy: set parent → get_issue thấy parentIssue → promote (clear).
  it("move_issue: set parent → get_issue parentIssue → promote (clear)", async () => {
    const parent = await mkIssue(project, `h3-mov-parent-${Date.now()}`);
    const child = await mkIssue(project, `h3-mov-child-${Date.now()}`);
    try {
      // set child under parent.
      const moved = await findTool("huly_move_issue").execute(
        "h3-mov-set",
        { project, identifier: child, parentIssue: parent },
        undefined,
        undefined,
        ctx(),
      );
      expect(moved.isError, `move_issue set parent: ${moved.content[0]?.text}`).toBeUndefined();

      const gotChild = await findTool("huly_get_issue").execute(
        "h3-mov-getc",
        { project, identifier: child },
        undefined,
        undefined,
        ctx(),
      );
      expect(detail(gotChild.details, "parentIssue"), `child parentIssue phải = parent`).toBe(
        parent,
      );

      // promote (no parentIssue).
      const promoted = await findTool("huly_move_issue").execute(
        "h3-mov-promo",
        { project, identifier: child },
        undefined,
        undefined,
        ctx(),
      );
      expect(promoted.isError, `move_issue promote: ${promoted.content[0]?.text}`).toBeUndefined();

      const gotChild2 = await findTool("huly_get_issue").execute(
        "h3-mov-getc2",
        { project, identifier: child },
        undefined,
        undefined,
        ctx(),
      );
      expect(
        detail(gotChild2.details, "parentIssue"),
        `sau promote parentIssue phải clear`,
      ).toBeFalsy();
    } finally {
      await delIssue(project, child);
      await delIssue(project, parent);
    }
  });

  // 4. preview_deletion: issue + comment → preview → cascade comments ≥ 1.
  it("preview_deletion: issue có comment → preview cascade comments ≥ 1", async () => {
    const identifier = await mkIssue(project, `h3-prev-${Date.now()}`);
    try {
      const c = await findTool("huly_add_comment").execute(
        "h3-prev-comment",
        { project, identifier, body: "cascade probe" },
        undefined,
        undefined,
        ctx(),
      );
      expect(c.isError, `add_comment: ${c.content[0]?.text}`).toBeUndefined();

      const preview = await findTool("huly_preview_deletion").execute(
        "h3-prev",
        { project, identifier },
        undefined,
        undefined,
        ctx(),
      );
      expect(preview.isError, `preview_deletion: ${preview.content[0]?.text}`).toBeUndefined();
      const cascade = detail(preview.details, "cascade");
      const comments = detail(cascade, "comments");
      expect(Number(comments ?? 0), `preview cascade comments ≥ 1`).toBeGreaterThanOrEqual(1);
    } finally {
      await delIssue(project, identifier);
    }
  });

  // 5. labels round-trip: create tag → add_issue_label → list_attached_tags → remove.
  it("labels: create tag → add_issue_label → list_attached_tags → remove_issue_label", async () => {
    const tagTitle = `hunt3tag${Date.now()}`;
    const identifier = await mkIssue(project, `h3-lbl-${Date.now()}`);
    let tagId: string | undefined;
    try {
      const created = await findTool("huly_create_tag").execute(
        "h3-tag-create",
        { project, title: tagTitle },
        undefined,
        undefined,
        ctx(),
      );
      expect(created.isError, `create_tag: ${created.content[0]?.text}`).toBeUndefined();
      tagId = detail(created.details, "id") as string | undefined;

      const added = await findTool("huly_add_issue_label").execute(
        "h3-lbl-add",
        { project, identifier, label: tagTitle },
        undefined,
        undefined,
        ctx(),
      );
      expect(added.isError, `add_issue_label: ${added.content[0]?.text}`).toBeUndefined();

      const listed = await findTool("huly_list_attached_tags").execute(
        "h3-lbl-list",
        { project, identifier },
        undefined,
        undefined,
        ctx(),
      );
      const attached = (detail(listed.details, "tags") as Array<{ title?: string }>) ?? [];
      expect(
        attached.some((t) => t.title === tagTitle),
        `list_attached_tags phải thấy tag vừa add`,
      ).toBe(true);

      const removed = await findTool("huly_remove_issue_label").execute(
        "h3-lbl-rm",
        { project, identifier, label: tagTitle },
        undefined,
        undefined,
        ctx(),
      );
      expect(removed.isError, `remove_issue_label: ${removed.content[0]?.text}`).toBeUndefined();

      const listed2 = await findTool("huly_list_attached_tags").execute(
        "h3-lbl-list2",
        { project, identifier },
        undefined,
        undefined,
        ctx(),
      );
      const attached2 = (detail(listed2.details, "tags") as Array<{ title?: string }>) ?? [];
      expect(
        attached2.some((t) => t.title === tagTitle),
        `sau remove tag phải gone`,
      ).toBe(false);
    } finally {
      await delIssue(project, identifier);
      if (tagId) {
        await findTool("huly_delete_tag").execute(
          "h3-tag-del",
          { project, tag: tagId },
          undefined,
          undefined,
          ctx(),
        );
      }
    }
  });

  // 6. list_issues status filter: issue có status X → list_issues(status:X) phải tìm thấy.
  // Bug nghi vấn: query.status = raw name (Issue.status = Ref) → có thể 0 match.
  it("list_issues(status: name) → phải tìm thấy issue có status đó", async () => {
    const ls = await findTool("huly_list_statuses").execute(
      "h3-st",
      { project },
      undefined,
      undefined,
      ctx(),
    );
    const statuses = (detail(ls.details, "statuses") as Array<{ name?: string }>) ?? [];
    const statusName = statuses[0]?.name;
    if (!statusName) return; // workspace chưa config workflow → skip

    const identifier = await mkIssue(project, `h3-lst-${Date.now()}`);
    try {
      const upd = await findTool("huly_update_issue").execute(
        "h3-st-set",
        { project, identifier, status: statusName },
        undefined,
        undefined,
        ctx(),
      );
      if (upd.isError) return; // status set fail → skip prove

      const listed = await findTool("huly_list_issues").execute(
        "h3-st-filter",
        { project, status: statusName, limit: 50 },
        undefined,
        undefined,
        ctx(),
      );
      expect(
        listed.isError,
        `list_issues status filter: ${listed.content[0]?.text}`,
      ).toBeUndefined();
      const found = (detail(listed.details, "issues") as Array<{ identifier?: string }>) ?? [];
      expect(
        found.some((i) => i.identifier === identifier),
        `list_issues(status:"${statusName}") phải tìm thấy issue (raw name push → 0 match = BUG)`,
      ).toBe(true);
    } finally {
      await delIssue(project, identifier);
    }
  });

  // 7. list_issues component filter: issue có component → list_issues(component: label) phải tìm thấy.
  // Bug nghi vấn: query.component = raw label (Issue.component = Ref) → có thể 0 match.
  it("list_issues(component: label) → phải tìm thấy issue có component đó", async () => {
    const label = `h3comp${Date.now()}`;
    const cc = await findTool("huly_create_component").execute(
      "h3-comp-create",
      { project, label },
      undefined,
      undefined,
      ctx(),
    );
    if (cc.isError) return; // skip nếu không tạo được
    const compId = detail(cc.details, "id") as string;

    const identifier = await mkIssue(project, `h3-lcomp-${Date.now()}`);
    try {
      const set = await findTool("huly_set_issue_component").execute(
        "h3-comp-set",
        { project, identifier, component: label },
        undefined,
        undefined,
        ctx(),
      );
      if (set.isError) return;

      const listed = await findTool("huly_list_issues").execute(
        "h3-comp-filter",
        { project, component: label, limit: 50 },
        undefined,
        undefined,
        ctx(),
      );
      expect(
        listed.isError,
        `list_issues component filter: ${listed.content[0]?.text}`,
      ).toBeUndefined();
      const found = (detail(listed.details, "issues") as Array<{ identifier?: string }>) ?? [];
      expect(
        found.some((i) => i.identifier === identifier),
        `list_issues(component:"${label}") phải tìm thấy issue (raw label push → 0 match = BUG)`,
      ).toBe(true);
    } finally {
      await delIssue(project, identifier);
      await findTool("huly_delete_component").execute(
        "h3-comp-del",
        { project, component: compId },
        undefined,
        undefined,
        ctx(),
      );
    }
  });
});
