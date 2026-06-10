## What

<!-- One-paragraph description of the change. -->

## Why

<!-- Motivation. Link any issue this PR fixes (Fixes #123). -->

## How

<!-- Approach: list the changes, files touched, design decisions. -->

## Test plan

<!-- How did you verify? Which commands, which test suites? -->

- [ ] Existing tests pass
- [ ] Added tests for new behaviour
- [ ] Manually verified in dev / staging

## Risk & rollout

<!-- What can break? Is rollback straightforward? Is there a feature flag? -->

## Checklist

- [ ] My branch is up-to-date with the base branch
- [ ] I ran `gitleaks` locally (or let CI do it)
- [ ] I added / updated tests for new behaviour
- [ ] I updated documentation (README, CHANGELOG, …)
- [ ] I did **not** commit any secrets, tokens, or credentials
- [ ] My commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)

> **Never commit secrets.** If you accidentally committed a token,
> rotate it **immediately** in the provider's settings, then update
> the PR to remove the secret. See [SECURITY.md](./SECURITY.md).
