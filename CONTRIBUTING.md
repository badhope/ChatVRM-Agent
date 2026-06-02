# Contributing to Personal-Assistant

Thanks for your interest in contributing! 🎉
This document outlines the guidelines for contributing to **Personal-Assistant**.

## 📋 Prerequisites

- Node.js **>= 20.0.0 < 25.0.0** (22 LTS recommended)
- npm
- TypeScript 5.8 knowledge
- Git

## 🔧 Setup

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/Personal-Assistant.git
cd Personal-Assistant

# 2. Install dependencies (backend + frontend)
npm install
cd frontend && npm install && cd ..

# 3. Build
npm run build
npm run web:build

# 4. Run tests
npm test
```

## 🤝 How to Contribute

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b bugfix/issue-number
```

### 2. Make Changes

- Follow the existing code style (`npm run lint` and `npm run format`)
- Write clean, maintainable, well-typed code
- Add comments only where logic is non-obvious
- **Include tests** for new functionality (`src/__tests__/`)

### 3. Run Tests and Lint

```bash
npm test           # all 707 tests must pass
npm run lint       # 0 ESLint errors
npm run build      # tsc 0 errors
```

### 4. Commit Changes

Use [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git commit -m "feat: add new feature X"
git commit -m "fix: resolve issue with Y"
git commit -m "docs: update README"
git commit -m "i18n: add Chinese translation"
```

### 5. Push and Open a Pull Request

```bash
git push origin feature/your-feature-name
```

Then open a PR from your branch to `main` on GitHub.

## 📝 Code Style

- TypeScript everywhere (no plain JS)
- 2-space indentation
- Single quotes for strings
- Trailing commas
- LF line endings (`.prettierrc`)
- Type annotations required
- Public APIs should have JSDoc

## 🌐 Internationalization (i18n)

The project supports multiple languages. When adding new UI strings:

1. Add the English string to `frontend/src/i18n/en.json`
2. Add the Chinese translation to `frontend/src/i18n/zh.json`
3. Use `t('key')` from `useTranslation()` in components

Documentation:

- `README.md` — primary English docs
- `README_zh.md` — Chinese mirror

## 🐛 Reporting Issues

1. Search [existing issues](https://github.com/badhope/Personal-Assistant/issues) first
2. Open a new issue with a clear title and description
3. For bugs, include:
   - Reproduction steps
   - Expected vs actual behavior
   - Environment (OS, Node version)
   - Relevant logs

## 💡 Feature Requests

Open an issue with the `enhancement` label and describe:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## 📄 License

By contributing, you agree your contributions will be licensed under the [MIT License](LICENSE).

## 📞 Contact

For questions, open a [GitHub Discussion](https://github.com/badhope/Personal-Assistant/discussions).

---

Thank you for contributing to **Personal-Assistant**! 🚀
