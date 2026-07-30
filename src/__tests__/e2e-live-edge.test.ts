// T-91 phase 9 — bug-hunt: ERROR PATHS / EDGE CASES. Happy paths verified; this
// hunts silent no-ops (dangerous class — #156 was silent). Feed invalid/missing
// input → expect LOUD isError, KHÔNG silent success. Run:
//   HULY_E2E_PROJECT=ETEST pnpm vitest run src/__tests__/e2e-live-edge.test.ts

import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { tools as issueCore } from "../tools/domains/issues-core.js";
import { tools as relations } from "../tools/domains/issues-relations.js";
import { tools as components } from "../tools/domains/components.js";
import { tools as milestones } from "../tools/domains/milestones.js";
import { tools as comments } from "../tools/domains/comments.js";
import { tools as tags } from "../tools/domains/tags.js";
import { tools as time } from "../tools/domains/time.js";
import { tools as todos } from "../tools/domains/todos.js";

const E2E_PROJECT = process.env.HULY_E2E_PROJECT;
const describeLive = E2E_PROJECT ? describe : describe.skip;

const ALL = [
  ...issueCore,
  ...relations,
  ...components,
  ...milestones,
  ...comments,
  ...tags,
  ...time,
  ...todos,
];
function findTool(name: string) {
  const full = name.startsWith("huly_") ? name : `huly_${name}`;
  const t = ALL.find((x) => x.name === full || x.name === name);
  if (!t) throw new Error(`tool ${name} not registered`);
  return t;
}
function ctx(): ExtensionContext {
  return { cwd: process.cwd(), hasUI: true, ui: { confirm: async () => true } } as never;
}

describeLive("T-91 phase 9 — error paths / edge cases (loud isError, KHÔNG silent no-op)", () => {
  const project = E2E_PROJECT as string;
  const BOGUS = "DOES-NOT-EXIST-999999";
  const BOGUS_ID = "6" + "0".repeat(23); // fake uuid-ish

  // 1. update_issue non-existent identifier → isError (KHÔNG silent no-op).
  it("update_issue bogus identifier → isError", async () => {
    const r = await findTool("update_issue").execute(
      "e1",
      { project, identifier: BOGUS, title: "x" },
      undefined,
      undefined,
      ctx(),
    );
    expect(r.isError, `update_issue bogus: ${r.content[0]?.text}`).toBe(true);
  });

  // 2. get_issue non-existent → isError.
  it("get_issue bogus identifier → isError", async () => {
    const r = await findTool("get_issue").execute(
      "e2",
      { project, identifier: BOGUS },
      undefined,
      undefined,
      ctx(),
    );
    expect(r.isError, `get_issue bogus: ${r.content[0]?.text}`).toBe(true);
  });

  // 3. set_issue_component non-existent component → isError (KHÔNG garbage null).
  it("set_issue_component bogus component → isError", async () => {
    // need a real issue.
    const ci = await findTool("create_issue").execute(
      "e3ci",
      { project, title: `edge-comp-${Date.now()}`, priority: "low" },
      undefined,
      undefined,
      ctx(),
    );
    const id = (ci.details as Record<string, unknown>).identifier as string;
    try {
      const r = await findTool("set_issue_component").execute(
        "e3",
        { project, identifier: id, component: BOGUS_ID },
        undefined,
        undefined,
        ctx(),
      );
      expect(r.isError, `set_issue_component bogus: ${r.content[0]?.text}`).toBe(true);
    } finally {
      await findTool("delete_issue").execute(
        "e3del",
        { project, identifier: id },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  // 4. set_issue_milestone non-existent milestone → isError.
  it("set_issue_milestone bogus milestone → isError", async () => {
    const ci = await findTool("create_issue").execute(
      "e4ci",
      { project, title: `edge-ms-${Date.now()}`, priority: "low" },
      undefined,
      undefined,
      ctx(),
    );
    const id = (ci.details as Record<string, unknown>).identifier as string;
    try {
      const r = await findTool("set_issue_milestone").execute(
        "e4",
        { project, identifier: id, milestone: BOGUS_ID },
        undefined,
        undefined,
        ctx(),
      );
      expect(r.isError, `set_issue_milestone bogus: ${r.content[0]?.text}`).toBe(true);
    } finally {
      await findTool("delete_issue").execute(
        "e4del",
        { project, identifier: id },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  // 5. add_comment non-existent issue → isError.
  it("add_comment bogus issue → isError", async () => {
    const r = await findTool("add_comment").execute(
      "e5",
      { project, identifier: BOGUS, body: "x" },
      undefined,
      undefined,
      ctx(),
    );
    expect(r.isError, `add_comment bogus: ${r.content[0]?.text}`).toBe(true);
  });

  // 6. create_issue invalid status → isError (T-98 #144 regression guard).
  it("create_issue invalid status → isError", async () => {
    const r = await findTool("create_issue").execute(
      "e6",
      {
        project,
        title: `edge-status-${Date.now()}`,
        status: "TOTALLY-BOGUS-STATUS",
        priority: "low",
      },
      undefined,
      undefined,
      ctx(),
    );
    expect(r.isError, `create_issue invalid status: ${r.content[0]?.text}`).toBe(true);
  });

  // 7. log_time value 0 / negative → behavior (should reject or clamp, not silently log).
  it("log_time value 0 → isError (KHÔNG silent log 0h)", async () => {
    const ci = await findTool("create_issue").execute(
      "e7ci",
      { project, title: `edge-time-${Date.now()}`, priority: "low" },
      undefined,
      undefined,
      ctx(),
    );
    const id = (ci.details as Record<string, unknown>).identifier as string;
    try {
      const r = await findTool("log_time").execute(
        "e7",
        { project, identifier: id, value: 0 },
        undefined,
        undefined,
        ctx(),
      );
      // value:0 meaningless — expect rejection (T-103 #158 handler guard).
      expect(r.isError, `log_time 0: ${r.content[0]?.text}`).toBe(true);
    } finally {
      await findTool("delete_issue").execute(
        "e7del",
        { project, identifier: id },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  // 7b. log_time NEGATIVE → isError (T-103 #158: KHÔNG negative time corruption).
  it("log_time NEGATIVE value → isError (KHÔNG corruption)", async () => {
    const ci = await findTool("create_issue").execute(
      "e7bci",
      { project, title: `edge-timeneg-${Date.now()}`, priority: "low" },
      undefined,
      undefined,
      ctx(),
    );
    const id = (ci.details as Record<string, unknown>).identifier as string;
    try {
      const r = await findTool("log_time").execute(
        "e7b",
        { project, identifier: id, value: -5 },
        undefined,
        undefined,
        ctx(),
      );
      expect(r.isError, `log_time -5: ${r.content[0]?.text} (negative = corruption)`).toBe(true);
    } finally {
      await findTool("delete_issue").execute(
        "e7bdel",
        { project, identifier: id },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  // 8. attach_tag non-existent tag → isError (KHÔNG garbage).
  it("attach_tag bogus tag → isError", async () => {
    const ci = await findTool("create_issue").execute(
      "e8ci",
      { project, title: `edge-tag-${Date.now()}`, priority: "low" },
      undefined,
      undefined,
      ctx(),
    );
    const id = (ci.details as Record<string, unknown>).identifier as string;
    try {
      const r = await findTool("attach_tag").execute(
        "e8",
        { project, identifier: id, tag: BOGUS_ID },
        undefined,
        undefined,
        ctx(),
      );
      expect(r.isError, `attach_tag bogus: ${r.content[0]?.text}`).toBe(true);
    } finally {
      await findTool("delete_issue").execute(
        "e8del",
        { project, identifier: id },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  // 9. add_issue_relation non-existent target → isError.
  it("add_issue_relation bogus target → isError", async () => {
    const ci = await findTool("create_issue").execute(
      "e9ci",
      { project, title: `edge-rel-${Date.now()}`, priority: "low" },
      undefined,
      undefined,
      ctx(),
    );
    const id = (ci.details as Record<string, unknown>).identifier as string;
    try {
      const r = await findTool("add_issue_relation").execute(
        "e9",
        { project, identifier: id, targetIssue: BOGUS, relationType: "blocks" },
        undefined,
        undefined,
        ctx(),
      );
      expect(r.isError, `add_issue_relation bogus target: ${r.content[0]?.text}`).toBe(true);
    } finally {
      await findTool("delete_issue").execute(
        "e9del",
        { project, identifier: id },
        undefined,
        undefined,
        ctx(),
      );
    }
  });

  // 10. create_todo non-existent issue → isError.
  it("create_todo bogus issue → isError", async () => {
    const r = await findTool("create_todo").execute(
      "e10",
      { project, identifier: BOGUS, title: "x" },
      undefined,
      undefined,
      ctx(),
    );
    expect(r.isError, `create_todo bogus issue: ${r.content[0]?.text}`).toBe(true);
  });
});
