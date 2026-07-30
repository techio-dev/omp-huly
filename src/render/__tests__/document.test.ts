// Test T-32 render/document.ts — document preview render.
// Strategy: test pure format function với theme stub + render wrapper.

import { describe, expect, it } from "vitest";
import { Text } from "@oh-my-pi/pi-tui";
import { formatDocumentPreview, renderDocumentResult, type RenderTheme } from "../document.js";

// Theme stub: CHỈ fg/bg/bold — match runtime pi Theme (KHÔNG có dim/muted methods).
function makeTheme(): RenderTheme {
  return {
    fg(color, text) {
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

describe("formatDocumentPreview", () => {
  it("full document → title + content preview + modified", () => {
    const out = formatDocumentPreview(
      {
        title: "My Doc",
        content: "Para 1\nPara 2",
        modifiedOn: 1735689600000, // 2025-01-01
      },
      makeTheme(),
    );
    expect(out).toContain("[bold][fg:mdHeading]My Doc[/fg][/bold]");
    expect(out).toContain("[fg:dim]─── Content (preview) ───[/fg]");
    expect(out).toContain("Para 1");
    expect(out).toContain("Para 2");
    // modified: wrap fg:dim, date colorize warning (nested markers, closing [/fg])
    expect(out).toContain("[fg:dim]modified: [fg:warning]2025-01-01[/fg][/fg]");
  });

  it("ANSI escape sequences trong title/content → stripped (code-review #5)", () => {
    // CSI color + OSC set-title (payload giữa ] và BEL bị strip cùng sequence)
    const evil = "\x1b[31mRED\x1b[0m clean\x1b]0;bad-title\x07OSC";
    const out = formatDocumentPreview({ title: evil, content: evil }, makeTheme());
    // KHÔNG còn escape sequences (CSI + OSC stripped)
    expect(out).not.toContain("\x1b[");
    expect(out).not.toContain("\x1b]");
    expect(out).not.toContain("\x07");
    // Printable text ngoài OSC payload kept
    expect(out).toContain("RED");
    expect(out).toContain("clean");
    // OSC payload "bad-title" bị strip cùng sequence (intended — tránh terminal title injection)
    expect(out).not.toContain("bad-title");
  });

  it("no title → (untitled document)", () => {
    const out = formatDocumentPreview({ content: "X" }, makeTheme());
    expect(out).toContain("(untitled document)");
  });

  it("no content → title only, no content section", () => {
    const out = formatDocumentPreview({ title: "T" }, makeTheme());
    expect(out).not.toContain("Content");
    expect(out.split("\n")).toHaveLength(1);
  });

  it("content truncated to 12 lines", () => {
    const long = Array.from({ length: 20 }, (_, i) => `line${i}`).join("\n");
    const out = formatDocumentPreview({ title: "T", content: long }, makeTheme());
    const lines = out.split("\n");
    // title + separator + 12 content lines = 14
    expect(lines).toHaveLength(14);
    expect(lines[2]).toBe("line0");
    expect(lines[13]).toBe("line11");
    expect(out).not.toContain("line12");
  });

  it("invalid modifiedOn → skip", () => {
    const out = formatDocumentPreview(
      { title: "T", content: "X", modifiedOn: Number.NaN },
      makeTheme(),
    );
    expect(out).not.toContain("modified:");
  });

  it("no modifiedOn → skip modified line", () => {
    const out = formatDocumentPreview({ title: "T", content: "X" }, makeTheme());
    expect(out).not.toContain("modified:");
  });
});

describe("renderDocumentResult", () => {
  it("returns Text component với formatted content", () => {
    const result = { content: [], details: { title: "Doc", content: "Body" } };
    const comp = renderDocumentResult(
      result as never,
      { expanded: false, isPartial: false },
      makeTheme(),
      {},
    );
    expect(comp).toBeInstanceOf(Text);
    const rendered = comp.render(80).join("\n");
    expect(rendered).toContain("Doc");
    expect(rendered).toContain("Body");
  });

  it("reuses lastComponent khi là Text", () => {
    const existing = new Text("old", 0, 0);
    const result = { content: [], details: { title: "New", content: "Body" } };
    const comp = renderDocumentResult(
      result as never,
      { expanded: false, isPartial: false },
      makeTheme(),
      { lastComponent: existing },
    );
    expect(comp).toBe(existing);
    expect(existing.render(80).join("\n")).toContain("[bold][fg:mdHeading]New[/fg][/bold]");
  });

  it("creates new Text khi lastComponent là component khác", () => {
    // lastComponent là object không phải Text → tạo mới
    const fakeComp = { render: () => ["x"], invalidate: () => {} };
    const result = { content: [], details: { title: "T" } };
    const comp = renderDocumentResult(
      result as never,
      { expanded: false, isPartial: false },
      makeTheme(),
      { lastComponent: fakeComp as never },
    );
    expect(comp).not.toBe(fakeComp);
    expect(comp).toBeInstanceOf(Text);
  });
});
