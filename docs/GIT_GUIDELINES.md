# Git Guidelines

This document outlines Git commit message conventions and workflow guidelines.

## Commit Message Convention

We follow the Conventional Commits specification.

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type

Must be one of the following:

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation only changes
- **style**: Formatting, white-space, etc.
- **refactor**: Code change that neither fixes a bug nor adds a feature
- **perf**: Performance improvement
- **test**: Adding or correcting tests
- **build**: Build process or dependencies
- **ci**: CI/CD related changes
- **chore**: Maintenance tasks
- **revert**: Reverting previous changes

### Scope

Optional, can be anything specifying place of the commit change.

Examples:
- `agent`
- `memory`
- `domain`
- `infrastructure`
- `application`
- `docs`

### Subject

- Short description (max 72 chars)
- Use imperative, present tense ("add" not "added")
- No dot at the end

### Body (Optional)

- Explain the motivation for the change
- Can include multiple paragraphs
- Separate from subject with a blank line

### Footer (Optional)

- Reference to GitHub issues or PRs
- BREAKING CHANGE: note at the beginning

## Examples

### Feature Commit

```
feat(agent): add personality system

- Implement personality domain model
- Add personality repository interface
- Create personality service with pure functions

Closes #123
```

### Bug Fix Commit

```
fix(domain): resolve decision repository save issue

The save method wasn't properly persisting decisions
to the file system. Now correctly stringifies JSON
and handles errors gracefully.

Fixes #456
```

### Documentation Commit

```
docs: update README with DDD architecture info

Add comprehensive project structure documentation
and explain the four-layer architecture setup.
```

### Refactor Commit

```
refactor(infrastructure): extract emotion state machine

Move emotion state machine from old file to new
infrastructure layer location. No behavior changes.
```

## Branching Strategy

### Main Branches

- **main/master** - Stable production code
- **develop** - Integration branch (if used)

### Feature Branches

```bash
git checkout -b feature/short-description
```

Format: `feature/<feature-name>`

### Bugfix Branches

```bash
git checkout -b fix/short-description
```

Format: `fix/<issue-description>`

### Hotfix Branches

```bash
git checkout -b hotfix/short-description
```

Format: `hotfix/<critical-fix>`

## Workflow

### 1. Create a Branch

```bash
git checkout main
git pull origin main
git checkout -b feature/my-feature
```

### 2. Make Changes

Edit files and stage them:

```bash
git add .
# or
git add <specific-files>
```

### 3. Commit Changes

```bash
git commit -m "feat: add my new feature"
```

### 4. Push Branch

```bash
git push -u origin feature/my-feature
```

### 5. Create Pull Request

Open a PR on GitHub from your branch to main.

## Git Hooks

This project uses Husky for Git hooks:

- **pre-commit**: Runs linting and formatting
- **commit-msg** (optional): Validates commit messages
- **pre-push** (optional): Runs tests before push

## Best Practices

### Commit Often

Make small, focused commits. Each commit should do one thing well.

### Write Good Messages

- Explain *why* not just *what*
- Keep subject line concise
- Use body for explanation

### Keep History Clean

- Rebase feature branches on main before PR
- Use `git rebase -i` to clean up commit history
- Avoid merge commits from main into feature branches

### Don't Push Broken Code

- Always run tests before pushing
- Make sure code builds correctly
- Check linting and formatting

### Sign Commits (Optional but Recommended)

```bash
git commit -S -m "feat: add signed commit"
```

## Rebasing vs Merging

**Prefer rebasing** for feature branches:

```bash
git checkout feature/my-branch
git rebase main
git push -f origin feature/my-branch
```

**Use merge commits** for PR merges:

- Squash merge for small features
- Create merge commit for larger features
- Preserves history appropriately

## Common Git Tasks

### Amend Last Commit

```bash
git commit --amend
```

### Undo Last Commit (Keep Changes)

```bash
git reset --soft HEAD~1
```

### Undo Last Commit (Discard Changes)

```bash
git reset --hard HEAD~1
```

### View Git History

```bash
git log --oneline --graph --all
```

### Stash Changes

```bash
git stash               # Stash changes
git stash pop           # Restore changes
git stash list          # List stashes
git stash drop          # Remove last stash
```

## PR Guidelines

- Keep PRs focused on one feature/fix
- Write clear PR title and description
- Reference related issues
- Include tests for new code
- Make sure all checks pass (lint, tests, build)

## Resources

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Pro Git Book](https://git-scm.com/book/)
- [GitHub Flow Guide](https://guides.github.com/introduction/flow/)
