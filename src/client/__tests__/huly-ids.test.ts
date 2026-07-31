// huly-ids.ts — format invariant tests (local replication của @hcengineering/core).
// Defends: generateId = 24 lowercase hex (Huly isId contract), makeCollabId shape.

import { describe, expect, it } from "vitest";
import { generateId, makeCollabId } from "../huly-ids.js";

describe("huly-ids (local replication @hcengineering/core)", () => {
  describe("generateId", () => {
    it("trả 24 lowercase hex (Huly isId contract /^[0-9a-f]{24}$/)", () => {
      const id = generateId();
      expect(id).toMatch(/^[0-9a-f]{24}$/);
      expect(id.length).toBe(24);
      expect(id).toBe(id.toLowerCase());
    });

    it("unique qua nhiều lần gọi (counter increment + timestamp)", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) ids.add(generateId());
      expect(ids.size).toBe(1000);
    });

    it("timestamp prefix (8 hex đầu) ~ Date.now seconds", () => {
      const before = (Date.now() / 1e3) | 0;
      const id = generateId();
      const ts = parseInt(id.slice(0, 8), 16);
      // Within ~2s window (allow for second boundary crossing).
      expect(Math.abs(ts - before)).toBeLessThanOrEqual(2);
    });
  });

  describe("makeCollabId", () => {
    it("trả { objectClass, objectId, objectAttr } (mirror core collaboration.js)", () => {
      expect(makeCollabId("document:class:Document", "abc123", "content")).toEqual({
        objectClass: "document:class:Document",
        objectId: "abc123",
        objectAttr: "content",
      });
    });
  });
});
