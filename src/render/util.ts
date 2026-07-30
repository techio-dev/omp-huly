// render/util.ts — shared helpers cho render/issue.ts + render/document.ts.
// Tách ra để tránh duplicate fmtDate/getOrCreateText/joinLines/opt giữa 2 file
// (code-review-mentor #3). Cũng chứa ANSI sanitize (#5 security).

import { Text } from "@oh-my-pi/pi-tui";
import type { Component } from "@oh-my-pi/pi-tui";

/**
 * Minimal theme surface mà render dùng. Pi Theme runtime CHỈ có fg/bg/bold/...,
 * KHÔNG có method dim/muted — "dim"/"muted" là ThemeColor enum values, gọi qua
 * theme.fg("dim", text) (code-review-mentor #1).
 */
export interface RenderTheme {
  fg(color: string, text: string): string;
  bg?(color: string, text: string): string;
  bold(text: string): string;
  italic?(text: string): string;
}

/**
 * Minimal render context (ToolRenderContext của pi KHÔNG re-export public).
 * Structurally compatible subset — chỉ cần lastComponent để reuse Text component.
 */
export interface RenderContext {
  /** Previously returned component for this render slot, if any (reuse để avoid flicker). */
  lastComponent?: Component;
}

/** Get-or-create Text component (reuse lastComponent nếu là Text, else create new). */
export function getOrCreateText(ctx: RenderContext): Text {
  return ctx.lastComponent instanceof Text ? ctx.lastComponent : new Text("", 0, 0);
}

/** Format timestamp (Unix ms) → YYYY-MM-DD; invalid/undefined → "". */
export function fmtDate(ms: number | undefined, theme: RenderTheme): string {
  if (ms === undefined || ms === null) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return theme.fg("warning", d.toISOString().slice(0, 10));
}

/** Join non-empty lines (skip empty/undefined entries). */
export function joinLines(lines: string[]): string {
  return lines.filter((l) => l.length > 0).join("\n");
}

/** Optional labeled row: skip nếu value undefined/empty; else "Label: value". */
export function opt(label: string, value: string | undefined, theme: RenderTheme): string {
  if (value === undefined || value === null || value.length === 0) return "";
  return `${theme.bold(label)}: ${value}`;
}

/**
 * Strip ANSI escape sequences từ string sourced từ Huly server (code-review-mentor #5).
 * Huly title/description/content/status/assignee có thể chứa escape sequences thật
 * (user input HOẶC markup legacy) → nếu render raw, terminal bị corrupt (hidden
 * cursor, changed title, cleared screen, màu sai).
 *
 * Strip CSI (Control Sequence Introducer) + OSC (Operating System Command) + ESC.
 * Whitelist-ish: giữ printable ASCII + tab + newline.
 */
export function sanitize(str: string): string {
  if (typeof str !== "string") return "";
  // Strip ANSI escape sequences từ server-sourced strings (terminal injection防御).
  // Mọi regex match control chars (U+001B/U+0007/...) — intentional, KHÔNG bug.
  // eslint-disable-next-line no-control-regex -- CSI escape sequence (intentional strip)
  const noCsi = str.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "");
  // eslint-disable-next-line no-control-regex -- OSC escape sequence (intentional strip)
  const noOsc = noCsi.replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "");
  // eslint-disable-next-line no-control-regex -- keypad mode escape (intentional strip)
  const noKeypad = noOsc.replace(/\u001b[=>]/g, "");
  // eslint-disable-next-line no-control-regex -- control chars except \t \n \r (intentional strip)
  return noKeypad.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}
