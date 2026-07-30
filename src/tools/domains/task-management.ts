// tools/domains/task-management.ts — Task-management domain (5 tools).
// Design: 06-api.md §4 Task-mgmt. Project types + task types + status registration.
//
// T-73 (2026-07-28): rewrite create_issue_status + create_task_type theo trusted
// task-management.ts. Status/tasktype created + REGISTERED vào project workflow
// (ProjectType.statuses ProjectStatus[] + TaskType.statuses Ref[]). Trước đây
// createDoc orphan — status/tasktype KHÔNG bao giờ link workflow (silent fail).
// space = core.space.Model (root model space, KHÔNG workspace root).
// category = Ref<StatusCategory> (KHÔNG raw enum string).
//
// Bonus fixes: list_task_types field ofProjectType → parent; create_task_type
// field ofProjectType → parent + register projectType.tasks.

import { z } from "zod";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import {
  PROJECT_TYPE_CLASS,
  TASK_TYPE_CLASS,
  MODEL_SPACE,
  STATUS_CATEGORY_REFS,
  ISSUE_STATUS_ATTRIBUTE,
  MIXIN_CLASS,
  TASK_TYPE_MIXIN,
  CLASSIFIER_KIND_MIXIN,
  MODEL_LABEL_PREFIX,
  idRef,
} from "./_class-refs.js";
import type { ProjectTypeDoc, TaskTypeDoc, MixinDoc, StatusDoc } from "./_entity-types.js";
import { workspaceParam } from "./_common.js";

/** Generate id helper (Huly convention <class-prefix>.<rand>). */
function genId(prefix: string): string {
  return `${prefix}.${Math.random().toString(36).slice(2, 12)}`;
}

export const tools: HulyToolDefinition[] = [
  // 1. list_project_types
  defineHulyTool({
    name: "list_project_types",
    label: "List project types",
    description: "List project types (vd tracker, recruiting, inventory).",
    parameters: z.object({ workspace: workspaceParam }),
    async handler(_params, tctx) {
      const pts = await tctx.client.findAll(PROJECT_TYPE_CLASS, {}, {});
      const list = pts.map((p) => ({
        _id: p._id,
        name: (p as { name?: string }).name ?? "",
        targetClass: (p as { targetClass?: string }).targetClass,
      }));
      return {
        content: `Found ${list.length} project type(s).`,
        details: { count: list.length, projectTypes: list },
      };
    },
  }),

  // 2. get_project_type
  defineHulyTool({
    name: "get_project_type",
    label: "Get project type",
    description: "Get project type by id.",
    parameters: z.object({
      workspace: workspaceParam,
      projectType: z.string(),
    }),
    async handler(params, tctx) {
      const pt = await tctx.client.findOne(PROJECT_TYPE_CLASS, {
        _id: params.projectType,
      });
      if (!pt) {
        return {
          content: `Project type "${params.projectType}" not found.`,
          isError: true,
          details: { projectType: params.projectType },
        };
      }
      return {
        content: `Project type ${(pt as { name?: string }).name ?? ""}`,
        details: {
          _id: pt._id,
          name: (pt as { name?: string }).name,
          targetClass: (pt as { targetClass?: string }).targetClass,
        },
      };
    },
  }),

  // 3. list_task_types — T-73: field ofProjectType → parent (trusted query field)
  defineHulyTool({
    name: "list_task_types",
    label: "List task types",
    description: "List task types cho project type.",
    parameters: z.object({
      workspace: workspaceParam,
      projectType: z.optional(z.string()),
    }),
    async handler(params, tctx) {
      // T-73: query field `parent` (KHÔNG ofProjectType — trusted getTaskTypesByProjectType).
      const query = params.projectType !== undefined ? { parent: params.projectType } : {};
      const tts = await tctx.client.findAll(TASK_TYPE_CLASS, query as never, {});
      const list = tts.map((t) => ({
        _id: t._id,
        name: (t as { name?: string }).name ?? "",
      }));
      return {
        content: `Found ${list.length} task type(s).`,
        details: { count: list.length, taskTypes: list },
      };
    },
  }),

  // 4. create_task_type — T-73: parent field + core.space.Model + register projectType.tasks
  // T-73 review (M1): copy required fields (statusClass/ofClass/kind/targetClass/
  // statusCategories/descriptor) từ sibling template TaskType trong cùng projectType.
  // T-73 review (L1): idempotent check by name+projectType.
  defineHulyTool({
    name: "create_task_type",
    label: "Create task type",
    description:
      "Create task type trong project type + register vào projectType.tasks. Copies descriptor fields from a sibling template task type.",
    parameters: z.object({
      workspace: workspaceParam,
      name: z.string(),
      projectType: z.string(),
    }),
    async handler(params, tctx) {
      const projectType = await tctx.client.findOne<ProjectTypeDoc>(PROJECT_TYPE_CLASS, {
        _id: params.projectType,
      });
      if (!projectType) {
        return {
          content: `Project type "${params.projectType}" not found.`,
          isError: true,
          details: { projectType: params.projectType },
        };
      }
      // T-73 review L1: idempotent — findOne existing TaskType by name+parent.
      const existing = await tctx.client.findOne<TaskTypeDoc>(TASK_TYPE_CLASS, {
        name: params.name,
        parent: params.projectType,
      });
      if (existing) {
        return {
          content: `Task type "${params.name}" already exists (idempotent — no-op).`,
          details: { id: existing._id, name: params.name, idempotent: true },
        };
      }
      // T-73 review M1: copy required fields từ sibling template TaskType.
      // T-90: native TaskTypeDoc (no inline cast). TaskType schema requires
      // descriptor/kind/ofClass/targetClass/statusClass/statusCategories.
      const existingTaskIds = projectType.tasks ?? [];
      let template: TaskTypeDoc | undefined;
      if (existingTaskIds.length > 0) {
        template = await tctx.client.findOne<TaskTypeDoc>(TASK_TYPE_CLASS, {
          _id: existingTaskIds[0],
        });
      }
      if (!template) {
        return {
          content:
            `Cannot create task type "${params.name}": no sibling template TaskType ` +
            `found trong projectType "${params.projectType}" to copy required fields ` +
            `(descriptor/kind/ofClass/targetClass/statusClass/statusCategories). ` +
            `Create the first task type via Huly UI, then use this tool for siblings.`,
          isError: true,
          details: {
            projectType: params.projectType,
            reason: "no_sibling_template",
          },
        };
      }
      const taskTypeId = genId("task:tasktype");
      // T-86 #121: derive targetClass mixin ref + create Mixin classifier doc +
      // createMixin(TaskTypeClass) để Huly apply task-typing behavior. Trước đây
      // skip cả 2 → task type tồn tại nhưng KHÔNG apply TaskTypeClass mixin.
      // UNVERIFIED: core:class:Mixin + task:mixin:TaskTypeClass theo naming
      // convention (task pkg not installed locally — flag như T-43).
      // T-90: native types + satisfies (no inline cast / as never trên payload).
      const targetClassId = `${taskTypeId}:type:mixin`;
      const mixinData = {
        extends: template.ofClass,
        kind: CLASSIFIER_KIND_MIXIN,
        label: MODEL_LABEL_PREFIX + params.name,
        ...(template.icon !== undefined ? { icon: template.icon } : {}),
      } satisfies Partial<MixinDoc>;
      await tctx.client.createDoc(MIXIN_CLASS, MODEL_SPACE, mixinData, idRef(targetClassId));
      await tctx.client.createMixin(
        idRef(targetClassId),
        MIXIN_CLASS,
        MODEL_SPACE,
        TASK_TYPE_MIXIN,
        { taskType: taskTypeId, projectType: projectType._id },
      );
      // T-86 #121: statuses copy từ template (KHÔNG start []) + targetClass =
      // new mixin ref (KHÔNG copy template.targetClass).
      const templateStatusIds = template.statuses ?? [];
      const taskData = {
        name: params.name,
        parent: projectType._id,
        descriptor: template.descriptor,
        kind: template.kind,
        ofClass: template.ofClass,
        targetClass: targetClassId, // T-86: new mixin ref
        statusClass: template.statusClass,
        statusCategories: template.statusCategories,
        statuses: templateStatusIds, // T-86: copy template (KHÔNG [])
        ...(template.icon !== undefined ? { icon: template.icon } : {}),
        ...(template.color !== undefined ? { color: template.color } : {}),
        ...(template.allowedAsChildOf !== undefined
          ? { allowedAsChildOf: template.allowedAsChildOf }
          : {}),
      } satisfies Partial<TaskTypeDoc>;
      const id = await tctx.client.createDoc(
        TASK_TYPE_CLASS,
        MODEL_SPACE,
        taskData,
        idRef(taskTypeId),
      );
      // T-86 #121: register projectType.tasks + statuses append {id,taskType}.
      const ptStatuses = projectType.statuses ?? [];
      const appendedStatuses = [
        ...ptStatuses,
        ...templateStatusIds
          .filter((sid) => !ptStatuses.some((s) => s._id === sid))
          .map((sid) => ({ _id: sid, taskType: taskTypeId })),
      ];
      await tctx.client.updateDoc(PROJECT_TYPE_CLASS, MODEL_SPACE, idRef(projectType._id), {
        tasks: existingTaskIds.includes(taskTypeId)
          ? existingTaskIds
          : [...existingTaskIds, taskTypeId],
        statuses: appendedStatuses,
      });
      return {
        content: `Created task type "${params.name}" + Mixin classifier + registered to projectType workflow.`,
        details: {
          id,
          name: params.name,
          projectType: projectType._id,
          targetClass: targetClassId,
          mixinCreated: true,
          registered: true,
        },
      };
    },
  }),

  // 5. create_issue_status — T-73: full proper flow (register workflow)
  //   - resolve taskType → statusClass dynamic (taskType.statusClass)
  //   - core.space.Model space (KHÔNG workspace root)
  //   - category = Ref<StatusCategory> via STATUS_CATEGORY_REFS (KHÔNG raw enum)
  //   - register: TaskType.statuses + ProjectType.statuses (ProjectStatus object)
  //   - idempotent: findOne exact name trên target taskType (KHÔNG global)
  defineHulyTool({
    name: "create_issue_status",
    label: "Create issue status",
    description:
      "Create issue status + register vào project workflow. Requires taskType param (resolve statusClass). Idempotent per taskType+name.",
    parameters: z.object({
      workspace: workspaceParam,
      taskType: z.string().describe("TaskType _id (resolve statusClass + register)."),
      name: z.string(),
      category: z.enum(["UnStarted", "ToDo", "Active", "Won", "Lost"]),
    }),
    async handler(params, tctx) {
      // T-73: resolve taskType → statusClass + parent projectType. T-90: native TaskTypeDoc.
      const taskType = await tctx.client.findOne<TaskTypeDoc>(TASK_TYPE_CLASS, {
        _id: params.taskType,
      });
      if (!taskType) {
        return {
          content: `Task type "${params.taskType}" not found.`,
          isError: true,
          details: { taskType: params.taskType },
        };
      }
      const statusClass = taskType.statusClass;
      if (!statusClass) {
        return {
          content: `Task type "${params.taskType}" has no statusClass (cannot determine target class).`,
          isError: true,
          details: { taskType: params.taskType },
        };
      }
      const projectTypeId = taskType.parent;
      if (!projectTypeId) {
        return {
          content: `Task type "${params.taskType}" has no parent projectType.`,
          isError: true,
          details: { taskType: params.taskType },
        };
      }
      // T-73: category = Ref<StatusCategory> (KHÔNG raw enum string). Resolve
      // trước existing-check để validate category mismatch (T-87 #122).
      const categoryRef = STATUS_CATEGORY_REFS[params.category];
      if (!categoryRef) {
        return {
          content: `Invalid category "${params.category}". Valid: ${Object.keys(STATUS_CATEGORY_REFS).join(", ")}.`,
          isError: true,
          details: { invalidCategory: params.category },
        };
      }
      // T-73 review H2: idempotent findOne by {name} trên statusClass ONLY (KHÔNG
      // ofTaskType — that field KHÔNG thuộc Status schema, server strip → query miss).
      // T-90: native StatusDoc (statusClass dynamic → as never structural, 1 boundary).
      const existing = await tctx.client.findOne<StatusDoc>(statusClass as never, {
        name: params.name,
      });
      if (existing) {
        // T-87 #122: validate category match (trusted requireStatusCategoryMatch).
        // Same name different category = silent workflow corruption. Error rõ.
        const existingCategory = existing.category;
        if (existingCategory !== undefined && existingCategory !== categoryRef) {
          return {
            content:
              `Status "${params.name}" already exists with category '${existingCategory}', ` +
              `not requested category '${params.category}'. Use a different name or category.`,
            isError: true,
            details: {
              name: params.name,
              existingCategory,
              requestedCategory: params.category,
              taskType: params.taskType,
            },
          };
        }
        return {
          content: `Status "${params.name}" already exists on taskType ${params.taskType} (idempotent — no-op).`,
          details: {
            id: existing._id,
            name: params.name,
            taskType: params.taskType,
            idempotent: true,
          },
        };
      }
      // T-73 review H1: ofAttribute required (Status.ofAttribute: Ref<Attribute<Status>>).
      // Trusted hardcodes tracker.attribute.IssueStatus cho issue statuses. T-90: satisfies.
      const statusId = genId("tracker:status");
      await tctx.client.createDoc(
        statusClass as never,
        MODEL_SPACE,
        {
          name: params.name,
          ofAttribute: ISSUE_STATUS_ATTRIBUTE,
          category: categoryRef,
        } satisfies Partial<StatusDoc>,
        idRef(statusId),
      );
      // T-73: register vào TaskType.statuses (read-modify-write idempotent).
      const ttStatuses = taskType.statuses ?? [];
      if (!ttStatuses.includes(statusId)) {
        await tctx.client.updateDoc(TASK_TYPE_CLASS, MODEL_SPACE, idRef(taskType._id), {
          statuses: [...ttStatuses, statusId],
        });
      }
      // T-73: register vào ProjectType.statuses (ProjectStatus[] objects {_id, taskType}).
      const projectType = await tctx.client.findOne<ProjectTypeDoc>(PROJECT_TYPE_CLASS, {
        _id: projectTypeId,
      });
      if (projectType) {
        const ptStatuses = projectType.statuses ?? [];
        if (!ptStatuses.some((s) => s._id === statusId)) {
          await tctx.client.updateDoc(PROJECT_TYPE_CLASS, MODEL_SPACE, idRef(projectType._id), {
            statuses: [...ptStatuses, { _id: statusId, taskType: params.taskType }],
          });
        }
      }
      return {
        content: `Created status "${params.name}" (${params.category}) + registered to workflow.`,
        details: {
          id: statusId,
          name: params.name,
          category: params.category,
          statusClass,
          taskType: params.taskType,
          projectType: projectTypeId,
          registered: true,
        },
      };
    },
  }),
];
