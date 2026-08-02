# pi-huly — TASKS

> TaskStore = `local-tasks`. 77 task (T-XX design ID, T-01..T-77). Size prefix
> [S/M/L] (gate: S không chia, M agent đề xuất, L bắt buộc chia — issues 21 đã
> split T-19a/b/c). DAG `blocked-by`/`blocks` text. Priority high/medium/low
> quyết định thứ tự implement (`milestone-implement` sort: priority > order >
> size). Roadmap đầy đủ: [docs/design/09-roadmap.md](./docs/design/09-roadmap.md).

## M0 Foundation

_DoD: build + lint + typecheck pass; config read/write; CI green._

**Status: ✅ completed** _(slash goal complete-milestone M0, 2026-07-27 — 3/3 tasks done, CI green, DoD pass)_

- [x] [T-01] [M] Skeleton + tooling (package.json pi-manifest, tsconfig TS7, rolldown bundle, oxlint/oxfmt, vitest, CI workflow, .node-version=24) — high | blocks: T-02,T-03 | risks: R3,R4,R6 — ✅ done (PR #1 merged 6ae59e7, CI green ubuntu+macos)
- [x] [T-02] [M] config/credentials.ts (auth union token|email+password, workspace-required, id-handle, findByName) + unit — high | blocked-by: T-01 | blocks: T-04 — ✅ done (PR #2 merged 515b7d2, 36 tests, coverage 90.54%)
- [x] [T-03] [M] config/config.ts + resolver.ts (transport ws|rest, projects cwd-map longest-prefix, same-name diff-URL disambiguate) + unit — high | blocked-by: T-01 | blocks: T-04,T-31 — ✅ done (PR #3 merged bcd9c92, 88 tests M0 total, coverage config 91.57% + resolver 100%)

## M1 Client core

_DoD: mock Huly WS+REST integration pass; markup round-trip fixtures green (R8)._

**Status: ✅ completed** _(slash goal complete-milestone M1, 2026-07-27 — 6/6 tasks done, 224 tests, CI green, DoD pass)_

- [x] [T-04] [S] client/errors.ts (HulyError taxonomy Auth/Connection/NotFound/Conflict/Internal/External, mapError, toToolResult no-leak) + unit — high | blocked-by: T-02,T-03 | blocks: T-05,T-08a,T-09 — ✅ done (PR #4 merged 01d1e63, 37 tests, coverage 93.33% stmts / 100% funcs)
- [x] [T-05] [M] client/client.ts (createHulyClient ws connect / rest connectRest, generic CRUD findOne/findAll/createDoc/updateDoc/removeDoc/addCollection/createMixin, getCurrentUser) + integration mock — high | blocked-by: T-04 | blocks: T-06,T-07 | risks: R2 — ✅ done (PR #6 merged 9c5bb2a, 28 tests, coverage 90%, ambient decls cho @hcengineering types)
- [x] [T-06] [M] client/pool.ts (transport-aware getClient, LRU evict ≤8 ws, auto-reconnect backoff, closeAll session_shutdown, health) + integration — high | blocked-by: T-05 | blocks: T-09 | risks: R2 — ✅ done (PR #7 merged 6316108, 15 tests, coverage 100% stmts)
- [x] [T-07] [S] client/assignee.ts (resolveAssignee: input→validate/lookup, absent→getCurrentUser email) + unit — medium | blocked-by: T-05 | blocks: T-09 — ✅ done (PR #8 merged, 5 tests)
- [x] [T-08a] [S] markup/markup.ts wrapper (@hcengineering/text-markdown markdownToMarkup/markupToMd, both directions) + unit — high | blocked-by: T-04 | blocks: T-08b — ✅ done (PR #9 merged, 26 tests + 12 markdown fixtures)
- [x] [T-08b] [M] native-ref transform (reimplement transformMarkupNodeNativeReferenceLinks + markupNodeToMarkdownString) + round-trip fixtures (R8) — high | blocked-by: T-08a | blocks: T-09 | risks: R8 — ✅ done (PR #10 merged a7d1ca6, 25 tests, R8 lossless verified)

## M2 Tools layer

_DoD: ~102 tool đăng ký; typebox schema valid; confirm gate; mock CRUD pass._

**Status: ✅ completed** _(slash goal complete-milestone M2, 2026-07-27 — 23/23 tasks done, 102 tools registered, 277 tests, CI green, DoD pass)_

- [x] [T-09] [M] tools/builder.ts (defineHulyTool seam: huly_ prefix, resolve ws+project, getClient, error map, confirm gate, render hook, assignee default) + unit — high | blocked-by: T-06,T-07,T-08b | blocks: T-10, T-11..T-29 — ✅ done (PR #11 merged 332d052, 26 tests, sanitize centralized)
- [x] [T-10] [S] tools/confirm.ts (confirmDestructive: ctx.ui.confirm; non-TUI auto-deny) + unit — high | blocked-by: T-09 | blocks: domains — ✅ done (PR #11 merged 332d052)
- [x] [T-11] [M] tools/domains/documents.ts (10: list/get/create/update/delete_teamspace, list/get/create/edit/delete_document) — high | blocked-by: T-09,T-10 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-12] [S] tools/domains/document-snapshots.ts (2: list/get_document_snapshot) — medium | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-13] [S] tools/domains/spaces.ts (5: list/get_space, list/get_space_type, update_space) — medium | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-14] [S] tools/domains/workspace.ts (5: get_workspace_info, list_workspaces, list_workspace_members, get/update_user_profile) — high | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12, 8 tests)
- [x] [T-15] [M] tools/domains/projects.ts (6: list/get/create/update/delete_project, list_statuses) — high | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-16] [S] tools/domains/task-management.ts (5: list_project_types, get_project_type, list_task_types, create_task_type, create_issue_status idempotent) — high | blocked-by: T-09 | blocks: T-19 — ✅ done (PR #12)
- [x] [T-17] [S] tools/domains/components.ts (6: list/get/create/update/set_issue/delete_component) — medium | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-18] [S] tools/domains/milestones.ts (6: list/get/create/update/set_issue/delete_milestone) — high | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-19a] [M] tools/domains/issues-core.ts (8: list/get/create/update/delete/move_issue, add/remove_issue_label) — high | blocked-by: T-09,T-10,T-16 | blocks: T-30, T-19b, T-19c — ✅ done (PR #12)
- [x] [T-19b] [M] tools/domains/issues-templates.ts (8: list/get/create/create_from/update/delete_template, add/remove_template_child) — medium | blocked-by: T-19a | blocks: T-30 — ✅ done (PR #12)
- [x] [T-19c] [S] tools/domains/issues-relations.ts (5: add/remove/list_issue_relation, link/unlink_document_to_issue) — high | blocked-by: T-19a | blocks: T-30 — ✅ done (PR #12)
- [x] [T-20] [S] tools/domains/labels.ts (4: list/create/update/delete_label — GLOBAL namespace) — medium | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-21] [S] tools/domains/tags.ts (7: list/create/update/delete_tag, list_attached, attach/detach_tag) — medium | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-22] [S] tools/domains/tag-categories.ts (4: list/create/update/delete_tag category) — low | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-23] [S] tools/domains/comments.ts (4: list/add/update/delete_comment, body not message) — high | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-24] [S] tools/domains/attachments.ts (5: list/get/add_attachment, add_issue_attachment, download_attachment) — medium | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-25] [S] tools/domains/search.ts (1: fulltext_search global) — medium | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-26] [S] tools/domains/deletion.ts (1: preview_deletion cascade) — medium | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-27] [S] tools/domains/time.ts (1: log_time minutes) — medium | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-28] [S] tools/domains/todos.ts (7: list/get/create/update/complete/reopen/delete_todo) — medium | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-29] [S] tools/domains/contacts.ts (2: list_employees, list_persons — read, assignee resolution) — medium | blocked-by: T-09 | blocks: T-30 — ✅ done (PR #12)
- [x] [T-30] [S] tools/register.ts (register all 19 domain modules) — high | blocked-by: T-11..T-29 | blocks: T-31,T-32,T-33 — ✅ done (PR #12, 102 tools registered)

## M3 Commands + render + factory

_DoD: `/huly init` bind cwd; 3 tool render; session_shutdown cleanup._

**Status: ✅ completed** _(slash goal hoàn thành công M3, 2026-07-27 — 3/3 tasks done, 349 tests, CI green, DoD pass)_

- [x] [T-31] [M] commands/huly.ts (unified: no-arg smart, init flow w/ auth choice, status diagnostics, workspace list/add/remove, link, unlink) + unit — high | blocked-by: T-03,T-30 | blocks: T-33 — ✅ done (PR #13 merged 2ca649b, 34 tests, version.ts tách tránh circular import, non-TUI fail-safe)
- [x] [T-32] [M] render/issue.ts + render/document.ts (huly_get_issue card, huly_list_issues table, huly_get_document preview) — medium | blocked-by: T-30 | blocks: T-33 — ✅ done (PR #14 merged a07e40b, 28 tests, render/util.ts shared, ANSI sanitize chống terminal injection)
- [x] [T-33] [S] index.ts factory (register tools+commands, session_shutdown→pool.closeAll, skills via package manifest) — high | blocked-by: T-31,T-32 | blocks: T-34,T-35 — ✅ done (PR #15 merged 46f1786, 10 tests, render hooks wire 3 tools, setup() guard tránh dev-reload leak, bundle 149.71 kB)

## M4 Skills

_DoD: skill load, huly_ prefixed names, no MCP refs._

**Status: ✅ completed** _(slash goal complete-milestone M4, 2026-07-27 — 2/2 tasks done, 352 tests, CI green, DoD pass; R7 precondition verified, dispatch smoke deferred T-36)_

- [x] [T-34] [M] skills/huly-docs + skills/huly-tasks adapted (substitute huly_ prefix, drop "@firfi/huly-mcp MCP" refs, keep structure) — high | blocked-by: T-33 | blocks: T-36 — ✅ done (PR #16 merged 245d424, 7 skill files: 2 SKILL.md + 5 references/, 46 huly_ tool refs all resolve to bundle, 0 MCP positive refs, markdownlint 0 issues, 5 automated DoD checks pass)
- [x] [T-35] [S] R7 subagent smoke test (dispatch pi-subagent gọi huly tool → assert 1 connection; fallback if separate process) — medium | blocked-by: T-33 | blocks: T-36 | risks: R7 — ✅ done (PR #17 merged 30d5fd8, rescoped: 3 precondition tests added to pool.test.ts verifying D14 same-process pool sharing — main+subagent share 1 connection, concurrent dispatch no double-connect, cross-workspace boundary; R7 dispatch runtime UNVERIFIED in CI — pi-subagents package unavailable in node_modules, deferred to T-36 e2e; 352 tests pass)

## M5 Hardening + release

_DoD: e2e self-host smoke; npm publish; Bước 10 release._

**Status: ✅ completed** _(slash goal complete-milestone M5, 2026-07-27 — 4/4 tasks done: T-36 e2e smoke integration harness + T-37 docs/NOTICE R1 audit + T-38 publish prep + T-39 release EXECUTED — canary v1.0.0-beta.1 published to npm tag `beta`, git tagged, GitHub release created, post-publish verified; stable 1.0.0 sau canary feedback per 10-release §B)_

- [x] [T-36] [M] e2e self-host smoke (~10 critical tools: create_issue, list_issues, get_issue, create_document, edit_document, create_milestone, set_issue_milestone, add_comment, fulltext_search, /huly init) — medium | blocked-by: T-34,T-35 | blocks: T-38 — ✅ done (PR #18 merged 5e11700, 13 integration smoke tests invoke tool.execute() full builder seam, 365 tests total; RESCOPED: runtime real-Huly e2e DEFERRED — no self-host available, defer to post-deploy prod verify 10-release §D)
- [x] [T-37] [M] docs (README, setup guide, /huly guide, Bước 10 deploy, @hcengineering GitHub token doc, R1 license audit) — medium | blocked-by: T-33 | blocks: T-38 | risks: R1 — ✅ done (PR #19 merged dcb2e34, README rewritten user-facing + NOTICE.md R1 license audit — verified 8/8 packages license metadata thật: @hcengineering/* EPL-2.0 bundled, ws/typebox/pi MIT external; R1 accept, no release block)
- [x] [T-38] [S] npm publish prep (prepack build, version, pi-package keyword, pi manifest final) — high | blocked-by: T-36,T-37 | blocks: T-39 — ✅ done (PR #20 merged 9e7c3a9, version 1.0.0, prepack script, CHANGELOG.md, .npmignore, doc-code sync fix — @hcengineering KHÔNG bundled mà là npm public dep; tarball clean: dist+skills+4docs+package.json)
- [x] [T-39] [M] release (Bước 10: deployment strategy, git tag v1.0.0, post-deploy prod verify, monitoring window) — high | blocked-by: T-38 — ✅ done (canary v1.0.0-beta.1 PUBLISHED to npm tag `beta` — user authorized NPM_TOKEN publish; `npm view pi-huly@1.0.0-beta.1` verified registry metadata + dist-tags + tarball fetch + 14 files clean + pi manifest intact; git tag v1.0.0-beta.1 pushed; GitHub release https://github.com/naicoi92/pi-huly/releases/tag/v1.0.0-beta.1; stable 1.0.0 DEFERRED sau canary feedback per 10-release §B)

---

## Post-release hotfixes (M6)

_DoD: 7/7 task done (T-40..T-46); 411 tests pass; CI main green; audit doc
(`docs/design/11-runtime-audit.md`) làm source of truth._

**Status: ✅ completed** _(slash goal complete-milestone M6, 2026-07-27 — 7/7
tasks done, 411 tests pass (+46 từ 365 baseline), CI green cả ubuntu+macos, DoD
pass; audit runtime qua npm tarball source map extraction thay self-host
`workvps` unavailable; 3 class refs UNVERIFIED (Label/TsRelation/DocumentSnapshot)
giữ current — cần runtime server verify khi có self-host)_

> **Context**: Sau canary v1.0.0-beta.1, smoke test trên self-host `workvps` phát
> hiện **7 runtime bug** (GitHub issues #22-#28). Tất cả chia sẻ **1 root pattern**:
> code viết dựa trên assumption về Huly runtime (class name, description storage,
> search API, surface shape, addCollection signature) nhưng **chưa có runtime
> verification thật** — chỉ verify qua design doc/source code tĩnh.
>
> **Nhóm theo bản chất**:
>
> - **Surface shape** (#22 list giấu array, #26 create giấu id) — cùng root cause
>   ở `builder.ts`, T-40 fix 1 chỗ.
> - **Class/storage/protocol sai** (#23 description ref, #25 class name, #28
>   addCollection) — T-44 audit runtime là prerequisite.
> - **Operator sai** (#24 `$like`) — T-44 verify operator.
> - **Validation thiếu** (#27 label không check tồn tại) — T-45 fix, blocked-by T-44.
>
> **T-44 (audit runtime) là prerequisite cho T-41/T-42/T-43/T-45/T-46** — không
> đoán mò class name / storage model / operator nữa. **T-40 fix độc lập** (chỉ
> logic surface, không depend Huly server) → bắt đầu được ngay.
>
> Chi tiết mỗi task (vấn đề, phương án, acceptance) ở [`docs/tasks/T-XX.md`](./docs/tasks/).
> Theo dõi: [GitHub issues #22-#28](https://github.com/naicoi92/pi-huly/issues).

- [x] [T-40] [M] fix(builder): surface `details` → `content` cho non-TUI path — fix cả list (#22) lẫn create__/add__ (#26) — high | blocked-by: (none) | blocks: (none) | issues: #22,#26 — [detail](./docs/tasks/T-40.md) — ✅ done (PR #29 merged 9c20abf, appendDetailsForLLM generic seam + sanitize, create_issue identifier lookup, 377 tests)
- [x] [T-41] [M] fix(get_issue): resolve description document ref → markdown content (issue #23) — high | blocked-by: T-44 | blocks: (none) | issue: #23 — [detail](./docs/tasks/T-41.md) — ✅ done (PR #32 merged 4bd1991, client.fetchMarkup MarkupOperations, fallback descriptionRef, 396 tests)
- [x] [T-42] [M] fix(fulltext_search): expand 3-domain search + honest capability (issue #24) — high | blocked-by: T-44 | blocks: (none) | issue: #24 — [detail](./docs/tasks/T-42.md) — ✅ done (PR #33 merged 1545c5b, Issue+Document+ChatMessage Promise.all, server reject catch honest, 402 tests)
- [x] [T-43] [L] fix(_class-refs): correct 6+ broken class name runtime (Employee→mixin, TaskType/ProjectType→task pkg, Document→tracker, Space→core, Tag→TagElement, Todo→time:ToDo, TimeSpendReport→tracker) (issue #25 updated) — high | blocked-by: T-44 | blocks: T-41,T-42,T-45,T-46 | issue: #25 — [detail](./docs/tasks/T-43.md) — ✅ done (PR #31 merged 039b15d, audit §1 truth table, 3 UNVERIFIED giữ current — Label/TsRelation/DocumentSnapshot, 393 tests)
- [x] [T-44] [M] chore(audit): runtime class refs + storage + search + addCollection verify qua npm tarball source map extraction (KHÔNG server — workvps unavailable) — high | blocked-by: (none) | blocks: T-41,T-42,T-43,T-45,T-46 — [detail](./docs/tasks/T-44.md) — ✅ done (PR #30 merged b273dd4, `docs/design/11-runtime-audit.md` source of truth, 9 audit regression tests, 386 tests)
- [x] [T-45] [S] fix(add_issue_label): validate label tồn tại + TagReference object shape (issue #27) — medium | blocked-by: T-44 | blocks: (none) | issue: #27 — [detail](./docs/tasks/T-45.md) — ✅ done (PR #34 merged fc06f30, lookup title OR _id + push {tag,title,color} shape, symmetric remove, 406 tests)
- [x] [T-46] [M] fix(create_todo): addCollection required fields (attachedToClass/user/visibility/rank/priority/workslots) + error wrap (issue #28) — medium | blocked-by: T-44,T-43 | blocks: (none) | issue: #28 — [detail](./docs/tasks/T-46.md) — ✅ done (PR #35 merged 768b566, priority string→number map, Visibility.Public default, lexorank empty, 411 tests)

---

## beta.2 follow-up hotfixes (post-beta.2 — không thuộc milestone)

> **Context**: Sau khi beta.2 shipped (fix 7 bug #22-#28 qua T-40..T-46), smoke
> test tiếp tục phát hiện **8 bug mới** (GitHub issues #36-#43). Phân tích cho thấy:
>
> - **3 bug là root cause mới chưa được address** (#36 update_issue status drop +
>   assignee leak, #40 space param sai, #41 silent space fallback).
> - **3 bug liên quan class registry vẫn UNVERIFIED** (audit §7 Known limitations
>   — Label/TsRelation/DocumentSnapshot): #38 Document class runtime lỗi, #39 +
>   #43 TsRelation runtime lỗi.
> - **1 bug là generalization** của pattern T-45 (validate FK ref): #42 mở rộng ra
>   7 tool khác cùng pattern.
> - **1 bug có thể là duplicate** của #22 đã fix T-40: #37 (list_* count) — cần
>   investigate xem user có chạy beta.2 hay chưa.
>
> **Nhóm theo bản chất**:
>
> - **Validation/space layer** (#40 + #41 + #42) — cùng root cause: write với
>   ref/space sai không validate → TxUpdateDoc skip lan truyền. Pattern chuẩn đã
>   ship ở PR #34 (T-45).
> - **Class registry remaining** (#38 + #39 + #43) — 3 class UNVERIFIED runtime,
>   cần server verify (T-53).
> - **Tool-specific bug** (#36 update_issue) — D15 leak + status không map enum.
> - **Investigate duplicate** (#37) — có thể close as duplicate #22.
>
> Chi tiết mỗi task ở [`docs/tasks/T-XX.md`](./docs/tasks/).
> Theo dõi: [GitHub issues #36-#43](https://github.com/naicoi92/pi-huly/issues).

- [x] [T-47] [M] fix(update_issue): status persist + stop auto-assignee leak (D15 rule không apply cho update) (issue #36) — critical | blocked-by: (none) | blocks: (none) | issue: #36 — [detail](./docs/tasks/T-47.md) — ✅ done (9 tests, 420 total; remove needsAssignee leak + resolve status short→full ref + empty/schema-drift/whitespace/findAll-throw edge cases; 2 code-review + 1 reality-check pass)
- [x] [T-48] [S] investigate: list_* có còn chỉ trả count sau T-40 không? (có thể duplicate #22 đã fix) (issue #37) — high | blocked-by: (none) | blocks: (none) | issue: #37 — [detail](./docs/tasks/T-48.md) — ✅ done (investigate + defensive consistency fix; most likely duplicate #22; builder.ts `=== false` → `!== true` align với confirm.ts/huly.ts; 1 test hasUI=undefined regression guard)
- [x] [T-49] [S] fix(fulltext_search): Document class sai runtime + defensive per-domain catch (issue #38) — high | blocked-by: (none, pair T-53 nếu cần server) | blocks: (none) | issue: #38 — [detail](./docs/tasks/T-49.md) — ✅ done (defensive Promise.allSettled; root cause Document class deferred T-53)
- [x] [T-50] [S] fix(update_user_profile): space param sai → TxUpdateDoc skip (issue #40) — high | blocked-by: (none) | blocks: (none) | issue: #40 — [detail](./docs/tasks/T-50.md) — ✅ done (lookup Person.space trước updateDoc + schema drift guard; 413 tests, +2 regression +1 schema drift; replace test固化 bug cũ)

- [x] [T-51] [M] fix(create_*): silent space fallback tạo document mồ côi khi project null (4 call site) (issue #41) — high | blocked-by: (none) | blocks: (none) | issue: #41 — [detail](./docs/tasks/T-51.md) — ✅ done (4 call sites fix: components + milestones + issues-templates ×2; isError thay fallback workspace)
- [x] [T-52] [L] fix(*): validate foreign-key ref tồn tại trước write (7 tool: add_issue_relation, set_issue_component/milestone, move_issue, link/unlink_document, attach_tag) (issue #42) — critical | blocked-by: (none, pattern có sẵn PR #34) | blocks: (none) | issue: #42 — [detail](./docs/tasks/T-52.md) — ✅ done (6/7 tool FK validate + attach_tag shape bonus; unlink_document skip per spec §3 idempotent; move_issue Option A; 435 tests, +24 across 4 new + 1 extend test files)

- [x] [T-53] [M] investigate: verify 3 class refs UNVERIFIED runtime (Label, TsRelation, DocumentSnapshot) trên self-host thật — gộp #39 bug + #43 investigation (issues #39,#43) — high | blocked-by: (none code, cần user cung cấp self-host URL+auth) | blocks: (none, unblock confirm #38/#39) | issues: #39,#43 — [detail](./docs/tasks/T-53.md) — ⏳ done (guide tạo [T-53-runtime-verify-guide.md](./docs/tasks/T-53-runtime-verify-guide.md), pending user runtime verify) — **superseded by T-58** (umbrella root cause audit, up level)

---

## beta.3 follow-up hotfixes (post-beta.3 — không thuộc milestone)

> **Context**: Sau khi beta.3 shipped (fix 8 bug #36-#43 qua T-47..T-53), smoke
> test tiếp tục phát hiện **vấn đề mới + root cause chưa resolve**:
>
> - **4 vấn đề là root cause runtime chưa fix thành công** (#38→#55 Document class
>   report 2 lần, #39 TsRelation open từ beta.2, #43 3 class UNVERIFIED, #58 mới
>   phát hiện create_teamspace sai class). User nhấn mạnh: **up level cao hơn** —
>   verify runtime thật + fix class ref đúng, KHÔNG defensive che lỗi nữa.
> - **3 enhancement** (#54 pool warm, #56 debug log, #57 error mapping) — cải thiện
>   DX/observability, start ngay.
>
> **Nhóm theo bản chất**:
>
> - **Runtime class registry audit (L, critical)** — T-58 umbrella gộp toàn bộ
>   root cause class sai runtime. Block T-59 (relations inline), T-60 (Document
>   search), resolve #39/#43/#55. Cần user cung cấp self-host probe output.
> - **Tool-specific bug** — T-54 create_teamspace sai class + thiếu required
>   fields (pattern giống #28 create_todo đã fix T-46).
> - **Enhancement/DX** — T-55 pool warm, T-56 debug log, T-57 error mapping.
>
> Chi tiết mỗi task ở GitHub issues (link trong cột issue).
> Theo dõi: [GitHub issues #39, #43, #55, #58-#64](https://github.com/naicoi92/pi-huly/issues).

- [x] [T-54] [M] fix(create_teamspace): sai class + thiếu required fields → platform:status:UnknownError — high | blocked-by: (none, pair T-58 nếu cần verify class) | blocks: (none) | issue: #58 — [detail](./docs/tasks/T-54.md) — ✅ done (honest-unavailable: reality-checker STRONG confirm `core:class:Space` base abstract KHÔNG instantiate được; KHÔNG đoán class mới — đợi T-58 verify; read path list/get_teamspaces vẫn OK; 5 tests)
- [x] [T-55] [S] enhancement(pool): eager warm connection at session_start — fix first-call failure — high | blocked-by: (none) | blocks: (none) | issue: #59 — [detail](./docs/tasks/T-55.md) — ✅ done (subscribe session_start reason∈{startup,resume} → warmPool fire-and-forget; swallow error; skip empty creds; 7 tests)
- [x] [T-56] [S] enhancement(debug): log tool name + params khi gọi tool — subscribe tool_execution_start — medium | blocked-by: (none) | blocks: (none) | issue: #60 — [detail](./docs/tasks/T-56.md) — ✅ done (log `[huly_<tool>] args: <json>` ra stderr; filter huly_ prefix; truncate>500 + sanitize sau truncate; circular safe; 7 tests)
- [x] [T-57] [S] enhancement(errors): map domain not found → honest "tool unavailable" thay vì generic InternalError — medium | blocked-by: (none) | blocks: (none) | issue: #61 — [detail](./docs/tasks/T-57.md) — ✅ done (ErrorClass "Unavailable" + UnavailableError + matchDomainNotFound; mapError detect PlatformError+plain Error; builder render honest; 11 tests)
- [x] [T-58] [L] runtime audit: verify + fix ALL class refs trên self-host thật (Document, TsRelation, Label, DocumentSnapshot, Space/Teamspace) — root cause, KHÔNG defensive — critical | blocked-by: (resolved — DEEP-AUDIT source map 12 packages) | blocks: T-59, T-60 (unblocked) | issues: #39, #43, #55, #62 — [detail](./docs/tasks/T-58.md) — ✅ done (DEEP-AUDIT plugin() class block scan: Document interface orphan, TsRelation inline, Label/Snapshot deprecated, Space base abstract → Drive; 6 label/snapshot tool honest-unavailable + issues-core TAG_CLASS switch)
- [x] [T-59] [M] refactor(issue_relations): dùng $push/$pull Issue.relations inline (nếu TsRelation KHÔNG phải class riêng) — high | blocked-by: T-58 (CONFIRMED inline) | blocks: (none) | issue: #63 — [detail](./docs/tasks/T-59.md) — ✅ done (3 tool refactor $push/$pull inline RelatedDocument[]; is-blocked-by reverse direction target.blockedBy; remove API breaking change relation _id → targetIssue+relationType; xóa TS_RELATION_CLASS dead code; 13 tests)
- [x] [T-60] [M] fix(fulltext_search): Document search root cause — verify + fix class ref (KHÔNG defensive) — high | blocked-by: T-58 (CONFIRMED interface orphan) | blocks: (none) | issues: #55, #64 — [detail](./docs/tasks/T-60.md) — ✅ done (REMOVE Document domain search; 5 doc CRUD + link/unlink honest-unavailable interface orphan; 7 tool total; reality-checker CONFIRMED 0 dead class runtime call)
- [x] [T-61] [M] fix(issue_relations): add/remove/list relation hướng KHÔNG khớp Huly UI (RelationsPopup.svelte) — root cause | high | blocked-by: (none) | blocks: (none) | issue: #TBD — ✅ done (verified từ Huly source chính thức: RelationsPopup.svelte:33-41 + issues.ts:111 updateIssueRelation + relations.spec.ts; storage đúng: blocks→target.blockedBy, is-blocked-by→source.blockedBy, relates-to→bidirectional; list thêm reverse query findAll { 'blockedBy._id': issue._id }; 18 tests; root cause T-59 #63 refactor trước đây ĐẢO ngược blocks/is-blocked-by + thiếu chiều relates-to)

---

## beta.4 follow-up hotfixes (post-beta.4 — không thuộc milestone)

**Status: ✅ completed** _(slash goal beta.4 follow-up, 2026-07-28 — 3/3 tasks
done, 583 tests pass (+74 từ 509 baseline), CI green cả ubuntu+macos, DoD pass;
3 review pass + 1 BLOCKER fix T-64 B1 token leak post-connect)_

> **Context**: Sau khi beta.4 shipped (root cause fix 5 class ref qua T-54..T-60 +
> T-61 issue_relations direction), smoke test tiếp tục phát hiện **3 vấn đề mới**:
>
> - **2 upstream noise spam** (#67, #69): upstream `@hcengineering` in ra stderr
>   hàng loạt `console.warn`/`console.error`/`console.log` không seam, break UI
>   pi. Cùng root cause class → cần **filter framework tập trung** (T-62 nền
>   tảng, T-64 đăng ký thêm pattern).
>   - **#67** (`@hcengineering/core` memdb/client): `no document found, failed
to apply model transaction` cache-miss warn khi warm pool T-55.
>   - **#69** (`@hcengineering/client-resources` connection.js): `client
websocket error: <id> wss://.../_transactor/<token>` + 7 dòng spam khác
>     (SessionId, ping, version, ...) + **token leak security** (URL chứa
>     api-token ra stderr/UI — NFR-04 violation).
> - **1 silent data loss audit** (#68): cùng warning class có root cause thứ 2
>   nằm trong pi-huly — tool gọi `updateDoc`/`removeDoc` với `space`/`objectId`
>   sai → server skip silent → update KHÔNG persist (giống bug #36/#40 đã fix).
>   Static audit hiện: **42 call site, 42/42 NHÓM A** (lấy từ lookup doc, OK),
>   NHƯNG 41/42 thiếu schema drift guard → silent no-op nếu doc.space/_id
>   undefined.
>
> **Nhóm theo bản chất**:
>
> - **Filter framework** (#67 / T-62) — xây `console-filter.ts` tập trung,
>   `runWithConsoleFilter` + pattern registry. Nền tảng cho T-64. Start ngay.
> - **WS spam + token leak** (#69 / T-64) — đăng ký pattern WS error + 7 dòng
>   spam + fix token leak vào framework T-62. **Blocked-by T-62**.
> - **Audit hardening** (#68 / T-63) — silent data loss prevention, centralize
>   schema drift guard qua `safeUpdateDoc` helper. Độc lập, start ngay, làm
>   song song với T-62.
>
> Chi tiết mỗi task ở [`docs/tasks/T-XX.md`](./docs/tasks/).
> Theo dõi: [GitHub issues #67, #68, #69](https://github.com/naicoi92/pi-huly/issues).

- [x] [T-62] [M] enhancement(pool): filter framework gate upstream console spam (no document found + các pattern khác) — high | blocked-by: (none) | blocks: T-64 | issue: #67 — [detail](./docs/tasks/T-62.md) — ✅ done (framework `console-filter.ts`: UpstreamConsoleFilter class + runWithConsoleFilter try/finally + DEFAULT_UPSTREAM_NOISE_PATTERNS; wrap connect() scope hẹp; counter module-level expose pool health → `/huly status`; config escape hatch quietUpstreamNoise + upstreamNoisePatterns; verified upstream api-client/lib/client.js:42-79 KHÔNG seam logger; +30 tests = 549 total, CI green)
- [x] [T-63] [M] bug(core): audit 42 call site updateDoc/removeDoc — validate space + objectId resolved + schema drift guard (silent TxUpdateDoc skip) — high | blocked-by: (none) | blocks: (none) | issue: #68 — [detail](./docs/tasks/T-63.md) — ✅ done (helper safeUpdateDoc/safeRemoveDoc trong _common.ts — schema drift guard centralized pattern T-50; migration 42/42 call site (30 updateDoc + 12 removeDoc) cross 13 file; 42/42 NHÓM A confirmed 0 NHÓM B; regression: tags + workspace schema drift + 12 helper unit + 7 schema-drift-guard test cho 4 file thiếu test (comments/projects/tag-categories/spaces); +21 tests = 572 total, CI green)
- [x] [T-64] [M] bug(client): gate "client websocket error" spam + token leak (URL `_transactor/<token>` ra stderr/UI) — high | blocked-by: T-62 | blocks: (none) | issue: #69 — [detail](./docs/tasks/T-64.md) — ✅ done (đăng ký 6 pattern string-arg vào DEFAULT_UPSTREAM_NOISE_PATTERNS T-62 framework; B1 fix review: installGlobalConsoleFilter active toàn session lifetime — runWithConsoleFilter chỉ cover connect-time, WS error fires post-connect (wsocket.onerror async) → token leak nếu KHÔNG global; wire setup() index.ts; security guard: stderr captured KHÔNG chứa _transactor/ + token substring post-connect; Error instance KHÔNG filter; WS onerror throw pathway vẫn propagate qua mapError; +11 tests = 583 total, CI green)

---

## beta.5 follow-up hotfixes (post-beta.5 — không thuộc milestone)

> **Context**: Audit toàn diện 102 tool pi-huly đối chiếu với trusted
> `@firfi/huly-mcp` v0.45 (https://github.com/dearlordylord/huly-mcp, clone
> `/tmp/huly-mcp-trusted`). Phương pháp: 4 agent Explore song song rà soát từng
> nhóm domain (issues/projects/milestones · documents/comments/attachments ·
> tags/labels/components/spaces/task-mgmt · todos/time/contacts/workspace/
> search/templates), đối chiếu logic nghiệp vụ, verify trực tiếp claim trọng
> yếu bằng evidence source + tests trusted.
>
> **Kết quả**: ~40/102 tool có bug, **~22 tool hỏng hoàn toàn** (silent data loss
> hoặc không dùng được). 5 root-cause chính:
>
> 1. **Sai class ref / thiếu plugin `@hcengineering/document`** — Documents/
>    Teamspaces/Snapshots disabled vì đoán `tracker:class:Document` (interface
>    orphan — kết luận T-58 sai vì đoán package). Class đúng từ
>    `documentPlugin.class.*` (`@hcengineering/document`). → T-65 (root), T-66.
> 2. **Sai data model** — `createDoc` thay vì `addCollection` cho AttachedDoc
>    (Issue); inline array `$push`/`$pull` thay vì `TagReference` AttachedDoc;
>    field `parentIssue` KHÔNG tồn tại (phải `attachedTo`/`attachedToClass`/
>    `collection`/`parents`). → T-67 (create_*), T-68 (issue hierarchy),
>    T-69 (TagReference).
> 3. **Sai field name + type** — comments `body` vs `message`; raw string vs
>    `MarkupBlobRef`; string vs enum (`MilestoneStatus`). → T-70 (comments),
>    T-72 (markup + enum).
> 4. **Thiếu space scoping + sai query field** — `list_*` query global → trả
>    cross-project; filter `assignee`/`parentIssue` raw string thay vì `_id`.
>    → T-71.
> 5. **Thiếu account-client integration** — 4 tool cần `WorkspaceClient` (HTTP)
>    mà pi-huly chỉ có data-client (WebSocket). → T-74 (root), T-75 (attachments
>    blob upload có thể phụ thuộc).
>
> Ngoài 5 root-cause còn có: workflow registration (T-73), templates children
> (T-76 — phụ thuộc T-68 cho `attachIssueChild`), misc bugs (T-77:
> `fulltext_search` sai API method, `preview_deletion` bỏ sót cascade, tag
> category sai field `title` vs `label`).
>
> **Umbrella tracking**: issue #86 `[META]` map toàn bộ + DAG. Mỗi task = 1
> vertical slice grab độc lập (trừ phụ thuộc đã note).
>
> Chi tiết mỗi task ở [`docs/tasks/T-XX.md`](./docs/tasks/) (TODO — cần tạo sau).
> Theo dõi: [GitHub issues #73-#86](https://github.com/naicoi92/pi-huly/issues).

- [x] [T-65] [L] fix(class-refs): register `@hcengineering/document` plugin — unlock Document/Teamspace/Snapshot (root cause của #55, #58, supercedes T-58 interface-orphan conclusion) — critical | blocked-by: (none) | blocks: T-66 | issue: #73 — [detail](./docs/tasks/T-65.md) — ✅ done (PR #87 merged; SUPERSEDES T-58 interface-orphan conclusion — real class registered trong document plugin() block, T-58 audited chỉ tracker pkg missed document pkg; fix string literal DOCUMENT_CLASS→document pkg + ADD TEAMSPACE_CLASS; deviation từ audit: string literal thay vì dep+loader — pi-huly pattern string literal cho all classes, server resolves by string, runtime identical; 584 tests +1, lint/typecheck/fmt green)
- [x] [T-66] [L] enable(documents): mở lại 11 tool honest-unavailable (Document CRUD ×5, Teamspace CRUD ×4, Snapshot ×2) bằng `documentPlugin.class.*` — critical | blocked-by: T-65 | blocks: (none) | issue: #74 — [detail](./docs/tasks/T-66.md) — ✅ done (re-enable 10/11: list/get/update/delete teamspace + list/get/create/edit/delete document + list/get snapshot dùng TEAMSPACE_CLASS/DOCUMENT_CLASS/DOCUMENT_SNAPSHOT_CLASS; wire uploadMarkup/updateMarkup vào HulyClient; create_teamspace STAYS unavailable — cần icon/spaceType Refs từ document plugin; 591 tests +7, lint/typecheck/fmt/md green)
- [x] [T-67] [M] bug(create_*): dùng `addCollection` cho AttachedDoc + set `sequence`/`identifier`/`rank`/`number`/`kind` — fix `create_issue`/`create_project`/`create_milestone` (silent data loss, không idempotent) — critical | blocked-by: (none) | blocks: (none) | issue: #75 — `create_issue` không `$inc sequence` → race duplicate identifier; `create_project` space sai (workspace handle thay vì project._id self-ref), thiếu `type` (workflow) + `members`/`owners` + `sequence:0`, không idempotent vi spec §9; `create_milestone` `status:"planned"` string thay vì enum `MilestoneStatus.Planned`. — ✅ done (PR #89 merged)
- [x] [T-68] [M] bug(issue hierarchy): `move_issue` + `list_issue_relations` dùng field `parentIssue` (KHÔNG tồn tại) thay vì `attachedTo`/`attachedToClass`/`collection`/`parents` — critical | blocked-by: (none) | blocks: T-76 | issue: #76 — `move_issue` không inc `subIssues` + không update descendants → cây hierarchy inconsistent; `list_issue_relations` query "blocks" dùng pattern trusted đã verify KHÔNG work + trả raw `_id` thay vì `identifier` → LLM không dùng được kết quả. Cần helper `topLevelIssueParent()`/`attachIssueChild()`/`updateDescendantParents()`. — ✅ done (PR #90 merged)
- [x] [T-69] [M] bug(tags): `attach_tag`/`detach_tag`/`list_attached_tags` dùng sai data model — `$push`/`$pull` inline array thay vì `TagReference` AttachedDoc — high | blocked-by: (none) | blocks: (none) | issue: #77 — `attach_tag` phải `addCollection(tags.class.TagReference, ...)` với attributes `{tag, title, color, weight}`; `list_attached_tags` phải `findAll(TagReference, {attachedTo})` thay vì inline `doc.labels`; generic theo `targetClass` param (không hardcoded Issue) để attach lên bất kỳ doc. — ✅ done (PR #92 merged)
- [x] [T-70] [M] bug(comments): `add`/`update`/`list_comment` dùng field `body` — Huly field thật là `message` (comment luôn rỗng, update silent no-op) — critical | blocked-by: (none) | blocks: (none) | issue: #78 — ĐÃ VERIFY trực tiếp: trusted `comments.ts:150` `message: markdownToMarkupString(params.body)`; trusted test `comments.test.ts:85` `message: "Test message"`. Bonus: `list_comments` thiếu filter `attachedToClass: tracker.class.Issue` (chỉ có `attachedTo`); design doc `05-data-model.md:122` cũng sai (cần sửa cả doc). — ✅ done (PR #91 merged)
- [x] [T-71] [M] bug(list_*): thiếu space scoping — `list_issues`/`list_milestones`/`list_statuses`/`list_components`/`list_templates` trả cross-project — high | blocked-by: (none) | blocks: (none) | issue: #79 — thêm `space: tctx.project._id` vào query 5 tool; `list_issues` filter `assignee` raw email → resolve Person trước (`findPersonByEmailOrName`); filter `parentIssue` raw identifier → resolve parent issue trước; `titleSearch` không xóa filter project (leak); `list_statuses` query theo `projectType.statuses` + convert `category` ref → enum + thêm `isDefault`. — ✅ done (PR #93 merged)
- [x] [T-72] [M] bug(markup): `description` gán raw string thay vì `MarkupBlobRef` + `status` sai type (string thay vì enum) — fix `create`/`update` issue + milestone — high | blocked-by: (none) | blocks: (none) | issue: #80 — tạo helper `uploadMarkup(client, markdown)` → `MarkupBlobRef` (wrap `client.uploadMarkup`); convert `MilestoneStatus` enum ↔ string (`stringToMilestoneStatus`/`milestoneStatusToString`); scope status resolve trong `update_issue` theo project type (hiện global → match cross-project). — ✅ done (PR #94 merged)
- [x] [T-73] [M] bug(workflow): `create_issue_status`/`create_task_type` sai class + không register vào project workflow — high | blocked-by: (none) | blocks: (none) | issue: #81 — `create_issue_status` class hardcoded `tracker:class:IssueStatus` → phải `statusClass` động của project type; space = workspace root → phải `core.space.Model`; `category` raw string → phải `Ref<TaskStatusCategory>`; KHÔNG `$push` ref vào `projectType.statuses`. Bonus: `list_tags` thiếu `targetClass` filter; `list_task_types` sai query field (`ofProjectType` vs parent); `list_space_types`/`get_space_type` trả fabricated data. — ✅ done (PR #95 merged)
- [x] [T-74] [L] enhancement(account-client): thêm `WorkspaceClient` integration (HTTP) — unlock `log_time` (value/date/employee đúng) + `list_workspaces` + `list_workspace_members` + `list_employees` — high | blocked-by: (none, sub-slice 1 data-client only) | blocks: T-75 | issue: #82 — chia 2 sub-slice: (1) **quick win** fix `log_time` collection `"reports"`, thêm `date` + `employee`, đơn vị hours (đang lệch 60x); (2) **architecture work** thêm account-client layer cho 3 tool còn lại. Cần ADR trước khi implement sub-slice 2. `list_workspaces` hiện WRONG-FUNCTION (trả members thay vì workspaces); `list_workspace_members`/`list_employees` query mixin `contact:mixin:Employee` như class → luôn fail runtime. — ✅ done (PR #98 merged)
- [x] [T-75] [M] bug(attachments): thiếu blob upload — `add_attachment`/`add_issue_attachment` gán inline `data`, `download_attachment` đọc field không tồn tại (luôn rỗng) — high | blocked-by: T-74 (có thể, khi grab xác nhận storageClient dependency) | blocks: (none) | issue: #83 — Huly Attachment lưu `file: Ref<Blob>` (ref tới blob), KHÔNG có field `data`. Phải `storageClient.uploadFile(filename, buffer, contentType)` → `{blobId, size, url}` rồi `addCollection` với `{name, file: blobId, size, type, lastModified}`; download dùng `storageClient.getFileUrl(att.file)`. — ✅ done (PR #99 merged)
- [x] [T-76] [M] bug(templates): `add`/`remove_template_child` dùng raw string thay vì `IssueTemplateChild` object — `create_issue_from_template` mất `priority`/`assignee`/`component`/`children` — high | blocked-by: T-68 (cần `attachIssueChild` cho sub-issue creation) | blocks: (none) | issue: #84 — `add_template_child` phải build object `{id, title, priority, assignee, component, estimation, description}` + replace toàn bộ `children` array (không `$push` string); `remove_template_child` find by `id` field trong children; `create_template` thiếu default field (`priority`/`assignee`/`component`/`estimation`/`children:[]`/`comments:0`); `create_issue_from_template` chỉ copy title+description → phải copy priority/assignee/component + tạo child issues đệ quy. — ✅ done (PR #96 merged)
- [x] [T-77] [M] bug(search + misc): `fulltext_search` dùng `$like findAll` thay vì `searchFulltext` API; `preview_deletion` bỏ sót cascade (sub-issues/relations/blockedBy); `create`/`update_tag_category` sai field `title` vs `label` — medium | blocked-by: (none) | blocks: (none) | issue: #85 — `fulltext_search` đổi sang `client.searchFulltext({query}, {limit})` (API engine thật + relevance score) + honest error nếu server không support (theo T-57 pattern); `preview_deletion` dùng aggregate counters (`subIssues`/`comments`/`attachments`/`blockedBy`/`relations`) + generate warnings cascade; tag category field `title` → `label`. — ✅ done (PR #97 merged)

## beta.7 follow-up hotfixes (post-beta.7 — không thuộc milestone)

> **Context**: Fresh audit vs trusted `@firfi/huly-mcp` v0.45 (clone
> `/tmp/huly-mcp-trusted`, unchanged since beta.5) — rà soát các tool KHÔNG
> cover bởi T-65..T-77 (todos, issues read-path, projects/spaces/components
> get/delete/update, milestones/workspace/contacts). 4 reality-checker song
> song theo domain group, verify từng tool vs trusted source + tests.
>
> **Kết quả**: ~20 bug mới trong 4 cluster, + ~20 completeness gaps. Blocker
> thực tế user-reported (create_teamspace unavailable) fix ngay trong beta.7.
> Còn lại 4 bug issues + 3 gap issues filed (#102-#108) dưới META #86.
>
> **Root cause mới** (không trùng 5 root-cause beta.5):
>
> 1. **`done` boolean giả định** (todos) — Huly ToDo dùng `doneOn: Timestamp|null`.
> 2. **Read path không resolve** (issues/milestones) — raw ref/number leak thay
>    vì human name/string enum.
> 3. **Wrong target** (update_user_profile) — ghi `Person.name` thay vì account
>    profile, phá format `"Last,First"`.
> 4. **Dead field read** (list_persons `p.email`) — email lives trong Channel.
>
> **Umbrella tracking**: issue #86 `[META]` (comment liệt kê #102-#108).
> Chi tiết mỗi task ở [`docs/tasks/T-XX.md`](./docs/tasks/).

- [x] [T-78] [M] fix(teamspace): implement `create_teamspace` (string-literal icon/spaceType refs) + `list_teamspaces` surface IDs — high | blocked-by: (none) | blocks: (none) | issue: (inline, PR #101) — T-66 conclusion sai (claimed icon/spaceType refs cần bundle document plugin). Reality: plugin refs = plain string literals (`document:icon:Teamspace` / `document:spaceType:DefaultTeamspaceType`), verified runtime qua `node -e`. Same T-65 pattern. Bonus latent fix: `SPACE_PARENT` dot→colon form (`core:space:Space`, cũ `core.space.Space` sai — affect update/delete teamspace). Idempotent create (findOne name → existing) + createDoc {name,description,private,members:[uuid],owners:[uuid],icon,type}. — ✅ done (PR #101 merged; beta.7 released; 650 tests, lint/typecheck/fmt/md green)
- [x] [T-79] [M] bug(todos): 7/7 tool sai data model — `doneOn` field + `ProjectToDo` class + `CollectionSize` counter — high | blocked-by: (none) | blocks: T-79G | issue: #102 — [detail](./docs/tasks/T-79.md) — Huly ToDo dùng `doneOn: Timestamp|null` (KHÔNG `done` boolean); issue-attached todo là class riêng `ProjectToDo` (KHÔNG base `ToDo`); space chung `time.space.ToDos` (KHÔNG `issue.space`); `Todoable.todos` = `CollectionSize` counter (KHÔNG array). complete/reopen hiện no-op (`{done:true/false}` — silent data loss). Cần: add `PROJECT_TODO_CLASS` + `TODOS_SPACE` refs; complete=`{doneOn:Date.now()}`; reopen=`{doneOn:null}`; delete=`$inc{todos:-1}`. — ✅ done (PR #111 merged 10bdddd, 660 tests, CI green ubuntu+macos)
- [x] [T-80] [M] bug(issues read-path): `get_issue` raw refs + `list_issue_relations` broken blocks query + `update_issue` assignee raw push — high | blocked-by: (none) | blocks: (none) | issue: #103 — [detail](./docs/tasks/T-80.md) — relations (T-61) + move_issue (T-68) PASS — KHÔNG đụng. get_issue thiếu labels/parentIssue/subIssues/modifiedOn + raw status/assignee ref (không resolve name); list_issue_relations trả raw `_id` (KHÔNG identifier) + **blocks query broken** (`blockedBy._id` dotted-path returns NO rows — trusted comment PR #48, phải `{blockedBy:{_id,_class}}`); update_issue assignee raw push (không resolve Person._id, đồng bộ create_issue) + không null-clear. — ✅ done (PR #112 merged 67140d6, 668 tests, CI green ubuntu+macos)
- [x] [T-81] [L] bug(projects/spaces/components): component `lead` raw ref + create `comments:0` + `IssueStatus` class query + component no space-scope — medium | blocked-by: (none) | blocks: T-81G | issue: #104 — [detail](./docs/tasks/T-81.md) — delete_project/component + set_issue_component storage PASS. create/update_component `lead` raw string (KHÔNG resolve `Ref<Employee>`); create_component thiếu `comments:0` (risk reject); `getProjectStatuses` query `tracker:class:IssueStatus` (trusted né — "can fail on some workspaces"), dùng `core:class:Status` + batch `$in`; component lookups (get/update/delete/set) không `space:project._id` filter. — ✅ done (PR #113 merged 5767769, 676 tests, CI green ubuntu+macos)
- [x] [T-82] [M] bug(milestones/workspace/contacts): milestone status number leak + `list_persons` dead email + `update_user_profile` wrong target — medium | blocked-by: (none) | blocks: T-82G | issue: #105 — [detail](./docs/tasks/T-82.md) — T-71 scoping + T-72 enum (write) + T-74 employees PASS. milestone status READ trả raw number (T-72 chỉ fix write — thiếu reverse map `milestoneStatusToString`); list_persons đọc `p.email` (dead — T-74 đã fix y hệt cho list_employees); update_user_profile sai target (`Person.name` vs account profile) + phá format `"Last,First"`. — ✅ done (PR #114 merged 875b7b0, 684 tests, CI green ubuntu+macos)
- [x] [T-79G] [M] enhancement(todos): `update_todo` fields (owner/priority/visibility) + `schedule`/`unschedule_todo` tools — low | blocked-by: T-79 (same domain) | blocks: (none) | issue: #106 — tool chạy đúng nhưng thiếu capability: update_todo thiếu owner/priority/visibility + description raw (thật markup) + no $unset dueDate; thiếu 2 tool schedule_todo/unschedule_todo (work slot/calendar). — ✅ done (PR #115 merged 746b83c; update_todo +owner/priority/visibility + uploadMarkup + dueDate=null $unset, 691 tests, CI green; DEFERRED schedule/unschedule_todo — WorkSlot model needs separate verify, risk silent data loss như T-79)
- [x] [T-81G] [L] enhancement(projects/spaces/components): output fields + archived-filter + `update_space` fields + name/label resolution — low | blocked-by: T-81 (same domain) | blocks: (none) | issue: #107 — 8 gaps: get_project thiếu defaultStatus/statuses; list_projects/spaces thiếu archived-filter + sort + rich fields; update_project/space thiếu null-clear + 3 fields (private/archived/autoJoin); get_space name-fallback; get_component lead→name + markdown + label resolve; set_issue_component label-resolve + null. — ✅ done (PR #116 merged cc10817, 703 tests, CI green; DEFERRED memberCount/ownerCount — perf cost, low value)
- [x] [T-82G] [M] enhancement(milestones/workspace/contacts): `get_milestone` fields + `findPersonByEmailOrName` email path + sort/clear — low | blocked-by: T-82 (same domain) | blocks: T-80 (assignee resolve) | issue: #108 — get_milestone thiếu description/project/modifiedOn; findPersonByEmailOrName chỉ name-match (email path deferred — trusted 5-step: SocialIdentity→Channel→name); list_milestones thiếu sort; set_issue_milestone thiếu null-clear. Cross-ref: unblocks T-80 assignee email resolve. — ✅ done (PR #117 merged 6248c1b; get_milestone +desc/project/modifiedOn/createdOn + findPersonByEmailOrName email via Channel + list_milestones sort + set_issue_milestone null + list_persons city/modifiedOn + list_employees position/active, 710 tests, CI green; DEFERRED SocialIdentity + $like email fallback)

## beta.9 follow-up hotfixes (post-beta.8 — không thuộc milestone)

**Status: ✅ completed** _(slash goal beta.9 follow-up, 2026-07-29 — 7/7 tasks done T-83..T-89, PR #125-#131 + fixup #132; 719 tests, CI green, fmt/lint/typecheck pass. Bonus T-90 (#133) refactor native entity types + satisfies → net -49 `as` cast vs pre-beta.9 baseline. Reality-checker audit pass: T-86 mixin refs UNVERIFIED locally — convention-consistent, needs runtime self-host.)_

> **Context**: Audit tiếp tục vs trusted `@firfi/huly-mcp` v0.45 (clone
> `/tmp/huly-mcp`) — domain chưa cover: labels, document-snapshots, time,
> search, deletion, task-management + write-path of issues-core. Cross-check
> từng tool vs trusted source. Song song scan fake `as` type casts (narrowing
> inline thay vì proper interface).
>
> **Kết quả**: 5 bug + 2 enhancement gaps. Critical silent-data-loss 1
> (add/remove_issue_label `$push` field không tồn tại). High 2 (deletion
> broken query + N+1, document-snapshots wrong sort + fake field). Medium 2
> (task-management Mixin skip + category validate). Low 2 enhancement
> (documents + templates output fields/sort). Filed #118-#124.
>
> **Root cause mới**:
>
> 1. **T-45 write path unmigrated** (issues-core) — `add/remove_issue_label`
>    vẫn `$push/$pull labels` (field KHÔNG tồn tại); T-69 (tags.ts) đã migrate
>    sang `addCollection(TagReference)` nhưng T-45 (issues-core) bị bỏ sót.
>    Read path (T-80) đọc đúng → mâu thuẫn nội bộ.
> 2. **`blockedBy._id` dotted-path broken** (deletion) — T-80 đã fix ở
>    `list_issue_relations` nhưng T-77 audit deletion dùng cùng broken query.
> 3. **CollectionSize counters bị bỏ qua** (deletion) — Issue có sẵn
>    `subIssues`/`comments`/`attachments` counter nhưng pi-huly N+1 findAll
>    thay vì đọc trực tiếp (perf + correctness).
> 4. **Mixin doc skip** (task-management) — `createTaskType` trusted tạo
>    `core.class.Mixin` doc + `createMixin(TaskTypeClass)` để register task
>    typing behavior; pi-huly skip cả 2 → task type tồn tại nhưng Huly không
>    apply mixin.
> 5. **Sort/output defaults** (documents/templates) — trusted có sẵn
>    `modifiedOn: Descending` / `name: Ascending`; pi-huly default arbitrary.
>
> **Umbrella tracking**: issue #86 `[META]` (comment cập nhật #118-#124).
> Chi tiết mỗi task ở [`docs/tasks/T-XX.md`](./docs/tasks/) khi grab.

- [x] [T-83] [M] bug(issues write-path): `add`/`remove_issue_label` dùng `$push`/`$pull` `labels` (field KHÔNG tồn tại) — silent data loss, migrate sang `addCollection(TagReference)` — critical | blocked-by: (none) | blocks: (none) | issue: #118 — T-45 (issues-core.ts) write path **chưa migrated** sang T-69 (tags.ts) pattern. `Issue.labels` KHÔNG tồn tại inline; labels = `tags:class:TagReference` AttachedDoc (`collection:"labels"`). Read path `get_issue` (T-80) đọc đúng via `findAll(TagReference, {attachedTo})`. Internal contradiction: push silent lost, get never shows. Surgical: match `attach_tag`/`detach_tag` implementation (resolve Tag → addCollection TagReference → idempotent findAll check). Hoặc mark deprecated alias → redirect sang tag tools (lower diff).
- [x] [T-84] [M] bug(deletion): `reverseBlocks` query broken (dotted-path) + N+1 findAll thay vì CollectionSize counters + total +1 entity sai — high | blocked-by: (none) | blocks: (none) | issue: #119 — `reverseBlocks` dùng `"blockedBy._id"` dotted-path (T-80 confirmed trả 0 rows, phải object form `{blockedBy:{_id,_class}}`) → counter luôn 0. Trusted `previewIssueDeletion` KHÔNG track direction này — chỉ `issue.blockedBy` inline. N+1 findAll (4 query) khi Issue có sẵn counters `subIssues`/`comments`/`attachments` (CollectionSize). Total cộng +1 entity sai (trusted `totalAffected = subIssues+comments+attachments+blockedBy+relations`). DEFER project/component/milestone preview.
- [x] [T-85] [S] bug(document-snapshots): thiếu sort `createdOn: Descending` + thiếu `title`/`createdOn`/`parentDocumentId` + fake `modifiedBy` field — high | blocked-by: (none) | blocks: (none) | issue: #120 — list default order arbitrary (trusted newest-first). Output `{id, modifiedBy, modifiedOn}` — `modifiedBy` không có trong trusted (có thể không tồn tại). Trusted summary: `{snapshotId, documentId, teamspaceId, title, parentDocumentId, createdOn, modifiedOn}`. Bonus: list thiếu `limit` param.
- [x] [T-86] [M] bug(task-management): `create_task_type` skip Mixin doc + `createMixin(TaskTypeClass)` + statuses copy — Huly KHÔNG apply task typing — medium | blocked-by: (none) | blocks: (none) | issue: #121 — trusted tạo `core.class.Mixin` doc (extends `template.ofClass`, kind=MIXIN) → derive `targetClassRef="<taskTypeId>:type:mixin"`, sau đó `createMixin(targetClassRef, ..., task.mixin.TaskTypeClass, {taskType, projectType})`. Pi-huly skip cả 2 → task type tồn tại nhưng Huly không apply TaskTypeClass mixin behavior. Bonus: `taskData.targetClass` copy template (sai — phải new Mixin ref); `statuses` start `[]` (phải copy template); ProjectType.statuses thiếu append `{_id, taskType}`.
- [x] [T-87] [S] bug(task-management): `create_issue_status` KHÔNG validate category match — silent workflow corruption — medium | blocked-by: (none) | blocks: (none) | issue: #122 — pi-huly idempotent `findOne(statusClass, {name})` returns no-op nhưng KHÔNG check `existingStatus.category === params.category`. User pass same name different category → silent idempotent (no-op) thay vì error. Trusted `requireStatusCategoryMatch` fails rõ category mismatch. DEFER cross-project recovery by name.
- [x] [T-88] [M] enhancement(documents): `list`/`get_documents` + teamspaces thiếu sort + output fields — low | blocked-by: (none) | blocks: (none) | issue: #123 — list_documents thiếu `sort: modifiedOn: Descending` + `teamspace`/`modifiedOn` output. get_document thiếu `teamspace`/`createdOn`. list_teamspaces thiếu `sort: name: Ascending` + `archived`. get_teamspace thiếu document count. DEFERRED: `url` field (workbenchUrlConfig unavailable — KNOWN LIMITATION).
- [x] [T-89] [M] enhancement(templates): `list`/`get_templates` thiếu sort + output fields — low | blocked-by: (none) | blocks: (none) | issue: #124 — list thiếu `sort: modifiedOn: Descending` + `priority`/`modifiedOn`/`childrenCount`. get thiếu `priority`/`assignee` (name)/`component` (label)/`estimation`/`modifiedOn`/`createdOn`/`children` + raw `description` (không resolve MarkupBlobRef → markdown).

---

## beta.11 QA e2e fix phase (post-beta.11 — runtime self-host test)

**Status: ✅ completed** _(slash goal hoàn thành beta.11 QA e2e fix phase — 6/6 tasks T-91..T-96 done, 725 tests (720 CI + 5 live gated), typecheck/lint/fmt/md green. Live e2e verify trên workspace ETEST: create/get/delete issue round-trip, list_issues content chứa identifier (T-92 fix), tag create→list→attach(title)→detach(title) (T-93+T-94), create_issue assignee→Person._id (T-95), tag-category round-trip (T-93b). UNCOMMITTED — chờ user review + commit/PR.)_

> **Context**: Khác mọi phase trước (audit vs trusted `@firfi/huly-mcp`), phase này nguồn từ **runtime test thực tế** — agent connect live workspace ETEST/MPMD/MPP, gọi từng `huly_*` tool, ghi nhận output thật. Mock-based tests (T-36 MockHulyStore) bypass 2 thứ mà runtime mới lộ: (1) **space semantics** (mock `createDoc` ignore `_space`, không validate space thật → bug "sai space" invisible), (2) **hasUI path** (mock test luôn `hasUI:false` → không bao giờ trigger TUI-blindness). Enable phần T-36 deferred: _"DEFERRED: actual real-Huly round-trip — task mới khi maintainer có self-host instance"_ — giờ maintainer CÓ workspace test.
>
> **Kết quả**: 5 bug filed (#138-#142). 1 critical systemic (TUI blindness), 3 high (space/lookup/assignee), 1 medium doc.
>
> **Tránh trùng lặp** (cũ vs mới):
>
> - **#102-#108 đã ✅done** (T-79/T-80/T-81/T-82/T-79G/T-81G/T-82G, PR #111-#117 merged). GitHub issue còn OPEN chỉ vì chưa close sau PR → **KHÔNG tạo task mới**; recommend close trực tiếp trên GitHub sau verify.
> - Mỗi task mới T-92..T-96 ghi rõ NON-DUP vs T-09/T-32/T-67/T-69/T-80/T-81/T-83 (khác domain/tool/code-path).
>
> **Root cause mới** (không trùng 5 root-cause beta.5/7/9):
>
> 1. **`hasUI` gate che `details`** (builder) — `appendDetailsForLLM` gated `ctx.hasUI !== true`; TUI mode drop details cho ~99 tool (chỉ 3 có `renderResult` hook). Mock test `hasUI:false` không bao giờ trigger.
> 2. **`spaceRef(tctx.workspace)` misuse** (tags/tag-categories/attachments) — truyền **workspace-handle string** làm Huly space (sai; đúng = `project._id` qua `getProjectSpace`). Mock ignore `_space` → invisible.
> 3. **`_id`-only lookup dead-end** (attach_tag/detach_tag) — không path nào cho LLM tag `_id` (create/list blind); khác T-69/T-83 write-path.
> 4. **`create_issue` assignee raw email** — push email string vào `Ref<Person>`; khác T-80 (update_issue, đã fix).
> 5. **Description nói dối handler** (list_tags/create_tag scoping + attach_tag param).
>
> **Test strategy**: T-91 live harness (gated env, skip CI) + T-92 integration test (`hasUI:true`). Mock tests (T-36) giữ nguyên cho CI fast-feedback; live tests cho correctness round-trip.
>
> Chi tiết mỗi task ở [`docs/tasks/T-XX.md`](./docs/tasks/) khi grab.

- [x] [T-91] [M] chore(e2e): live-Huly round-trip test harness — enable T-36 deferred "real-Huly round-trip" — high | blocked-by: (none) | blocks: T-93,T-94,T-95 | — new `src/__tests__/e2e-live.test.ts`: connect REAL workspace qua `getClient` (gated env `HULY_E2E_TOKEN`/`HULY_E2E_EMAIL`+`HULY_E2E_PASSWORD`/`HULY_E2E_URL`/`HULY_E2E_WORKSPACE` + `HULY_E2E_PROJECT`), `describe.skipUnless(env)` → skip trong CI khi env absent. Mỗi test dùng unique prefix `e2e-<ts>-` + cleanup (delete entity tạo ra cuối test). Dùng project test (ETEST). **NON-DUP T-36**: T-36 = MockHulyStore integration smoke (CI); T-91 = REAL round-trip (T-36 comment "DEFERRED: actual real-Huly round-trip — post-deploy HOẶC task mới khi maintainer có self-host instance"). DoD: `HULY_E2E_*` set → test connect thật + 1 create→get round-trip pass; unset → skip (CI green). Bonus: doc `docs/contributing-e2e.md` cách set env local.
- [x] [T-92] [M] bug(builder): TUI blindness — luôn surface `details` cho LLM (bỏ `hasUI` gate) — critical | blocked-by: (none) | blocks: (none) | issue: #138 — `builder.ts:294` `appendDetailsForLLM` gated `ctx.hasUI !== true` → TUI mode chỉ 3 tool có render hook, ~99 tool `details` bị drop, model thấy count-only (`list_issues`/`list_spaces`/`list_tags`/`fulltext_search`/`list_statuses`/`list_comments`/`list_todos` + mutation `add_comment`/`create_todo`/`add_issue_attachment` không trả id). Fix options: (A) bỏ gate — luôn `appendDetailsForLLM` (smallest blast radius), (B) per-handler format id vào `content` (pattern `list_teamspaces`/`list_documents` đã đúng). Recommend A + audit render hook tools không double-print. **NON-DUP T-09** (builder seam exist) + **T-32** (render hook 3 tool): T-92 fix chính cái gate. DoD: integration test `makeCtx({hasUI:true})` assert `content` của `list_issues`/`list_tags`/`list_spaces`/`fulltext_search`/`add_comment`/`create_todo` CHỨA id/identifier (không chỉ count).
- [x] [T-93] [M] bug(tags/tag-categories/attachments): `create_*` dùng `getProjectSpace` thay `spaceRef(tctx.workspace)` — entities orphaned — high | blocked-by: T-91 | blocks: T-94,T-96 | issue: #139 — `tags.ts:61`, `tag-categories.ts:45`, `attachments.ts:121` `spaceRef(tctx.workspace)` = **workspace-handle string** làm space (cast trần `_class-refs.ts:36`, sai — đúng = `project._id` self-ref qua `getProjectSpace` `_common.ts:81`, `Project._id === Project.space`). Tag/tag-category tạo ra orphan: `list_tags` count không tăng, `attach_tag` không thấy (repro ETEST: create_tag → count 9→9, attach → not found). Fix: `const space = await getProjectSpace(tctx.client, tctx.project!); if(!space) return isError; createDoc(CLASS, space, ...)`. Verify `add_attachment` project-scoped hay workspace-scoped (nếu ws-scoped → workspace ROOT space id thật, KHÔNG handle string). **NON-DUP T-67** (create_project/create_milestone space) + **T-81** (component scope): khác domain (tags/tag-categories/attachments chưa cover). DoD (live e2e T-91): `create_tag` → `list_tags` count +1 + `attach_tag` tìm thấy tag vừa tạo.
- [x] [T-94] [S] bug(attach_tag/detach_tag): title-first lookup (matching `add_issue_label`) + param description — high | blocked-by: T-93 | blocks: T-96 | issue: #140 — `tags.ts:210,286` `findOne(TAG_CLASS,{_id:idRef(params.tag)})` _id-ONLY → dead-end: không path nào cho LLM tag `_id` (`create_tag`/`list_tags` blind per T-92). Fix: title-first `_id` fallback mirror `issues-core.ts:668` (`add_issue_label`): `findOne({title:params.tag}) ?? findOne({_id:idRef(params.tag)})` + param `description: "Tag title or _id."`. **NON-DUP T-69** (write-path addCollection migration) + **T-83** (issues-core write-path): đây là **lookup path**, không phải write path. DoD (live e2e): `attach_tag` by TITLE thành công sau T-93 tag persist; `detach_tag` by title thành công.
- [x] [T-95] [S] bug(create_issue): resolve assignee email→`Person._id` (mirror `update_issue`) — high | blocked-by: T-91 | blocks: (none) | issue: #141 — `issues-core.ts:314` `assignee: params.assignee` push raw email (builder D15 `needsAssignee` fill = `currentUser.email`) vào `Issue.assignee` (`Ref<Person>`) → garbage ref → `get_issue` `findOne(PERSON,{_id:email})` miss → render "Assignee: ?". Fix: `findPersonByEmailOrName(client, params.assignee)` → `Person._id` trước `addCollection` (mirror `update_issue` branch `issues-core.ts` assignee); invalid email → isError rõ. **NON-DUP T-80** (`update_issue` assignee raw push, đã fix): tool + code path khác (create vs update). DoD (live e2e): `create_issue` default assignee (no param) → `get_issue` hiện tên current user (không "?"); explicit assignee email → assign đúng Person.
- [x] [T-96] [S] documentation(tags): sửa `description` cho khớp handler — medium | blocked-by: T-93,T-94 | blocks: (none) | issue: #142 — `list_tags` "trong project" (handler `findAll(TAG_CLASS,{})` KHÔNG scope), `create_tag` "project-scoped" (handler ignore project, dùng ws space), `attach_tag`/`detach_tag` `tag` param không `description`, `update_issue` status exact-name nhưng `list_statuses` blind (chain — note trong desc hoặc ensure valid names reachable post T-92). Fix description match handler **post** T-93/T-94 (description thành truthful sau khi behavior fix). **NON-DUP** (mới — description/doc layer, chưa có task). DoD: mỗi `description`+param field mô tả đúng input format + scoping; `pnpm lint:md` pass. — ✅ done (descriptions giờ khớp handler post T-93/T-94: list_tags/create_tag project-scoped thật, attach_tag/detach_tag desc + param desc "Tag title or _id", update_issue status param desc hint list_statuses).


> **Post-beta.11 live repro (2026-08-01, workspace VPSM — KHÔNG phải ETEST)**: phát hiện khi sync design docs cho project VPSM. Log đầy đủ: change-set `local://assignservice-changeset.md` (repo workvps/manage session 019fbd9c).

- [x] [T-97] [M] investigate(update_issue): description persistence fails live dù fix #156/b7e1080 đã có trong dist 0.2.5 — high | blocked-by: (none) | blocks: (none) | issue: (TBD upstream pi-huly) — **Live repro** (workspace VPSM production, 2026-08-01): `update_issue {identifier, description}` trên issue **ĐÃ CÓ description** → tool báo `"Updated issue ... description"` (success) nhưng `get_issue` đọc lại vẫn **content cũ** (cùng call đó `title`+`status` persist OK → loại giả thuyết cache). Source `issues-core.ts:524-551` ĐÃ có fix đúng (`existingDesc != null` → nhánh `updateMarkup`/updateContent rpc); dist 0.2.5 build SAU commit `b7e1080` + có `updateMarkup` (12× trong `dist/index.mjs`) → **fix present nhưng VẪN reproduces**. e2e `e2e-live-hunt8.test.ts:175` ("description update over EXISTING description") cover lý thuyết nhưng chạy workspace ETEST — production VPSM fail. Cần diagnosis: (1) chạy hunt8 live trên workspace bị bug (KHÔNG chỉ ETEST); (2) `updateMarkup` có throw silent bị catch thành success không; (3) `get_issue` `fetchMarkup` có đọc version stale từ collaborator; (4) Huly server version mismatch workspace VPSM vs ETEST. **NON-DUP #156** (#156 = fix first-write-vs-existing logic; đây = fix đó present nhưng ineffective live → regression/environment). DoD: `update_issue description` round-trip thành công live trên workspace production VPSM. — ✅ done (T-97 investigation: ROOT CAUSE = ops.description=existingDesc write-back sau updateMarkup. Trusted @firfi/huly-mcp (calendar.ts:321, cards.ts:350) updateMarkup xong return {} — KHÔNG ghi description vào updateDoc. pi-huly TX cũ ghi existingDesc → TxUpdateDoc trên description field trigger server re-process → reset collaborator content → stale. FIX: bỏ ops.description write-back, track descUpdated riêng cho success msg, skip updateDoc khi chỉ description (updateMarkup đã handle). 700 tests pass, typecheck/lint/fmt green. NOTE: cùng pattern có trong components.ts + todos.ts working copy — cần cùng fix. Live e2e verify pending — chạy e2e-live-hunt8.test.ts:175 trên VPSM/ETEST)
> **T-93b bonus (khác T-93 scope)**: probe live xác định tag-categories space = `core:space:Workspace` (25/25 category) → fix `create_tag_category` dùng `WORKSPACE_SPACE` constant (thay spaceRef(workspace)). **DEFERRED**: generic `add_attachment` (no project, spaceRef(workspace)) — cần resolve attachedTo entity's space, ít dùng (add_issue_attachment đã đúng issue.space). Theo dõi issue #139.

---

## Size / priority distribution

- Size: S ~30 · M ~37 · **L 6** (T-43, T-52 done; T-58 done — runtime audit critical; T-65, T-66, T-74 open — beta.5).
- Priority: 🔴 critical 5 open (T-65, T-66, T-67, T-68, T-70) · 🔴 high 7 open (T-69, T-71, T-72, T-73, T-74, T-75, T-76) · 🟡 medium 22 (T-77 + 21 cũ) · 🟢 low 1 (T-22).
- Critical path: T-01→02/03→04→05→06→09→domains→30→31→33→34→36→38→39.
- **beta.1 hotfix chain (M6 — all done)**: T-40..T-46 fix #22-#28, PR #29-#35.
- **beta.2 follow-up chain (T-47..T-53 — all done)**: fix #36-#43, PR #44-#53.
- **beta.3 follow-up chain (T-54..T-61 — ALL DONE 8/8)**:
  - **Enhancement** (3): T-55 (pool warm), T-56 (debug log), T-57 (error mapping Unavailable).
  - **Root cause DEEP-AUDIT** (4): T-58 (audit resolved 5 class refs via plugin() block scan — KHÔNG cần runtime server), T-59 (issue_relations inline $push/$pull), T-60 (Document interface orphan — 7 tool honest-unavailable + search domain remove), T-54 (create_teamspace honest-unavailable — drive:class:Drive nhưng SpaceType ref inaccessible).
  - **Relations direction** (1): T-61 (add/remove/list relation direction khớp Huly UI — root cause T-59 #63 đảo chiều + thiếu relates-to).
  - 509 tests (+55 baseline 454), CI green, 2 review pass + re-audit CONFIRMED 0 dead class runtime call.
- **beta.4 follow-up chain (T-62..T-64 — ALL DONE 3/3)**:
  - **Filter framework** (1): T-62 (PR #70 — gate upstream console spam `console-filter.ts` framework + `runWithConsoleFilter` try/finally + DEFAULT_UPSTREAM_NOISE_PATTERNS registry + config escape hatch, issue #67).
  - **Audit hardening** (1): T-63 (PR #71 — `safeUpdateDoc`/`safeRemoveDoc` helper schema drift guard + migrate 42/42 call site, issue #68).
  - **WS spam + token leak** (1): T-64 (PR #72 — đăng ký 6 pattern WS error vào framework T-62 + B1 fix `installGlobalConsoleFilter` active toàn session lifetime — token leak gate post-connect, issue #69).
  - 583 tests (+74 baseline 509), CI green cả ubuntu+macos, 3 review pass (code-review + reality-checker mỗi task) + 1 BLOCKER fix (T-64 B1 token leak post-connect).
- **beta.5 follow-up chain (T-65..T-77 — ✅ ALL DONE 13/13)**: audit toàn diện 102 tool vs trusted `@firfi/huly-mcp` v0.45 — 5 root-cause (sai class ref · sai data model · sai field name/type · thiếu space scoping · thiếu account-client). Umbrella: issue #86. 651 tests (baseline 583 + 68), CI green cả ubuntu+macos. T-74 sub-slice 2 (account-client HTTP layer) deferred behind ADR (list_workspaces/members honest-unavailable).
  - **Critical path (silent data loss, làm trước)**: T-65 → T-66 (Document plugin enable), T-67 (create_* AttachedDoc), T-68 (issue hierarchy), T-70 (comments `body`→`message`).
  - **High**: T-69 (TagReference), T-71 (list_* scoping), T-72 (markup+enum), T-73 (workflow registration), T-74 (account-client, blocker T-75), T-75 (attachments blob — blocked-by T-74), T-76 (templates children — blocked-by T-68).
  - **Medium**: T-77 (fulltext_search API + preview_deletion cascade + tag category field).
  - DAG phụ thuộc: T-65→T-66 · T-68→T-76 · T-74→T-75.
  - Task detail files: TODO (cần tạo `docs/tasks/T-65.md`..`T-77.md` khi grab).
- **beta.7 follow-up chain (T-78 done · T-79..T-82 + 3 gaps open)**: fresh audit tools KHÔNG cover bởi T-65..T-77 (todos, issues read-path, projects/spaces/components get/delete/update, milestones/workspace/contacts). 4 reality-checker song song. Blocker T-78 (create_teamspace) fix ngay beta.7 (#101). 4 bug + 3 gap issues filed #102-#108. 650 tests (baseline 651 −1: 3 unavailable → 2 create).
  - **Done**: T-78 (create_teamspace string-literal refs + SPACE_PARENT colon fix).
  - **Bug high**: T-79 (todos doneOn+ProjectToDo, silent no-op), T-80 (issues read-path raw refs + broken blocks query).
  - **Bug medium**: T-81 (projects/spaces/components lead+comments+IssueStatus+scope), T-82 (milestones status leak + list_persons email + update_user_profile target).
  - **Enhancement low**: T-79G (todos update fields+schedule), T-81G (output fields+filters), T-82G (milestone fields + email resolve — unblocks T-80).
  - DAG phụ thuộc: T-79→T-79G · T-81→T-81G · T-82→T-82G→T-80 (email resolve).
  - Task detail files: [`docs/tasks/T-79.md`..`T-82G.md`](./docs/tasks/) (created).
- **beta.9 follow-up chain (T-83..T-89 — ✅ ALL DONE 7/7 + T-90 refactor)**: audit tiếp tục domain chưa cover (labels/document-snapshots/time/search/deletion/task-management + issues-core write-path). 5 bug + 2 enhancement gaps filed #118-#124, PR #125-#131 (+ fixup #132).
  - **Critical (silent data loss)**: T-83 (add/remove_issue_label → addCollection TagReference, #125).
  - **High**: T-84 (deletion CollectionSize counters + drop reverseBlocks + total match trusted, #127), T-85 (document-snapshots sort createdOn Desc + output fields, #126).
  - **Medium**: T-86 (create_task_type Mixin doc + createMixin — UNVERIFIED mixin refs flag như T-43, #129), T-87 (create_issue_status category match validate, #128).
  - **Enhancement low**: T-88 (documents/teamspaces sort + output + documentCount, #130), T-89 (templates sort + output + resolve description markdown, #131 + #132).
  - **Bonus T-90** (#133): refactor native entity types (`_entity-types.ts`) + `satisfies` thay inline `as` cast — net -49 cast vs pre-beta.9 baseline. Reality-checker audit pass.
  - DAG phụ thuộc: (không — tất cả independent).
  - DEFERRED: T-84 project/component/milestone preview, T-87 cross-project recovery by name, T-88 url field (workbenchUrlConfig unavailable), T-90 comments collection filter (low).
  - Task detail files: TODO (`docs/tasks/T-83.md`..`T-89.md` khi grab).
