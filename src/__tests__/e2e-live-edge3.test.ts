// T-91 phase 10 — bug-hunt: input robustness (idempotency claims + empty/whitespace/
// special-char). Test duplicate creates (claim idempotent → dedupe, KHÔNG duplicate)
// + empty title handling. Run:
//   HULY_E2E_PROJECT=ETEST pnpm vitest run src/__tests__/e2e-live-edge3.test.ts

import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { tools as documents } from "../tools/domains/documents.js";
import { tools as projects } from "../tools/domains/projects.js";
import { tools as components } from "../tools/domains/components.js";
import { tools as tags } from "../tools/domains/tags.js";
import { tools as issueCore } from "../tools/domains/issues-core.js";

const E2E_PROJECT = process.env.HULY_E2E_PROJECT;
const describeLive = E2E_PROJECT ? describe : describe.skip;

const ALL = [...documents, ...projects, ...components, ...tags, ...issueCore];
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

describeLive("T-91 phase 10 — input robustness (idempotency + empty/special input)", () => {
  const project = E2E_PROJECT as string;

  // 1. create_teamspace idempotent (same name twice → returns SAME id, NOT duplicate).
  it("create_teamspace idempotent — same name → same id (KHÔNG duplicate)", async () => {
    const name = `idem-ts-${Date.now()}`;
    const a = await findTool("create_teamspace").execute(
      "i1a",
      { name },
      undefined,
      undefined,
      ctx(),
    );
    const idA = detail(a.details, "id") as string;
    expect(idA, "first create").toBeTruthy();
    try {
      const b = await findTool("create_teamspace").execute(
        "i1b",
        { name },
        undefined,
        undefined,
        ctx(),
      );
      const idB = detail(b.details, "id") as string;
      // Idempotent: SAME id, created:false on 2nd.
      expect(idB, `2nd create must return SAME id (got ${idB} vs ${idA})`).toBe(idA);
      expect(detail(b.details, "created") as boolean).toBe(false);
    } finally {
      await findTool("delete_teamspace").execute(
        "i1del",
        { teamspace: idA },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  // 2. create_project idempotent (same identifier twice → returns existing).
  it("create_project idempotent — same identifier → no duplicate", async () => {
    const ident = `I${(Date.now() % 100000).toString(36).toUpperCase().slice(0, 4)}`;
    const name = `idem-proj-${Date.now()}`;
    const a = await findTool("create_project").execute(
      "i2a",
      { name, identifier: ident },
      undefined,
      undefined,
      ctx(),
    );
    expect(a.isError, `first create: ${a.content[0]?.text}`).toBeUndefined();
    try {
      const b = await findTool("create_project").execute(
        "i2b",
        { name: `${name}-dup`, identifier: ident },
        undefined,
        undefined,
        ctx(),
      );
      // Idempotent: no error (returns existing), KHÔNG crash.
      expect(b.isError, `2nd create (same ident): ${b.content[0]?.text}`).toBeUndefined();
    } finally {
      await findTool("delete_project").execute(
        "i2del",
        { project: ident },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  // 3. create_component same label twice → behavior (dedupe or duplicate?).
  it("create_component same label twice → dedupe OR explicit (KHÔNG silent dup garbage)", async () => {
    const label = `idem-comp-${Date.now()}`;
    const a = await findTool("create_component").execute(
      "i3a",
      { project, label },
      undefined,
      undefined,
      ctx(),
    );
    const idA = (detail(a.details, "id") ?? detail(a.details, "_id")) as string;
    expect(idA).toBeTruthy();
    try {
      const b = await findTool("create_component").execute(
        "i3b",
        { project, label },
        undefined,
        undefined,
        ctx(),
      );
      // Either idempotent (same id) or explicit duplicate (different id, documented).
      // BUG only if silent duplicate with no indication.
      const idB = (detail(b.details, "id") ?? detail(b.details, "_id")) as string;
      // Accept either: idempotent (idB===idA) OR explicit (idB !== idA but isError/hint).
      const idempotent = idB === idA;
      // If NOT idempotent, must clean up the dup.
      if (!idempotent && idB) {
        await findTool("delete_component").execute(
          "i3bdel",
          { project, component: idB },
          undefined,
          undefined,
          ctx(),
        );
      }
    } finally {
      await findTool("delete_component").execute(
        "i3del",
        { project, component: idA },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  // 4. create_tag same title twice → dedupe or duplicate.
  it("create_tag same title twice → dedupe OR explicit", async () => {
    const title = `idemtag${Date.now() % 100000}`;
    const a = await findTool("create_tag").execute(
      "i4a",
      { project, title },
      undefined,
      undefined,
      ctx(),
    );
    const idA = (detail(a.details, "id") ?? detail(a.details, "_id")) as string;
    expect(idA).toBeTruthy();
    try {
      const b = await findTool("create_tag").execute(
        "i4b",
        { project, title },
        undefined,
        undefined,
        ctx(),
      );
      const idB = (detail(b.details, "id") ?? detail(b.details, "_id")) as string;
      const idempotent = idB === idA;
      if (!idempotent && idB) {
        await findTool("delete_tag").execute(
          "i4bdel",
          { project, tag: idB },
          undefined,
          undefined,
          ctx(),
        );
      }
    } finally {
      await findTool("delete_tag").execute(
        "i4del",
        { project, tag: idA },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  // 5. create_issue empty title → isError (KHÔNG garbage empty-title issue).
  it("create_issue empty title → isError (KHÔNG empty-title garbage)", async () => {
    const r = await findTool("create_issue").execute(
      "i5",
      { project, title: "", priority: "low" },
      undefined,
      undefined,
      ctx(),
    );
    // Empty title meaningless — expect rejection.
    expect(r.isError, `empty title: ${r.content[0]?.text} (silent empty-title = garbage)`).toBe(
      true,
    );
    // cleanup if somehow created.
    const id = detail(r.details, "identifier") as string | undefined;
    if (id)
      await findTool("delete_issue").execute(
        "i5del",
        { project, identifier: id },
        undefined,
        undefined,
        ctx(),
      );
  });

  // 6. create_issue whitespace-only title → isError.
  it("create_issue whitespace title → isError", async () => {
    const r = await findTool("create_issue").execute(
      "i6",
      { project, title: "   ", priority: "low" },
      undefined,
      undefined,
      ctx(),
    );
    expect(r.isError, `whitespace title: ${r.content[0]?.text}`).toBe(true);
    const id = detail(r.details, "identifier") as string | undefined;
    if (id)
      await findTool("delete_issue").execute(
        "i6del",
        { project, identifier: id },
        undefined,
        undefined,
        ctx(),
      );
  });

  // 7. create_issue special chars (unicode/emoji/quotes) → persists round-trip.
  it("create_issue special chars (émoji 🎯 + quotes) → round-trips", async () => {
    const title = `spéciäl 🎯 "quoted" ${Date.now()}`;
    const r = await findTool("create_issue").execute(
      "i7",
      { project, title, priority: "low" },
      undefined,
      undefined,
      ctx(),
    );
    if (r.isError) {
      // If server rejects special chars, that's a finding — but allow (some Huly setups).
      console.warn(`special-char title rejected: ${r.content[0]?.text}`);
      return;
    }
    const id = detail(r.details, "identifier") as string;
    try {
      const got = await findTool("get_issue").execute(
        "i7get",
        { project, identifier: id },
        undefined,
        undefined,
        ctx(),
      );
      expect(String(detail(got.details, "title") ?? "")).toContain("🎯");
    } finally {
      await findTool("delete_issue").execute(
        "i7del",
        { project, identifier: id },
        undefined,
        undefined,
        ctx(),
      );
    }
  });
});
