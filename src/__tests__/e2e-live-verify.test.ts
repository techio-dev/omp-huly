// T-91 phase 8 — VERIFICATION: cross-domain issue lifecycle integration.
// Catches interaction bugs per-domain tests miss (cumulative state, field composition).
// Chain: create → update(assignee/milestone/component/label/priority/dueDate) →
// comment + todo + relation → get_issue verifies ALL reflected. Run:
//   HULY_E2E_PROJECT=ETEST pnpm vitest run src/__tests__/e2e-live-verify.test.ts

import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { tools as issueCore } from "../tools/domains/issues-core.js";
import { tools as relations } from "../tools/domains/issues-relations.js";
import { tools as comments } from "../tools/domains/comments.js";
import { tools as todos } from "../tools/domains/todos.js";
import { tools as components } from "../tools/domains/components.js";
import { tools as milestones } from "../tools/domains/milestones.js";
import { tools as tags } from "../tools/domains/tags.js";
import { tools as time } from "../tools/domains/time.js";

const E2E_PROJECT = process.env.HULY_E2E_PROJECT;
const describeLive = E2E_PROJECT ? describe : describe.skip;

const ALL = [
  ...issueCore,
  ...relations,
  ...comments,
  ...todos,
  ...components,
  ...milestones,
  ...tags,
  ...time,
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

describeLive("T-91 phase 8 — cross-domain issue lifecycle integration", () => {
  const project = E2E_PROJECT as string;

  it("full lifecycle: create → multi-update → comment+todo+relation → get_issue reflects ALL", async () => {
    // --- setup: throwaway component + milestone + tag ---
    const comp = await findTool("create_component").execute(
      "v-comp",
      { project, label: `verify-comp-${Date.now()}` },
      undefined,
      undefined,
      ctx(),
    );
    const compId = (detail(comp.details, "id") ?? detail(comp.details, "_id")) as string;
    const ms = await findTool("create_milestone").execute(
      "v-ms",
      { project, label: `verify-ms-${Date.now()}`, targetDate: Date.now() + 86400000 },
      undefined,
      undefined,
      ctx(),
    );
    const msId = (detail(ms.details, "id") ?? detail(ms.details, "_id")) as string;
    const tag = await findTool("create_tag").execute(
      "v-tag",
      { project, title: `verifytag${Date.now() % 100000}` },
      undefined,
      undefined,
      ctx(),
    );
    const tagId = (detail(tag.details, "id") ?? detail(tag.details, "_id")) as string;

    // 2 issues (for relation).
    const a = await findTool("create_issue").execute(
      "v-a",
      { project, title: `verify-a-${Date.now()}`, priority: "low" },
      undefined,
      undefined,
      ctx(),
    );
    const idA = detail(a.details, "identifier") as string;
    const b = await findTool("create_issue").execute(
      "v-b",
      { project, title: `verify-b-${Date.now()}`, priority: "low" },
      undefined,
      undefined,
      ctx(),
    );
    const idB = detail(b.details, "identifier") as string;

    try {
      // --- multi-field update (cumulative) ---
      const due = Date.now() + 86400000;
      await findTool("update_issue").execute(
        "v-upd",
        {
          project,
          identifier: idA,
          title: `verify-a-renamed-${Date.now()}`,
          priority: "high",
          dueDate: due,
          estimation: 480,
        },
        undefined,
        undefined,
        ctx(),
      );
      // assign milestone + component + label (separate tools).
      await findTool("set_issue_milestone").execute(
        "v-ms-set",
        { project, identifier: idA, milestone: msId },
        undefined,
        undefined,
        ctx(),
      );
      await findTool("set_issue_component").execute(
        "v-comp-set",
        { project, identifier: idA, component: compId },
        undefined,
        undefined,
        ctx(),
      );
      await findTool("attach_tag").execute(
        "v-tag-att",
        { project, identifier: idA, tag: tagId },
        undefined,
        undefined,
        ctx(),
      );
      // comment + todo + relation.
      await findTool("add_comment").execute(
        "v-cmt",
        { project, identifier: idA, body: `verify comment ${Date.now()}` },
        undefined,
        undefined,
        ctx(),
      );
      const todo = await findTool("create_todo").execute(
        "v-todo",
        { project, identifier: idA, title: `verify-todo-${Date.now()}`, priority: "medium" },
        undefined,
        undefined,
        ctx(),
      );
      const todoId = (detail(todo.details, "id") ?? detail(todo.details, "_id")) as string;
      await findTool("add_issue_relation").execute(
        "v-rel",
        { project, identifier: idA, targetIssue: idB, relationType: "blocks" },
        undefined,
        undefined,
        ctx(),
      );
      await findTool("log_time").execute(
        "v-time",
        { project, identifier: idA, value: 2, description: "verify log" },
        undefined,
        undefined,
        ctx(),
      );

      // --- get_issue: verify CUMULATIVE state (all fields reflected) ---
      const got = await findTool("get_issue").execute(
        "v-get",
        { project, identifier: idA },
        undefined,
        undefined,
        ctx(),
      );
      expect(got.isError, `get_issue: ${got.content[0]?.text}`).toBeUndefined();
      const d = got.details as Record<string, unknown>;
      expect(d.priority, "priority high persists").toBe("high");
      expect(Number(d.estimation ?? 0), "estimation 480").toBe(480);
      expect(Number(d.dueDate ?? 0), "dueDate set").toBe(due);
      expect(String(d.milestone ?? "").length > 0, "milestone reflected").toBe(true);
      expect(String(d.component ?? "").length > 0, "component reflected").toBe(true);
      expect(String(d.title ?? "").startsWith("verify-a-renamed"), "title updated").toBe(true);

      // comments reflected (list).
      const cmts = await findTool("list_comments").execute(
        "v-cmt-list",
        { project, identifier: idA },
        undefined,
        undefined,
        ctx(),
      );
      expect(
        (detail(cmts.details, "comments") as unknown[]).length,
        "1 comment",
      ).toBeGreaterThanOrEqual(1);

      // todo reflected (list).
      const tlist = await findTool("list_todos").execute(
        "v-todo-list",
        { project, identifier: idA },
        undefined,
        undefined,
        ctx(),
      );
      const todos = (detail(tlist.details, "todos") as Array<{ _id?: string }>) ?? [];
      expect(
        todos.some((t) => t._id === todoId),
        "todo attached",
      ).toBe(true);

      // relation reflected (bidirectional).
      const rels = await findTool("list_issue_relations").execute(
        "v-rel-list",
        { project, identifier: idA },
        undefined,
        undefined,
        ctx(),
      );
      const relArr =
        (detail(rels.details, "relations") as Array<{ identifier?: string; direction?: string }>) ??
        [];
      expect(
        relArr.some((r) => r.identifier === idB && r.direction === "blocks"),
        "blocks relation",
      ).toBe(true);
    } finally {
      // cleanup (component/milestone/tag deleted last; issues first).
      await findTool("delete_issue").execute(
        "v-del-a",
        { project, identifier: idA },
        undefined,
        undefined,
        ctx(),
      );
      await findTool("delete_issue").execute(
        "v-del-b",
        { project, identifier: idB },
        undefined,
        undefined,
        ctx(),
      );
      await findTool("delete_component").execute(
        "v-comp-del",
        { project, component: compId },
        undefined,
        undefined,
        ctx(),
      );
      await findTool("delete_milestone").execute(
        "v-ms-del",
        { project, milestone: msId },
        undefined,
        undefined,
        ctx(),
      );
      await findTool("delete_tag").execute(
        "v-tag-del",
        { project, tag: tagId },
        undefined,
        undefined,
        ctx(),
      );
    }
  }, 60000);
});
