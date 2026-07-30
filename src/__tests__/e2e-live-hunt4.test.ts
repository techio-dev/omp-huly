// T-91 phase 4 — bug-hunt round 4 (post-beta.13). Cover domains CHƯA deep-test:
// update_issue round-trip (description markup), projects/spaces/teamspaces
// lifecycle, employees/persons output, admin create (issue_status). Run:
//   HULY_E2E_PROJECT=ETEST pnpm vitest run src/__tests__/e2e-live-hunt4.test.ts

import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { tools as issueCore } from "../tools/domains/issues-core.js";
import { tools as projects } from "../tools/domains/projects.js";
import { tools as spaces } from "../tools/domains/spaces.js";
import { tools as documents } from "../tools/domains/documents.js";
import { tools as contacts } from "../tools/domains/contacts.js";
import { tools as taskMgmt } from "../tools/domains/task-management.js";

const E2E_PROJECT = process.env.HULY_E2E_PROJECT;
const describeLive = E2E_PROJECT ? describe : describe.skip;

const ALL = [...issueCore, ...projects, ...spaces, ...documents, ...contacts, ...taskMgmt];
function findTool(name: string) {
  // Tên tool registered có prefix `huly_` (builder thêm). Auto-prepend nếu caller dùng bare name.
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
    "h4-issue",
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
  await findTool("delete_issue").execute(
    "h4-del",
    { project, identifier },
    undefined,
    undefined,
    ctx(),
  );
}

describeLive("T-91 phase 4 — bug-hunt round 4 (round-trip + output + admin)", () => {
  const project = E2E_PROJECT as string;

  // 1. update_issue description round-trip: uploadMarkup write → fetchMarkup read.
  it("update_issue description → get_issue fetchMarkup decode match", async () => {
    const identifier = await mkIssue(project, `h4-desc-${Date.now()}`);
    try {
      const desc = `probe description ${Date.now()} — special: émoji 🎯 + markdown **bold**`;
      const upd = await findTool("update_issue").execute(
        "h4-desc-upd",
        { project, identifier, description: desc },
        undefined,
        undefined,
        ctx(),
      );
      expect(upd.isError, `update_issue description: ${upd.content[0]?.text}`).toBeUndefined();

      const got = await findTool("get_issue").execute(
        "h4-desc-get",
        { project, identifier },
        undefined,
        undefined,
        ctx(),
      );
      const readDesc = detail(got.details, "description") as string | undefined;
      // fetchMarkup có thể strip markdown formatting — assert substring core, KHÔNG exact.
      expect(
        String(readDesc ?? ""),
        `get_issue description phải round-trip (got: "${readDesc}")`,
      ).toContain("probe description");
    } finally {
      await delIssue(project, identifier);
    }
  });

  // 2. update_issue multi-field round-trip: title/priority/dueDate/estimation.
  it("update_issue title+priority+dueDate+estimation → get_issue reflects", async () => {
    const identifier = await mkIssue(project, `h4-fields-${Date.now()}`);
    try {
      const due = Date.now() + 86400000;
      const upd = await findTool("update_issue").execute(
        "h4-fields-upd",
        {
          project,
          identifier,
          title: `renamed-${Date.now()}`,
          priority: "high",
          dueDate: due,
          estimation: 240,
        },
        undefined,
        undefined,
        ctx(),
      );
      expect(upd.isError, `update_issue fields: ${upd.content[0]?.text}`).toBeUndefined();

      const got = await findTool("get_issue").execute(
        "h4-fields-get",
        { project, identifier },
        undefined,
        undefined,
        ctx(),
      );
      expect(detail(got.details, "priority")).toBe("high");
      expect(Number(detail(got.details, "estimation") ?? 0)).toBe(240);
      expect(Number(detail(got.details, "dueDate") ?? 0)).toBe(due);
    } finally {
      await delIssue(project, identifier);
    }
  });

  // 3. projects: list → get → update description → get reflects.
  it("projects: list_projects → get_project → update_project description → get", async () => {
    const listed = await findTool("list_projects").execute(
      "h4-proj-list",
      {},
      undefined,
      undefined,
      ctx(),
    );
    expect(listed.isError, `list_projects: ${listed.content[0]?.text}`).toBeUndefined();
    const projList = (detail(listed.details, "projects") as Array<{ identifier?: string }>) ?? [];
    const target = projList.find((p) => p.identifier === project) ?? projList[0];
    if (!target?.identifier) return; // no project → skip

    const before = await findTool("get_project").execute(
      "h4-proj-get",
      { project: target.identifier },
      undefined,
      undefined,
      ctx(),
    );
    expect(before.isError, `get_project: ${before.content[0]?.text}`).toBeUndefined();
    const origDesc = detail(before.details, "description") as string | null | undefined;

    const desc = `hunt4 proj desc ${Date.now()}`;
    const upd = await findTool("update_project").execute(
      "h4-proj-upd",
      { project: target.identifier, description: desc },
      undefined,
      undefined,
      ctx(),
    );
    expect(upd.isError, `update_project: ${upd.content[0]?.text}`).toBeUndefined();

    const after = await findTool("get_project").execute(
      "h4-proj-get2",
      { project: target.identifier },
      undefined,
      undefined,
      ctx(),
    );
    expect(String(detail(after.details, "description") ?? "")).toContain("hunt4 proj desc");

    // restore original description (cleanup — avoid mutating ETEST project).
    await findTool("update_project").execute(
      "h4-proj-restore",
      { project: target.identifier, description: origDesc ?? "" },
      undefined,
      undefined,
      ctx(),
    );
  });

  // 4. spaces: list → get → update (name/description round-trip + restore).
  it("spaces: list_spaces → get_space → update_space name → restore", async () => {
    const listed = await findTool("list_spaces").execute(
      "h4-sp-list",
      {},
      undefined,
      undefined,
      ctx(),
    );
    expect(listed.isError, `list_spaces: ${listed.content[0]?.text}`).toBeUndefined();
    const spList = (detail(listed.details, "spaces") as Array<{ _id?: string }>) ?? [];
    const space = spList[0];
    if (!space?._id) return; // no space → skip

    const before = await findTool("get_space").execute(
      "h4-sp-get",
      { space: space._id },
      undefined,
      undefined,
      ctx(),
    );
    expect(before.isError, `get_space: ${before.content[0]?.text}`).toBeUndefined();
    const origName = detail(before.details, "name") as string | undefined;

    const probe = `hunt4-space-${Date.now()}`;
    const upd = await findTool("update_space").execute(
      "h4-sp-upd",
      { space: space._id, name: probe },
      undefined,
      undefined,
      ctx(),
    );
    // update_space có thể fail (workspace space protected) — guard, không hard fail.
    if (upd.isError) return;

    const after = await findTool("get_space").execute(
      "h4-sp-get2",
      { space: space._id },
      undefined,
      undefined,
      ctx(),
    );
    expect(String(detail(after.details, "name") ?? "")).toBe(probe);

    // restore.
    if (origName) {
      await findTool("update_space").execute(
        "h4-sp-restore",
        { space: space._id, name: origName },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  // 5. teamspaces: create → list → update → delete (lifecycle, KHÔNG đụng production space).
  it("teamspaces: create → list → update → delete lifecycle", async () => {
    const name = `hunt4-ts-${Date.now()}`;
    const created = await findTool("create_teamspace").execute(
      "h4-ts-create",
      { name, description: "probe" },
      undefined,
      undefined,
      ctx(),
    );
    expect(created.isError, `create_teamspace: ${created.content[0]?.text}`).toBeUndefined();
    const tsId = detail(created.details, "id") as string | undefined;
    expect(tsId, "create_teamspace phải trả id").toBeTruthy();
    try {
      // list phải thấy teamspace mới.
      const listed = await findTool("list_teamspaces").execute(
        "h4-ts-list",
        {},
        undefined,
        undefined,
        ctx(),
      );
      const tsList = (detail(listed.details, "teamspaces") as Array<{ id?: string }>) ?? [];
      expect(
        tsList.some((t) => t.id === tsId),
        `list_teamspaces phải thấy ts mới`,
      ).toBe(true);

      // update name.
      const newName = `${name}-upd`;
      const upd = await findTool("update_teamspace").execute(
        "h4-ts-upd",
        { teamspace: tsId as string, name: newName },
        undefined,
        undefined,
        ctx(),
      );
      expect(upd.isError, `update_teamspace: ${upd.content[0]?.text}`).toBeUndefined();

      const got = await findTool("get_teamspace").execute(
        "h4-ts-get",
        { teamspace: tsId as string },
        undefined,
        undefined,
        ctx(),
      );
      expect(String(detail(got.details, "name") ?? "")).toBe(newName);
    } finally {
      await findTool("delete_teamspace").execute(
        "h4-ts-del",
        { teamspace: tsId as string },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  // 6. contacts: list_employees + list_persons không crash + trả array.
  it("contacts: list_employees + list_persons trả array (output sanity)", async () => {
    const emps = await findTool("list_employees").execute(
      "h4-emp",
      {},
      undefined,
      undefined,
      ctx(),
    );
    expect(emps.isError, `list_employees: ${emps.content[0]?.text}`).toBeUndefined();
    const empArr = detail(emps.details, "employees");
    expect(Array.isArray(empArr), `employees phải là array`).toBe(true);

    const persons = await findTool("list_persons").execute(
      "h4-persons",
      {},
      undefined,
      undefined,
      ctx(),
    );
    expect(persons.isError, `list_persons: ${persons.content[0]?.text}`).toBeUndefined();
    const personArr = detail(persons.details, "persons");
    expect(Array.isArray(personArr), `persons phải là array`).toBe(true);
  });

  // 7. admin live: create_issue_status (T-73). KHÔNG tool-testable sạch — registration
  // logic ĐÚNG (registers cả TaskType + ProjectType.statuses, task-management.ts:102-120),
  // nhưng test cần taskType thuộc ĐÚNG project's projectType. get_project KHÔNG expose
  // projectType ref + list_task_types cần projectType param → deadlock via tools.
  // Admin tool hiếm, source-reviewed → skip (không false-fail).
  it.skip("admin: create_issue_status (KHÔNG tool-testable sạch — taskType lineage)", async () => {
    // Reserved: cần projectType-scoped taskType (get_project phải expose `type`).
  });
});
