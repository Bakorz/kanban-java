# Kanban Java

A personal Kanban application planned for a university Java web project.

**Stack:** React + Java Servlets + JDBC + Supabase PostgreSQL + Supabase Auth.

**Status:** Foundation implemented: React routes, Servlet health endpoint, build/test commands, and credential-free CI. Authentication, JDBC integration, and real board/card features are not implemented yet. No Supabase migrations or deployment have been performed. See [progress and approved scope](<docs/PROGRESS.md>).

## Documentation

- [Product requirements and architecture](<docs/PRD.md>) — MVP scope, flowcharts, ERD, API contract, and acceptance criteria.
- [Implementation backlog](<docs/TASKS.md>) — 37 core tasks and 3 optional enhancements with dependencies and completion checks.
- [Setup and credential handling](<docs/SETUP.md>) — public configuration, private environment settings, and access gates.
- [Local course demo guide](<docs/LOCAL-DEMO.md>) — owner-approved localhost setup, SQL steps, private launcher, and remaining acceptance checks.
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

```text
kanban-java/
├── frontend/             React + Vite, component and browser tests
├── backend/              Maven WAR, Jakarta Servlets, embedded Tomcat tests
├── database/             Reviewed SQL and isolated database-test tooling
├── scripts/              Temporary real frontend-to-Java verification
├── docs/                 Requirements, setup, tasks, and progress
└── .github/workflows/    Branch policy and application CI
```

## Build and run the foundation

Prerequisites: Node **24.22.3**, npm **11**, JDK **21+**, Maven **3.9+**.
This host has JDK 26.0.2 and Maven 3.10.1; the WAR targets Java 21.

```bash
npm ci --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend
mvn -B -ntp -f backend/pom.xml verify
```

Run the Java API and frontend in separate terminals:

```bash
mvn -f backend/pom.xml -Pdev package exec:exec
npm run dev --prefix frontend
```

Open <http://localhost:5173/dashboard> on the machine running these commands.
Click **Check connection** to call the real Java health endpoint through Vite's
`/api` proxy. Both servers bind loopback only; stop them with Ctrl+C.
This does not deploy the app or change the agent GUI.

Browser and real-integration verification (ports 8080 and 5173 must be free):

```bash
cd frontend && npx playwright install chromium && cd ..
npm run test:e2e --prefix frontend
node scripts/verify-foundation.mjs
```

On this sandboxed host, use `NPM_CONFIG_CACHE=/tmp/kanban-npm-cache`,
`PLAYWRIGHT_BROWSERS_PATH="$PWD/.tools/playwright"`, and
`MVN=/home/bakorz/.local/bin/mvn` for the integration script. Maven can use
`MAVEN_REPO_LOCAL="$PWD/backend/.m2"` for the integration script if its home cache is unavailable.
For direct Maven commands, add `-Dmaven.repo.local="$PWD/backend/.m2"` as a command argument.
See the [frontend guide](<frontend/README.md>) and [backend guide](<backend/README.md>).
The health endpoint is public liveness only; all other API routes currently reject
requests, including requests containing an unverified token.

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
