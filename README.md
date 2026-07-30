# omp-huly

> Native Huly support cho [oh-my-pi](https://github.com/techio-dev/oh-my-pi) (omp) —
> ~102 tools + native Huly client.
> KHÔNG MCP, gọi thẳng Huly WebSocket/REST API.
> Fork của [pi-huly](https://github.com/naicoi92/pi-huly).

[![CI](https://github.com/techio-dev/omp-huly/actions/workflows/ci.yml/badge.svg)](https://github.com/techio-dev/omp-huly/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![npm](https://img.shields.io/npm/v/omp-huly.svg)](https://www.npmjs.com/package/omp-huly)

**Status**: Ported from pi-huly `1.0.0-beta.14` → omp-huly `0.1.0` (2026-07-30). Tools-only package; skills maintained separately in `~/.omp/agent/skills/`.

## Tại sao omp-huly?

omp-huly là fork của pi-huly, retarget từ [pi-coding-agent](https://github.com/earendil-works/pi-coding-agent) sang [oh-my-pi](https://github.com/techio-dev/oh-my-pi) (omp). Đóng gói **~102 tools thiết yếu** chạy native trong omp process, kèm Huly client WebSocket/REST.

<details><summary>Vấn đề vs cách omp-huly giải quyết</summary>

| Vấn đề | omp-huly giải quyết |
|---|---|
| MCP server riêng (process phụ thuộc, env vars) | 1 package native, cùng lifecycle session |
| ~470 tools nhiễu LLM | **~102 tools** full-CRUD-per-domain, không gap lifecycle |
| Hosted Huly SaaS shutdown 2026-07-20 | Target **self-hosted Huly** từ đầu |
| pi-huly only works on pi | Port sang omp — chạy trên oh-my-pi |

</details>

## Features

- 🔑 **Native, không MCP** — tools chạy trong omp process, không spawn process ngoài.
- 🔑 **Lean + complete** — 102 tools full-CRUD-per-domain, không nhiễu context.
- 🔒 **Multi-workspace** — lưu token/password mỗi workspace, switch qua `/huly`.
- 🔀 **Transport toggle** — WebSocket (persistent, pool) hoặc REST (stateless), default ws.
- 🛡️ **Confirm gate** — destructive ops (delete) yêu cầu confirm; non-TUI auto-deny.
- 🔁 **Markdown round-trip** — Huly markup ↔ markdown lossless (native ref links).
- 🎨 **TUI render** — `huly_get_issue` card, `huly_list_issues` table, `huly_get_document` preview.

## Requirements

- **Bun ≥ 1.3.14** (omp runtime).
- **oh-my-pi** (omp) — peer dependencies `@oh-my-pi/pi-coding-agent`, `@oh-my-pi/pi-tui`.
- **Self-host Huly instance** (KHÔNG support hosted SaaS — đã shutdown 2026-07-20). Hướng dẫn self-host: <https://docs.huly.io/self-host/>.
- **`@hcengineering/*` deps** publish **public trên npmjs.org** (KHÔNG cần GitHub Packages token).

## Install

```bash
omp install npm:omp-huly
```

Hoặc từ source:

```bash
git clone https://github.com/techio-dev/omp-huly.git
cd omp-huly
pnpm install        # no token needed — @hcengineering public on npm
pnpm run typecheck  # verify toolchain
pnpm run build      # → dist/index.mjs
```

## Quick start (3 bước)

```bash
# 1. Cài package
omp install npm:omp-huly

# 2. Bind workspace cho cwd hiện tại (interactive — chọn workspace + project)
/huly init

# 3. Dùng tool (LLM tự gọi, hoặc bạn invoke qua prompt)
#    VD: "Tạo issue PD-1: 'Setup CI' priority high"
#    → LLM gọi huly_create_issue({project:"PD", title:"Setup CI", priority:"high"})
```

## Configuration

omp-huly dùng 2 file global (KHÔNG env vars, KHÔNG project-local):

- **`~/.omp/agent/huly/credentials.json`** (chmod 600, KHÔNG commit) — auth union per workspace.

  Existing pi-huly users: credentials **auto-migrate** từ `~/.pi/agent/huly/credentials.json` → `~/.omp/agent/huly/credentials.json` on first load.

  ```json
  {
    "workspaces": {
      "myteam": {
        "url": "https://huly.example.com",
        "workspace": "myteam",
        "token": "tok_xxx"
      }
    }
  }
  ```

  Hoặc email/password:

  ```json
  {
    "workspaces": {
      "myteam": {
        "url": "https://huly.example.com",
        "workspace": "myteam",
        "email": "user@example.com",
        "password": "pass123"
      }
    }
  }
  ```

- **`~/.omp/agent/huly/config.json`** (non-secret) — transport + cwd binding.

  Existing pi-huly users: config **auto-migrate** từ `~/.pi/agent/huly/config.json`.

  ```json
  {
    "version": 1,
    "transport": "ws",
    "projects": {
      "/Users/me/projects/myapp": { "workspace": "myteam", "project": "PD" }
    }
  }
  ```

Cả 2 file được tạo/quản lý qua `/huly init`. KHÔNG edit tay trừ khi cần. Secret CHỈ trong credentials.json, KHÔNG log.

## `/huly` command guide

Unified command, git-like subcommands:

| Subcommand | Mô tả |
|---|---|
| `/huly` | Smart: cwd bound → status; unbound → init flow |
| `/huly init` | Setup/bind cwd (chọn workspace → verify → project → bind) |
| `/huly status` | Diagnostics: binding, pool health, user, version |
| `/huly workspace list` | List workspace đã config |
| `/huly workspace add` | Add workspace (url + auth) |
| `/huly workspace remove <id>` | Remove workspace |
| `/huly link [ws] [project]` | Bind cwd manual |
| `/huly unlink` | Remove cwd binding |

## Tool catalog (19 domains, 102 tools)

| Domain | Tools | VD |
|---|---|---|
| **Issues** | 21 | create/list/get/update/delete/move_issue, add/remove_label, relations, templates |
| **Documents** | 10 | create/edit/get/delete_document, teamspace CRUD |
| **Projects** | 6 | create/list/get/update/delete_project, list_statuses |
| **Milestones** | 6 | CRUD + set_issue_milestone |
| **Components** | 6 | CRUD + set_issue_component |
| **Comments** | 4 | list/add/update/delete_comment |
| **Workspace** | 5 | get_workspace_info, list_workspaces/members, get/update_user_profile |
| **Labels** | 4 | list/create/update/delete_label (GLOBAL namespace) |
| **Tags** | 7 | CRUD + attach/detach/list_attached |
| **Tag-categories** | 4 | CRUD |
| **Attachments** | 5 | list/get/add/download (incl issue attachment) |
| **Todos** | 7 | list/get/create/update/complete/reopen/delete |
| **Search** | 1 | fulltext_search (global) |
| **Deletion** | 1 | preview_deletion (cascade preview) |
| **Time** | 1 | log_time (minutes) |
| **Contacts** | 2 | list_employees, list_persons (assignee resolution) |
| **Task-management** | 5 | create_issue_status, create_task_type, list/get_project_type |
| **Spaces** | 5 | list/get_space, list/get/update_space_type |
| **Snapshots** | 2 | list/get_document_snapshot |

Mọi tool có prefix `huly_` (vd `huly_create_issue`). Common params:

- `workspace?` — override workspace (default: cwd-map)
- `project?` — project-scoped (issues/milestones/components)
- `identifier` — issue: `PD-123` hoặc raw `123`
- `assignee?` — auto-resolve currentUser email khi absent

## Skills (separate package)

omp-huly là **tools-only package**. Huly skills (`huly-docs`, `huly-tasks`) được maintain riêng trong `~/.omp/agent/skills/` (KHÔNG bundled).

- **`huly-docs`** — DocStore adapter cho `project-design` workflow. Sync design docs ↔ Huly Documents.
- **`huly-tasks`** — TaskStore adapter. Sync tasks/issues ↔ Huly Issues. Hỗ trợ `milestone-implement` orchestrator.

Cả 2 skills đã adapted: dùng `huly_` prefixed tools (KHÔNG MCP refs), giữ structure gốc. Install skills separately trong `~/.omp/agent/skills/`.

## Transport + Auth

- **Transport** (`config.json`):
  - `ws` (default) — WebSocket persistent, connection pool per-workspace
    (max 8 ws, LRU evict), auto-reconnect backoff. Tốt cho latency.
  - `rest` — REST stateless, KHÔNG pool. Tốt cho environments block WS.
- **Auth** (per workspace):
  - `token` — Huly API token (preferred).
  - `email` + `password` — login credentials (api-client `connect` hỗ trợ cả 2).

## Troubleshooting

| Symptom | Nguyên nhân + Fix |
|---|---|
| `NeedsInitError: No workspace resolved` | cwd chưa bind. Run `/huly init`. |
| `NeedsDisambiguationError: Workspace ambiguous` | Same-name diff-URL. Specify `workspace` param explicit. |
| `ConnectionError: Huly unreachable` | Check URL, network, self-host Huly running. `/huly status` diagnostic. |
| `AuthError: token expired` | Refresh token trong `/huly workspace add`. |

## License

- **omp-huly**: [MIT](./LICENSE) © can1357 (fork from pi-huly by naicoi92).
- **Runtime dependency `@hcengineering/*`**: **EPL-2.0** (consumer install từ
  npm public — KHÔNG bundled vào dist). Xem [`NOTICE.md`](./NOTICE.md) cho
  attribution + source availability.
- **Other deps** (`ws`, `zod`, `@oh-my-pi/*`): MIT.

## Links

- [GitHub](https://github.com/techio-dev/omp-huly)
- [Issues](https://github.com/techio-dev/omp-huly/issues)
- [Upstream: pi-huly](https://github.com/naicoi92/pi-huly)
- [oh-my-pi](https://github.com/techio-dev/oh-my-pi)
- [Huly self-host guide](https://docs.huly.io/self-host/)
