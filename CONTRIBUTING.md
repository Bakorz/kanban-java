# Contribution and Git Workflow

## Branches

- `main`: reviewed, coherent project baseline.
- `feat/<topic>`: a new feature.
- `fix/<topic>`: a bug fix.
- `docs/<topic>`: documentation changes.

Once `main` exists on GitHub:

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/board-crud

# Make and test the focused change.
git status --short
git diff
# Stage specific reviewed files, not an unreviewed blanket add.
git add path/to/reviewed-file
git diff --cached
git commit -m "feat: implement board CRUD"
git push -u origin feat/board-crud
```

Open a pull request into `main`. Describe the change, linked backlog tasks, tests, and any migrations. Prefer small commits with clear messages. Do not force-push shared history without explicit coordination.

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

When available for the repository's plan and visibility, enable protections/rulesets for `main` and require the appropriate checks. These settings are not automatically enabled by cloning or by this document. CI and secret-scanning automation will be added explicitly during implementation.

## Database changes

Write schema changes as new ordered migrations. Review the target environment and backup/data-retention implications before execution. Never apply destructive migrations to a shared/production database as part of tests.
