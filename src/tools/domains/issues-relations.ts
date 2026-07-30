// tools/domains/issues-relations.ts — Issue relations + doclink domain (5 tools).
// Design: 06-api.md §4 Issue relations. DAG + doc↔issue links.
//
// T-61 fix (2026-07-28): storage pattern KHỚP 100% với Huly thật, verified từ:
//   - plugins/tracker-resources/src/components/RelationsPopup.svelte:33-41
//   - plugins/tracker-resources/src/issues.ts:111 updateIssueRelation
//   - tests/sanity/tests/tracker/relations.spec.ts ("Mark as blocked by" / "Mark as blocking")
//
// Issue interface (Huly thật) CHỈ có 2 field relation:
//   - Issue.blockedBy?: RelatedDocument[]    — issues đang BLOCK issue này
//   - Issue.relations?: RelatedDocument[]    — related-to (bidirectional)
// RelatedDocument = Pick<Doc, '_id' | '_class'> = { _id, _class } — KHÔNG có
// relationType field. KHÔNG có field `blocks` — "blocks" được COMPUTE bằng
// reverse query (tìm issues có blockedBy._id === currentIssue._id).
//
// Mapping relationType → storage (T-61, đúng Huly pattern):
//   - "blocks"        → target.blockedBy[] push { _id: source, _class }
//                       (A blocks B → B.blockedBy.push(A) — push lên ĐÍCH B)
//   - "is-blocked-by" → source.blockedBy[] push { _id: target, _class }
//                       (A blocked-by B → A.blockedBy.push(B) — push lên NGUỒN A)
//   - "relates-to"    → BIDIRECTIONAL: A.relations.push(B) + B.relations.push(A)
//                       (2 updateDoc call, khớp RelationsPopup dòng 34-39)
//
// Tools (5, FR-04 D4):
//   1. add_issue_relation     2. remove_issue_relation  3. list_issue_relations
//   4. link_document_to_issue 5. unlink_document_to_issue

import { z } from "zod";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { ISSUE_CLASS } from "./_class-refs.js";
import {
  workspaceParam,
  projectParam,
  identifierParam,
  resolveIdentifier,
  safeUpdateDoc,
} from "./_common.js";

/** RelatedDocument shape = { _id: Ref<Doc>, _class: Ref<Class<Doc>> }. */
function makeRelatedDoc(targetId: string): { _id: string; _class: string } {
  return { _id: targetId, _class: ISSUE_CLASS };
}

/** Check nếu relation đã tồn tại trong mảng (idempotent guard). */
function hasRelation(arr: unknown[] | undefined, targetId: string): boolean {
  if (!Array.isArray(arr)) return false;
  return arr.some((r) => (r as { _id?: string })._id === targetId);
}

export const tools: HulyToolDefinition[] = [
  // 1. add_issue_relation — DAG dependency
  defineHulyTool({
    name: "add_issue_relation",
    label: "Add issue relation",
    description:
      "Add relation between issues. relationType: blocks | is-blocked-by | relates-to. " +
      "Storage (T-61, khớp Huly UI): blocks→target.blockedBy, is-blocked-by→source.blockedBy, " +
      "relates-to→bidirectional (cả 2 issue.relations).",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      targetIssue: z.string().describe("Target issue identifier."),
      relationType: z.enum(["blocks", "is-blocked-by", "relates-to"]),
    }),
    async handler(params, tctx) {
      const issue = await tctx.client.findOne(ISSUE_CLASS, {
        identifier: resolveIdentifier(tctx.project!, params.identifier),
      });
      if (!issue) {
        return {
          content: `Issue "${params.identifier}" not found.`,
          isError: true,
          details: { identifier: params.identifier },
        };
      }
      // T-52 #42: validate targetIssue tồn tại + resolve identifier → _id.
      // targetIssue cho phép CROSS-PROJECT (raw identifier, KHÔNG resolveIdentifier)
      // — khác source (identifier dòng 67 dùng resolveIdentifier throw nếu cross).
      // Khớp Huly UI RelationsPopup: ObjectSearchPopup pick bất kỳ issue nào bất kể
      // project. Đây là INTENT, không phải bug.
      const target = await tctx.client.findOne(ISSUE_CLASS, {
        identifier: params.targetIssue,
      });
      if (!target) {
        return {
          content: `Target issue "${params.targetIssue}" not found. Check identifier.`,
          isError: true,
          details: { targetIssue: params.targetIssue, identifier: params.identifier },
        };
      }

      // T-61 fix: storage pattern KHỚP Huly thật (RelationsPopup.svelte +
      // updateIssueRelation). 3 nhánh rõ ràng:
      //   - blocks         → target.blockedBy push source (A blocks B → B.blockedBy.push(A))
      //   - is-blocked-by  → source.blockedBy push target (A blocked-by B → A.blockedBy.push(B))
      //   - relates-to     → BIDIRECTIONAL: A.relations.push(B) + B.relations.push(A)
      if (params.relationType === "blocks") {
        // A blocks B → B.blockedBy.push(A). Push lên ĐÍCH B.
        const targetBlockedBy = (target as { blockedBy?: unknown[] }).blockedBy;
        if (hasRelation(targetBlockedBy, issue._id as string)) {
          return {
            content: `Relation ${params.identifier} -[blocks]-> ${params.targetIssue} already exists (no-op).`,
            details: { idempotent: true, relationType: params.relationType },
          };
        }
        const updResult = await safeUpdateDoc(tctx.client, ISSUE_CLASS, target, {
          $push: { blockedBy: makeRelatedDoc(issue._id as string) },
        });
        if (!updResult.ok) return updResult.error;
      } else if (params.relationType === "is-blocked-by") {
        // A is-blocked-by B → A.blockedBy.push(B). Push trên NGUỒN A.
        const issueBlockedBy = (issue as { blockedBy?: unknown[] }).blockedBy;
        if (hasRelation(issueBlockedBy, target._id as string)) {
          return {
            content: `Relation ${params.identifier} -[is-blocked-by]-> ${params.targetIssue} already exists (no-op).`,
            details: { idempotent: true, relationType: params.relationType },
          };
        }
        const updResult = await safeUpdateDoc(tctx.client, ISSUE_CLASS, issue, {
          $push: { blockedBy: makeRelatedDoc(target._id as string) },
        });
        if (!updResult.ok) return updResult.error;
      } else {
        // relates-to → BIDIRECTIONAL: A.relations.push(B) + B.relations.push(A).
        // Khớp RelationsPopup.svelte dòng 34-39 (updateRelation type='relations'
        // gọi updateIssueRelation 2 lần: value→refDocument + refDocument→value).
        //
        // NON-ATOMIC (khớp hành vi Huly gốc — RelationsPopup cũng 2 thao tác riêng,
        // không transaction): nếu forward commit xong nhưng reverse throw (vd network
        // drop, quyền space khác khi cross-project), A.relations có B nhưng B.relations
        // chưa có A → lệch 1 chiều. Idempotent guard (forwardExists/reverseExists)
        // cho phép retry an toàn — lần sau chỉ push chiều còn thiếu, không duplicate.
        const issueRelations = (issue as { relations?: unknown[] }).relations;
        const targetRelations = (target as { relations?: unknown[] }).relations;
        const forwardExists = hasRelation(issueRelations, target._id as string);
        const reverseExists = hasRelation(targetRelations, issue._id as string);
        if (forwardExists && reverseExists) {
          return {
            content: `Relation ${params.identifier} -[relates-to]-> ${params.targetIssue} already exists (no-op).`,
            details: { idempotent: true, relationType: params.relationType },
          };
        }
        // Forward: A.relations.push(B)
        if (!forwardExists) {
          const updResult = await safeUpdateDoc(tctx.client, ISSUE_CLASS, issue, {
            $push: { relations: makeRelatedDoc(target._id as string) },
          });
          if (!updResult.ok) return updResult.error;
        }
        // Reverse: B.relations.push(A)
        if (!reverseExists) {
          const updResult = await safeUpdateDoc(tctx.client, ISSUE_CLASS, target, {
            $push: { relations: makeRelatedDoc(issue._id as string) },
          });
          if (!updResult.ok) return updResult.error;
        }
      }
      return {
        content: `Added relation ${params.identifier} -[${params.relationType}]-> ${params.targetIssue}.`,
        details: {
          identifier: params.identifier,
          targetIssue: params.targetIssue,
          targetIssueId: target._id,
          relationType: params.relationType,
        },
      };
    },
  }),

  // 2. remove_issue_relation — T-59: $pull theo targetIssue + relationType
  // (KHÔNG dùng relation _id nữa — relation là array element, KHÔNG phải doc riêng)
  defineHulyTool({
    name: "remove_issue_relation",
    label: "Remove issue relation",
    description:
      "Remove relation between issues. Pass targetIssue + relationType (KHÔNG dùng relation _id — " +
      "Huly stores relations inline trong Issue.relations / blockedBy array). Storage (T-61, khớp " +
      "Huly UI): blocks→target.blockedBy, is-blocked-by→source.blockedBy, relates-to→bidirectional.",
    destructive: true,
    needsProject: true,
    destructiveContext: (p) => ({
      type: "issue relation",
      id: (p as { identifier?: string }).identifier ?? "<unknown>",
    }),
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      targetIssue: z.string().describe("Target issue identifier to remove relation to."),
      relationType: z.enum(["blocks", "is-blocked-by", "relates-to"]),
    }),
    async handler(params, tctx) {
      const issue = await tctx.client.findOne(ISSUE_CLASS, {
        identifier: resolveIdentifier(tctx.project!, params.identifier),
      });
      if (!issue) {
        return {
          content: `Issue "${params.identifier}" not found.`,
          isError: true,
          details: { identifier: params.identifier },
        };
      }
      const target = await tctx.client.findOne(ISSUE_CLASS, {
        identifier: params.targetIssue,
      });
      if (!target) {
        return {
          content: `Target issue "${params.targetIssue}" not found.`,
          isError: true,
          details: { targetIssue: params.targetIssue },
        };
      }

      // T-61 fix: $pull đối xứng add. 3 nhánh rõ ràng:
      //   - blocks         → $pull target.blockedBy (xóa source khỏi blockedBy của đích)
      //   - is-blocked-by  → $pull source.blockedBy (xóa target khỏi blockedBy của nguồn)
      //   - relates-to     → BIDIRECTIONAL: $pull cả 2 chiều issue.relations + target.relations
      const pullRef = makeRelatedDoc(target._id as string);
      const pullSourceRef = makeRelatedDoc(issue._id as string);
      if (params.relationType === "blocks") {
        // A blocks B → xóa A khỏi B.blockedBy[]. Pull trên ĐÍCH B.
        if (!hasRelation((target as { blockedBy?: unknown[] }).blockedBy, issue._id as string)) {
          return {
            content: `Relation ${params.identifier} -[blocks]-> ${params.targetIssue} did not exist (no-op, idempotent).`,
            details: { idempotent: true, relationType: params.relationType },
          };
        }
        const updResult = await safeUpdateDoc(tctx.client, ISSUE_CLASS, target, {
          $pull: { blockedBy: pullSourceRef },
        });
        if (!updResult.ok) return updResult.error;
      } else if (params.relationType === "is-blocked-by") {
        // A is-blocked-by B → xóa B khỏi A.blockedBy[]. Pull trên NGUỒN A.
        if (!hasRelation((issue as { blockedBy?: unknown[] }).blockedBy, target._id as string)) {
          return {
            content: `Relation ${params.identifier} -[is-blocked-by]-> ${params.targetIssue} did not exist (no-op, idempotent).`,
            details: { idempotent: true, relationType: params.relationType },
          };
        }
        const updResult = await safeUpdateDoc(tctx.client, ISSUE_CLASS, issue, {
          $pull: { blockedBy: pullRef },
        });
        if (!updResult.ok) return updResult.error;
      } else {
        // relates-to → BIDIRECTIONAL: $pull cả 2 chiều.
        const forwardExists = hasRelation(
          (issue as { relations?: unknown[] }).relations,
          target._id as string,
        );
        const reverseExists = hasRelation(
          (target as { relations?: unknown[] }).relations,
          issue._id as string,
        );
        if (!forwardExists && !reverseExists) {
          return {
            content: `Relation ${params.identifier} -[relates-to]-> ${params.targetIssue} did not exist (no-op, idempotent).`,
            details: { idempotent: true, relationType: params.relationType },
          };
        }
        if (forwardExists) {
          const updResult = await safeUpdateDoc(tctx.client, ISSUE_CLASS, issue, {
            $pull: { relations: pullRef },
          });
          if (!updResult.ok) return updResult.error;
        }
        if (reverseExists) {
          const updResult = await safeUpdateDoc(tctx.client, ISSUE_CLASS, target, {
            $pull: { relations: pullSourceRef },
          });
          if (!updResult.ok) return updResult.error;
        }
      }
      return {
        content: `Removed relation ${params.identifier} -[${params.relationType}]-> ${params.targetIssue}.`,
        details: {
          identifier: params.identifier,
          targetIssue: params.targetIssue,
          relationType: params.relationType,
        },
      };
    },
  }),

  // 3. list_issue_relations — T-59: read Issue.relations + blockedBy trực tiếp
  defineHulyTool({
    name: "list_issue_relations",
    label: "List issue relations",
    description:
      "List relations (blocks/is-blocked-by/relates-to) của issue. " +
      "blocks: reverse query findAll (issues có blockedBy._id === issue._id). " +
      "is-blocked-by: đọc issue.blockedBy trực tiếp. " +
      "relates-to: đọc issue.relations (bidirectional).",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
    }),
    async handler(params, tctx) {
      const issue = await tctx.client.findOne(ISSUE_CLASS, {
        identifier: resolveIdentifier(tctx.project!, params.identifier),
      });
      if (!issue) {
        return {
          content: `Issue "${params.identifier}" not found.`,
          isError: true,
          details: { identifier: params.identifier },
        };
      }
      // T-61 fix: 3 hướng rõ ràng, khớp Huly UI RelationsPopup:
      //   - is-blocked-by: đọc issue.blockedBy (issues blocking this)
      //   - relates-to:    đọc issue.relations (bidirectional related)
      //   - blocks:        REVERSE QUERY — findAll issues có blockedBy._id === issue._id
      //                    (issues mà issue này blocks — KHÔNG có field riêng)
      const blockedBy = ((issue as { blockedBy?: unknown[] }).blockedBy ?? []) as Array<{
        _id?: string;
        _class?: string;
      }>;
      const relations = ((issue as { relations?: unknown[] }).relations ?? []) as Array<{
        _id?: string;
        _class?: string;
      }>;
      // T-80 #103: blocks = REVERSE QUERY. Dotted-path `{ "blockedBy._id": x }`
      // returns NO rows trong Huly query engine — phải object form
      // `{ blockedBy: { _id, _class } }` (verified trusted PR #48 comment).
      const blockedResults = (await tctx.client.findAll(ISSUE_CLASS, {
        blockedBy: { _id: issue._id, _class: ISSUE_CLASS },
      } as never)) as Array<{ _id?: string; identifier?: string; _class?: string }>;
      // T-80 #103: resolve raw _id → identifier (batch findAll $in). Trước đây
      // trả raw Ref → LLM không dùng được kết quả.
      const allIds = [
        ...blockedResults.map((r) => r._id),
        ...blockedBy.map((r) => r._id),
        ...relations.map((r) => r._id),
      ].filter((id): id is string => typeof id === "string");
      const idMap = new Map<string, string>();
      if (allIds.length > 0) {
        const resolved = (await tctx.client.findAll(ISSUE_CLASS, {
          _id: { $in: allIds },
        } as never)) as Array<{ _id?: string; identifier?: string }>;
        for (const r of resolved) {
          if (r._id !== undefined && r.identifier !== undefined) {
            idMap.set(r._id, r.identifier);
          }
        }
      }
      const blocksList = blockedResults.map((r) => ({
        identifier: r._id !== undefined ? idMap.get(r._id) : undefined,
        targetIssueId: r._id,
        direction: "blocks" as const,
      }));
      const blockedList = blockedBy.map((r) => ({
        identifier: r._id !== undefined ? idMap.get(r._id) : undefined,
        targetIssueId: r._id,
        direction: "is-blocked-by" as const,
      }));
      const relList = relations.map((r) => ({
        identifier: r._id !== undefined ? idMap.get(r._id) : undefined,
        targetIssueId: r._id,
        direction: "relates-to" as const,
      }));
      const all = [...blocksList, ...blockedList, ...relList];
      return {
        content:
          `Found ${all.length} relation(s) on ${params.identifier} ` +
          `(${blocksList.length} blocks, ${blockedList.length} is-blocked-by, ${relList.length} relates-to).`,
        details: { count: all.length, relations: all },
      };
    },
  }),

  // 4. link_document_to_issue — T-60: honest-unavailable (DOCUMENT_CLASS orphan)
  defineHulyTool({
    name: "link_document_to_issue",
    label: "Link document to issue",
    description:
      "UNAVAILABLE — tracker:class:Document not registered runtime. Link doc↔issue via Huly UI.",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      document: z.string(),
    }),
    async handler(_params, _tctx) {
      return {
        content:
          `link_document_to_issue KHÔNG khả dụng: Huly runtime class ` +
          `"tracker:class:Document" KHÔNG register trong plugin() class block ` +
          `(interface orphan — T-58 audit). Link doc↔issue qua Huly UI Relations ` +
          `panel trực tiếp.`,
        isError: true,
        details: { reason: "interface_orphan", useClass: "tracker:class:Document" },
      };
    },
  }),

  // 5. unlink_document_to_issue — T-60: honest-unavailable (DOCUMENT_CLASS orphan)
  defineHulyTool({
    name: "unlink_document_to_issue",
    label: "Unlink document from issue",
    description:
      "UNAVAILABLE — tracker:class:Document not registered runtime. Unlink doc↔issue via Huly UI.",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      document: z.string(),
    }),
    async handler(_params, _tctx) {
      return {
        content:
          `unlink_document_to_issue KHÔNG khả dụng: Huly runtime class ` +
          `"tracker:class:Document" KHÔNG register trong plugin() class block ` +
          `(interface orphan — T-58 audit). Unlink doc↔issue qua Huly UI ` +
          `Relations panel trực tiếp.`,
        isError: true,
        details: { reason: "interface_orphan", useClass: "tracker:class:Document" },
      };
    },
  }),
];
