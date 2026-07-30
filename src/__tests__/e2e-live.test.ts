// T-91 (#138 phase) — live-Huly round-trip e2e.
//
// Enable phần T-36 DEFERRED: "actual real-Huly round-trip — post-deploy prod
// verify HOẶC task mới khi maintainer có self-host instance". Giờ maintainer CÓ
// workspace test → harness này connect thật.
//
// Gate: `HULY_E2E_PROJECT` env (test project identifier, vd ETEST). CI KHÔNG
// set → toàn file skip (CI green).
//
// Workspace resolution: KHÔNG truyền workspace param → builder resolve qua
// cwd-map (config.resolveByCwd) — cùng path session dùng. Project truyền explicit
// (= HULY_E2E_PROJECT). Do đó test phải chạy từ cwd đã `/huly init` bind.
//
// Run local (từ repo root đã bind ETEST):
//   HULY_E2E_PROJECT=ETEST pnpm vitest run src/__tests__/e2e-live.test.ts
//
// Creds: ~/.pi/agent/huly/credentials.json (loadCredentials — reuse binding đã
// connect, KHÔNG re-enter). Mỗi test dùng prefix `e2e-t91-<ts>-` + self-cleanup
// (delete trong finally — confirm gate bypass qua ctx.ui.confirm=true).
//
// NON-DUP T-36: T-36 = MockHulyStore integration smoke (CI, hasUI=false, ignore
// space semantics). T-91 = REAL round-trip (catch bug mà mock không thấy: sai
// space, assignee raw, …). Hai layer bổ sung nhau: T-36 fast CI feedback,
// T-91 correctness round-trip local.

import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { tools as issueCoreTools } from "../tools/domains/issues-core.js";
import { tools as tagTools } from "../tools/domains/tags.js";
import { tools as tagCategoryTools } from "../tools/domains/tag-categories.js";
import { getClient } from "../client/pool.js";
import { resolveWorkspace } from "../config/resolver.js";
import { TAG_CATEGORY_CLASS } from "../tools/domains/_class-refs.js";

const E2E_PROJECT = process.env.HULY_E2E_PROJECT;

// Skip toàn file khi KHÔNG enable (CI — no creds).
const describeLive = E2E_PROJECT ? describe : describe.skip;

/** Đọc scalar field từ details (unknown → safe access). */
function detail(d: unknown, field: string): unknown {
  if (d !== null && typeof d === "object") return (d as Record<string, unknown>)[field];
  return undefined;
}

/** Live ctx: hasUI=true + ui.confirm=true → destructive cleanup chạy được. */
function makeLiveCtx(cwd: string): ExtensionContext {
  return {
    cwd,
    hasUI: true,
    ui: { confirm: async () => true },
  } as never as ExtensionContext;
}

describeLive("T-91 e2e live — real Huly round-trip (gated HULY_E2E_PROJECT)", () => {
  /** Tìm tool (bất kỳ domain). */
  function findTool(name: string) {
    const all = [...issueCoreTools, ...tagTools, ...tagCategoryTools];
    const t = all.find((x) => x.name === name);
    if (!t) throw new Error(`tool ${name} not registered`);
    return t;
  }

  const project = E2E_PROJECT as string;
  const cwd = process.cwd();

  // DoD T-91: 1 create → get round-trip thật pass.
  it("create_issue → get_issue → delete_issue round-trip trên live workspace", async () => {
    const title = `e2e-t91-${Date.now()}`;
    const ctx = makeLiveCtx(cwd);

    const created = await findTool("huly_create_issue").execute(
      "e2e-create",
      { project, title, priority: "low" },
      undefined,
      undefined,
      ctx,
    );
    expect(created.isError, `create failed: ${created.content[0]?.text}`).toBeUndefined();
    const identifier = detail(created.details, "identifier") as string | undefined;
    expect(identifier, "create phải trả identifier").toBeTruthy();

    try {
      const got = await findTool("huly_get_issue").execute(
        "e2e-get",
        { project, identifier: identifier as string },
        undefined,
        undefined,
        ctx,
      );
      expect(got.isError, `get failed: ${got.content[0]?.text}`).toBeUndefined();
      expect(detail(got.details, "identifier")).toBe(identifier);
      expect(detail(got.details, "title")).toBe(title);
    } finally {
      // Cleanup (confirm gate bypass qua ctx.ui.confirm=true).
      await findTool("huly_delete_issue").execute(
        "e2e-delete",
        { project, identifier: identifier as string },
        undefined,
        undefined,
        ctx,
      );
    }
  });

  // T-92 verification trên live: list_issues content (model-visible) PHẢI chứa
  // identifier sau fix #138 (trước đây TUI mode chỉ trả count).
  it("list_issues content chứa identifier (T-92 #138 live verify)", async () => {
    const title = `e2e-t91-list-${Date.now()}`;
    const ctx = makeLiveCtx(cwd);

    const created = await findTool("huly_create_issue").execute(
      "e2e-list-create",
      { project, title, priority: "low" },
      undefined,
      undefined,
      ctx,
    );
    const identifier = detail(created.details, "identifier") as string;
    expect(created.isError, `create failed: ${created.content[0]?.text}`).toBeUndefined();
    expect(identifier).toBeTruthy();

    try {
      const res = await findTool("huly_list_issues").execute(
        "e2e-list",
        { project, limit: 50 },
        undefined,
        undefined,
        ctx,
      );
      expect(res.isError).toBeUndefined();
      // T-92: hasUI=true giờ cũng append details → content CHỨA identifier
      expect(res.content[0]?.text).toContain(identifier);
    } finally {
      await findTool("huly_delete_issue").execute(
        "e2e-list-delete",
        { project, identifier },
        undefined,
        undefined,
        ctx,
      );
    }
  });

  // T-93 (#139) + T-94 (#140): create_tag (project space) → list_tags thấy →
  // attach_tag by TITLE → list_attached_tags → detach_tag by TITLE. Trước đây:
  // create_tag orphan (sai space) + attach_tag _id-only dead-end.
  it("tag round-trip: create → list → attach(title) → detach(title) (T-93+T-94)", async () => {
    const title = `e2e-t93-${Date.now()}`;
    const ctx = makeLiveCtx(cwd);

    // Tạo 1 issue host để attach tag.
    const issueRes = await findTool("huly_create_issue").execute(
      "e2e-tag-issue",
      { project, title: `e2e-t93-issue-${Date.now()}`, priority: "low" },
      undefined,
      undefined,
      ctx,
    );
    const identifier = detail(issueRes.details, "identifier") as string;
    expect(issueRes.isError, `issue create failed: ${issueRes.content[0]?.text}`).toBeUndefined();
    expect(identifier).toBeTruthy();

    try {
      // T-93: create_tag trong project space.
      const created = await findTool("huly_create_tag").execute(
        "e2e-tag-create",
        { project, title },
        undefined,
        undefined,
        ctx,
      );
      expect(created.isError, `create_tag failed: ${created.content[0]?.text}`).toBeUndefined();

      // T-93: list_tags PHẢI thấy tag vừa create (trước đây count không đổi).
      const listed = await findTool("huly_list_tags").execute(
        "e2e-tag-list",
        { project },
        undefined,
        undefined,
        ctx,
      );
      expect(listed.isError).toBeUndefined();
      expect(listed.content[0]?.text, "list_tags phải thấy tag mới").toContain(title);

      // T-94: attach_tag by TITLE (trước đây _id-only → dead-end).
      const attached = await findTool("huly_attach_tag").execute(
        "e2e-tag-attach",
        { project, identifier, tag: title },
        undefined,
        undefined,
        ctx,
      );
      expect(attached.isError, `attach_tag failed: ${attached.content[0]?.text}`).toBeUndefined();

      // list_attached_tags thấy tag.
      const attachedList = await findTool("huly_list_attached_tags").execute(
        "e2e-tag-attached-list",
        { project, identifier },
        undefined,
        undefined,
        ctx,
      );
      expect(attachedList.content[0]?.text).toContain(title);

      // T-94: detach_tag by TITLE.
      const detached = await findTool("huly_detach_tag").execute(
        "e2e-tag-detach",
        { project, identifier, tag: title },
        undefined,
        undefined,
        ctx,
      );
      expect(detached.isError, `detach_tag failed: ${detached.content[0]?.text}`).toBeUndefined();
    } finally {
      await findTool("huly_delete_issue").execute(
        "e2e-tag-issue-delete",
        { project, identifier },
        undefined,
        undefined,
        ctx,
      );
    }
  });

  // T-95 (#141): create_issue default assignee → assigneeRef phải là Person._id
  // (KHÔNG raw email). Trước đây push email string vào Ref<Person> → get_issue "?".
  it("create_issue assignee resolves to Person._id not raw email (T-95 #141)", async () => {
    const title = `e2e-t95-${Date.now()}`;
    const ctx = makeLiveCtx(cwd);

    const created = await findTool("huly_create_issue").execute(
      "e2e-assignee-create",
      { project, title, priority: "low" }, // no assignee → D15 default currentUser
      undefined,
      undefined,
      ctx,
    );
    const identifier = detail(created.details, "identifier") as string;
    expect(created.isError, `create failed: ${created.content[0]?.text}`).toBeUndefined();
    expect(identifier).toBeTruthy();

    try {
      const got = await findTool("huly_get_issue").execute(
        "e2e-assignee-get",
        { project, identifier },
        undefined,
        undefined,
        ctx,
      );
      expect(got.isError).toBeUndefined();
      const assigneeRef = detail(got.details, "assigneeRef");
      // T-95: Person._id (khi resolve được) HOẶC null (default-assignee fallback,
      // workspace user chưa có email Channel → unassigned). KHÔNG bao giờ raw
      // email string (bug cũ: assignee = currentUser.email).
      expect(
        assigneeRef === null || (typeof assigneeRef === "string" && !assigneeRef.includes("@")),
        `T-95: assignee phải là Person._id hoặc null, KHÔNG raw email. got=${String(assigneeRef)}`,
      ).toBe(true);
    } finally {
      await findTool("huly_delete_issue").execute(
        "e2e-assignee-delete",
        { project, identifier },
        undefined,
        undefined,
        ctx,
      );
    }
  });

  // T-93b (#139): tag-category workspace-scoped → space core:space:Workspace
  // (probe live confirm: 25 categories đều space này). create→list round-trip.
  it("tag-category round-trip: create → list visible (T-93b #139)", async () => {
    const ws = await resolveWorkspace(undefined, { cwd });
    const client = await getClient(ws);
    const existing = (await client.findAll(TAG_CATEGORY_CLASS, {}, {})) as Array<{
      _id: string;
      space?: string;
    }>;
    const spaces = [...new Set(existing.map((c) => String(c.space)))];
    expect(spaces, "workspace tag-categories phải ở core:space:Workspace").toContain(
      "core:space:Workspace",
    );

    const label = `e2e-t93b-${Date.now()}`;
    const ctx = makeLiveCtx(cwd);
    const created = await findTool("huly_create_tag_category").execute(
      "e2e-cat-create",
      { label },
      undefined,
      undefined,
      ctx,
    );
    expect(
      created.isError,
      `create_tag_category failed: ${created.content[0]?.text}`,
    ).toBeUndefined();

    const listed = await findTool("huly_list_tag_categories").execute(
      "e2e-cat-list",
      {},
      undefined,
      undefined,
      ctx,
    );
    expect(
      listed.content[0]?.text,
      "T-93b: create_tag_category phải visible trong list_tag_categories",
    ).toContain(label);
  });
});
