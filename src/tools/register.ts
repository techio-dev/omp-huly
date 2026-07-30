// tools/register.ts — Register all domain modules với pi.
// Design: 04-system.md §6 (register.ts), 06-api.md §4 (catalog).
//
// T-30: collect tools từ 21 domain files (19 domain theo spec FR-04, Issues
// chia 3 files + Documents tách snapshots = 21 files) + registerTool each.
// Total: 102 tools (FR-02).

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { HulyToolDefinition } from "./builder.js";

// Import 19 domain modules
import { tools as workspaceTools } from "./domains/workspace.js";
import { tools as projectTools } from "./domains/projects.js";
import { tools as milestoneTools } from "./domains/milestones.js";
import { tools as taskMgmtTools } from "./domains/task-management.js";
import { tools as componentTools } from "./domains/components.js";
import { tools as spaceTools } from "./domains/spaces.js";
import { tools as snapshotTools } from "./domains/document-snapshots.js";
import { tools as labelTools } from "./domains/labels.js";
import { tools as tagTools } from "./domains/tags.js";
import { tools as tagCategoryTools } from "./domains/tag-categories.js";
import { tools as commentTools } from "./domains/comments.js";
import { tools as searchTools } from "./domains/search.js";
import { tools as deletionTools } from "./domains/deletion.js";
import { tools as timeTools } from "./domains/time.js";
import { tools as contactTools } from "./domains/contacts.js";
import { tools as documentTools } from "./domains/documents.js";
import { tools as issueCoreTools } from "./domains/issues-core.js";
import { tools as issueRelationTools } from "./domains/issues-relations.js";
import { tools as issueTemplateTools } from "./domains/issues-templates.js";
import { tools as attachmentTools } from "./domains/attachments.js";
import { tools as todoTools } from "./domains/todos.js";

/**
 * All tools từ 19 domain modules. Collect 1 lần, register với pi.
 * Spec FR-02: ~102 tools prefix huly_.
 */
export const allTools: HulyToolDefinition[] = [
  ...workspaceTools,
  ...projectTools,
  ...milestoneTools,
  ...taskMgmtTools,
  ...componentTools,
  ...spaceTools,
  ...snapshotTools,
  ...labelTools,
  ...tagTools,
  ...tagCategoryTools,
  ...commentTools,
  ...searchTools,
  ...deletionTools,
  ...timeTools,
  ...contactTools,
  ...documentTools,
  ...issueCoreTools,
  ...issueRelationTools,
  ...issueTemplateTools,
  ...attachmentTools,
  ...todoTools,
];

/**
 * Register all Huly tools với pi extension API.
 * Called từ index.ts factory (T-33).
 *
 * @param pi Pi ExtensionAPI
 * @param tools Override tool list (default: allTools). Cho phép factory attach
 *              render hooks qua shallow copy KHÔNG mutate module global.
 * @returns number of tools registered
 */
export function registerAllTools(pi: ExtensionAPI, tools: HulyToolDefinition[] = allTools): number {
  let count = 0;
  for (const tool of tools) {
    // Cast HulyToolDefinition → pi ToolDefinition (compatible shape).
    // pi.registerTool expects full ToolDefinition; HulyToolDefinition subset.
    pi.registerTool(tool as never);
    count++;
  }
  return count;
}

/** Count tools per domain (cho diagnostics). */
export function toolCountByDomain(): Record<string, number> {
  return {
    workspace: workspaceTools.length,
    projects: projectTools.length,
    milestones: milestoneTools.length,
    "task-management": taskMgmtTools.length,
    components: componentTools.length,
    spaces: spaceTools.length,
    snapshots: snapshotTools.length,
    labels: labelTools.length,
    tags: tagTools.length,
    "tag-categories": tagCategoryTools.length,
    comments: commentTools.length,
    search: searchTools.length,
    deletion: deletionTools.length,
    time: timeTools.length,
    contacts: contactTools.length,
    documents: documentTools.length,
    "issues-core": issueCoreTools.length,
    "issues-relations": issueRelationTools.length,
    "issues-templates": issueTemplateTools.length,
    attachments: attachmentTools.length,
    todos: todoTools.length,
  };
}
