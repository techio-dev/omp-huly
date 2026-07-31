// huly-ids.ts — Local replication của @hcengineering/core id helpers.
//
// Lý do KHÔNG import từ @hcengineering/core (CJS):
//   1. Static default import mất generateId/makeCollabId dưới vitest/vite transform
//      (cjs-module-lexer không detect exports qua __reExport loop) → test gãy.
//   2. createRequire(import.meta.url) sinh runtime require() mà omp loader KHÔNG
//      resolve được → "Cannot find module '@hcengineering/core'" khi load extension.
//   3. Cả 2 func KHÔNG có trong types/index.d.ts → buộc `as` cast unchecked.
// Local replication triệt tiêu cả 3: pure TS, zero CJS dependency, zero cast.
//
// Impl verified vs @hcengineering/core@0.7.423:
//   - lib/utils.js: toHex, counter, random, timestamp, generateId
//   - lib/collaboration.js: makeCollabId
// Format invariants: generateId = 24 lowercase hex (isId: /^[0-9a-f]{24}$/),
// makeCollabId = plain { objectClass, objectId, objectAttr } object.

/** Hex-encode value, zero-pad trái đến `chars` digits (mirror core toHex). */
function toHex(value: number, chars: number): string {
  const result = value.toString(16);
  return result.length < chars ? "0".repeat(chars - result.length) + result : result;
}

// 24-bit counter (seed random) + 10-hex process-random (mirror core utils.js:96-97).
let counter = (Math.random() * (1 << 24)) | 0;
const random =
  toHex((Math.random() * (1 << 24)) | 0, 6) + toHex((Math.random() * (1 << 16)) | 0, 4);

/**
 * Generate Huly _id: 24 lowercase hex (8 timestamp + 10 random + 6 counter).
 * Mirror @hcengineering/core generateId() — match doc thật + huly-mcp convention.
 * KHÔNG dùng `${class}.<rand>` class-prefix (hex 24 là convention Huly).
 */
export function generateId(): string {
  const time = (Date.now() / 1e3) | 0;
  const count = counter++ & 0xffffff;
  return toHex(time, 8) + random + toHex(count, 6);
}

/**
 * Build Huly collaboration id (objectClass + objectId + objectAttr).
 * Mirror @hcengineering/core makeCollabId() — trivial object wrapper, dùng cho
 * client.updateMarkup (collaborator.updateMarkup rpc).
 */
export function makeCollabId(
  objectClass: string,
  objectId: string,
  objectAttr: string,
): { objectClass: string; objectId: string; objectAttr: string } {
  return { objectClass, objectId, objectAttr };
}
