// render/document.ts — TUI render cho huly_get_document (title + content preview).
// Design: 04-system.md §6 render/document.ts, 06-api.md §3 render hooks (D12).
//
// renderDocumentResult theo pi signature: (result, options, theme, context) => Component.
// Pure format function (formatDocumentPreview) dùng theme.fg() colorize.
// Shared helpers + RenderTheme/RenderContext ở render/util.ts.
//
// Layout:
//   Title (bold, mdHeading color)
//   ─── Content (preview) ─── (dim)
//   <content preview, 12 dòng đầu>
//   modified: 2026-01-01 (dim)

import type { Component } from "@oh-my-pi/pi-tui";
import type { AgentToolResult, ToolRenderResultOptions } from "@oh-my-pi/pi-coding-agent";
import {
  fmtDate,
  getOrCreateText,
  sanitize,
  type RenderContext,
  type RenderTheme,
} from "./util.js";

/** Document details shape từ huly_get_document (xem domains/documents.ts). */
export interface DocumentDetails {
  id?: string;
  title?: string;
  content?: string;
  modifiedOn?: number;
}

// Re-export cho consumer single-import.
export type { RenderTheme, RenderContext } from "./util.js";

/**
 * Format document preview. Pure function — testable.
 * Layout:
 *   Title (mdHeading, bold)
 *   ─── Content (preview) ─── (dim)
 *   <content preview — 12 dòng đầu>
 *   modified: 2026-01-01 (dim, optional)
 *
 * Content preview giới hạn 12 dòng (pi tự truncate byte/line). Tránh dump full
 * document dài vào render (LLM đã nhận content đầy đủ qua tool result text).
 * Mọi string từ server qua sanitize() (code-review-mentor #5 ANSI injection).
 */
export function formatDocumentPreview(details: DocumentDetails, theme: RenderTheme): string {
  const title = sanitize(details.title ?? "(untitled document)");
  const lines: string[] = [`${theme.bold(theme.fg("mdHeading", title))}`];

  if (details.content !== undefined && details.content.length > 0) {
    const contentLines = sanitize(details.content).split("\n").slice(0, 12);
    lines.push(theme.fg("dim", "─── Content (preview) ───"));
    lines.push(...contentLines);
  }

  const modified = fmtDate(details.modifiedOn, theme);
  if (modified.length > 0) {
    lines.push(theme.fg("dim", `modified: ${modified}`));
  }

  return lines.join("\n");
}

/**
 * Render cho huly_get_document (title + content preview).
 * Pi ToolDefinition.renderResult signature.
 */
export function renderDocumentResult(
  result: AgentToolResult<DocumentDetails>,
  _options: ToolRenderResultOptions,
  theme: RenderTheme,
  context: RenderContext,
): Component {
  const text = getOrCreateText(context);
  if (result.details !== undefined) {
    text.setText(formatDocumentPreview(result.details, theme));
  }
  return text;
}
