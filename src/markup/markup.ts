// MarkupConverter — markdown ↔ Huly markup wrapper.
// Design: 04-system.md §6 markup.ts, 01 §B.10 D10 (parser dùng text-markdown).
//
// Parser = @hcengineering/text-markdown (markdownToMarkup/markupToMarkdown).
// Native-ref transform (browse-URL) = reimplement ở T-08b (separate module).

// CJS interop: @hcengineering/text-markdown ships CommonJS → named ESM imports
// crash at runtime. Default import + destructure.
import textMarkdown from "@hcengineering/text-markdown";
import type { MarkdownOptions } from "@hcengineering/text-markdown";
const { markdownToMarkup, markupToMarkdown } = textMarkdown;
import type { MarkupNode } from "@hcengineering/text-core";

/** Re-export MarkupNode type cho consumer. */
export type { MarkupNode, MarkdownOptions };

/**
 * Convert markdown → Huly markup node tree.
 * Native-ref transform (md link → native ref) = T-08b (KHÔNG ở đây).
 */
export function mdToMarkup(md: string, options?: MarkdownOptions): MarkupNode {
  return markdownToMarkup(md, options);
}

/**
 * Convert Huly markup node tree → markdown.
 * Native-ref transform (native ref → md link) = T-08b (KHÔNG ở đây).
 */
export function markupToMd(markup: MarkupNode, options?: MarkdownOptions): string {
  return markupToMarkdown(markup, options);
}

/**
 * Round-trip: markdown → markup → markdown.
 * Useful cho test (lossless check).
 *
 * Note: KHÔNG guaranteed lossless do markdown dialects khác.
 * R8 native-ref round-trip fidelity = T-08b concern.
 */
export function roundTripMd(md: string, options?: MarkdownOptions): string {
  return markupToMd(mdToMarkup(md, options), options);
}
