// tools/domains/issues-templates.ts — Issue templates domain (8 tools).
// Design: 06-api.md §4 Issue templates. CRUD + create_from + children.

import { z } from "zod";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import {
  ISSUE_TEMPLATE_CLASS,
  ISSUE_CLASS,
  PROJECT_CLASS,
  PERSON_CLASS,
  COMPONENT_CLASS,
  NO_PARENT_REF,
  ISSUE_KIND_REF,
} from "./_class-refs.js";
import type { IssueTemplateDoc, PersonDoc, ComponentDoc } from "./_entity-types.js";
import {
  workspaceParam,
  projectParam,
  safeUpdateDoc,
  safeRemoveDoc,
  getProjectSpace,
} from "./_common.js";
import { mdToMarkup } from "../../markup/markup.js";
import { findPersonByEmailOrName } from "./contacts.js";

/** T-76: IssueTemplateChild object shape (replaces raw string in children array). */
interface TemplateChild {
  id: string;
  title: string;
  description?: string;
  priority?: string;
  assignee?: string | null;
  component?: string | null;
  estimation?: number;
}

/** Generate Huly-style id for template child (Ref<Issue> placeholder). */
function genChildId(): string {
  return `tracker:issue.${Math.random().toString(36).slice(2, 12)}`;
}

export const tools: HulyToolDefinition[] = [
  // 1. list_templates
  defineHulyTool({
    name: "list_templates",
    label: "List issue templates",
    description: "List issue templates trong project.",
    needsProject: true,
    parameters: z.object({ workspace: workspaceParam, project: projectParam }),
    async handler(_params, tctx) {
      // T-71: space scoping (KHÔNG findAll global cross-project).
      const space = await getProjectSpace(tctx.client, tctx.project!);
      if (!space) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      // T-89 #124: sort modifiedOn Descending + output priority/modifiedOn/childrenCount. T-90: native IssueTemplateDoc.
      const tpls = await tctx.client.findAll<IssueTemplateDoc>(
        ISSUE_TEMPLATE_CLASS,
        { space },
        {
          sort: { modifiedOn: -1 },
        },
      );
      const list = tpls.map((tpl) => ({
        _id: tpl._id,
        title: tpl.title ?? "",
        priority: tpl.priority,
        modifiedOn: tpl.modifiedOn,
        childrenCount: tpl.children?.length ?? 0,
      }));
      return {
        content: `Found ${list.length} template(s).`,
        details: { count: list.length, templates: list },
      };
    },
  }),

  // 2. get_template
  defineHulyTool({
    name: "get_template",
    label: "Get issue template",
    description: "Get issue template by id.",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      template: z.string(),
    }),
    async handler(params, tctx) {
      // T-100 (#146): scope template lookup theo project space (mirror components.ts T-81).
      const space = await getProjectSpace(tctx.client, tctx.project!);
      if (!space) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const tpl = await tctx.client.findOne<IssueTemplateDoc>(ISSUE_TEMPLATE_CLASS, {
        _id: params.template,
        space,
      } as never);
      if (!tpl) {
        return {
          content: `Template "${params.template}" not found.`,
          isError: true,
          details: { template: params.template },
        };
      }
      // T-89 #124: resolve description MarkupBlobRef → markdown.
      let description: string | undefined;
      if (tpl.description) {
        try {
          description = await tctx.client.fetchMarkup(
            ISSUE_TEMPLATE_CLASS,
            tpl._id,
            "description",
            tpl.description,
            "markdown",
          );
        } catch {
          // Markup fetch fail — omit description.
        }
      }
      // T-89 #124: resolve assignee (Person name) + component (label). T-90: native PersonDoc/ComponentDoc.
      let assigneeName: string | undefined;
      if (tpl.assignee) {
        const person = await tctx.client.findOne<PersonDoc>(PERSON_CLASS, { _id: tpl.assignee });
        assigneeName = person?.name;
      }
      let componentLabel: string | undefined;
      if (tpl.component) {
        const comp = await tctx.client.findOne<ComponentDoc>(COMPONENT_CLASS, {
          _id: tpl.component,
        });
        componentLabel = comp?.label;
      }
      return {
        content: `Template ${tpl.title ?? ""}`,
        details: {
          _id: tpl._id,
          title: tpl.title,
          description,
          priority: tpl.priority,
          assignee: assigneeName ?? tpl.assignee,
          component: componentLabel ?? tpl.component,
          estimation: tpl.estimation,
          modifiedOn: tpl.modifiedOn,
          createdOn: tpl.createdOn,
          children: tpl.children,
        },
      };
    },
  }),

  // 3. create_template
  defineHulyTool({
    name: "create_template",
    label: "Create issue template",
    description: "Create issue template.",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      title: z.string(),
      description: z.optional(z.string()),
    }),
    async handler(params, tctx) {
      // T-103 #160: guard title non-empty.
      if (params.title.trim() === "") {
        return {
          content: `create_template title must be non-empty.`,
          isError: true,
          details: { title: params.title },
        };
      }
      const project = await tctx.client.findOne(PROJECT_CLASS, {
        identifier: tctx.project,
      });
      // T-51 #41: project null → isError rõ ràng, KHÔNG fallback workspace.
      if (!project) {
        return {
          content: `Project "${tctx.project}" not found. Run /huly init or check binding.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const descMarkup =
        params.description !== undefined
          ? JSON.stringify(mdToMarkup(params.description))
          : undefined;
      // T-97 (#143): space = project._id (KHÔNG project.space).
      const id = await tctx.client.createDoc(
        ISSUE_TEMPLATE_CLASS,
        project._id as never,
        {
          title: params.title,
          description: descMarkup,
          // T-76: default fields (trusted createIssueTemplate).
          priority: "no-priority",
          assignee: null,
          component: null,
          estimation: 0,
          children: [],
          comments: 0,
        } as never,
      );
      return {
        content: `Created template "${params.title}".`,
        details: { id, title: params.title },
      };
    },
  }),

  // 4. create_issue_from_template
  defineHulyTool({
    name: "create_issue_from_template",
    label: "Create issue from template",
    description: "Create new issue from template.",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      template: z.string(),
      title: z.optional(z.string()),
    }),
    async handler(params, tctx) {
      // T-100 (#146): project first — dùng project._id scope cho tpl lookup
      // (tránh getProjectSpace thừa; handler tạo issue trong project._id space).
      const project = await tctx.client.findOne(PROJECT_CLASS, {
        identifier: tctx.project,
      });
      if (!project) {
        return {
          content: `Project "${tctx.project}" not found. Run /huly init or check binding.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const tpl = await tctx.client.findOne(ISSUE_TEMPLATE_CLASS, {
        _id: params.template,
        space: project._id,
      } as never);
      if (!tpl) {
        return {
          content: `Template "${params.template}" not found.`,
          isError: true,
          details: { template: params.template },
        };
      }
      const title = params.title ?? (tpl as { title?: string }).title ?? "Untitled";
      // T-76: copy priority/assignee/component từ template (trước chỉ copy title+desc).
      const tplFields = tpl as {
        priority?: string;
        assignee?: string | null;
        component?: string | null;
        description?: string;
      };
      // T-103 #155: Issue = AttachedDoc → createDoc crash ('cannot be used for objects
      // inherited from AttachedDoc'). Mirror create_issue: $inc sequence → identifier
      // → addCollection (attached-to-project collection), KHÔNG createDoc.
      const incResult = await tctx.client.updateDoc(
        PROJECT_CLASS,
        "core:space:Space" as never,
        project._id as never,
        { $inc: { sequence: 1 } } as never,
        true,
      );
      const seqRaw = (incResult as { object?: { sequence?: number } })?.object?.sequence;
      const sequence =
        typeof seqRaw === "number"
          ? seqRaw
          : ((project as { sequence?: number }).sequence ?? 0) + 1;
      const identifier = `${(project as { identifier?: string }).identifier ?? tctx.project}-${sequence}`;
      // description: copy markup ref từ template (nếu có), KHÔNG re-upload.
      const issueId = `tracker:issue.${Math.random().toString(36).slice(2, 14)}`;
      const id = await tctx.client.addCollection(
        ISSUE_CLASS,
        project._id as never, // space = project (issues live trong project space)
        NO_PARENT_REF, // attachedTo = NoParent sentinel (top-level)
        ISSUE_CLASS, // attachedToClass
        "subIssues", // collection
        {
          title,
          description: tplFields.description ?? null,
          priority: tplFields.priority ?? "no-priority",
          assignee: tplFields.assignee ?? null,
          component: tplFields.component ?? null,
          status: undefined,
          number: sequence,
          kind: ISSUE_KIND_REF,
          identifier,
          estimation: 0,
          remainingTime: 0,
          reportedTime: 0,
          reports: 0,
          subIssues: 0,
          parents: [],
          childInfo: [],
          dueDate: null,
          rank: "",
        } as never,
        issueId as never,
      );
      return {
        content: `Created issue ${identifier}: "${title}" from template.`,
        details: { id, identifier, title, template: params.template },
      };
    },
  }),

  // 5. update_template
  defineHulyTool({
    name: "update_template",
    label: "Update issue template",
    description: "Update template (title, description).",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      template: z.string(),
      title: z.optional(z.string()),
      description: z.optional(z.string()),
    }),
    async handler(params, tctx) {
      // T-100 (#146): scope template lookup theo project space.
      const space = await getProjectSpace(tctx.client, tctx.project!);
      if (!space) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const t = await tctx.client.findOne(ISSUE_TEMPLATE_CLASS, {
        _id: params.template,
        space,
      } as never);
      if (!t) {
        return {
          content: `Template "${params.template}" not found.`,
          isError: true,
          details: { template: params.template },
        };
      }
      const ops: Record<string, unknown> = {};
      if (params.title !== undefined) {
        if (params.title.trim() === "")
          return {
            content: "title must be non-empty.",
            isError: true,
            details: { title: params.title },
          };
        ops.title = params.title;
      }
      if (params.description !== undefined)
        ops.description = JSON.stringify(mdToMarkup(params.description));
      if (Object.keys(ops).length === 0) {
        return { content: "No fields to update.", details: { updated: false } };
      }
      const updResult = await safeUpdateDoc(tctx.client, ISSUE_TEMPLATE_CLASS, t, ops);
      if (!updResult.ok) return updResult.error;
      return {
        content: `Updated template ${params.template}.`,
        details: { updated: true, fields: Object.keys(ops) },
      };
    },
  }),

  // 6. delete_template — destructive
  defineHulyTool({
    name: "delete_template",
    label: "Delete issue template",
    description: "Delete template (destructive).",
    destructive: true,
    needsProject: true,
    destructiveContext: (p) => ({
      type: "template",
      id: (p as { template?: string }).template ?? "<unknown>",
    }),
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      template: z.string(),
    }),
    async handler(params, tctx) {
      // T-100 (#146): scope template lookup theo project space.
      const space = await getProjectSpace(tctx.client, tctx.project!);
      if (!space) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const t = await tctx.client.findOne(ISSUE_TEMPLATE_CLASS, {
        _id: params.template,
        space,
      } as never);
      if (!t) {
        return {
          content: `Template "${params.template}" not found.`,
          isError: true,
          details: { template: params.template },
        };
      }
      const delResult = await safeRemoveDoc(tctx.client, ISSUE_TEMPLATE_CLASS, t);
      if (!delResult.ok) return delResult.error;
      return {
        content: `Deleted template ${params.template}.`,
        details: { deleted: true, template: params.template },
      };
    },
  }),

  // 7. add_template_child — T-76: build IssueTemplateChild object + replace array
  defineHulyTool({
    name: "add_template_child",
    label: "Add template child",
    description:
      "Add child template to parent. Builds IssueTemplateChild object {id,title,priority,...} + replaces full children array.",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      template: z.string(),
      title: z.string(),
      description: z.optional(z.string()),
      priority: z.optional(z.string()),
      assignee: z.optional(z.string()),
      component: z.optional(z.string()),
      estimation: z.optional(z.number().int()),
    }),
    async handler(params, tctx) {
      // T-100 (#146): scope template lookup theo project space.
      const space = await getProjectSpace(tctx.client, tctx.project!);
      if (!space) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const t = await tctx.client.findOne(ISSUE_TEMPLATE_CLASS, {
        _id: params.template,
        space,
      } as never);
      if (!t) {
        return {
          content: `Template "${params.template}" not found.`,
          isError: true,
          details: { template: params.template },
        };
      }
      // T-101 (#147): resolve assignee/component → Ref _id (KHÔNG raw string).
      // Trước đây child.assignee/component = raw email/label → garbage Ref (cousin
      // #141). Chỉ resolve khi provided (existing test không truyền → no shift).
      let assigneeRef: string | undefined;
      if (params.assignee !== undefined) {
        assigneeRef = await findPersonByEmailOrName(tctx.client, params.assignee);
        if (!assigneeRef) {
          return {
            content: `Assignee "${params.assignee}" not found (no Person matching email/name).`,
            isError: true,
            details: { assignee: params.assignee, template: params.template },
          };
        }
      }
      let componentRef: string | undefined;
      if (params.component !== undefined) {
        const tplSpace = (t as { space?: string }).space;
        const comp = await tctx.client.findOne(COMPONENT_CLASS, {
          label: params.component,
          space: tplSpace,
        } as never);
        if (!comp) {
          return {
            content: `Component "${params.component}" not found.`,
            isError: true,
            details: { component: params.component, template: params.template },
          };
        }
        componentRef = (comp as { _id: string })._id;
      }
      // T-76: build IssueTemplateChild object (KHÔNG raw string).
      const child: TemplateChild = {
        id: genChildId(),
        title: params.title,
      };
      if (params.description !== undefined) child.description = params.description;
      if (params.priority !== undefined) child.priority = params.priority;
      if (params.assignee !== undefined) child.assignee = assigneeRef;
      if (params.component !== undefined) child.component = componentRef;
      if (params.estimation !== undefined) child.estimation = params.estimation;
      // T-76: replace full children array (KHÔNG $push).
      const existingChildren = ((t as { children?: TemplateChild[] }).children ??
        []) as TemplateChild[];
      const updResult = await safeUpdateDoc(tctx.client, ISSUE_TEMPLATE_CLASS, t, {
        children: [...existingChildren, child],
      });
      if (!updResult.ok) return updResult.error;
      return {
        content: `Added child "${params.title}" to template ${params.template}.`,
        details: { template: params.template, childId: child.id, title: params.title },
      };
    },
  }),

  // 8. remove_template_child — T-76: find by id field + replace array
  defineHulyTool({
    name: "remove_template_child",
    label: "Remove template child",
    description: "Remove child from parent template (by child id).",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      template: z.string(),
      childId: z.string().describe("IssueTemplateChild.id to remove."),
    }),
    async handler(params, tctx) {
      // T-100 (#146): scope template lookup theo project space.
      const space = await getProjectSpace(tctx.client, tctx.project!);
      if (!space) {
        return {
          content: `Project "${tctx.project}" not found.`,
          isError: true,
          details: { project: tctx.project },
        };
      }
      const t = await tctx.client.findOne(ISSUE_TEMPLATE_CLASS, {
        _id: params.template,
        space,
      } as never);
      if (!t) {
        return {
          content: `Template "${params.template}" not found.`,
          isError: true,
          details: { template: params.template },
        };
      }
      // T-76: find by id field trong children (KHÔNG $pull raw string).
      const existingChildren = ((t as { children?: TemplateChild[] }).children ??
        []) as TemplateChild[];
      const idx = existingChildren.findIndex((c) => c.id === params.childId);
      if (idx === -1) {
        return {
          content: `Child "${params.childId}" not found in template ${params.template}.`,
          isError: true,
          details: { template: params.template, childId: params.childId },
        };
      }
      const newChildren = existingChildren.filter((_, i) => i !== idx);
      const updResult = await safeUpdateDoc(tctx.client, ISSUE_TEMPLATE_CLASS, t, {
        children: newChildren,
      });
      if (!updResult.ok) return updResult.error;
      return {
        content: `Removed child ${params.childId} from template ${params.template}.`,
        details: { template: params.template, childId: params.childId },
      };
    },
  }),
];
