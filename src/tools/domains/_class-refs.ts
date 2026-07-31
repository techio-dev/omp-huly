// Huly _class refs — string literal cast `as never` (branded Ref<T> bypass).
// Centralized ở đây để domain modules KHÔNG lặp pattern, dễ search/audit.
// Runtime: Huly packages có đầy đủ tracker/contact/document/..., pi-huly chỉ
// dùng string literal (packages KHÔNG trong bundle, only runtime).
//
// T-43 fix (2026-07-27): re-verified class refs từ @hcengineering/*@0.7.423
// source map (npm tarball extraction). Source of truth:
// docs/design/11-runtime-audit.md. 6+ class broken root cause từng loại riêng
// (mixin vs class / cross-package import / rename / base abstract).
//
// T-58 fix (2026-07-28): DEEP-AUDIT 12 packages @0.7.423 — verify plugin()
// class block registration (KHÔNG chỉ interface existence). Key findings:
//   - Document interface exists trong tracker source NHƯNG KHÔNG register class
//     → `tracker:class:Document` runtime fail (interface orphan). Document search
//     marked honest-unavailable (T-60).
//   - Label: 0 match toàn packages → deprecated (Huly dùng TagElement).
//   - TsRelation: 0 match → Issue.relations inline RelatedDocument[] (T-59
//     refactor $push/$pull inline, xóa TS_RELATION_CLASS dead code).
//   - DocumentSnapshot: 0 match → deprecated (T-58 honest-unavailable).
//   - Space base abstract → Teamspace = drive:class:Drive (T-54).

/**
 * Cast plain string thành Huly _class Ref (branded type bypass).
 * Runtime: string. Compile-time: Ref<T> (KHÔNG break generic constraint).
 */
export function classRef(ref: string): never {
  return ref as never;
}

/** Cast plain string thành Huly _id Ref (branded type bypass). */
export function idRef(id: string): never {
  return id as never;
}

/** Cast plain string thành Huly space Ref. */
export function spaceRef(space: string): never {
  return space as never;
}

// === Domain class refs (verified từ @hcengineering/*@0.7.423 source map, 2026-07-27) ===

// contact (Persons + Employee mixin)
// Person/Contact = class. Employee = mixin (KHÔNG phải class — runtime lookup
// khác → "domain not found" nếu query như class).
export const PERSON_CLASS = classRef("contact:class:Person");
export const EMPLOYEE_CLASS = classRef("contact:mixin:Employee"); // T-43: class → mixin
export const CONTACT_CLASS = classRef("contact:class:Contact");
// T-82G #108: Channel = email/phone provider attachments on Person.
// Email resolve: findOne(Channel, {value: email, provider: Email}).
export const CHANNEL_CLASS = classRef("contact:class:Channel");
export const EMAIL_PROVIDER = "contact:channelProvider:Email";

// tracker (Issues/Milestones/Components/Projects — extends Task)
// Issue/Milestone/Component/Project/IssueStatus/IssueTemplate/TimeSpendReport
// define trong tracker package source (extends Task từ task package).
export const ISSUE_CLASS = classRef("tracker:class:Issue");
export const MILESTONE_CLASS = classRef("tracker:class:Milestone");
export const COMPONENT_CLASS = classRef("tracker:class:Component");
export const PROJECT_CLASS = classRef("tracker:class:Project");
export const ISSUE_STATUS_CLASS = classRef("tracker:class:IssueStatus");
export const ISSUE_TEMPLATE_CLASS = classRef("tracker:class:IssueTemplate");
export const TIME_SPEND_REPORT_CLASS = classRef("tracker:class:TimeSpendReport"); // T-43: activity → tracker (verify runtime)

// task (Task/TaskType/ProjectType — generic task model, tracker extends)
// TaskType/ProjectType defined trong @hcengineering/task, import vào tracker.
// Pi-huly đoán tracker pkg → sai domain.
export const TASK_TYPE_CLASS = classRef("task:class:TaskType"); // T-43: tracker → task
export const PROJECT_TYPE_CLASS = classRef("task:class:ProjectType"); // T-43: tracker → task
// T-86 #121: Mixin doc + task.mixin.TaskTypeClass — UNVERIFIED (task pkg not
// installed locally, không runtime self-host). Refs theo Huly naming convention
// `<plugin>:<kind>:<Name>` (same convention verified core:space:Model, core:class:Space).
export const MIXIN_CLASS = classRef("core:class:Mixin");
export const TASK_TYPE_MIXIN = classRef("task:mixin:TaskTypeClass");
export const CLASSIFIER_KIND_MIXIN = 2; // ClassifierKind.MIXIN (numeric enum)
export const MODEL_LABEL_PREFIX = "embedded:embedded:"; // getEmbeddedLabel() format

// Document / Teamspace / DocumentSnapshot — T-65 (2026-07-28): SUPERSEDES
// T-58 interface-orphan conclusion. Real class registered trong
// `@hcengineering/document` plugin() (KHÔNG phải tracker). T-58 audited chỉ
// tracker package + missed document package. Verified vs trusted huly-mcp v0.45
// (`/tmp/huly-mcp-trusted/src/huly/huly-plugins.ts` loads
// `@hcengineering/document` → `documentPlugin.class.{Document,Teamspace,
// DocumentSnapshot}`). Server-side: standard Huly installation bundles document
// plugin → string ref resolves. Pi-huly dùng string literal (giống tất cả class
// khác) — KHÔNG cần load plugin client-side (server resolves class by string).
export const DOCUMENT_CLASS = classRef("document:class:Document"); // T-65: tracker → document pkg
export const TEAMSPACE_CLASS = classRef("document:class:Teamspace"); // T-65: expose (từ document pkg)
export const DOCUMENT_SNAPSHOT_CLASS = classRef("document:class:DocumentSnapshot");

// Teamspace create refs (T-78): verified runtime = plain string literals
// (plugin() factory prefixes `<pluginId>:<category>:<name>`). KHÔNG cần bundle
// document plugin — same string-literal pattern as class refs.
export const TEAMSPACE_ICON = "document:icon:Teamspace";
export const DEFAULT_TEAMSPACE_TYPE = "document:spaceType:DefaultTeamspaceType";
// T-doc-parent: top-level Document parent marker. Web Documents tree query
// top-level = { parent: "document:ids:NoParent" }. Doc KHÔNG set field này (absent)
// hay set "" → bị loại khỏi sidebar tree (chỉ search thấy). = documentPlugin.ids.NoParent.
// Verified vs doc thật + huly-mcp createDocument. Port pi-huly beta.19 (#162).
export const DOCUMENT_NO_PARENT = "document:ids:NoParent";
// Top-level spaces (Teamspace/Drive/Project) dùng core.space.Space làm parent.
export const SPACE_PARENT = spaceRef("core:space:Space");

// Space — base abstract class trong @hcengineering/core.
// READ-ONLY SAFE: findAll/findOne trên SPACE_CLASS trả subclasses qua inheritance
// (list_teamspaces/get_teamspace OK cross all space types). T-66 sẽ switch
// list_teamspaces sang TEAMSPACE_CLASS (chỉ trả Teamspace, không lẫn Project/
// Drive/ChunterSpace).
export const SPACE_CLASS = classRef("core:class:Space");
// T-54: drive:class:Drive = Documents/Files Teamspace thật (extends TypedSpace,
// có SpaceTypeDescriptor). Register trong drive plugin() class block line 31.
export const DRIVE_CLASS = classRef("drive:class:Drive");

// T-67 (2026-07-28): refs cho create_* AttachedDoc + Project Type.
// Huly convention <plugin>:<category>:<key> (giống class refs).
// NoParent = empty ref sentinel (trusted issues-parent.ts:21 tracker.ids.NoParent="").
export const NO_PARENT_REF = idRef("");
// Issue.kind = tracker.taskTypes.Issue (trusted issues-write.ts:168).
export const ISSUE_KIND_REF = classRef("tracker:taskTypes:Issue");
// Project.type (TypedSpace) = tracker.ids.ClassingProjectType (trusted projects.ts:185).
export const CLASSIC_PROJECT_TYPE_REF = classRef("tracker:ids:ClassingProjectType");

// chunter (Comments = ChatMessage)
export const CHAT_MESSAGE_CLASS = classRef("chunter:class:ChatMessage");

// attachment (Attachments)
export const ATTACHMENT_CLASS = classRef("attachment:class:Attachment");

// tags (TagElement = entity thật, NOT "Tag")
// Huly thiết kế: TagElement = tag entity, TagReference = ref trong doc, TagCategory = group.
export const TAG_CLASS = classRef("tags:class:TagElement"); // T-43: Tag → TagElement
export const TAG_REFERENCE_CLASS = classRef("tags:class:TagReference"); // T-69: AttachedDoc cho tag attachments
export const TAG_CATEGORY_CLASS = classRef("tags:class:TagCategory");

// T-73: core.space.Model = root model space (workflow docs IssueStatus/TaskType
// live here, KHÔNG project space). Verified trusted task-management.ts.
export const MODEL_SPACE = spaceRef("core:space:Model");

// T-81 #104: Status base class (task.class.Status alias core.class.Status).
// Trusted issues-shared.ts:281 resolve statuses qua core.class.Status + batch $in
// (KHÔNG findOne IssueStatus per ref — "can fail on some workspaces").
export const STATUS_CLASS = classRef("core:class:Status");

// T-73: StatusCategory Ref<StatusCategory> map (5 values, format task:statusCategory:<Key>).
// IssueStatus.category = Ref<StatusCategory> (KHÔNG enum string). Verified T-71 + trusted.
export const STATUS_CATEGORY_REFS: Record<string, string> = {
  UnStarted: "task:statusCategory:UnStarted",
  ToDo: "task:statusCategory:ToDo",
  Active: "task:statusCategory:Active",
  Won: "task:statusCategory:Won",
  Lost: "task:statusCategory:Lost",
};

// T-73: IssueStatus.ofAttribute required field (Ref<Attribute<Status>>).
// Trusted hardcodes tracker.attribute.IssueStatus cho issue statuses.
export const ISSUE_STATUS_ATTRIBUTE = "tracker:attribute:IssueStatus";

// view — T-58 DEEP-AUDIT: Label KHÔNG tồn tại trong 12 packages (0 match).
// Deprecated — Huly dùng TagElement (tags:class:TagElement) cho tag/label entity.
// Labels tools refactor dùng TAG_CLASS (T-45 pattern đã verify).
export const LABEL_CLASS = classRef("view:class:Label");

// time (ToDo — chữ viết hoa D, NOT "Todo")
// ToDo extends AttachedDoc, define trong @hcengineering/time (KHÔNG phải task).
export const TODO_CLASS = classRef("time:class:ToDo"); // T-43: task:Todo → time:ToDo
// T-79 #102: ProjectToDo = subclass cho issue-attached todo (KHÔNG base ToDo).
// Verified trusted huly-mcp planner.ts: createIssueTodo dùng time.class.ProjectToDo.
export const PROJECT_TODO_CLASS = classRef("time:class:ProjectToDo");
// T-79 #102: shared space cho mọi todo (KHÔNG issue.space). Trusted planner.ts:141.
export const TODOS_SPACE = spaceRef("time:space:ToDos");
// T-93b #139: workspace ROOT space cho workspace-global docs (TagCategory).
// Probe live: 25 tag-categories đều space="core:space:Workspace". Trước đây
// create_tag_category dùng spaceRef(tctx.workspace) (handle string) → orphan.
export const WORKSPACE_SPACE = spaceRef("core:space:Workspace");

// T-59 (2026-07-28): TS_RELATION_CLASS XÓA — Issue relations KHÔNG phải class
// riêng. Issue.relations?: RelatedDocument[] + Issue.blockedBy?: RelatedDocument[]
// inline (RelatedDocument = Pick<Doc, '_id' | '_class'>). add/remove/list dùng
// $push/$pull trực tiếp trên Issue, KHÔNG addCollection.
