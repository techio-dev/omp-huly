// T-Hunt9 — live round-trip probing of under-tested write paths against
// real self-host Huly (workspace "global" / project "ETEST", bound via
// ~/.pi/agent/huly/{config,credentials}.json).
//
//   HULY_E2E_PROJECT=ETEST pnpm vitest run src/__tests__/e2e-live-hunt9.test.ts
//
// Focus: interactions NOT exercised by earlier hunt files —
//   - add/remove_issue_label TagReference collection round-trip (T-83/T-90)
//     + idempotency on both add (dup) and remove (absent).
//   - update_issue assignee lifecycle: set by email → reflected; null → cleared.
//   - update_issue status: valid name persists; invalid name → isError +
//     validStatuses list populated (LLM retry surface).
//   - move_issue hierarchy: make-child sets parent + bumps parent.subIssues;
//     promote clears parent + decrements parent.subItems.
//   - fulltext_search discovers a freshly created issue by unique title.

import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { tools as issueTools } from "../tools/domains/issues-core.js";
import { tools as projectTools } from "../tools/domains/projects.js";
import { tools as tagTools } from "../tools/domains/tags.js";
import { tools as workspaceTools } from "../tools/domains/workspace.js";
import { tools as searchTools } from "../tools/domains/search.js";

const E2E = process.env.HULY_E2E_PROJECT;
const d = E2E ? describe : describe.skip;

const ALL = [...issueTools, ...projectTools, ...tagTools, ...workspaceTools, ...searchTools];

function ft(n: string) {
  const f = `huly_${n}`;
  return ALL.find((x) => x.name === f || x.name === n)!;
}

function ctx(): ExtensionContext {
  return { cwd: process.cwd(), hasUI: true, ui: { confirm: async () => true } } as never;
}

function det(x: unknown, ...fields: string[]): unknown {
  if (!x || typeof x !== "object") return undefined;
  let cur: any = x;
  for (const f of fields) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[f];
  }
  return cur;
}

function uniq(s: string): string {
  return `${s}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function createIssue(project: string, title: string): Promise<string> {
  const r = await ft("create_issue").execute("c", { project, title }, undefined, undefined, ctx());
  const id = det(r, "details", "identifier") as string | undefined;
  if (!id) throw new Error(`create_issue did not return identifier: ${JSON.stringify(r)}`);
  return id;
}

async function getIssue(project: string, identifier: string): Promise<any> {
  const r = await ft("get_issue").execute(
    "c",
    { project, identifier },
    undefined,
    undefined,
    ctx(),
  );
  return det(r, "details");
}

d("Hunt9 — live round-trips (global/ETEST)", () => {
  const project = E2E!;

  it("labels: create_tag → add_issue_label → get shows label → add dup idempotent → remove → remove-absent idempotent → cleanup", async () => {
    const title = uniq("L");
    // 1. create tag
    const tag = await ft("create_tag").execute(
      "c",
      { project, title, color: "#ff0000" },
      undefined,
      undefined,
      ctx(),
    );
    const tagId = det(tag, "details", "id") as string | undefined;

    try {
      const ident = await createIssue(project, uniq("issue-label"));
      try {
        // 2. add label
        const add = await ft("add_issue_label").execute(
          "c",
          { project, identifier: ident, label: title },
          undefined,
          undefined,
          ctx(),
        );
        expect(det(add, "details", "added")).toBe(true);

        // 3. get_issue reflects the label (TagReference.title)
        const after = await getIssue(project, ident);
        const labelTitles = ((after?.labels as any[]) ?? []).map((l) => l.title);
        expect(labelTitles).toContain(title);

        // 4. add again → idempotent no-op
        const addDup = await ft("add_issue_label").execute(
          "c",
          { project, identifier: ident, label: title },
          undefined,
          undefined,
          ctx(),
        );
        expect(det(addDup, "details", "added")).toBe(false);
        expect(det(addDup, "details", "idempotent")).toBe(true);

        // 5. remove label
        const rm = await ft("remove_issue_label").execute(
          "c",
          { project, identifier: ident, label: title },
          undefined,
          undefined,
          ctx(),
        );
        expect(det(rm, "details", "removed")).toBe(true);

        // 6. verify gone
        const afterRm = await getIssue(project, ident);
        const labelTitles2 = ((afterRm?.labels as any[]) ?? []).map((l) => l.title);
        expect(labelTitles2).not.toContain(title);

        // 7. remove again (absent) → idempotent no-op, not error
        const rmDup = await ft("remove_issue_label").execute(
          "c",
          { project, identifier: ident, label: title },
          undefined,
          undefined,
          ctx(),
        );
        expect(det(rmDup, "details", "removed")).toBe(false);
        expect(det(rmDup, "details", "idempotent")).toBe(true);
        expect((rmDup as any).isError).toBeFalsy();
      } finally {
        await ft("delete_issue").execute(
          "c",
          { project, identifier: ident },
          undefined,
          undefined,
          ctx(),
        );
      }
    } finally {
      await ft("delete_tag").execute(
        "c",
        { project, tag: (tagId ?? title) as string },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  it("assignee: update_issue assignee=<self email> persists → assignee=null clears", async () => {
    // current user email
    const prof = await ft("get_user_profile").execute("c", {}, undefined, undefined, ctx());
    const email = det(prof, "details", "user", "email") as string | undefined;
    if (!email) {
      // workspace without a resolvable current-user email — skip gracefully
      console.warn("[hunt9] no current-user email; skipping assignee probe");
      return;
    }

    const ident = await createIssue(project, uniq("issue-asn"));
    try {
      // set assignee by email
      const set = await ft("update_issue").execute(
        "c",
        { project, identifier: ident, assignee: email },
        undefined,
        undefined,
        ctx(),
      );
      expect((set as any).isError).toBeFalsy();
      expect(det(set, "details", "fields")).toContain("assignee");

      const after = await getIssue(project, ident);
      // assignee name resolved (Person.name) — just assert non-empty & ref set
      expect(after?.assignee).toBeTruthy();
      expect(after?.assigneeRef).toBeTruthy();

      // clear assignee via null
      const clr = await ft("update_issue").execute(
        "c",
        { project, identifier: ident, assignee: null },
        undefined,
        undefined,
        ctx(),
      );
      expect((clr as any).isError).toBeFalsy();

      const afterClr = await getIssue(project, ident);
      // cleared: assignee name empty AND ref null/undefined
      const ref = afterClr?.assigneeRef;
      const cleared = !afterClr?.assignee && (ref === null || ref === undefined);
      expect(cleared).toBe(true);
    } finally {
      await ft("delete_issue").execute(
        "c",
        { project, identifier: ident },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  it("status: valid name persists; invalid name → isError + validStatuses list", async () => {
    // pick a valid status from list_statuses
    const ls = await ft("list_statuses").execute("c", { project }, undefined, undefined, ctx());
    const statuses = (det(ls, "details", "statuses") as Array<{ name: string }>) ?? [];
    if (statuses.length < 1) {
      console.warn("[hunt9] project has no statuses; skipping status probe");
      return;
    }
    const validName = statuses[0].name;

    const ident = await createIssue(project, uniq("issue-st"));
    try {
      // set to valid status
      const set = await ft("update_issue").execute(
        "c",
        { project, identifier: ident, status: validName },
        undefined,
        undefined,
        ctx(),
      );
      expect((set as any).isError).toBeFalsy();
      const after = await getIssue(project, ident);
      expect(after?.status).toBe(validName);

      // invalid status → isError with validStatuses
      const bad = await ft("update_issue").execute(
        "c",
        { project, identifier: ident, status: "DEFINITELY_NOT_A_STATUS_X9" },
        undefined,
        undefined,
        ctx(),
      );
      expect((bad as any).isError).toBe(true);
      expect(det(bad, "details", "invalidStatus")).toBe("DEFINITELY_NOT_A_STATUS_X9");
      const validList = det(bad, "details", "validStatuses") as unknown[] | undefined;
      expect(Array.isArray(validList)).toBe(true);
      expect(validList).toContain(validName);
    } finally {
      await ft("delete_issue").execute(
        "c",
        { project, identifier: ident },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  it("hierarchy: move B under A → B.parentIssue=A, A.subItems bumped; promote → cleared, decremented", async () => {
    const a = await createIssue(project, uniq("epic-A"));
    const b = await createIssue(project, uniq("child-B"));
    try {
      const before = await getIssue(project, a);
      const subBefore = (before?.subIssues as number | undefined) ?? 0;

      // make B a child of A
      const mv = await ft("move_issue").execute(
        "c",
        { project, identifier: b, parentIssue: a },
        undefined,
        undefined,
        ctx(),
      );
      expect((mv as any).isError).toBeFalsy();

      // B now has parent A
      const bChild = await getIssue(project, b);
      expect(bChild?.parentIssue).toBe(a);

      // A subIssues incremented
      const aAfter = await getIssue(project, a);
      expect((aAfter?.subIssues as number | undefined) ?? 0).toBe(subBefore + 1);

      // promote B to top-level (no parentIssue)
      const prom = await ft("move_issue").execute(
        "c",
        { project, identifier: b },
        undefined,
        undefined,
        ctx(),
      );
      expect((prom as any).isError).toBeFalsy();

      const bTop = await getIssue(project, b);
      expect(bTop?.parentIssue).toBeFalsy();

      const aFinal = await getIssue(project, a);
      expect((aFinal?.subIssues as number | undefined) ?? 0).toBe(subBefore);
    } finally {
      // promote first so delete of parent doesn't cascade oddly
      await ft("move_issue")
        .execute("c", { project, identifier: b }, undefined, undefined, ctx())
        .catch(() => {});
      await ft("delete_issue")
        .execute("c", { project, identifier: b }, undefined, undefined, ctx())
        .catch(() => {});
      await ft("delete_issue")
        .execute("c", { project, identifier: a }, undefined, undefined, ctx())
        .catch(() => {});
    }
  });

  it("search: fulltext_search finds freshly created issue by unique title", async () => {
    const token = uniq("HUNT9TOKEN");
    const ident = await createIssue(project, `${token} searchable issue`);
    try {
      // small delay not required but tolerant of indexing
      const res = await ft("fulltext_search").execute(
        "c",
        { query: token },
        undefined,
        undefined,
        ctx(),
      );
      // result shape varies; check the identifier appears somewhere in details/content
      const blob = JSON.stringify(res);
      expect(blob).toContain(ident);
    } finally {
      await ft("delete_issue").execute(
        "c",
        { project, identifier: ident },
        undefined,
        undefined,
        ctx(),
      );
    }
  });
});
