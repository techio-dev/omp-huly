// tools/domains/time.ts — Time log domain (1 tool).
// Design: 06-api.md §4 Time.
//
// T-74 (2026-07-28): collection "reports" (KHÔNG "timetracking"), value = hours
// (Huly native unit, fractional OK — 0.25 = 15min), date + employee fields.
// reality-checker CONFIRMED vs trusted time.ts + tracker-types.ts.

import { z } from "zod";
import { defineHulyTool, type HulyToolDefinition } from "../builder.js";
import { TIME_SPEND_REPORT_CLASS, ISSUE_CLASS, EMPLOYEE_CLASS } from "./_class-refs.js";
import { workspaceParam, projectParam, identifierParam, resolveIdentifier } from "./_common.js";

export const tools: HulyToolDefinition[] = [
  // 1. log_time — T-74: value = hours (Huly native unit)
  defineHulyTool({
    name: "log_time",
    label: "Log time",
    description:
      "Log time on issue (value = HOURS, Huly native unit — 0.25 = 15min, 8 = 1 work day). " +
      "Fractional allowed. Employee resolved từ current user.",
    promptSnippet: "Log time spent on a Huly issue.",
    needsProject: true,
    parameters: z.object({
      workspace: workspaceParam,
      project: projectParam,
      identifier: identifierParam,
      value: z.number().describe("Time in HOURS (0.25 = 15min, 8 = 1 day).").min(0.01),
      description: z.optional(z.string()),
    }),
    async handler(params, tctx) {
      // T-103 #158: guard value > 0 (schema min 0.01 unenforced — negative =
      // time corruption, 0 = noise). Reject loudly.
      if (!(params.value > 0)) {
        return {
          content: `log_time value must be > 0 hours (got ${params.value}). Negative corrupts tracked time, 0 is noise.`,
          isError: true,
          details: { value: params.value },
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
      // T-74: resolve current user → Employee ref (best-effort).
      let employeeRef: string | undefined;
      try {
        const user = await tctx.client.getCurrentUser();
        const emp = await tctx.client.findOne(EMPLOYEE_CLASS, {
          personUuid: user.id,
        } as never);
        employeeRef = emp?._id;
      } catch {
        // Resolution fail — omit employee, server may default to current.
      }
      const attrs: Record<string, unknown> = {
        value: params.value,
        date: Date.now(),
      };
      if (params.description !== undefined) attrs.description = params.description;
      if (employeeRef !== undefined) attrs.employee = employeeRef;
      // T-74: collection "reports" (KHÔNG "timetracking" — Issue.reports field).
      await tctx.client.addCollection(
        TIME_SPEND_REPORT_CLASS,
        issue.space as never,
        issue._id as never,
        ISSUE_CLASS,
        "reports",
        attrs as never,
      );
      return {
        content: `Logged ${params.value}h on ${params.identifier}.`,
        details: {
          identifier: params.identifier,
          value: params.value,
          unit: "hours",
          employee: employeeRef,
          date: attrs.date,
        },
      };
    },
  }),
];
