// confirmGate — confirmDestructive cho destructive ops (FR-09 D9).
// Design: 04-system.md §6 tools/confirm.ts, 01 §B.9 D9, 06-api.md §6 confirm flow.
//
// Behavior:
//   ctx.hasUI === true (TUI/RPC) → ctx.ui.confirm prompt — user choose yes/no
//   ctx.hasUI === false (print/json/CI) → auto-deny (KHÔNG bypass — 05 §4 safety)
//
// Confirm KHÔNG bypass: non-TUI mode deny mọi destructive op (NFR-10 safety).

import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";

/** Detail object cho confirm prompt. */
export interface ConfirmContext {
  /** Type entity bị xóa (vd "issue", "document", "project"). */
  type: string;
  /** Identifier (vd "PD-123", doc id). */
  id: string;
  /** Optional extra detail (vd cascade count "Cascade: 5 items"). */
  detail?: string;
}

/**
 * Confirm destructive operation với user (FR-09 D9).
 *
 * @param ctx Pi extension context (cho hasUI check + ui.confirm)
 * @param c   Confirm context: type + id + optional detail
 * @returns true nếu user confirmed, false nếu denied HOẶC non-TUI auto-deny
 *
 * Non-TUI (print/json/CI, ctx.hasUI===false) → auto-deny KHÔNG bypass.
 */
export async function confirmDestructive(
  ctx: ExtensionContext,
  c: ConfirmContext,
): Promise<boolean> {
  // Non-TUI → auto-deny (KHÔNG bypass — NFR-10)
  if (ctx.hasUI !== true) {
    return false;
  }

  const title = `Delete ${c.type}`;
  const message =
    c.detail !== undefined && c.detail.length > 0
      ? `Delete ${c.type} "${c.id}"? ${c.detail}`
      : `Delete ${c.type} "${c.id}"?`;

  try {
    return await ctx.ui.confirm(title, message);
  } catch {
    // UI error (e.g. dialog dismissed) → treat as deny (safe default)
    return false;
  }
}
