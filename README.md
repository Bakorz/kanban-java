# Kanban Java

A personal Kanban application planned for a university Java web project.

**Stack:** React + Java Servlets + JDBC + Supabase PostgreSQL + Supabase Auth.

**Status:** Planning and repository initialization only. Application implementation, database provisioning, and deployment have not started.

## Documentation

- [Product requirements and architecture](<docs/PRD.md>) — MVP scope, flowcharts, ERD, API contract, and acceptance criteria.
- [Implementation backlog](<docs/TASKS.md>) — 37 core tasks and 3 optional enhancements with dependencies and completion checks.
- [Setup and credential handling](<docs/SETUP.md>) — public configuration, private environment settings, and access gates.
- [Contribution and Git workflow](<CONTRIBUTING.md>) — branching, commits, and secret safety.

## Architecture

```text
React ── authentication ──> Supabase Auth
React ── JSON + access token ──> Java API on Tomcat
Java  ── token verification, ownership checks, business rules
Java  ── JDBC ──> Supabase PostgreSQL
```

All board and card operations go through Java. Supabase Auth handles accounts and sessions; the application does not implement a second password system.

## Planned MVP

- Email/password registration, login, logout, and recovery.
- Personal boards with To Do, In Progress, and Done columns.
- Card creation, editing, deletion, priority, due dates, and movement.
- Persistent data, server-side ownership checks, and transactional ordering.
- Accessible non-drag controls; drag-and-drop is optional after core correctness.

## Repository layout

Current:

```text
kanban-java/
├── docs/
│   ├── PRD.md
│   ├── TASKS.md
│   └── SETUP.md
├── .gitignore
├── CONTRIBUTING.md
└── README.md
```

Implementation will add `frontend/`, `backend/`, and `database/migrations/` as described in the PRD. No runnable application or build commands are claimed yet.

## Security

- Do not commit real environment files, database passwords, tokens, private keys, or database dumps.
- Only Supabase browser-safe publishable configuration belongs in the React build.
- Runtime DB credentials and migration credentials must be separate and configured privately.
- Existing credentials exposed by a previous project must be rotated before reuse.
- This repository starts with clean history; no source, binaries, or history from the previous Spring Boot checkout is imported.

## Version control

Remote: <https://github.com/Bakorz/kanban-java>

Branch flow: **`feat/*` (or `fix/*`, `docs/*`, `chore/*`) → `develop` → `main`**.

- `develop` is the default integration branch and the source for development/staging deployments.
- `main` contains production-ready releases; only `develop` may be merged into it through a release pull request.
- Create work branches from an up-to-date `develop` and target `develop` in feature pull requests.
- Both long-lived branches require pull requests and the branch-flow check; direct/force pushes are blocked, including for administrators.
- Use merge commits for releases and preserve `develop` after promotion.

See the [contribution guide](<CONTRIBUTING.md>) for commands and policy details. Deployment automation and hosting are not configured yet.

Do not run deployment commands or apply remote database migrations simply because a change has been committed. Those actions require separate environment-specific approval.
