// T-91 phase 10b — UPDATE empty-input guards (#161, systemic #159/#160 class for
// update tools). update_issue/component/milestone/todo/template/tag with empty
// title/label → isError (KHÔNG garbage empty rename). Run:
//   HULY_E2E_PROJECT=ETEST pnpm vitest run src/__tests__/e2e-live-edge4.test.ts

import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { tools as issueCore } from "../tools/domains/issues-core.js";
import { tools as components } from "../tools/domains/components.js";
import { tools as milestones } from "../tools/domains/milestones.js";
import { tools as todos } from "../tools/domains/todos.js";
import { tools as templates } from "../tools/domains/issues-templates.js";
import { tools as tags } from "../tools/domains/tags.js";

const E2E_PROJECT = process.env.HULY_E2E_PROJECT;
const describeLive = E2E_PROJECT ? describe : describe.skip;

const ALL = [...issueCore, ...components, ...milestones, ...todos, ...templates, ...tags];
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

describeLive("T-91 phase 10b — update tools reject empty title/label (#161)", () => {
  const project = E2E_PROJECT as string;

  it("update_issue empty title → isError", async () => {
    const ci = await findTool("create_issue").execute(
      "u1",
      { project, title: `u1-${Date.now()}`, priority: "low" },
      undefined,
      undefined,
      ctx(),
    );
    const id = detail(ci.details, "identifier") as string;
    try {
      const r = await findTool("update_issue").execute(
        "u1",
        { project, identifier: id, title: "" },
        undefined,
        undefined,
        ctx(),
      );
      expect(r.isError, `update_issue empty: ${r.content[0]?.text}`).toBe(true);
    } finally {
      await findTool("delete_issue").execute(
        "u1del",
        { project, identifier: id },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  it("update_component empty label → isError", async () => {
    const c = await findTool("create_component").execute(
      "u2",
      { project, label: `u2-${Date.now()}` },
      undefined,
      undefined,
      ctx(),
    );
    const cid = (detail(c.details, "id") ?? detail(c.details, "_id")) as string;
    try {
      const r = await findTool("update_component").execute(
        "u2",
        { project, component: cid, label: "" },
        undefined,
        undefined,
        ctx(),
      );
      expect(r.isError, `update_component empty: ${r.content[0]?.text}`).toBe(true);
    } finally {
      await findTool("delete_component").execute(
        "u2del",
        { project, component: cid },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  it("update_milestone empty label → isError", async () => {
    const m = await findTool("create_milestone").execute(
      "u3",
      { project, label: `u3-${Date.now()}`, targetDate: Date.now() + 86400000 },
      undefined,
      undefined,
      ctx(),
    );
    const mid = (detail(m.details, "id") ?? detail(m.details, "_id")) as string;
    try {
      const r = await findTool("update_milestone").execute(
        "u3",
        { project, milestone: mid, label: "" },
        undefined,
        undefined,
        ctx(),
      );
      expect(r.isError, `update_milestone empty: ${r.content[0]?.text}`).toBe(true);
    } finally {
      await findTool("delete_milestone").execute(
        "u3del",
        { project, milestone: mid },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  it("update_todo empty title → isError", async () => {
    const ci = await findTool("create_issue").execute(
      "u4ci",
      { project, title: `u4-${Date.now()}`, priority: "low" },
      undefined,
      undefined,
      ctx(),
    );
    const id = detail(ci.details, "identifier") as string;
    const todo = await findTool("create_todo").execute(
      "u4t",
      { project, identifier: id, title: `u4t-${Date.now()}` },
      undefined,
      undefined,
      ctx(),
    );
    const tid = (detail(todo.details, "id") ?? detail(todo.details, "_id")) as string;
    try {
      const r = await findTool("update_todo").execute(
        "u4",
        { todo: tid, title: "" },
        undefined,
        undefined,
        ctx(),
      );
      expect(r.isError, `update_todo empty: ${r.content[0]?.text}`).toBe(true);
    } finally {
      await findTool("delete_todo").execute("u4tdel", { todo: tid }, undefined, undefined, ctx());
      await findTool("delete_issue").execute(
        "u4del",
        { project, identifier: id },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  it("update_template empty title → isError", async () => {
    const tpl = await findTool("create_template").execute(
      "u5",
      { project, title: `u5-${Date.now()}` },
      undefined,
      undefined,
      ctx(),
    );
    const tplId = (detail(tpl.details, "id") ?? detail(tpl.details, "_id")) as string;
    try {
      const r = await findTool("update_template").execute(
        "u5",
        { project, template: tplId, title: "" },
        undefined,
        undefined,
        ctx(),
      );
      expect(r.isError, `update_template empty: ${r.content[0]?.text}`).toBe(true);
    } finally {
      await findTool("delete_template").execute(
        "u5del",
        { project, template: tplId },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  it("update_tag empty title → isError", async () => {
    const tag = await findTool("create_tag").execute(
      "u6",
      { project, title: `u6tag${Date.now() % 100000}` },
      undefined,
      undefined,
      ctx(),
    );
    const tid = (detail(tag.details, "id") ?? detail(tag.details, "_id")) as string;
    try {
      const r = await findTool("update_tag").execute(
        "u6",
        { project, tag: tid, title: "" },
        undefined,
        undefined,
        ctx(),
      );
      expect(r.isError, `update_tag empty: ${r.content[0]?.text}`).toBe(true);
    } finally {
      await findTool("delete_tag").execute(
        "u6del",
        { project, tag: tid },
        undefined,
        undefined,
        ctx(),
      );
    }
  });
});
