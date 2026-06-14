# Contributing to ChatVRM Agent

First off, thanks for taking the time to contribute! This project is a
community fork of [pixiv/ChatVRM](https://github.com/pixiv/ChatVRM) and we
welcome improvements from anyone.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Project layout](#project-layout)
- [Development setup](#development-setup)
- [Making changes](#making-changes)
- [Commit message style](#commit-message-style)
- [Pull request process](#pull-request-process)
- [Reporting bugs](#reporting-bugs)
- [Suggesting features](#suggesting-features)
- [Translations](#translations)

## Code of Conduct

This project and everyone participating in it is governed by the
[Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to
uphold this code. Please report unacceptable behavior through the contact
listed in [SECURITY.md](./SECURITY.md).

## Project layout

```
src/
  components/   React UI components
  features/     Domain modules (chat, TTS, lip sync, vrm viewer, …)
  lib/          Low-level VRM / VRMA loaders
  pages/        Next.js pages, including /api/*
  styles/       Global CSS
  utils/        Small helpers
```

Feature-specific code lives under `src/features/<feature>/`. UI primitives go
in `src/components/`. Both are kept framework-light so that bits of the runtime
can be moved into a library or a CLI without a rewrite.

## Development setup

You need Node.js 16.14.2+ (see `engines` in `package.json`) and npm.

```bash
git clone https://github.com/badhope/ChatVRM-Agent.git
cd ChatVRM-Agent
npm install
cp .env.example .env
# edit .env and add your OPEN_AI_KEY
npm run dev
```

The dev server runs on <http://localhost:3000>.

## Making changes

1. **Fork** the repository and create a topic branch:
   ```bash
   git checkout -b feat/short-descriptive-name
   ```
2. **Keep commits small and focused.** One logical change per commit.
3. **Run the linter** before pushing:
   ```bash
   npm run lint
   ```
4. **Build** to make sure nothing is broken:
   ```bash
   npm run build
   ```
5. **Push** to your fork and open a pull request against `main`.

> The `main` branch is protected. If you are a maintainer and need to push
> directly, disable branch protection first and re-enable it after.

## Commit message style

We follow a lightweight [Conventional Commits](https://www.conventionalcommits.org/)
style:

```
<type>(<scope>): <short summary>

<body — explain the why, not the what>

<footer — references, breaking-change notes>
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`,
`perf`.

Examples:

```
feat(chat): support gpt-4o model selector in settings
fix(lipsync): clamp audio amplitude to avoid jitter
docs(readme): clarify static-export caveats
```

## Pull request process

- Fill in the [pull request template](./.github/PULL_REQUEST_TEMPLATE.md).
- Make sure CI (lint + build) is green.
- Address review feedback by pushing new commits; avoid force-pushes once a
  review has started.
- A maintainer will merge once there is at least one approval.

## Reporting bugs

Open an issue using the [bug report template](./.github/ISSUE_TEMPLATE/bug_report.md).
Please include:

- Steps to reproduce
- Expected vs. actual behavior
- Browser, OS, and Node version
- Console output / screenshots if relevant

## Suggesting features

Open an issue using the [feature request template](./.github/ISSUE_TEMPLATE/feature_request.md).
Describe the problem you are trying to solve before proposing a specific
solution — that makes it easier for others to suggest alternatives.

## Translations

Documentation is **English-first** (`README.md`); Chinese and Japanese live in
`README.zh.md` and `README.ja.md`. If you spot a mistake in any version, or
would like to add a new language, please open a pull request. Keep the section
headings identical across languages so the reader can switch files without
losing their place.

UI strings in the app are still Japanese-only. Internationalization of the
runtime UI is tracked as a future enhancement.
