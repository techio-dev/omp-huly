// Test T-32 render/issue.ts — issue card + list table render.
// Strategy: test pure format functions với theme stub (no pi types needed).
// Test render wrappers (return Component + reuse lastComponent).

import { describe, expect, it } from "vitest";
import { Text } from "@oh-my-pi/pi-tui";
import {
  formatIssueCard,
  formatIssueList,
  renderIssueResult,
  renderIssueListResult,
  type IssueDetails,
  type IssueListDetails,
  type RenderTheme,
} from "../issue.js";

// Theme stub: wrap text với marker để assert colorize được gọi đúng color.
// CHỈ có fg/bg/bold — match runtime pi Theme (KHÔNG có method dim/muted).
function makeTheme(): RenderTheme & { calls: Array<[string, string]> } {
  const calls: Array<[string, string]> = [];
  return {
    calls,
    fg(color, text) {
      calls.push([color, text]);
      return `[fg:${color}]${text}[/fg]`;
    },
    bg(color, text) {
      return `[bg:${color}]${text}[/bg]`;
    },
    bold(text) {
      return `[bold]${text}[/bold]`;
    },
  };
}

// === formatIssueCard ===

describe("formatIssueCard", () => {
  it("full issue → header + 2 meta lines + description", () => {
    const theme = makeTheme();
    const d: IssueDetails = {
      identifier: "PD-123",
      title: "Fix bug",
      status: "In Progress",
      priority: "high",
      assignee: "nai@x.com",
      milestone: "M3",
      component: "core",
      dueDate: 1735689600000, // 2025-01-01
      estimation: 120,
      description: "Some description\nLine 2\nLine 3",
    };
    const out = formatIssueCard(d, theme);
    // Header có identifier (accent) + title (bold)
    expect(out).toContain("[fg:accent]PD-123[/fg]");
    expect(out).toContain("[bold]Fix bug[/bold]");
    // Meta 1: label bold + value colorize. Format: [bold]Label[/bold]: value
    expect(out).toContain("[bold]Status[/bold]:");
    expect(out).toContain("[fg:success]In Progress[/fg]");
    expect(out).toContain("[bold]Priority[/bold]: high");
    expect(out).toContain("[bold]Assignee[/bold]: nai@x.com");
    // Meta 2: milestone/component/due/estimation
    expect(out).toContain("[bold]Milestone[/bold]: M3");
    expect(out).toContain("[bold]Component[/bold]: core");
    expect(out).toContain("Due: [fg:warning]2025-01-01[/fg]");
    expect(out).toContain("Estimation: 120m");
    // Description section
    expect(out).toContain("─── Description ───");
    expect(out).toContain("Some description");
    expect(out).toContain("Line 2");
  });

  it("minimal issue (id+title only) → header only, no meta lines", () => {
    const theme = makeTheme();
    const out = formatIssueCard({ identifier: "X-1", title: "T" }, theme);
    const lines = out.split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("[fg:accent]X-1[/fg]");
    expect(lines[0]).toContain("[bold]T[/bold]");
  });

  it("no identifier → '?' placeholder", () => {
    const out = formatIssueCard({ title: "T" }, makeTheme());
    expect(out).toContain("[fg:accent]?[/fg]");
  });

  it("no title → (no title)", () => {
    const out = formatIssueCard({ identifier: "PD-1" }, makeTheme());
    expect(out).toContain("[bold](no title)[/bold]");
  });

  it("description truncated to 8 lines", () => {
    const long = Array.from({ length: 20 }, (_, i) => `line${i}`).join("\n");
    const out = formatIssueCard({ identifier: "PD-1", title: "T", description: long }, makeTheme());
    const lines = out.split("\n");
    // header + desc separator + 8 desc lines = 10
    expect(lines).toHaveLength(10);
    expect(lines[2]).toBe("line0");
    expect(lines[9]).toBe("line7");
    expect(out).not.toContain("line8");
  });

  it("description separator wrap fg:dim (KHÔNG method dim — runtime-safe)", () => {
    const out = formatIssueCard({ identifier: "PD-1", title: "T", description: "X" }, makeTheme());
    expect(out).toContain("[fg:dim]─── Description ───[/fg]");
  });

  it("ANSI escape sequences trong server data → stripped (code-review #5)", () => {
    const evil = "\x1b[31mRED\x1b[0m\x1b[2;0;0tEVIL";
    const out = formatIssueCard(
      {
        identifier: "PD-1",
        title: evil,
        status: evil,
        description: evil,
        assignee: evil,
      },
      makeTheme(),
    );
    // KHÔNG còn escape sequences (CSI/OSC stripped)
    expect(out).not.toContain("\x1b[");
    expect(out).not.toContain("\x1b]");
    // Content còn lại: "RED" + "EVIL" (text printable kept)
    expect(out).toContain("RED");
    expect(out).toContain("EVIL");
  });

  it("skips description section when empty", () => {
    const out = formatIssueCard({ identifier: "PD-1", title: "T", description: "" }, makeTheme());
    expect(out).not.toContain("Description");
  });

  it("skips meta line entirely when all fields empty", () => {
    const out = formatIssueCard(
      { identifier: "PD-1", title: "T", status: "", priority: undefined, assignee: "" },
      makeTheme(),
    );
    // Chỉ header, KHÔNG có meta1 (toàn empty/undefined)
    expect(out.split("\n")).toHaveLength(1);
  });

  it("invalid dueDate → skip (no crash)", () => {
    const out = formatIssueCard(
      { identifier: "PD-1", title: "T", dueDate: Number.NaN },
      makeTheme(),
    );
    expect(out).not.toContain("Due:");
  });
});

// === formatIssueList ===

describe("formatIssueList", () => {
  it("empty list → fg:muted no issues (count luôn include)", () => {
    const theme = makeTheme();
    const out = formatIssueList({ count: 0, issues: [] }, theme);
    expect(out).toContain("[fg:muted]No issues found (0 total).[/fg]");
  });

  it("list with items → count header + rows + assignee dim suffix", () => {
    const theme = makeTheme();
    const d: IssueListDetails = {
      count: 2,
      issues: [
        { identifier: "PD-1", title: "First", status: "Done", assignee: "nai" },
        { identifier: "PD-2", title: "Second", status: "Todo" },
      ],
    };
    const out = formatIssueList(d, theme);
    expect(out).toContain("2 issue(s)");
    expect(out).toContain("[fg:accent]PD-1");
    expect(out).toContain("[fg:success][Done]");
    expect(out).toContain("First");
    // assignee suffix wrap fg:dim (KHÔNG phải method dim — runtime-safe)
    expect(out).toContain("[fg:dim]@nai[/fg]");
    expect(out).toContain("Second");
    // Second no assignee → no @
    const lines = out.split("\n");
    const secondLine = lines.find((l) => l.includes("Second"));
    expect(secondLine).not.toContain("@");
  });

  it("defaults count to issues.length when missing", () => {
    const out = formatIssueList({ issues: [{ identifier: "X-1", title: "T" }] }, makeTheme());
    expect(out).toContain("1 issue(s)");
  });

  it("defaults issues to [] when missing", () => {
    const out = formatIssueList({ count: 5 }, makeTheme());
    expect(out).toContain("No issues found (5 total)");
  });

  it("column width adapts to longest identifier", () => {
    const out = formatIssueList(
      {
        count: 1,
        issues: [{ identifier: "LONG-99", title: "T", status: "X" }],
      },
      makeTheme(),
    );
    expect(out).toContain("LONG-99");
  });
});

// === render wrappers ===

describe("renderIssueResult / renderIssueListResult", () => {
  it("renderIssueResult returns Component (Text) với content", () => {
    const theme = makeTheme();
    const result = {
      content: [],
      details: { identifier: "PD-1", title: "T" },
    };
    const comp = renderIssueResult(
      result as never,
      { expanded: false, isPartial: false },
      theme,
      {},
    );
    expect(comp).toBeInstanceOf(Text);
    const rendered = comp.render(80);
    expect(rendered.join("\n")).toContain("PD-1");
  });

  it("renderIssueResult reuses lastComponent khi là Text", () => {
    const theme = makeTheme();
    const existing = new Text("old", 0, 0);
    const result = { content: [], details: { identifier: "PD-1", title: "New" } };
    const comp = renderIssueResult(result as never, { expanded: false, isPartial: false }, theme, {
      lastComponent: existing,
    });
    expect(comp).toBe(existing); // same instance (reuse)
    // Content đã update sang "New" (setText clear cache). KHÔNG assert !old
    // vì Text.render pad spaces → brittle. toBe + toContain("New") đủ chứng minh.
    expect(existing.render(80).join("\n")).toContain("[bold]New[/bold]");
  });

  it("renderIssueListResult returns Component", () => {
    const theme = makeTheme();
    const result = {
      content: [],
      details: { count: 1, issues: [{ identifier: "PD-1", title: "T" }] },
    };
    const comp = renderIssueListResult(
      result as never,
      { expanded: false, isPartial: false },
      theme,
      {},
    );
    expect(comp).toBeInstanceOf(Text);
    expect(comp.render(80).join("\n")).toContain("1 issue(s)");
  });
});
