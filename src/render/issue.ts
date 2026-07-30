// render/issue.ts — TUI render cho huly_get_issue (card) + huly_list_issues (table).
// Design: 04-system.md §6 render/issue.ts, 06-api.md §3 render hooks (D12).
//
// Render functions theo pi signature: (result, options, theme, context) => Component.
// Strategy: pure format function (formatIssueCard/formatIssueList) dùng theme.fg()
// colorize → wrap vào Text component (reuse context.lastComponent khi có).
//
// Pure function testable KHÔNG cần pi types (chỉ cần theme stub có fg/bg/bold).
// Shared helpers + RenderTheme/RenderContext ở render/util.ts.

import type { Component } from "@oh-my-pi/pi-tui";
import type { AgentToolResult, ToolRenderResultOptions } from "@oh-my-pi/pi-coding-agent";
import {
  fmtDate,
  getOrCreateText,
  joinLines,
  opt,
  sanitize,
  type RenderContext,
  type RenderTheme,
} from "./util.js";

/** Issue shape từ huly_get_issue details (xem domains/issues-core.ts get_issue). */
export interface IssueDetails {
  identifier?: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  milestone?: string;
  component?: string;
  dueDate?: number;
  estimation?: number;
}

/** IssueListItem shape từ huly_list_issues details. */
export interface IssueListItem {
  identifier?: string;
  title?: string;
  status?: string;
  priority?: string;
  assignee?: string;
}

/** List details shape. */
export interface IssueListDetails {
  count?: number;
  issues?: IssueListItem[];
}

// Re-export shared types cho consumer single-import.
export type { RenderTheme, RenderContext } from "./util.js";

/** Due line: skip nếu dueDate undefined HOẶC invalid (fmtDate trả ""). */
function dueLine(ms: number | undefined, t: RenderTheme): string {
  if (ms === undefined || ms === null) return "";
  const d = fmtDate(ms, t);
  return d.length > 0 ? `Due: ${d}` : "";
}

/**
 * Format issue card (single issue). Pure function — testable.
 * Layout:
 *   PD-123: Title (bold)
 *   Status: X · Priority: Y · Assignee: Z
 *   Milestone: M · Component: C · Due: 2026-01-01
 *   ─── Description ─── (dim)
 *   <description preview>
 *
 * Mọi string từ server qua sanitize() (code-review-mentor #5 ANSI injection).
 */
export function formatIssueCard(details: IssueDetails, theme: RenderTheme): string {
  const id = sanitize(details.identifier ?? "?");
  const title = sanitize(details.title ?? "(no title)");
  const header = `${theme.fg("accent", id)}: ${theme.bold(title)}`;

  const meta1 = joinLines([
    opt(
      "Status",
      details.status ? theme.fg("success", sanitize(details.status)) : undefined,
      theme,
    ),
    opt("Priority", details.priority !== undefined ? sanitize(details.priority) : undefined, theme),
    opt("Assignee", details.assignee !== undefined ? sanitize(details.assignee) : undefined, theme),
  ]).replace(/\n/g, " · ");

  const meta2 = joinLines([
    opt(
      "Milestone",
      details.milestone !== undefined ? sanitize(details.milestone) : undefined,
      theme,
    ),
    opt(
      "Component",
      details.component !== undefined ? sanitize(details.component) : undefined,
      theme,
    ),
    dueLine(details.dueDate, theme),
    details.estimation !== undefined ? `Estimation: ${details.estimation}m` : "",
  ]).replace(/\n/g, " · ");

  const lines = [header];
  if (meta1.length > 0) lines.push(meta1);
  if (meta2.length > 0) lines.push(meta2);

  // Description preview (KHÔNG full — pi truncate tự). Giới hạn 8 dòng đầu.
  if (details.description !== undefined && details.description.length > 0) {
    const descLines = sanitize(details.description).split("\n").slice(0, 8);
    lines.push(theme.fg("dim", "─── Description ───"));
    lines.push(...descLines);
  }

  return lines.join("\n");
}

/**
 * Format issue list (compact table). Pure function — testable.
 * Layout:
 *   N issue(s)
 *   PD-123  [Status]  Title                          @assignee
 *   PD-124  [Status]  Another title
 *
 * Empty list: theme.fg("muted", "No issues found (N total).") — luôn include count
 * (code-review-mentor #2: trước đây dùng theme.muted method KHÔNG tồn tại runtime).
 */
export function formatIssueList(details: IssueListDetails, theme: RenderTheme): string {
  const count = details.count ?? details.issues?.length ?? 0;
  const issues = details.issues ?? [];
  if (issues.length === 0) {
    return theme.fg("muted", `No issues found (${count} total).`);
  }
  const header = `${count} issue(s)`;
  // Column widths: identifier (max 10), status (max 12), title (flex), assignee (suffix)
  const idWidth = Math.max(8, ...issues.map((i) => sanitize(i.identifier ?? "").length));
  const rows = issues.map((i) => {
    const id = theme.fg("accent", sanitize(i.identifier ?? "?").padEnd(idWidth));
    const status = theme.fg("success", `[${sanitize(i.status ?? "?")}]`.padEnd(12));
    const title = sanitize(i.title ?? "(no title)");
    const assignee = sanitize(i.assignee ?? "");
    const assigneeSuffix = assignee.length > 0 ? ` ${theme.fg("dim", `@${assignee}`)}` : "";
    return `${id}  ${status}  ${title}${assigneeSuffix}`;
  });
  return [header, ...rows].join("\n");
}

/**
 * Render cho huly_get_issue (card layout).
 * Pi ToolDefinition.renderResult signature.
 */
export function renderIssueResult(
  result: AgentToolResult<IssueDetails>,
  _options: ToolRenderResultOptions,
  theme: RenderTheme,
  context: RenderContext,
): Component {
  const text = getOrCreateText(context);
  if (result.details !== undefined) {
    text.setText(formatIssueCard(result.details, theme));
  }
  return text;
}

/**
 * Render cho huly_list_issues (compact table).
 * Pi ToolDefinition.renderResult signature.
 */
export function renderIssueListResult(
  result: AgentToolResult<IssueListDetails>,
  _options: ToolRenderResultOptions,
  theme: RenderTheme,
  context: RenderContext,
): Component {
  const text = getOrCreateText(context);
  if (result.details !== undefined) {
    text.setText(formatIssueList(result.details, theme));
  }
  return text;
}
