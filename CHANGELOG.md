# Changelog

All notable changes to omp-huly sẽ document ở đây. Format theo [Keep a Changelog](https://keepachangelog.com/),
versioning theo [Semantic Versioning](https://semver.org/).

## [0.2.2] — 2026-07-31

**Hotfix sync pi-huly `1.0.0-beta.18` — fix ESM/CJS interop crash (#162, CRITICAL).**
Bản fix quan trọng nhất: bug đã chặn omp-huly load hoàn toàn kể từ đầu. Named ESM imports
từ `@hcengineering/*` (CommonJS, dynamic `__reExport` loop) crash lúc load:
"Named export 'connect' not found" — `cjs-module-lexer` không detect exports sau
`require()`+`__copyProps` loop. `connect`/`markdownToMarkup`/`makeCollabId`/`jsonToMarkup`
đều `undefined` runtime. Fix: default import + destructure (types giữ `import type`).

### Fixed

- **CJS interop crash (#162, CRITICAL)**: `src/client/client.ts` + `src/markup/markup.ts`
  đổi named value imports → default import + destructure (`import apiClient from
  "@hcengineering/api-client"; const { connect, ... } = apiClient`). Namespace imports
  (`coreNs.makeCollabId` = `undefined`) cũng fix qua default import. `client.test.ts` mock
  thêm `default` export.

### Verify runtime (smoke-load)

- dist smoke-load: default import `@hcengineering/api-client` resolve OK (KHÔNG còn
  "Named export not found"). `connect`/`connectRest`/`getWorkspaceToken`/`markdownToMarkup`/
  `core.makeCollabId`/`textCore.jsonToMarkup` đều `function` (callable, không undefined).
- Lưu ý: standalone load vẫn fail ở `@oh-my-pi/pi-tui` (peer dep ship `.ts` source — Node
  không strip types trong node_modules) → concern loader riêng, KHÔNG phải bug CJS này.

## [0.2.1] — 2026-07-30

**Hotfix sync pi-huly `1.0.0-beta.17` (description persistence + todo priority map).**
Port ngữ nghĩa 2 fix HIGH. Lưu ý: #160 **revert một phần beta.16** (update_todo description
từ `updateMarkup` về `uploadMarkup` ref — updateMarkup chỉ edit blob existing, fail khi todo
chưa có description). **689 tests pass** + 91 e2e-live skip, typecheck/lint/fmt green.

### Fixed

- **description persistence (component/milestone/todo)** (#160, HIGH): create/update component
  + milestone push RAW STRING vào MarkupBlobRef description → garbage, get reads undefined.
  Fix: pre-gen id → `uploadMarkup` ref (mirror create/update_issue). update_todo description
  revert `updateMarkup`→`uploadMarkup` ref (R11 proven persist). get_todo +`fetchMarkup` render.
- **TODO_PRIORITY_MAP inverted** (#161, HIGH): map `high:0, no-priority:3` (4/5 sai) → 'high'
  lưu 0=None, 'no-priority' lưu 3=High. Fix canonical Huly Priority: 0=None, 1=Low, 2=Medium,
  3=High, 4=Urgent (ascending severity) + reverse-label `TODO_PRIORITY_LABELS` render trong get_todo.

### Tests

- Port pi-huly beta.17 unit test changes (components/milestones/todos/t79g — uploadMarkup→ref
  path + priority map assertions).
- Port e2e-live-hunt8 (re-namespaced @earendil→@oh-my-pi).

## [0.2.0] — 2026-07-30

**Sync upstream pi-huly `1.0.0-beta.15` → `1.0.0-beta.16` (markup persistence + input-validation hardening).**
Port ngữ nghĩa 9 fix (adapt sang Zod + namespace @oh-my-pi, KHÔNG merge thô — omp đã
typebox→Zod). Builder cast `as z.infer` KHÔNG parse runtime → guard imperative (parity
pi-huly). **689 tests pass** + 78 e2e-live skip (gated), typecheck/lint/fmt green.

### Added

- `HulyClient.updateMarkup` (optional) — WS impl (collaborator.updateMarkup / updateContent
  rpc) + REST throwing stub. Edit existing document/todo content in-place.

### Fixed

- **create_issue_from_template crash (AttachedDoc)** (#155, HIGH): `createDoc(ISSUE_CLASS)`
  crash 'cannot be used for objects inherited from AttachedDoc'. Mirror `create_issue`:
  `$inc` sequence → identifier → `addCollection` ('subIssues' collection) + full field set.
- **edit_document silent no-persist** (#156, HIGH): `saveContent` uploadMarkup (createContent)
  chỉ tạo INITIAL version, KHÔNG persist → dùng `updateMarkup` (updateContent rpc).
- **update_todo description no-persist** (#106): description via `updateMarkup` in-place
  (mirror #156); `descUpdated` flag, conditional `safeUpdateDoc`.
- **update_user_profile wrong Person** (#157): lookup-by-_id fail (Person._id ≠ uuid) →
  `personUuid` field (canonical account→Person link). + `accountToUser` extract real email
  từ `fullSocialIds[email]` (primarySocialId có thể là numeric id, KHÔNG email).
- **log_time non-positive** (#158, MED): value 0/negative accepted → time corruption.
  Handler guard `value > 0`.
- **create_issue empty title** (#159): whitespace title = garbage issue. Guard `trim()`.
- **create tools empty title/label — SYSTEMIC** (#160): create_todo / create_milestone /
  create_component / create_tag / create_template cùng bug class. Uniform empty-guard.
- **update tools empty title/label — SYSTEMIC** (#161): update_issue / update_component /
  update_milestone / update_todo / update_template / update_tag rename → ''. Uniform guard.

### Tests

- Port pi-huly unit guard tests (components / issues-core / milestones / tags / time /
  todos / issues-templates / workspace) + assertion updates (uploadMarkup→updateMarkup,
  createDoc→addCollection, _id→personUuid).
- Port e2e-live-edge/edge3/edge4/hunt5/hunt6/hunt7/verify (re-namespaced @earendil→@oh-my-pi).

## [0.1.0] — 2026-07-30

- Fork from pi-huly `1.0.0-beta.14` (includes #153 `list_issues` filter fix); retarget to oh-my-pi (omp).
- Schema system: typebox -> Zod.
- Imports: @earendil-works/* -> @oh-my-pi/*.
- Config store: ~/.omp/agent/huly/ (+ legacy ~/.pi auto-migration).
- Tools-only package; Huly skills maintained in ~/.omp/agent/skills/.

## [1.0.0-beta.14] - 2026-07-30

**beta.14 — QA e2e fix phase III (bug-hunt rounds 3-4).** Hai vòng live e2e
hunt sâu (13 domain) + reconcile zombie-open issues. 1 bug HIGH (#153) fix,
4 zombie bug (#102-105, fixed từ batch T-78..T-82 nhưng chưa close) verify +
close. Reality-checker + reviewer subagent cho mỗi task. **727 CI tests** +
33 live-gated skip, typecheck/lint/fmt green.

### Fixed

- **list_issues status + component filter raw push → 0 match** (T-102 #153,
  HIGH): filter raw-push human value (status name / component label) vào Ref field
  → findAll trả 0 results (silent data loss — LLM tưởng không có issue). Cùng
  root cause với #144 + #104 nhưng sót ở read-path. Fix: `status` resolve name→
  IssueStatus._id qua `getProjectStatuses` (mirror `update_issue` T-98);
  `component` resolve label/_id→Component._id (mirror `set_issue_component`
  T-81G, _id-first). TDD 6 unit test RED→GREEN.

### Verified + Closed (zombie-open — fixed in T-78..T-82, merge thiếu Fixes #NNN)

- **#102 todos data model** (T-79): 7/7 todos tool sai model (doneOn /
  ProjectToDo / CollectionSize). Live e2e prove (list_todos + get_todo doneOn).
- **#103 issues read-path** (T-80): get_issue raw refs + list_issue_relations
  broken blocks query + update assignee raw. Live e2e prove (assignee resolve).
- **#104 projects/spaces/components** (T-81): lead raw ref + comments:0 +
  IssueStatus class + component space-scope. Live e2e prove (component lead resolve).
- **#105 milestones/workspace/contacts** (T-82): milestone status number leak +
  list_persons dead email + update_user_profile wrong target. Live e2e prove
  (milestone status string).

### Bug-hunt round 4 (0 bug thực)

6 domain deep-test (update_issue description+fields round-trip, projects/spaces/
teamspaces lifecycle, contacts output) — tất cả clean. 2 initial failure = test
artifact (teamspaces field `id` không phải `_id`; create_issue_status taskType
lineage — KHÔNG tool-testable sạch, source-review logic ĐÚNG).

### Tests

- e2e-live-hunt3 (7 domain round-trip) + e2e-live-hunt4 (6 round-trip + output)
  + zombie-verify block (#102-105). Live ETEST 27/27 (gated).


## [1.0.0-beta.13] - 2026-07-30

**beta.13 — QA e2e fix phase II.** Re-verify beta.12 + hunt bug mới qua live
round-trip e2e (`HULY_E2E_PROJECT` gated) + static pattern audit (reality-checker
+ reviewer subagent). 5 bug (#143-#147) fix, mỗi task full task-implement cycle
(reality-checker → branch → verify CI+live → reviewer → merge). **721 tests**
(720 CI + 15 live gated... 721 CI + 15 skip), typecheck/lint/fmt green.

### Fixed

- _*create_* sai space → orphan_* (T-97 #143): `create_component`/
  `create_milestone`/`create_template`/`create_issue_from_template` dùng
  `project.space` (T-67 assumption sai) thay `project._id` → entity orphan,
  invisible `list_*`/`set_*`. Đổi `project._id` (canonical = `create_issue` +
  `getProjectSpace`).
- **create_issue status raw push** (T-98 #144): push raw status name vào
  `Ref<IssueStatus>` → server silent-reject (cousin #141). Resolve qua
  `getProjectStatuses` (mirror `update_issue`); guard empty-workflow (leave
  undefined, không fail create); invalid → error rõ.
- **document-snapshots dead-end + body hidden** (T-99 #145): list field
  `snapshotId` (KHÔNG `_id`) → `appendDetailsForLLM` drop → `get_document_snapshot`
  unreachable; get body chỉ trong `details.content` → LLM mất body. Đổi `_id` +
  body vào `content` (clone `get_document` T-88).
- **add_template_child raw refs** (T-101 #147): push raw assignee email/component
  label vào `IssueTemplateChild` Ref fields (KHÔNG resolve) → garbage Ref.
  Resolve qua `findPersonByEmailOrName` + `findOne(label, space)`.
- **milestone/template \_id lookup thiếu space scope** (T-100 #146, defense-in-depth):
  `findOne({_id})` không `space` filter → cross-project read/mutate possible
  (`_id` globally unique nên KHÔNG functional break, nhưng components.ts T-81 đã
  scope — bỏ sót). Add `space` (getProjectSpace) 8 site + `set_issue_milestone`
  dùng `issue.space` + `create_issue_from_template` reorder project-first.

## [1.0.0-beta.12] - 2026-07-30

**beta.12 — QA e2e fix phase.** Nguồn: agent runtime-test toàn bộ 102 tool
trực tiếp trên live workspace ETEST (thay vì mock) phát hiện 5 bug (#138-#142)
mà `MockHulyStore` T-36 không bắt được (bypass space semantics + hasUI path).
Enable phần T-36 deferred _"actual real-Huly round-trip"_. **725 tests**
(720 CI + 5 live gated), CI green. Live round-trip verify trên workspace thật.

### Fixed

- **TUI blindness — LLM mù tool results trong TUI mode** (T-92 #138, critical):
  `builder.ts` `appendDetailsForLLM` gate `ctx.hasUI !== true` → TUI mode drop
  `details` cho ~99 tool (chỉ 3 có `renderResult` hook), model thấy count-only
  → không drive được follow-up (`list_issues` không trả identifier, `list_tags`
  không `_id`, `fulltext_search` không identifier, `add_comment`/`create_todo`
  không id). Bỏ gate → luôn append. Render hook (3 tool) vẫn consume details cho
  UI user; content (model) giờ cũng thấy (khác audience, không xung đột).
- **create_tag/list_tags sai space → orphan** (T-93 #139): `create_tag` dùng
  `spaceRef(tctx.workspace)` (workspace-handle string) thay vì project space
  (`project._id` via `getProjectSpace`) → tag tạo ra orphan (`list_tags` count
  không đổi, `attach_tag` không thấy). `list_tags` giờ scope theo project space.
- **create_tag_category sai space** (T-93b #139): workspace-scoped → space
  `core:space:Workspace` (probe live confirm 25/25 category). Add `WORKSPACE_SPACE`
  constant. DEFERRED: generic `add_attachment` (no project) — cần entity space resolve.
- **attach_tag/detach_tag \_id-only dead-end** (T-94 #140): resolve tag chỉ theo
  `_id` → không path nào cho LLM lấy tag `_id` (create/list blind). Đổi sang
  title-first `_id` fallback (mirror `add_issue_label`) + param desc
  _"Tag title or _id."_
- **create_issue assignee raw email** (T-95 #141): push raw email string vào
  `Issue.assignee` (`Ref<Person>`) → garbage ref, `get_issue` render
  _"Assignee: ?"_. Giờ resolve email→`Person._id` (mirror `update_issue`).
  Resilient: default-assignee (currentUser) không resolve → `null` (unassigned,
  không garbage, không fail create); explicit assignee không resolve → error rõ.

### Changed

- **Descriptions khớp handler** (T-96 #142): `list_tags`/`create_tag` project-scoped
  thật (post T-93), `attach_tag`/`detach_tag` desc + param desc, `update_issue`
  status param desc hint `huly_list_statuses`.

### Added

- **Live-Huly e2e harness** (T-91): `src/__tests__/e2e-live.test.ts` — enable T-36
  deferred _"real-Huly round-trip"_. Gate `HULY_E2E_PROJECT` env (skip CI, no creds).
  5 tests: issue create/get/delete round-trip, `list_issues` content chứa identifier
  (T-92 live verify), tag create→list→attach(title)→detach(title) (T-93+T-94),
  `create_issue` assignee→`Person._id` (T-95), tag-category round-trip (T-93b).
  Run: `HULY_E2E_PROJECT=ETEST pnpm vitest run src/__tests__/e2e-live.test.ts`.

## [1.0.0-beta.9] - 2026-07-29

Hotfix canary #8. **beta.9 follow-up** — slash goal: 7/7 task (5 bug + 2
enhancement) + bonus T-90 refactor. Audit tiếp tục vs trusted
`@firfi/huly-mcp` v0.45 — domain chưa cover (labels, document-snapshots,
time, search, deletion, task-management + issues-core write-path). 5 bug + 2
enhancement gaps filed (#118-#124). **719 tests** (baseline 710 → +9), CI green.
Reality-checker audit pass. Tất cả fix verified vs trusted source.

### Fixed

- **issues write-path** (T-83 #118, critical silent data-loss): `add`/`remove_issue_label`
  vẫn `$push`/`$pull` `labels` (Issue.labels field **KHÔNG tồn tại** runtime) —
  push silent lost, get never shows (read path T-80 đọc đúng via TagReference).
  Migrate sang `addCollection(TagReference)` + `removeDoc` matching `attach_tag`/`detach_tag`
  (T-69 pattern).
- **deletion** (T-84 #119): `reverseBlocks` query broken (`blockedBy._id` dotted-path
  → 0 rows, trusted không track direction này) + N+1 findAll (4 query) khi Issue
  có sẵn `subIssues`/`comments`/`attachments` CollectionSize counters. Read counters
  trực tiếp, drop N+1 + reverseBlocks. `total` match trusted (no +1 entity).
- **document-snapshots** (T-85 #120): list default order arbitrary (trusted
  newest-first) → `sort {createdOn:Descending}` + `limit` param. Output fake
  `modifiedBy` (không có trong trusted) → drop, thêm `{snapshotId,documentId,title,
parentDocumentId,createdOn,modifiedOn}`.
- **task-management Mixin** (T-86 #121): `create_task_type` skip `core.class.Mixin`
  doc + `createMixin(task.mixin.TaskTypeClass)` → Huly KHÔNG apply task-typing.
  Add Mixin classifier doc (extends/kind=MIXIN/label=getEmbeddedLabel) +
  createMixin + targetClass=new mixin ref + statuses copy từ template +
  ProjectType.statuses append `{_id,taskType}`. **UNVERIFIED mixin refs**
  (`core:class:Mixin` + `task:mixin:TaskTypeClass`) — theo Huly naming convention,
  task pkg not installed locally, flag như T-43.
- **task-management status category** (T-87 #122): `create_issue_status` idempotent
  `findOne(statusClass,{name})` silent no-op nhưng KHÔNG check category match.
  Same name different category = silent workflow corruption → giờ `isError`
  (trusted `requireStatusCategoryMatch`).

### Added

- **documents/teamspaces output** (T-88 #123): `list_documents` `sort {modifiedOn:Descending}`
  - teamspace/modifiedOn output; `get_document` teamspace/createdOn; `list_teamspaces`
    `sort {name:Ascending}` + archived; `get_teamspace` documentCount.
- **templates output** (T-89 #124): `list_templates` `sort {modifiedOn:Descending}` +
  priority/modifiedOn/childrenCount; `get_template` resolve description MarkupBlobRef→markdown
  - assignee(Person name)/component(label)/estimation/modifiedOn/createdOn/children.

### Changed

- **refactor native entity types** (T-90 #133): beta.9 thêm ~24 inline `as` cast
  (field narrowing lặp + `as never` dư thừa) — đi ngược mục tiêu audit 'scan fake
  as casts'. Giới thiệu `_entity-types.ts` (13 native interface extend Doc) +
  `findOne<EntityDoc>(CLASS,...)`/`findAll<EntityDoc>` explicit generic (client đã
  generic nhưng class constants return `never` → T default Doc → field access ép
  cast) + `satisfies Partial<EntityDoc>` cho built payloads + `idRef()` cho Ref
  boundary. **Net -49 `as` cast** vs pre-beta.9 baseline (dù +7 feature). Behavior-preserving.

### Deferred

- T-84 project/component/milestone preview, T-87 cross-project recovery by name,
  T-88 `url` field (workbenchUrlConfig unavailable), T-86 mixin refs runtime verify
  (needs self-host).

## [1.0.0-beta.8] - 2026-07-29

Hotfix canary #7. **beta.7 follow-up** — slash goal `complete-milestone beta.8`:
7/7 task (4 bug + 3 enhancement). Fresh audit vs trusted `@firfi/huly-mcp` v0.45
ra soát tools KHÔNG cover bởi T-65..T-77 (todos, issues read-path,
projects/spaces/components, milestones/workspace/contacts). 4 bug issues + 3 gap
issues filed (#102-#108). 710 tests (baseline 650 → +60), CI green cả
ubuntu+macos. Tất cả fix verified vs trusted source.

### Fixed

- **todos** (T-79 #102): 7/7 tool sai data model — `ProjectToDo` class (KHÔNG base
  `ToDo`), `doneOn: Timestamp|null` (KHÔNG `done` bool), space `time.space.ToDos`,
  `Todoable.todos` = CollectionSize counter (KHÔNG array). `complete`/`reopen` lúc
  trước silent no-op (`{done:true/false}` — field KHÔNG tồn tại). `delete` dec
  parent counter.
- **issues read-path** (T-80 #103): `get_issue` raw status/assignee ref → name +
  add labels/parentIssue/subIssues/modifiedOn; `list_issue_relations` **broken
  blocks query** (`blockedBy._id` dotted → object form `{blockedBy:{_id,_class}}`)
  - resolve raw `_id`→identifier; `update_issue` assignee raw push → resolve
    Person + null clear.
- **projects/spaces/components** (T-81 #104): component `lead` raw string →
  `Ref<Employee>`; create `comments:0`; `getProjectStatuses` N+1 `IssueStatus` →
  `core.class.Status` batch `$in` (trusted né "can fail on some workspaces");
  component lookups thiếu `space:project._id` (project isolation).
- **milestones/workspace/contacts** (T-82 #105): milestone status READ raw number
  → string (`milestoneStatusToString` reverse map; T-72 chỉ fix write); `list_persons`
  dead `email` field; `update_user_profile` ghi raw `Person.name` phá format →
  `firstName`/`lastName` → `"LastName,First"`.

### Added

- **todos** (T-79G #106): `update_todo` +owner/priority/visibility + description
  via `uploadMarkup` (KHÔNG raw string) + `dueDate=null` clear.
- **projects/spaces/components** (T-81G #107): archived-filter + sort + widen output
  (description/total/class/private/archived); `get_project` inline statuses;
  `get_space` name-fallback; `update_space` +private/archived/autoJoin;
  `get_component` lead→name + markdown; `set_issue_component` label-resolve + null.
- **milestones/workspace/contacts** (T-82G #108): `get_milestone` +description/project/
  modifiedOn/createdOn; `findPersonByEmailOrName` **email resolve via Channel**
  (unblocks assignee email input); `list_milestones` sort; `set_issue_milestone`
  null clear; `list_persons` +city/modifiedOn; `list_employees` +position/active.

### Deferred (low-risk, documented)

- `schedule_todo`/`unschedule_todo` (T-79G): WorkSlot model needs separate verify.
- `memberCount`/`ownerCount` (spaces, T-81G): perf cost, low value.
- `SocialIdentity` + `$like` email fallback (T-82G): workspace-members edge.

## [1.0.0-beta.7] - 2026-07-29

Hotfix canary #6. **User-reported blocker fix**: `create_teamspace` was
honest-unavailable (T-66 conclusion sai — claimed icon/spaceType refs cần
bundle document plugin). Reality: plugin refs = plain string literals
(plugin() factory prefixes `<pluginId>:<category>:<name>`), verified runtime
via `node -e`. Same T-65 pattern.

### Fixed

- **create_teamspace** (T-78 #101): implement (string-literal icon/spaceType).
  Idempotent (findOne name → existing) + createDoc {name, description, private,
  members:[uuid], owners:[uuid], icon, type}. Return {id, name, created}.
  Unblocks Huly docs workflow.
- **list_teamspaces** (T-78 #101): content message surface ids+names (trước
  chỉ "Found N" — agent không resolve id được).
- **SPACE_PARENT colon form** (T-78 #101 latent fix): `spaceRef("core.space.Space")`
  (DOT — sai) → `spaceRef("core:space:Space")` (colon, đúng Huly ref format).
  Affects update/delete teamspace (T-66 silent bug).

### Known limitations (from fresh audit — issues TBD)

Fresh audit vs trusted v0.45 found ~20 bugs across 4 clusters (todos, issues
read-path, projects/spaces/components, milestones/workspace/contacts). GitHub
issues to be filed.

## [1.0.0-beta.6] - 2026-07-29

Hotfix canary #5. **beta.5 follow-up** — audit toàn diện 102 tool vs trusted
`@firfi/huly-mcp` v0.45 phát hiện ~40/102 tool có bug, ~22 hỏng hoàn toàn.
Slash goal complete-milestone beta.5: 13/13 task (T-65..T-77), 5 root-cause
(sai class ref · sai data model · sai field name/type · thiếu space scoping ·
thiếu account-client). 651 tests (baseline 583 → +68), CI green cả ubuntu+macos.

### Fixed (root-cause, verified vs trusted)

- **class refs** (T-65 #73): `tracker:class:Document` interface orphan (T-58
  conclusion sai) → `document:class:Document`/`Teamspace`/`DocumentSnapshot`
  from `@hcengineering/document` plugin. SUPERSEDES T-58.
- **document tools re-enabled** (T-66 #74): 10/11 honest-unavailable tools mở
  lại (list/get/update/delete teamspace + list/get/create/edit/delete document
  - list/get snapshot) dùng class refs mới. `uploadMarkup`/`updateMarkup` wired
    vào HulyClient (ws delegate + rest throw).
- _\*create_* AttachedDoc + sequence_* (T-67 #75): create_issue dùng `$inc
sequence` (atomic, no race dup identifier) + addCollection + number/kind/
  identifier/rank/parents. create_project self-ref space + type + members/owners
  - sequence:0 + idempotent. create_milestone status enum (KHÔNG string).
- **issue hierarchy** (T-68 #76): move_issue + list_issues dùng AttachedDoc
  fields (attachedTo/attachedToClass/collection/parents/subIssues) thay field
  `parentIssue` (KHÔNG tồn tại). 4 move cases cover + updateDescendantParents
  recursive + dec old parent subIssues.
- **tags TagReference** (T-69 #77): attach/detach/list_attached dùng addCollection/
  findAll/removeDoc trên `tags:class:TagReference` (collection "labels", KHÔNG
  "tags") thay $push/$pull inline array. color coerce Number().
- **comments field** (T-70 #78): field `message` (inline Markup) thay `body`
  (KHÔNG tồn tại). ChatMessage.message = `JSON.stringify(mdToMarkup(md))`,
  KHÔNG MarkupBlobRef. list_comments thêm filter `attachedToClass` + sort.
- _\*list_* space scoping_* (T-71 #79): list_issues/milestones/components/
  templates thêm `space: project._id`. list_issues assignee resolve Person +
  titleSearch no-leak. list_statuses ProjectType.statuses traversal + category
  ref→enum + isDefault.
