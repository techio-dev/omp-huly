// tools/domains/workspace.ts — workspace + profile domain (5 tools).
// Design: 04-system.md §6 (19 domain modules), 06-api.md §4 (Workspace/profile).
//
// Tools (5):
//   1. huly_get_workspace_info      — workspace name/url (current)
//   2. huly_list_workspaces         — T-74 honest-unavailable (account-client)
//   3. huly_list_workspace_members  — T-74 honest-unavailable (account-client)
//   4. huly_get_user_profile        — current user (getCurrentUser passthrough)
//   5. huly_update_user_profile     — update current user name
//
// _class refs: contact.class.Person + contact.mixin:Employee (string literal).

import { z } from "zod";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { PERSON_CLASS } from "./_class-refs.js";
import { safeUpdateDoc } from "./_common.js";

export const tools: HulyToolDefinition[] = [
  // 1. get_workspace_info — workspace binding hiện tại
  defineHulyTool({
    name: "get_workspace_info",
    label: "Get workspace info",
    description: "Get current workspace info (id, resolved). Use để verify binding sau /huly init.",
    promptSnippet: "Get current Huly workspace binding info.",
    parameters: z.object({
      workspace: z.optional(
        z.string().describe("Workspace id-handle override (default: cwd-map)."),
      ),
    }),
    async handler(_params, tctx) {
      return {
        content: `Workspace: ${tctx.workspace}`,
        details: { workspace: tctx.workspace },
      };
    },
  }),

  // 2. list_workspaces — T-74: honest-unavailable (needs account-client HTTP layer)
  defineHulyTool({
    name: "list_workspaces",
    label: "List workspaces",
    description:
      "UNAVAILABLE — workspaces = account-level data (AccountClient.listWorkspaces). " +
      "Use huly_get_workspace_info for current workspace binding. Deferred behind ADR.",
    promptSnippet: "List Huly workspaces.",
    parameters: z.object({
      workspace: z.optional(z.string()),
      limit: z.optional(z.number().int().describe("Max results (default: 50).").min(1)),
    }),
    async handler(_params, _tctx) {
      return {
        content:
          "list_workspaces KHÔNG khả dụng: workspaces = account-level data " +
          "(AccountClient.listWorkspaces, HTTP). Use huly_get_workspace_info for current workspace. " +
          "Deferred behind ADR.",
        isError: true,
        details: {
          reason: "account_client_layer_required",
          alternative: "huly_get_workspace_info",
        },
      };
    },
  }),

  // 3. list_workspace_members — T-74: honest-unavailable (needs account-client for roles)
  defineHulyTool({
    name: "list_workspace_members",
    label: "List workspace members",
    description:
      "UNAVAILABLE — workspace members with roles = account-level data (AccountClient.getWorkspaceMembers). " +
      "Use huly_list_employees for employee data (data-client). Deferred behind ADR.",
    promptSnippet: "List Huly workspace members.",
    parameters: z.object({
      workspace: z.optional(z.string()),
      limit: z.optional(z.number().int().describe("Max results (default: 50).").min(1)),
    }),
    async handler(_params, _tctx) {
      return {
        content:
          "list_workspace_members KHÔNG khả dụng: workspace members with roles = " +
          "account-level data (AccountClient.getWorkspaceMembers, HTTP). Use " +
          "huly_list_employees for employee data via data-client ws. Deferred behind ADR.",
        isError: true,
        details: { reason: "account_client_layer_required", alternative: "huly_list_employees" },
      };
    },
  }),

  // 4. get_user_profile — current user (passthrough getCurrentUser)
  defineHulyTool({
    name: "get_user_profile",
    label: "Get user profile",
    description: "Get current user profile (id, name, email) — default assignee source.",
    promptSnippet: "Get current Huly user profile.",
    parameters: z.object({
      workspace: z.optional(z.string()),
    }),
    async handler(_params, tctx) {
      return {
        content: `User: ${tctx.currentUser.name} <${tctx.currentUser.email}> (id: ${tctx.currentUser.id})`,
        details: { user: tctx.currentUser },
      };
    },
  }),

  // 5. update_user_profile — update current user name (firstName/lastName)
  defineHulyTool({
    name: "update_user_profile",
    label: "Update user profile",
    description:
      'Update current user name (firstName/lastName → Huly "LastName,FirstName" format). ' +
      "Bio/city/socialLinks honest-unavailable (account-client ADR pending).",
    promptSnippet: "Update current Huly user profile.",
    parameters: z.object({
      workspace: z.optional(z.string()),
      firstName: z.optional(z.string().describe("First name.")),
      lastName: z.optional(z.string().describe("Last name.")),
    }),
    async handler(params, tctx) {
      // T-82 #105: Huly Person.name = "LastName,FirstName" (trusted persons.ts:65).
      // Trước đây ghi raw params.name → phá format. Nay tách firstName/lastName +
      // formatName. Partial update: parse current name, giữ field không truyền.
      if (params.firstName === undefined && params.lastName === undefined) {
        return {
          content: "No fields to update.",
          details: { updated: false },
        };
      }
      // T-103 #157: Person linked to account qua `personUuid` field (= account.uuid
      // = currentUser.id). Lookup-by-_id fail (Person._id = generated id, KHÔNG
      // uuid). Channel(email) cũng KHÔNG reliable (numeric socialId). personUuid
      // là canonical account→Person link.
      const person = await tctx.client.findOne(PERSON_CLASS, {
        personUuid: tctx.currentUser.id,
      } as never);
      if (!person) {
        return {
          content: `Person for current user (uuid ${tctx.currentUser.id}) not found. Cannot update profile.`,
          isError: true,
          details: { userId: tctx.currentUser.id },
        };
      }
      const current = parsePersonName((person as { name?: string }).name);
      const newFirst = params.firstName ?? current.firstName;
      const newLast = params.lastName ?? current.lastName;
      const operations: Record<string, unknown> = {
        name: `${newLast},${newFirst}`,
      };
      const result = await safeUpdateDoc(tctx.client, PERSON_CLASS, person, operations);
      if (!result.ok) return result.error;
      return {
        content: `Updated profile name: ${newLast},${newFirst}`,
        details: { updated: true, fields: ["name"], name: `${newLast},${newFirst}` },
      };
    },
  }),
];

/**
 * T-82 #105: parse Huly Person.name "LastName,FirstName" → {firstName, lastName}.
 * Port trusted persons.ts:67 parseName.
 */
function parsePersonName(name: string | undefined): { firstName: string; lastName: string } {
  if (name === undefined) return { firstName: "", lastName: "" };
  const comma = name.indexOf(",");
  if (comma !== -1) {
    return { firstName: name.slice(comma + 1), lastName: name.slice(0, comma) };
  }
  return { firstName: name, lastName: "" };
}
