# Contribution and Git Workflow

## Branches and promotion

```text
feat/*, fix/*, docs/*, chore/*
              │ pull request
              ▼
           develop  ── development/staging deployment
              │ release pull request
              ▼
            main    ── production release/deployment
```

- `main`: production-ready releases only. A pull request into `main` must come from this repository's `develop` branch.
- `develop`: integration branch and source for development/staging deployments; also the default GitHub branch.
- `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `chore/<topic>`: short-lived work branches created from `develop`, with pull requests targeting `develop` only.
- No direct pushes, force pushes, or branch deletion on `main` or `develop`.
- No direct feature-to-main promotion, including fixes. Fixes follow `fix/* → develop → main`.
- Use merge commits for promotion so the common branch history is preserved. Do not squash or rebase a `develop → main` release.

### Feature workflow

```bash
git switch develop
git pull --ff-only origin develop
git switch -c feat/board-crud

# Make and test the focused change.
git status --short
git diff
# Stage specific reviewed files, not an unreviewed blanket add.
git add path/to/reviewed-file
git diff --cached
git commit -m "feat: implement board CRUD"
git push -u origin feat/board-crud
gh pr create --base develop --head feat/board-crud
```

Describe the change, backlog tasks, tests, and migrations. Wait for required checks, review the diff, and merge into `develop`. A second-person approval is not mandatory for this solo project; add required approvals when a team exists.

### Release workflow

After features are integrated and verified on the development/staging environment:

```bash
gh pr create --base main --head develop --title "release: describe the release"
# Review and pass checks, then merge with a merge commit.
# Do not delete develop after the release.
```

Only promote releases when authorized; do not automatically merge unrelated future features to production. Rollback changes use the same fix-branch flow. Deployment pipelines are not implemented yet: these branch roles define future deployment sources, not a claim that hosting or environments are already configured.

## Before committing

- Review staged content, including newly added files.
- Do not stage real credentials, auth tokens, private configuration, or user data.
- Track safe example configuration, dependency lockfiles, reviewed migrations, and source.
- Run relevant tests and document anything not yet runnable.
- Keep unrelated build output and IDE state out of the commit.
- Remember that ignore rules do not untrack previously committed files or remove secrets from history.

If a secret is committed, stop sharing the affected history, revoke/rotate the secret, and coordinate cleanup. Removing it in a later commit is not sufficient.

## Authentication and author identity

Use an existing GitHub-authenticated credential manager, GitHub CLI login, or an authorized SSH key. Never embed a token in the remote URL or paste passwords/tokens into chat.

Set commit author identity locally for this repository when agreed:

```bash
git config --local user.name "Your chosen name"
git config --local user.email "Your verified or GitHub noreply email"
```

Do not invent another person's identity. GitHub provides an exact private commit email in account email settings; copy that value rather than guessing it.

## Repository settings

Protect both `develop` and `main` with required pull requests and the `Branch flow / validate` check, including administrators. Disable force pushes and branch deletion. Use zero required approvals while the project has one contributor; required pull requests and checks still apply. Keep the named check required even for documentation changes.

The branch-flow workflow validates pull-request source/base branches using only GitHub event metadata. It does not check out or execute pull-request code and uses read-only repository permissions. It checks that same-repository `develop` is the sole source into `main`, and that short-lived prefixed work branches target `develop`.

The workflow uses `pull_request_target` so its policy comes from the trusted base branch. Branch protection and repository settings must be verified on GitHub, not assumed from documentation. Build/test checks will be added when application code exists. Secret-scanning automation is separate and is not claimed as enabled here.

## Database changes

Write schema changes as new ordered migrations. Review the target environment and backup/data-retention implications before execution. Never apply destructive migrations to a shared/production database as part of tests.
