import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { tools as components } from "../tools/domains/components.js";
import { tools as milestones } from "../tools/domains/milestones.js";
const E2E = process.env.HULY_E2E_PROJECT;
const d = E2E ? describe : describe.skip;
const ALL = [...components, ...milestones];
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
d("R11c create-with-description direct", () => {
  const project = E2E!;
  it("create_component WITH description → get reads it", async () => {
    const c = await ft("create_component").execute(
      "c",
      { project, label: `cd-${Date.now()}`, description: "CREATE-COMP-DESC-1122" },
      undefined,
      undefined,
      ctx(),
    );
    const cid = det(c.details, "id") || det(c.details, "_id");
    try {
      const g = await ft("get_component").execute(
        "c",
        { project, component: cid },
        undefined,
        undefined,
        ctx(),
      );
      expect(String(det(g.details, "description"))).toContain("CREATE-COMP-DESC-1122");
    } finally {
      await ft("delete_component").execute(
        "c",
        { project, component: cid },
        undefined,
        undefined,
        ctx(),
      );
    }
  });
  it("create_milestone WITH description → get reads it", async () => {
    const m = await ft("create_milestone").execute(
      "c",
      {
        project,
        label: `cmd-${Date.now()}`,
        targetDate: Date.now() + 86400000,
        description: "CREATE-MS-DESC-3344",
      },
      undefined,
      undefined,
      ctx(),
    );
    const mid = det(m.details, "id") || det(m.details, "_id");
    try {
      const g = await ft("get_milestone").execute(
        "c",
        { project, milestone: mid },
        undefined,
        undefined,
        ctx(),
      );
      expect(String(det(g.details, "description"))).toContain("CREATE-MS-DESC-3344");
    } finally {
      await ft("delete_milestone").execute(
        "c",
        { project, milestone: mid },
        undefined,
        undefined,
        ctx(),
      );
    }
  });
});
