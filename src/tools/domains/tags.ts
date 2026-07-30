// tools/domains/tags.ts — Tags domain (7 tools).
// Design: 06-api.md §4 Tags. CRUD + attach/detach/list_attached.
//
// Tags khác labels: PROJECT-SCOPED (không global). (05-data-model §3)

import { z } from "zod";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { TAG_CLASS, TAG_REFERENCE_CLASS, ISSUE_CLASS, idRef } from "./_class-refs.js";
import {
  workspaceParam,
  projectParam,
  identifierParam,
  resolveIdentifier,
  safeUpdateDoc,
  safeRemoveDoc,
  getProjectSpace,
} from "./_common.js";

export const tools: HulyToolDefinition[] = [
  // 1. list_tags — T-73: optional targetClass filter (tags scoped theo class attach)
  defineHulyTool({
    name: "list_tags",
    label: "List tags",
    description: "List tags trong project. Optional targetClass filter (vd tracker:class:Issue).",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      targetClass: z.optional(
        z.string().describe("Filter tags theo target class (vd tracker:class:Issue)."),
      ),
    }),
    async handler(params, tctx) {
      // T-93 (#139): scope theo project space (tags là PROJECT-SCOPED). Trước đây
      // findAll không filter → list không thấy tag vừa create (tag tạo sai space).
      const space = await getProjectSpace(tctx.client, tctx.project!);
      if (!space) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const query: Record<string, unknown> = { space };
      if (params.targetClass !== undefined) query.targetClass = params.targetClass;
      const tags = await tctx.client.findAll(TAG_CLASS, query as never, {});
      const list = tags.map((t) => ({
        _id: t._id,
        title: (t as { title?: string }).title ?? "",
        color: (t as { color?: string }).color,
      }));
      return {
        content: `Found ${list.length} tag(s).`,
        details: { count: list.length, tags: list },
      };
    },
  }),

  // 2. create_tag
  defineHulyTool({
    name: "create_tag",
    label: "Create tag",
    description: "Create tag (project-scoped).",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      title: z.string(),
      color: z.optional(z.string()),
    }),
    async handler(params, tctx) {
      // T-93 (#139): tạo trong PROJECT space (project._id self-ref qua
      // getProjectSpace), KHÔNG spaceRef(tctx.workspace) (workspace-handle string
      // → tag orphan, list/attach không thấy). File header: tags PROJECT-SCOPED.
      const space = await getProjectSpace(tctx.client, tctx.project!);
      if (!space) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const id = await tctx.client.createDoc(TAG_CLASS, space as never, {
        title: params.title,
        color: params.color,
      });
      return {
        content: `Created tag "${params.title}".`,
        details: { id, title: params.title },
      };
    },
  }),

  // 3. update_tag
  defineHulyTool({
    name: "update_tag",
    label: "Update tag",
    description: "Update tag (title, color).",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      tag: z.string(),
      title: z.optional(z.string()),
      color: z.optional(z.string()),
    }),
    async handler(params, tctx) {
      const t = await tctx.client.findOne(TAG_CLASS, { _id: params.tag });
      if (!t) {
        return {
          content: `Tag "${params.tag}" not found.`,
          isError: true,
          details: { tag: params.tag },
        };
      }
      const ops: Record<string, unknown> = {};
      if (params.title !== undefined) ops.title = params.title;
      if (params.color !== undefined) ops.color = params.color;
      if (Object.keys(ops).length === 0) {
        return { content: "No fields to update.", details: { updated: false } };
      }
      const updResult = await safeUpdateDoc(tctx.client, TAG_CLASS, t, ops);
      if (!updResult.ok) return updResult.error;
      return {
        content: `Updated tag ${params.tag}.`,
        details: { updated: true, fields: Object.keys(ops) },
      };
    },
  }),

  // 4. delete_tag — destructive
  defineHulyTool({
    name: "delete_tag",
    label: "Delete tag",
    description: "Delete tag (destructive).",
    destructive: true,
    needsProject: true,
    destructiveContext: (p) => ({
      type: "tag",
      id: (p as { tag?: string }).tag ?? "<unknown>",
    }),
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      tag: z.string(),
    }),
    async handler(params, tctx) {
      const t = await tctx.client.findOne(TAG_CLASS, { _id: params.tag });
      if (!t) {
        return {
          content: `Tag "${params.tag}" not found.`,
          isError: true,
          details: { tag: params.tag },
        };
      }
      const delResult = await safeRemoveDoc(tctx.client, TAG_CLASS, t);
      if (!delResult.ok) return delResult.error;
      return {
        content: `Deleted tag ${params.tag}.`,
        details: { deleted: true, tag: params.tag },
      };
    },
  }),

  // 5. list_attached_tags — T-69: findAll TagReference (KHÔNG issue.tags inline)
  defineHulyTool({
    name: "list_attached_tags",
    label: "List attached tags",
    description: "List tags attached to issue.",
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
      // T-69: TagReference là AttachedDoc — findAll collection "labels".
      const refs = await tctx.client.findAll(
        TAG_REFERENCE_CLASS,
        {
          attachedTo: issue._id,
          attachedToClass: ISSUE_CLASS,
          collection: "labels",
        } as never,
        {},
      );
      const tags = refs.map((r) => {
        const ref = r as { _id: string; tag?: string; title?: string; color?: number };
        return { _id: ref._id, tag: ref.tag, title: ref.title, color: ref.color };
      });
      return {
        content: `Found ${tags.length} tag(s) attached to ${params.identifier}.`,
        details: { count: tags.length, tags },
      };
    },
  }),

  // 6. attach_tag — T-69: addCollection TagReference (collection "labels")
  defineHulyTool({
    name: "attach_tag",
    label: "Attach tag",
    description: "Attach tag to issue. Accepts tag title or _id (resolved title-first).",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      tag: z.string().describe("Tag title or _id."),
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
      // T-94 (#140): title-first, _id fallback (mirror add_issue_label). Trước đây
      // _id-only → dead-end (create_tag/list_tags không surface _id cho LLM).
      const tag =
        (await tctx.client.findOne(TAG_CLASS, { title: params.tag })) ??
        (await tctx.client.findOne(TAG_CLASS, { _id: idRef(params.tag) }));
      if (!tag) {
        return {
          content: `Tag "${params.tag}" not found. Create via create_tag first.`,
          isError: true,
          details: { identifier: params.identifier, tag: params.tag },
        };
      }
      const tagDoc = tag as { _id: string; title?: string; color?: number | string };
      // Idempotent: findAll TagReference collection "labels" check exists.
      const existing = await tctx.client.findAll(
        TAG_REFERENCE_CLASS,
        {
          attachedTo: issue._id,
          attachedToClass: ISSUE_CLASS,
          collection: "labels",
          tag: tagDoc._id,
        } as never,
        {},
      );
      if (existing.length > 0) {
        return {
          content: `Tag ${params.tag} already attached (no-op).`,
          details: { attached: true, tag: params.tag, idempotent: true },
        };
      }
      // addCollection TagReference AttachedDoc (collection "labels"). Attributes
      // {tag, title, color:Number} — weight optional, omit khi undefined.
      const attrs: Record<string, unknown> = {
        tag: tagDoc._id,
        title: tagDoc.title ?? params.tag,
        color: Number(tagDoc.color ?? 0),
      };
      const id = await tctx.client.addCollection(
        TAG_REFERENCE_CLASS,
        issue.space as never,
        issue._id as never,
        ISSUE_CLASS,
        "labels",
        attrs as never,
      );
      return {
        content: `Attached tag ${params.tag} to ${params.identifier}.`,
        details: {
          identifier: params.identifier,
          tag: params.tag,
          tagId: tagDoc._id,
          tagRefId: id,
        },
      };
    },
  }),

  // 7. detach_tag — T-69: findAll TagReference + removeDoc matching
  defineHulyTool({
    name: "detach_tag",
    label: "Detach tag",
    description: "Detach tag from issue. Accepts tag title or _id (resolved title-first).",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      tag: z.string().describe("Tag title or _id."),
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
      // T-94 (#140): title-first, _id fallback (đồng bộ attach_tag).
      const tag =
        (await tctx.client.findOne(TAG_CLASS, { title: params.tag })) ??
        (await tctx.client.findOne(TAG_CLASS, { _id: idRef(params.tag) }));
      if (!tag) {
        return {
          content: `Tag "${params.tag}" not found.`,
          isError: true,
          details: { identifier: params.identifier, tag: params.tag },
        };
      }
      const tagDoc = tag as { _id: string };
      // findAll TagReference matching tag trên issue.
      const refs = await tctx.client.findAll(
        TAG_REFERENCE_CLASS,
        {
          attachedTo: issue._id,
          attachedToClass: ISSUE_CLASS,
          collection: "labels",
          tag: tagDoc._id,
        } as never,
        {},
      );
      if (refs.length === 0) {
        return {
          content: `Tag ${params.tag} not on ${params.identifier} (no-op).`,
          details: { detached: false, idempotent: true, tag: params.tag },
        };
      }
      // removeDoc each matching TagReference.
      for (const r of refs) {
        const ref = r as { _id: string; space?: string };
        await tctx.client.removeDoc(
          TAG_REFERENCE_CLASS,
          (ref.space ?? issue.space) as never,
          ref._id as never,
        );
      }
      return {
        content: `Detached tag ${params.tag} from ${params.identifier}.`,
        details: {
          identifier: params.identifier,
          tag: params.tag,
          tagId: tagDoc._id,
          removed: refs.length,
        },
      };
    },
  }),
];
