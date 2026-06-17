# Security Policy

## Supported Versions

The `main` branch of **ChatVRM Agent** receives security fixes on a
best-effort basis. Older tags and branches are not supported.

| Branch  | Supported          |
| ------- | ------------------ |
| `main`  | :white_check_mark: |
| other   | :x:                |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security problems.**

Use one of the following private channels:

- **GitHub Security Advisories** — open a private report via the
  [Security tab](../../security/advisories/new) of this repository.
- **Email** — see the contact address in the maintainer's GitHub profile
  ([github.com/badhope](https://github.com/badhope)).

Please include:

- A clear description of the issue and its impact
- Reproduction steps or a minimal proof-of-concept
- Affected versions / commits
- Any known workarounds

## What to Expect

- **Acknowledgement** within 7 days of your report
- An initial assessment within 14 days
- Coordinated disclosure — we will agree on a disclosure date with you
  before publishing a CVE or advisory

## Scope

The following are **in scope**:

- Server-side code in `src/pages/api/`
- Anything that allows arbitrary code execution on the host running the
  Next.js server
- Anything that exposes `.env`, API keys, or conversation history across
  users

The following are **out of scope**:

- The third-party APIs we call (OpenAI, Koeiromap) — please report those
  upstream
- The browser Web Speech API behavior, which is browser-dependent

## Secrets

Never commit `.env` files, OpenAI keys, Koeiromap keys, or any other secrets.
The `.gitignore` already excludes `.env` and `.env*.local`. If you accidentally
commit a secret, **rotate it immediately** — git history is forever.
