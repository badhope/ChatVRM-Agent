# Security Policy

## Supported versions

Personal-Assistant is a fast-moving open-source project. The following table
describes which versions receive security updates.

| Version | Supported                | Status            |
| ------- | ------------------------ | ----------------- |
| 2.x     | Active                   | Current stable    |
| 1.x     | Critical fixes only      | Maintenance       |
| 0.x     | End of life              | EOL — please upgrade |

We recommend running the latest `2.x` release.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

We use **GitHub private vulnerability reporting** for all security disclosures.

1. Go to [https://github.com/badhope/Personal-Assistant/security/advisories/new](https://github.com/badhope/Personal-Assistant/security/advisories/new)
2. Fill in the form with a clear description and reproduction steps
3. We will acknowledge your report within **72 hours**
4. We will triage and confirm a fix within **14 days** for critical issues,
   **30 days** for high / medium
5. We will coordinate disclosure timing with you (default 90 days)

If private advisory reporting is not available in your region, open a
non-public issue and we will convert it.

## What to include in a report

To help us triage quickly, please include:

- **Affected version** (`pa --version` or commit SHA)
- **Affected component** (frontend / server / CLI / SDK / specific tool)
- **Vulnerability class** (RCE / SSRF / path traversal / injection / XSS / auth bypass / DoS / info disclosure / other)
- **Attack scenario** (what can an attacker do, who is impacted)
- **Reproduction steps** (minimal working example)
- **Impact assessment** (CVSS if known)
- **Suggested fix** (optional)

## Security best practices for users

To keep your deployment safe:

1. **Never commit API keys** to the repository
   - The repo's `.gitignore` already covers `ghp_*`, `sk-*`, `.env*`, `*.key`, `*.pem`, `*.secret`
2. **Use 0600 permissions** on `~/.config/personal-assistant-nodejs/config.json`
   - The CLI sets this automatically
3. **Restrict network exposure** — the Express server (default port 3000) is not designed for direct public exposure
   - Put it behind a reverse proxy (nginx, Caddy) with TLS
   - Add an auth layer (OAuth proxy, basic auth, or mTLS) if exposing to the internet
4. **Use a sandbox** — the `shell` tool can execute arbitrary commands
   - Configure `config.sandbox.allowedCommands` to whitelist
   - Or run the CLI as a low-privilege user
5. **Pin dependencies** in production
   - `npm ci` instead of `npm install` for reproducible builds
   - Enable Dependabot security updates (already configured)
6. **Keep Node.js up to date** — older Node versions have known CVEs in transitive deps
7. **Audit LLM outputs** — the agent can call `shell` and `writeFile`; do not run it unattended on production systems
8. **Review diffs** — the `agent` task can create / modify files; always inspect `createdFiles` / `modifiedFiles` after a run

## Scope

The following are in scope for security reports:

- Command injection in the `shell` tool
- Path traversal in `writeFile` / `readFile`
- SSRF in any LLM provider adapter
- API key leakage (config dump, log leakage, error messages)
- Sandbox bypass
- XSS in the Web UI
- Prototype pollution in dependency chains
- Dependency confusion / supply chain attacks

The following are **out of scope**:

- LLM hallucination / quality issues (not a security vulnerability)
- Prompt-injection from untrusted user input (this is an inherent LLM property, not a software bug — see "LLM safety" docs)
- "The model said something I didn't like" content issues
- Issues only reproducible on deprecated / EOL versions

## Acknowledgements

This project benefits from open-source security tooling including
`npm audit` and `eslint-plugin-security`.
