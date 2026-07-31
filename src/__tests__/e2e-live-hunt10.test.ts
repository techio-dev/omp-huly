// T-Hunt10 — tiếp tục live bug hunt trên workspace "global"/"ETEST".
//
//   HULY_E2E_PROJECT=ETEST pnpm vitest run src/__tests__/e2e-live-hunt10.test.ts
//
// Findings:
//   ✅ FIXED (Bug #2, interop): edit_document từng crash dưới vitest với
//      `TypeError: makeCollabId is not a function`. Root cause: @hcengineering/core
//      là CJS, default import ra undefined dưới vitest (OK ở plain Node/dist).
//      Fix: client.ts dùng createRequire cho core. makeCollabId giờ resolve.
//      Production (dist) KHÔNG bị — chỉ vitest env bị.
//   ✅ Bug #2b = KHÔNG phải production bug. edit_document persist đúng
//      (content-replace + search-replace đều verified qua body text). Vấn đề
//      trước đây là TEST đọc sai field: get_document đặt body trong top-level
//      content[0].text (sau "---"), KHÔNG trong details.content. + timeout 5s
//      quá chặt cho collaborator latency (thường 1-2s, thỉnh thoảng >5s). Fix:
//      helper bodyText() + timeout 30s.
//   ✅ Guards validate TRƯỚC saveContent đúng: not-found → isError,
//      multi-match-without-replace_all → isError.
//   ✅ list_issues titleSearch: substring match đúng, không leak.
//   🐛 assign-by-email breadth (hunt9 Bug #1): list_issues assignee filter +
//      create_component lead đều isError trên self-email (cùng resolver
//      findPersonByEmailOrName). create_todo KHÔNG dùng resolver (hardcode
//      currentUser.id) nên không bị — breadth hẹp hơn dự đoán.

import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { tools as issueTools } from "../tools/domains/issues-core.js";
import { tools as projectTools } from "../tools/domains/projects.js";
import { tools as workspaceTools } from "../tools/domains/workspace.js";
import { tools as docTools } from "../tools/domains/documents.js";
import { tools as compTools } from "../tools/domains/components.js";

const E2E = process.env.HULY_E2E_PROJECT;
const d = E2E ? describe : describe.skip;

const ALL = [...issueTools, ...projectTools, ...workspaceTools, ...docTools, ...compTools];

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

// get_document đặt body markdown trong top-level content[0].text sau separator "---",
// KHÔNG trong details (details chỉ có id/title/teamspace/createdOn).
function bodyText(r: unknown): string {
  const arr = (r as any)?.content;
  const t = Array.isArray(arr) ? String(arr[0]?.text ?? "") : String((arr as any) ?? "");
  const i = t.indexOf("---");
  return i >= 0 ? t.slice(i + 3).trim() : t;
}

async function tsId(): Promise<string | undefined> {
  const ts = await ft("create_teamspace").execute(
    "c",
    { name: uniq("TS") },
    undefined,
    undefined,
    ctx(),
  );
  if ((ts as any).isError) return undefined;
  return det(ts, "details", "id") as string | undefined;
}

async function docId(tsIdv: string, content: string): Promise<string> {
  const doc = await ft("create_document").execute(
    "c",
    { teamspace: tsIdv, title: uniq("doc"), content },
    undefined,
    undefined,
    ctx(),
  );
  const id = det(doc, "details", "id") as string | undefined;
  if (!id) throw new Error(`create_document no id: ${JSON.stringify(doc)}`);
  return id;
}

d("Hunt10 — edit_document guards + list_issues titleSearch + assign-email breadth", () => {
  const project = E2E!;

  it("edit_document content-replace persists (read body text)", async () => {
    const ts = await tsId();
    if (!ts) return;
    try {
      const id = await docId(ts, "seedCONTENT");
      try {
        const r = await ft("edit_document").execute(
          "c",
          { document: id, content: "NEW_BODY_77" },
          undefined,
          undefined,
          ctx(),
        );
        expect((r as any).isError).toBeFalsy();
        const g = await ft("get_document").execute(
          "c",
          { document: id },
          undefined,
          undefined,
          ctx(),
        );
        const body = bodyText(g);
        expect(body).toContain("NEW_BODY_77");
        expect(body).not.toContain("seedCONTENT");
      } finally {
        await ft("delete_document").execute("c", { document: id }, undefined, undefined, ctx());
      }
    } finally {
      await ft("delete_teamspace").execute("c", { teamspace: ts }, undefined, undefined, ctx());
    }
  }, 30000);

  it("edit_document search-replace persists + reflects on get", async () => {
    const ts = await tsId();
    if (!ts) return;
    try {
      const needle = uniq("NDL");
      const id = await docId(ts, `a ${needle} b`);
      try {
        const r = await ft("edit_document").execute(
          "c",
          { document: id, old_text: needle, new_text: "REPLACED_X", replace_all: true },
          undefined,
          undefined,
          ctx(),
        );
        expect((r as any).isError).toBeFalsy();
        const g = await ft("get_document").execute(
          "c",
          { document: id },
          undefined,
          undefined,
          ctx(),
        );
        const body = bodyText(g);
        expect(body).toContain("REPLACED_X");
        expect(body).not.toContain(needle);
      } finally {
        await ft("delete_document").execute("c", { document: id }, undefined, undefined, ctx());
      }
    } finally {
      await ft("delete_teamspace").execute("c", { teamspace: ts }, undefined, undefined, ctx());
    }
  }, 30000);

  it("edit_document guards (pre-saveContent): not-found → isError; multi-match w/o replace_all → isError", async () => {
    const ts = await tsId();
    if (!ts) {
      console.warn("[hunt10] create_teamspace unavailable; skipping guard probe");
      return;
    }
    try {
      const t2 = uniq("DUP");
      const id = await docId(ts, `${t2} ${t2}`);
      try {
        // not-found → isError (returns BEFORE saveContent → no makeCollabId crash)
        const nf = await ft("edit_document").execute(
          "c",
          { document: id, old_text: "ZZZ_NO_SUCH_TEXT_ZZZ", new_text: "x" },
          undefined,
          undefined,
          ctx(),
        );
        expect((nf as any).isError).toBe(true);

        // multi-match without replace_all → isError (returns BEFORE saveContent)
        const mm = await ft("edit_document").execute(
          "c",
          { document: id, old_text: t2, new_text: "ONCE" },
          undefined,
          undefined,
          ctx(),
        );
        expect((mm as any).isError).toBe(true);
        expect(det(mm, "details", "matches")).toBe(2);
      } finally {
        await ft("delete_document").execute("c", { document: id }, undefined, undefined, ctx());
      }
    } finally {
      await ft("delete_teamspace").execute("c", { teamspace: ts }, undefined, undefined, ctx());
    }
  });

  it("list_issues titleSearch: substring match returns the issue; nonsense misses", async () => {
    const token = uniq("TITLETOKEN");
    const created = await ft("create_issue").execute(
      "c",
      { project, title: `${token} unique` },
      undefined,
      undefined,
      ctx(),
    );
    const ident = det(created, "details", "identifier") as string;
    if (!ident) throw new Error(`create_issue no identifier: ${JSON.stringify(created)}`);
    try {
      const hit = await ft("list_issues").execute(
        "c",
        { project, titleSearch: token },
        undefined,
        undefined,
        ctx(),
      );
      const ids = ((det(hit, "details", "issues") as any[]) ?? []).map((i) => i.identifier);
      expect(ids).toContain(ident);

      const miss = await ft("list_issues").execute(
        "c",
        { project, titleSearch: `${token}NOPE` },
        undefined,
        undefined,
        ctx(),
      );
      const ids2 = ((det(miss, "details", "issues") as any[]) ?? []).map((i) => i.identifier);
      expect(ids2).not.toContain(ident);
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

  it("assign-by-email FIXED: list_issues assignee(self) resolves + create_component lead(self) persists", async () => {
    const prof = await ft("get_user_profile").execute("c", {}, undefined, undefined, ctx());
    const email = det(prof, "details", "user", "email") as string | undefined;
    if (!email) {
      console.warn("[hunt10] no current-user email; skipping breadth probe");
      return;
    }

    // 1. list_issues assignee filter by self-email → resolves (KHÔNG còn isError).
    const li = await ft("list_issues").execute(
      "c",
      { project, assignee: email },
      undefined,
      undefined,
      ctx(),
    );
    expect((li as any).isError).toBeFalsy();
    expect(Array.isArray(det(li, "details", "issues"))).toBe(true);

    // 2. create_component lead=self-email → resolves (KHÔNG còn isError).
    const cc = await ft("create_component").execute(
      "c",
      { project, label: uniq("comp-lead"), lead: email },
      undefined,
      undefined,
      ctx(),
    );
    expect((cc as any).isError).toBeFalsy();
    const compId = det(cc, "details", "id") as string | undefined;
    try {
      // verify lead persisted (get_component.lead resolved → Person name)
      const g = await ft("get_component").execute(
        "c",
        { project, component: compId! },
        undefined,
        undefined,
        ctx(),
      );
      expect(det(g, "details", "leadRef")).toBeTruthy();
    } finally {
      if (compId)
        await ft("delete_component").execute(
          "c",
          { project, component: compId },
          undefined,
          undefined,
          ctx(),
        );
    }

    // NOTE: create_todo KHÔNG test — không có param `owner` (hardcode
    // currentUser.id qua D15), không đi qua resolver. Resolver fix scope:
    // self-email (input === currentUser.email) → Person.personUuid.
    // Arbitrary teammate email vẫn cần Channel data (self-host thường thiếu →
    // documented limitation, KHÔNG fix được qua API available).
  });
});
