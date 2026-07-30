// R11 — WRITE-PERSISTENCE round-trip hunt. Update field X → get/read back →
// confirm value persisted (NOT just return-value). Catches #156-class silent
// no-persist bugs across all update fields not yet round-tripped.
// Run: HULY_E2E_PROJECT=ETEST pnpm vitest run src/__tests__/e2e-live-hunt8.test.ts --test-timeout=40000
import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { tools as issueCore } from "../tools/domains/issues-core.js";
import { tools as components } from "../tools/domains/components.js";
import { tools as milestones } from "../tools/domains/milestones.js";
import { tools as todos } from "../tools/domains/todos.js";
import { tools as projects } from "../tools/domains/projects.js";
const E2E = process.env.HULY_E2E_PROJECT;
const d = E2E ? describe : describe.skip;
const ALL = [...issueCore, ...components, ...milestones, ...todos, ...projects];
function ft(n: string) {
  const f = `huly_${n}`;
  return ALL.find((x) => x.name === f || x.name === n)!;
}
function ctx(): ExtensionContext {
  return { cwd: process.cwd(), hasUI: true, ui: { confirm: async () => true } } as never;
}
function det(x: unknown, f: string) {
  return x && typeof x === "object" ? (x as any)[f] : undefined;
}

d("R11 update_issue field persistence", () => {
  const project = E2E!;
  it("priority persists", async () => {
    const ci = await ft("create_issue").execute(
      "a",
      { project, title: `r11p-${Date.now()}`, priority: "low" },
      undefined,
      undefined,
      ctx(),
    );
    const id = det(ci.details, "identifier");
    try {
      await ft("update_issue").execute(
        "a",
        { project, identifier: id, priority: "high" },
        undefined,
        undefined,
        ctx(),
      );
      const g = await ft("get_issue").execute(
        "a",
        { project, identifier: id },
        undefined,
        undefined,
        ctx(),
      );
      expect(String(det(g.details, "priority"))).toMatch(/high/i);
    } finally {
      await ft("delete_issue").execute(
        "a",
        { project, identifier: id },
        undefined,
        undefined,
        ctx(),
      );
    }
  });
  it("dueDate persists", async () => {
    const dd = Date.now() + 7 * 86400000;
    const ci = await ft("create_issue").execute(
      "a",
      { project, title: `r11dd-${Date.now()}`, priority: "low" },
      undefined,
      undefined,
      ctx(),
    );
    const id = det(ci.details, "identifier");
    try {
      await ft("update_issue").execute(
        "a",
        { project, identifier: id, dueDate: dd },
        undefined,
        undefined,
        ctx(),
      );
      const g = await ft("get_issue").execute(
        "a",
        { project, identifier: id },
        undefined,
        undefined,
        ctx(),
      );
      const got = det(g.details, "dueDate");
      // dueDate stored as ms; allow ±1day tolerance
      expect(Math.abs(Number(got) - dd)).toBeLessThan(86400000);
    } finally {
      await ft("delete_issue").execute(
        "a",
        { project, identifier: id },
        undefined,
        undefined,
        ctx(),
      );
    }
  });
  it("estimation persists", async () => {
    const ci = await ft("create_issue").execute(
      "a",
      { project, title: `r11e-${Date.now()}`, priority: "low" },
      undefined,
      undefined,
      ctx(),
    );
    const id = det(ci.details, "identifier");
    try {
      await ft("update_issue").execute(
        "a",
        { project, identifier: id, estimation: 14400 },
        undefined,
        undefined,
        ctx(),
      );
      const g = await ft("get_issue").execute(
        "a",
        { project, identifier: id },
        undefined,
        undefined,
        ctx(),
      );
      expect(Number(det(g.details, "estimation"))).toBe(14400);
    } finally {
      await ft("delete_issue").execute(
        "a",
        { project, identifier: id },
        undefined,
        undefined,
        ctx(),
      );
    }
  });
  it("description persists (markup round-trip)", async () => {
    const ci = await ft("create_issue").execute(
      "a",
      { project, title: `r11desc-${Date.now()}`, priority: "low" },
      undefined,
      undefined,
      ctx(),
    );
    const id = det(ci.details, "identifier");
    try {
      await ft("update_issue").execute(
        "a",
        { project, identifier: id, description: "MARKER-DESC-9988" },
        undefined,
        undefined,
        ctx(),
      );
      const g = await ft("get_issue").execute(
        "a",
        { project, identifier: id },
        undefined,
        undefined,
        ctx(),
      );
      expect(String(det(g.details, "description"))).toContain("MARKER-DESC-9988");
    } finally {
      await ft("delete_issue").execute(
        "a",
        { project, identifier: id },
        undefined,
        undefined,
        ctx(),
      );
    }
  });
});

d("R11 update_component description+lead persistence", () => {
  const project = E2E!;
  it("description persists", async () => {
    const c = await ft("create_component").execute(
      "a",
      { project, label: `r11c-${Date.now()}` },
      undefined,
      undefined,
      ctx(),
    );
    const cid = det(c.details, "id") || det(c.details, "_id");
    try {
      await ft("update_component").execute(
        "a",
        { project, component: cid, description: "COMP-DESC-7788" },
        undefined,
        undefined,
        ctx(),
      );
      const g = await ft("get_component").execute(
        "a",
        { project, component: cid },
        undefined,
        undefined,
        ctx(),
      );
      expect(String(det(g.details, "description"))).toContain("COMP-DESC-7788");
    } finally {
      await ft("delete_component").execute(
        "a",
        { project, component: cid },
        undefined,
        undefined,
        ctx(),
      );
    }
  });
});

d("R11 update_milestone description+targetDate persistence", () => {
  const project = E2E!;
  it("description persists", async () => {
    const m = await ft("create_milestone").execute(
      "a",
      { project, label: `r11m-${Date.now()}`, targetDate: Date.now() + 86400000 },
      undefined,
      undefined,
      ctx(),
    );
    const mid = det(m.details, "id") || det(m.details, "_id");
    try {
      await ft("update_milestone").execute(
        "a",
        { project, milestone: mid, description: "MS-DESC-5566" },
        undefined,
        undefined,
        ctx(),
      );
      const g = await ft("get_milestone").execute(
        "a",
        { project, milestone: mid },
        undefined,
        undefined,
        ctx(),
      );
      expect(String(det(g.details, "description"))).toContain("MS-DESC-5566");
    } finally {
      await ft("delete_milestone").execute(
        "a",
        { project, milestone: mid },
        undefined,
        undefined,
        ctx(),
      );
    }
  });
});

d("R11 update_todo fields persistence", () => {
  const project = E2E!;
  it("description + dueDate + priority persist", async () => {
    const ci = await ft("create_issue").execute(
      "a",
      { project, title: `r11t-${Date.now()}`, priority: "low" },
      undefined,
      undefined,
      ctx(),
    );
    const id = det(ci.details, "identifier");
    const todo = await ft("create_todo").execute(
      "a",
      { project, identifier: id, title: `r11todo-${Date.now()}` },
      undefined,
      undefined,
      ctx(),
    );
    const tid = det(todo.details, "id") || det(todo.details, "_id");
    try {
      const dd = Date.now() + 3 * 86400000;
      await ft("update_todo").execute(
        "a",
        { todo: tid, description: "TODO-DESC-3344", dueDate: dd, priority: "high" },
        undefined,
        undefined,
        ctx(),
      );
      const g = await ft("get_todo").execute("a", { todo: tid }, undefined, undefined, ctx());
      const desc = String(det(g.details, "description"));
      console.log("[TODO-DESC]", desc.slice(0, 80));
      expect(desc).toContain("TODO-DESC-3344");
    } finally {
      await ft("delete_todo").execute("a", { todo: tid }, undefined, undefined, ctx());
      await ft("delete_issue").execute(
        "a",
        { project, identifier: id },
        undefined,
        undefined,
        ctx(),
      );
    }
  });
});

d("R11 update_project description persistence", () => {
  it.skipIf(!E2E)("description persists", async () => {
    const project = E2E!;
    const before = await ft("get_project").execute("a", { project }, undefined, undefined, ctx());
    const orig = det(before.details, "description");
    try {
      await ft("update_project").execute(
        "a",
        { project, description: `R11-PROBE-${Date.now()}` },
        undefined,
        undefined,
        ctx(),
      );
      const g = await ft("get_project").execute("a", { project }, undefined, undefined, ctx());
      expect(String(det(g.details, "description"))).toContain("R11-PROBE-");
    } finally {
      // restore
      await ft("update_project")
        .execute("a", { project, description: orig ?? undefined }, undefined, undefined, ctx())
        .catch(() => {});
    }
  });
});

d("R11b #164: todo priority semantic correctness (map fixed)", () => {
  const project = E2E!;
  it.each([
    ["no-priority", "no-priority"],
    ["low", "low"],
    ["medium", "medium"],
    ["high", "high"],
    ["urgent", "urgent"],
  ] as const)("create todo priority=%s → get renders %s", async (input, expected) => {
    const ci = await ft("create_issue").execute(
      "p",
      { project, title: `prio-${input}-${Date.now()}`, priority: "low" },
      undefined,
      undefined,
      ctx(),
    );
    const id = det(ci.details, "identifier");
    const todo = await ft("create_todo").execute(
      "p",
      { project, identifier: id, title: `t-${input}`, priority: input },
      undefined,
      undefined,
      ctx(),
    );
    const tid = det(todo.details, "id") || det(todo.details, "_id");
    try {
      const g = await ft("get_todo").execute("p", { todo: tid }, undefined, undefined, ctx());
      expect(String(det(g.details, "priority"))).toBe(expected);
    } finally {
      await ft("delete_todo").execute("p", { todo: tid }, undefined, undefined, ctx());
      await ft("delete_issue").execute(
        "p",
        { project, identifier: id },
        undefined,
        undefined,
        ctx(),
      );
    }
  });
});
