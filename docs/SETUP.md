# Project Setup Guide

This guide will help you set up the Personal-Assistant project for development.

## Prerequisites

### Required Software
- **Node.js** >= 18.0.0 < 23.0.0
- **npm** (included with Node.js)
- **Git** (for version control)

### Recommended Tools
- **VSCode** - With TypeScript and ESLint extensions
- **Git** - For version control

## Step-by-Step Setup

### 1. Clone the Repository

```bash
git clone https://github.com/badhope/Personal-Assistant.git
cd Personal-Assistant
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` if you want to customize any settings (optional).

### 4. Build the Project

```bash
npm run build
```

### 5. Run Tests

```bash
npm run test
```

All 484+ tests should pass!

## Development Workflow

### Watch Mode

For active development with auto-rebuild:

```bash
npm run dev
```

### Code Formatting

To run Prettier and format all code:

```bash
npm run format
```

To check formatting without making changes:

```bash
npm run format:check
```

### Linting

To run ESLint:

```bash
npm run lint
```

To fix auto-fixable linting issues:

```bash
npm run lint:fix
```

### Testing

```bash
npm run test              # Run all tests
npm run test:unit        # Run only unit tests
npm run test:integration  # Run integration tests
npm run test:watch        # Watch mode for development
npm run test:coverage     # Generate coverage report
npm run test:ui           # Open Vitest UI
```

### Git Hooks

This project uses Husky for Git hooks. The hooks are automatically installed when you run `npm install`.

The pre-commit hook will:
- Auto-format staged files with Prettier
- Run ESLint on TypeScript/TSX files

## Project Configuration Files

### TypeScript (`tsconfig.json`)
- Strict TypeScript checking enabled
- Module resolution set to NodeNext
- Targets ES2020

### Prettier (`.prettierrc`)
- Semi-colons: Yes
- Single quotes: Yes
- Tab width: 2 spaces
- Trailing commas: ES5 style
- Print width: 100 characters

### ESLint (`.eslintrc.cjs`)
- Uses TypeScript ESLint
- Strict type checking rules
- Best practices enforced

### Husky (`.husky/`)
- Pre-commit hook for linting and formatting
- Prepare script configured in package.json

## Common Tasks

### Global Link (Optional)

To make `personal-assistant` available globally:

```bash
npm link
```

### Cleaning Build Output

```bash
# Delete dist directory manually or rebuild
npm run build
```

### Updating Dependencies

```bash
# Check for outdated packages
npm outdated

# Update packages
npm update
```

## Troubleshooting

### Node Version Issues

If you get Node version errors, use nvm to manage Node.js versions:

```bash
nvm install 20.20.2
nvm use 20.20.2
```

### Dependency Installation Issues

If npm install fails, try:

```bash
# Clean npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall
npm install --legacy-peer-deps
```

### TypeScript Compilation Errors

- Make sure all dependencies are installed
- Try deleting `node_modules` and reinstalling
- Verify Node.js version is in the required range

### Test Failures

- Make sure the project builds first: `npm run build`
- Check that all dependencies are installed correctly
- Run `npm run test:unit` to isolate issues

## IDE Setup (VSCode)

Recommended extensions:
- TypeScript and JavaScript Language Features (built-in)
- ESLint
- Prettier
- Vitest
- GitLens

Recommended VSCode settings (`.vscode/settings.json`):
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  }
}
```

## Project Structure Reference

For detailed architecture information, see [ARCHITECTURE.md](./ARCHITECTURE.md).
