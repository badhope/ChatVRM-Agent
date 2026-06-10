# Contributing

Thanks for your interest in contributing! This document covers the
ground rules so your PR can land quickly and cleanly.

## Branch & PR workflow

> **Direct pushes to `main` are blocked by branch protection.**

1. **Fork** (or create a feature branch if you have write access).
2. **Branch off `main`**: `git switch -c feat/short-description`
3. **Make focused commits** following
   [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat: …`        — new feature
   - `fix: …`         — bug fix
   - `refactor: …`    — no behaviour change
   - `docs: …`        — documentation only
   - `chore(deps): …` — dependency bumps
   - `security: …`    — security fix
4. **Push your branch**: `git push -u origin feat/short-description`
5. **Open a Pull Request** against `main`. Fill in the PR template.
6. **Wait for CI** (gitleaks + CodeQL on every repo that has code).
7. **Squash-merge** is the default. One commit per logical change.
   The merge commit subject will become the PR title.

## Code style

- Match the existing style of the file you are editing.
- Keep diffs minimal — don't reformat unrelated code.
- Add tests for new behaviour. Bug fixes should add a regression test
  that fails on `main` and passes on your branch.
- No dead code, no commented-out code, no orphan TODO comments.

## Security

- **Never commit secrets, tokens, API keys, or `.env` files.**
  Push-protection is on; if you bypass it, **rotate the credential**.
  See [SECURITY.md](./SECURITY.md).
- Don't paste stack traces that contain real user data in issues.
- If you find a vulnerability, follow the
  [private disclosure process](./SECURITY.md) — do not open a public
  issue.

## Dependencies

- Dependabot opens weekly PRs for all package ecosystems detected
  in the repo (npm, pip, cargo, docker, github-actions, gitsubmodule,
  composer, gomod, bundler, nuget, maven, gradle).
- Dependabot PRs are auto-mergeable when CI passes — they do not need
  a review from a human (the branch is signed and the diff is small).
- Major-version bumps that touch lockfiles will be reviewed manually.

## Issue triage

- New issues are auto-labelled **bug** / **enhancement** / **security**
  via the issue templates.
- Please use the right template. Issues without a template take longer
  to triage.

## License

By submitting a contribution, you agree that your work will be
licensed under the same license as the repository.
