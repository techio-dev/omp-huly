// tools/domains/todos.ts — Todos domain (7 tools).
// Design: 06-api.md §4 Todos. attachedTo: {type:'issue', project, identifier}.

import { z } from "zod";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { ISSUE_CLASS, TODO_CLASS, PROJECT_TODO_CLASS, TODOS_SPACE } from "./_class-refs.js";
import {
  workspaceParam,
  projectParam,
  identifierParam,
  resolveIdentifier,
  safeUpdateDoc,
  safeRemoveDoc,
} from "./_common.js";
import { findPersonByEmailOrName } from "./contacts.js";

/**
 * ToDoPriority enum — Huly Priority (canonical, per @hcengineering/time).
 * T-103 #164: 0=None, 1=Low, 2=Medium, 3=High, 4=Urgent (ASCENDING severity).
 * Trước đây map INVERTED (high:0, no-priority:3) → 'high' lưu 0=None,
 * 'no-priority' lưu 3=High (4/5 sai, chỉ urgent đúng). Pi-huly API dùng
 * string ('urgent','high',...) → map sang number cho server.
 */
const TODO_PRIORITY_MAP: Record<string, number> = {
  "no-priority": 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

/** Reverse: numeric Huly priority → human label (cho get_todo render readable). */
const TODO_PRIORITY_LABELS: Record<number, string> = {
  0: "no-priority",
  1: "low",
  2: "medium",
  3: "high",
  4: "urgent",
};

/** Priority param schema (string → number enum mapping). */
const todoPrioritySchema = z.optional(z.enum(["urgent", "high", "medium", "low", "no-priority"]));

export const tools: HulyToolDefinition[] = [
  // 1. list_todos
  defineHulyTool({
    name: "list_todos",
    label: "List todos",
    description: "List todos attached to issue.",
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
      // T-79 #102: issue.todos là CollectionSize counter (number), KHÔNG array.
      // Query todos qua findAll theo attachedTo=issue._id (trusted planner.ts).
      const todos = (await tctx.client.findAll(TODO_CLASS, {
        attachedTo: issue._id,
      } as never)) as Array<{ _id: string; title?: string; doneOn?: number | null }>;
      const summary = todos.map((t) => ({
        _id: t._id,
        title: t.title ?? "",
        done: t.doneOn != null,
      }));
      return {
        content: `Found ${summary.length} todo(s) on ${params.identifier}.`,
        details: { count: summary.length, todos: summary },
      };
    },
  }),

  // 2. get_todo
  defineHulyTool({
    name: "get_todo",
    label: "Get todo",
    description: "Get todo by id.",
    parameters: z.object({
      workspace: workspaceParam,
      todo: z.string(),
    }),
    async handler(params, tctx) {
      const t = (await tctx.client.findOne(TODO_CLASS, { _id: params.todo })) as {
        _id: string;
        title?: string;
        doneOn?: number | null;
        user?: string;
        dueDate?: number | null;
        priority?: number;
        description?: unknown;
      } | null;
      if (!t) {
        return {
          content: `Todo "${params.todo}" not found.`,
          isError: true,
          details: { todo: params.todo },
        };
      }
      // T-103 #163: fetch description markup (MarkupBlobRef → markdown).
      let description: string | undefined;
      if (t.description) {
        try {
          const markup = await tctx.client.fetchMarkup(
            TODO_CLASS,
            t._id,
            "description",
            t.description,
            "markdown",
          );
          description = typeof markup === "string" ? markup : undefined;
        } catch {
          description = undefined;
        }
      }
      return {
        content: `Todo: ${t.title ?? ""}`,
        details: {
          _id: t._id,
          title: t.title,
          description,
          // T-79 #102: Huly ToDo dùng doneOn (timestamp|null), KHÔNG `done` bool.
          doneOn: t.doneOn ?? null,
          done: t.doneOn != null,
          owner: t.user,
          dueDate: t.dueDate ?? null,
          priority: TODO_PRIORITY_LABELS[t.priority ?? -1] ?? t.priority,
        },
      };
    },
  }),

  // 3. create_todo
  defineHulyTool({
    name: "create_todo",
    label: "Create todo",
    description: "Create todo attached to issue.",
    needsProject: true,
    needsAssignee: true,
    assigneeField: "owner",
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      title: z.string(),
      description: z.optional(z.string()),
      dueDate: z.optional(z.number().int()),
      priority: todoPrioritySchema,
    }),
    async handler(params, tctx) {
      // T-103 #160: guard title non-empty (empty = garbage todo).
      if (params.title.trim() === "") {
        return {
          content: `create_todo title must be non-empty.`,
          isError: true,
          details: { title: params.title },
        };
      }
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
      // T-46 #28 + T-79 #102: ProjectToDo = subclass cho issue-attached todo.
      // space = time.space.ToDos (KHÔNG issue.space). doneOn:null (KHÔNG `done`).
      // attachedTo/attachedToClass = positional addCollection args (KHÔNG trong data).
      // description = MarkupBlobRef qua uploadMarkup (KHÔNG JSON.stringify).
      const priority = TODO_PRIORITY_MAP[params.priority ?? "medium"];
      const todoId = `time:todo.${Math.random().toString(36).slice(2, 14)}` as never;
      let descriptionRef: unknown = null;
      if (params.description !== undefined && params.description.trim() !== "") {
        descriptionRef = await tctx.client.uploadMarkup(
          PROJECT_TODO_CLASS,
          todoId,
          "description",
          params.description,
          "markdown",
        );
      }
      try {
        const id = await tctx.client.addCollection(
          PROJECT_TODO_CLASS,
          TODOS_SPACE,
          issue._id as never,
          ISSUE_CLASS,
          "todos",
          {
            title: params.title,
            description: descriptionRef,
            attachedSpace: issue.space,
            user: tctx.currentUser.id, // Ref<Employee>
            priority, // ToDoPriority number enum
            visibility: "Public", // Visibility.Public default
            rank: "", // lexorank empty — server gán nếu empty
            workslots: 0,
            doneOn: null, // T-79: open todo (KHÔNG `done:false`)
            dueDate: params.dueDate,
          },
          todoId,
        );
        return {
          content: `Created todo "${params.title}" on ${params.identifier}.`,
          details: { id, title: params.title, identifier: params.identifier },
        };
      } catch (e) {
        // Wrap lỗi generic của Huly server (platform:status:UnknownError) với
        // context rõ ràng hơn — mention todo + issue + class để debug lần sau.
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content:
            `Failed to create todo "${params.title}" on ${params.identifier} ` +
            `(class ${PROJECT_TODO_CLASS}). Server error: ${msg}. ` +
            `Verify issue exists and ProjectToDo required fields are valid.`,
          isError: true,
          details: {
            identifier: params.identifier,
            title: params.title,
            error: msg,
          },
        };
      }
    },
  }),

  // 4. update_todo
  defineHulyTool({
    name: "update_todo",
    label: "Update todo",
    description:
      "Update todo (title, description, owner, priority, visibility, dueDate). " +
      "dueDate=null clears ($unset).",
    parameters: z.object({
      workspace: workspaceParam,
      todo: z.string(),
      title: z.optional(z.string()),
      description: z.optional(z.string()),
      owner: z.optional(z.string().describe("Owner email/name.")),
      priority: todoPrioritySchema,
      visibility: z.optional(z.enum(["public", "freeBusy", "private"])),
      // T-79G #106: dueDate=null → \$unset clear.
      dueDate: z.optional(z.union([z.number().int(), z.null()])),
    }),
    async handler(params, tctx) {
      const t = await tctx.client.findOne(TODO_CLASS, { _id: params.todo });
      if (!t) {
        return {
          content: `Todo "${params.todo}" not found.`,
          isError: true,
          details: { todo: params.todo },
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
      // T-97: description = MarkupBlobRef. Todo ĐÃ CÓ description → updateMarkup
      // (updateContent rpc) edit in-place. KHÔNG ghi description vào ops — mirror trusted
      // @firfi/huly-mcp (TxUpdateDoc trên description → server reset collaborator → stale).
      // CHƯA có → uploadMarkup tạo blob + swap ref. Track descUpdated riêng cho success.
      let descUpdated = false;
      if (params.description !== undefined) {
        const existingDesc =
          typeof t === "object" && t !== null && "description" in t ? t.description : undefined;
        if (existingDesc != null && typeof tctx.client.updateMarkup === "function") {
          await tctx.client.updateMarkup(
            TODO_CLASS,
            t._id,
            "description",
            params.description,
            "markdown",
          );
          descUpdated = true;
        } else {
          ops.description = await tctx.client.uploadMarkup(
            TODO_CLASS,
            t._id,
            "description",
            params.description,
            "markdown",
          );
          descUpdated = true;
        }
      }
      // T-79G #106: owner → user: Ref<Employee> (resolve Person).
      if (params.owner !== undefined) {
        const ownerId = await findPersonByEmailOrName(tctx.client, params.owner, tctx.currentUser);
        if (!ownerId) {
          return {
            content: `Owner "${params.owner}" not found (no Person matching email/name).`,
            isError: true,
            details: { owner: params.owner, todo: params.todo },
          };
        }
        ops.user = ownerId;
      }
      if (params.priority !== undefined) ops.priority = TODO_PRIORITY_MAP[params.priority];
      if (params.visibility !== undefined) {
        // visibility string → Huly Visibility (public/freeBusy/private match 1:1).
        ops.visibility = params.visibility.charAt(0).toUpperCase() + params.visibility.slice(1);
      }
      // T-79G #106: dueDate null → \$unset (clear); number → set.
      if (params.dueDate !== undefined) {
        if (params.dueDate === null) {
          ops.$unset = { dueDate: "" };
        } else {
          ops.dueDate = params.dueDate;
        }
      }
      if (Object.keys(ops).length === 0 && !descUpdated) {
        return { content: "No fields to update.", details: { updated: false } };
      }
      if (Object.keys(ops).length > 0) {
        const updResult = await safeUpdateDoc(tctx.client, TODO_CLASS, t, ops);
        if (!updResult.ok) return updResult.error;
      }
      const fields = Object.keys(ops).filter((f) => f !== "$unset");
      if (ops.$unset !== undefined) fields.push("dueDate(clear)");
      if (descUpdated && !fields.includes("description")) fields.push("description");
      return {
        content: `Updated todo ${params.todo}: ${fields.join(", ")}`,
        details: { updated: true, fields },
      };
    },
  }),

  // 5. complete_todo
  defineHulyTool({
    name: "complete_todo",
    label: "Complete todo",
    description: "Mark todo done.",
    parameters: z.object({
      workspace: workspaceParam,
      todo: z.string(),
    }),
    async handler(params, tctx) {
      const t = await tctx.client.findOne(TODO_CLASS, { _id: params.todo });
      if (!t) {
        return {
          content: `Todo "${params.todo}" not found.`,
          isError: true,
          details: { todo: params.todo },
        };
      }
      const updResult = await safeUpdateDoc(tctx.client, TODO_CLASS, t, {
        doneOn: Date.now(), // T-79 #102: timestamp (KHÔNG `done:true` no-op)
      });
      if (!updResult.ok) return updResult.error;
      return {
        content: `Completed todo ${params.todo}.`,
        details: { completed: true, todo: params.todo },
      };
    },
  }),

  // 6. reopen_todo
  defineHulyTool({
    name: "reopen_todo",
    label: "Reopen todo",
    description: "Mark todo not done (reopen).",
    parameters: z.object({
      workspace: workspaceParam,
      todo: z.string(),
    }),
    async handler(params, tctx) {
      const t = await tctx.client.findOne(TODO_CLASS, { _id: params.todo });
      if (!t) {
        return {
          content: `Todo "${params.todo}" not found.`,
          isError: true,
          details: { todo: params.todo },
        };
      }
      const updResult = await safeUpdateDoc(tctx.client, TODO_CLASS, t, {
        doneOn: null, // T-79 #102: clear completion (KHÔNG `done:false` no-op)
      });
      if (!updResult.ok) return updResult.error;
      return {
        content: `Reopened todo ${params.todo}.`,
        details: { reopened: true, todo: params.todo },
      };
    },
  }),

  // 7. delete_todo — destructive
  defineHulyTool({
    name: "delete_todo",
    label: "Delete todo",
    description: "Delete todo (destructive).",
    destructive: true,
    destructiveContext: (p) => ({
      type: "todo",
      id: (p as { todo?: string }).todo ?? "<unknown>",
    }),
    parameters: z.object({
      workspace: workspaceParam,
      todo: z.string(),
    }),
    async handler(params, tctx) {
      const t = (await tctx.client.findOne(TODO_CLASS, { _id: params.todo })) as {
        _id: string;
        space: string;
        attachedTo?: string;
        attachedToClass?: string;
        attachedSpace?: string;
      } | null;
      if (!t) {
        return {
          content: `Todo "${params.todo}" not found.`,
          isError: true,
          details: { todo: params.todo },
        };
      }
      // T-79 #102: issue-attached todo = ProjectToDo subclass. removeDoc dùng
      // PROJECT_TODO_CLASS (trusted planner.ts deleteTodo). Personal todo (base
      // ToDo) dùng TODO_CLASS — distinguish qua attachedToClass + attachedTo.
      const isIssueTodo =
        t.attachedToClass === ISSUE_CLASS && t.attachedTo != null && t.attachedTo !== "";
      const delResult = await safeRemoveDoc(
        tctx.client,
        isIssueTodo ? PROJECT_TODO_CLASS : TODO_CLASS,
        t,
      );
      if (!delResult.ok) return delResult.error;
      // Decrement parent Issue.todo counter (CollectionSize) — tránh drift.
      if (isIssueTodo && t.attachedTo) {
        const issueSpace = (t.attachedSpace ?? t.space) as never;
        await tctx.client.updateDoc(
          ISSUE_CLASS,
          issueSpace,
          t.attachedTo as never,
          { $inc: { todos: -1 } } as never,
        );
      }
      return {
        content: `Deleted todo ${params.todo}.`,
        details: { deleted: true, todo: params.todo },
      };
    },
  }),
];
