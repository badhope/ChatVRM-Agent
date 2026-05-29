# Troubleshooting Guide

This guide helps you diagnose and fix common issues with Personal Assistant.

## Table of Contents
- [Installation Issues](#installation-issues)
- [Configuration Issues](#configuration-issues)
- [CLI Issues](#cli-issues)
- [Agent Execution Issues](#agent-execution-issues)
- [Git Issues](#git-issues)
- [LLM Provider Issues](#llm-provider-issues)
- [Performance Issues](#performance-issues)
- [VSCode Extension Issues](#vscode-extension-issues)

---

## Installation Issues

### Problem: `npm install` fails

**Possible Solutions:**
1. Clear npm cache:
   ```bash
   npm cache clean --force
   ```

2. Delete `node_modules` and lock file:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. Check Node.js version (requires 18+):
   ```bash
   node --version
   ```

4. Try using a different registry:
   ```bash
   npm install --registry=https://registry.npmmirror.com
   ```

### Problem: `personal-assistant` command not found

**Possible Solutions:**
1. Ensure global installation:
   ```bash
   npm install -g @personal-assistant/cli
   ```

2. Check your PATH:
   ```bash
   echo $PATH
   which personal-assistant
   ```

3. Use npx instead:
   ```bash
   npx @personal-assistant/cli <command>
   ```

---

## Configuration Issues

### Problem: Cannot configure LLM provider

**Possible Solutions:**
1. Check config file location:
   ```bash
   personal-assistant config path
   ```

2. Initialize config if missing:
   ```bash
   personal-assistant config init
   ```

3. Verify config format (JSON):
   ```bash
   personal-assistant config show
   ```

4. Set provider explicitly:
   ```bash
   personal-assistant config set provider anthropic
   personal-assistant config set apiKey YOUR_API_KEY
   ```

### Problem: API key not being detected

**Possible Solutions:**
1. Check if API key is set:
   ```bash
   personal-assistant config show
   ```

2. Try setting via environment variable:
   ```bash
   export ANTHROPIC_API_KEY=your_key_here
   # or
   export OPENAI_API_KEY=your_key_here
   ```

3. Verify API key validity in provider dashboard

---

## CLI Issues

### Problem: Command hangs or takes too long

**Possible Solutions:**
1. Check internet connectivity
2. Increase timeout:
   ```bash
   personal-assistant --timeout 120 <command>
   ```

3. Check for verbose output:
   ```bash
   personal-assistant -v <command>
   ```

4. Disable cache temporarily:
   ```bash
   personal-assistant --no-cache <command>
   ```

### Problem: Permission denied errors

**Possible Solutions:**
1. Check file/directory permissions
2. Run with appropriate user permissions
3. On Unix systems:
   ```bash
   chmod +x /path/to/personal-assistant
   ```

4. Avoid running as root unless necessary

---

## Agent Execution Issues

### Problem: Agent fails to start

**Possible Solutions:**
1. Verify LLM provider configuration
2. Check API key and quota
3. Try a different model:
   ```bash
   personal-assistant agent --model claude-3-haiku-20240307 "your task"
   ```

4. Check logs for details:
   ```bash
   personal-assistant logs
   ```

### Problem: Agent makes incorrect changes

**Possible Solutions:**
1. Use git checkpoint to revert:
   ```bash
   personal-assistant git checkpoint
   # make changes
   personal-assistant git undo
   ```

2. Review the plan before executing:
   ```bash
   personal-assistant agent --plan-only "your task"
   ```

3. Provide clearer, more specific instructions
4. Break complex tasks into smaller steps

### Problem: Agent runs out of context window

**Possible Solutions:**
1. Use a larger context model
2. Exclude irrelevant files:
   ```bash
   personal-assistant agent --exclude "**/node_modules/**" "your task"
   ```

3. Focus on specific directories:
   ```bash
   personal-assistant agent --focus src "your task"
   ```

4. Enable context compression:
   ```bash
   personal-assistant config set contextCompression true
   ```

---

## Git Issues

### Problem: Git checkpoint fails

**Possible Solutions:**
1. Ensure git is initialized:
   ```bash
   git init
   ```

2. Check git status:
   ```bash
   git status
   ```

3. Configure git user if needed:
   ```bash
   git config user.name "Your Name"
   git config user.email "your.email@example.com"
   ```

### Problem: Cannot undo checkpoint

**Possible Solutions:**
1. Check git log:
   ```bash
   git log --oneline -10
   ```

2. Manual git reset if needed:
   ```bash
   git reset --hard HEAD~1
   ```

3. Ensure you're in the correct branch

---

## LLM Provider Issues

### Problem: Authentication errors

**Possible Solutions:**
1. Verify API key is correct
2. Check for typos or extra whitespace
3. Ensure API key has appropriate permissions
4. Regenerate API key in provider dashboard

### Problem: Rate limiting

**Possible Solutions:**
1. Wait and try again later
2. Enable request batching:
   ```bash
   personal-assistant config set batchRequests true
   ```

3. Use a lower tier model for simpler tasks
4. Check provider's rate limit documentation

### Problem: Model not found

**Possible Solutions:**
1. Check available models:
   ```bash
   personal-assistant provider models
   ```

2. Use a supported model name
3. Verify model availability in your region

---

## Performance Issues

### Problem: Slow startup

**Possible Solutions:**
1. Enable caching:
   ```bash
   personal-assistant config set cacheEnabled true
   ```

2. Clear old cache:
   ```bash
   personal-assistant cache clear
   ```

3. Exclude large directories from analysis

### Problem: High memory usage

**Possible Solutions:**
1. Limit concurrent operations
2. Reduce context window size
3. Disable unused features in config
4. Monitor with:
   ```bash
   personal-assistant monitor
   ```

### Problem: Slow code analysis

**Possible Solutions:**
1. Use incremental analysis:
   ```bash
   personal-assistant config set incrementalAnalysis true
   ```

2. Focus on specific directories
3. Increase cache TTL
4. Exclude build artifacts and dependencies

---

## VSCode Extension Issues

### Problem: Extension not activating

**Possible Solutions:**
1. Check VSCode version (requires 1.85+)
2. Reload VSCode window:
   - Press `Ctrl+Shift+P`
   - Type "Developer: Reload Window"

3. Check extension logs in Output panel:
   - Select "Personal Assistant" from dropdown

### Problem: CLI path not found

**Possible Solutions:**
1. Set CLI path explicitly in settings
2. Verify CLI is installed:
   ```bash
   which personal-assistant
   ```

3. Use absolute path in extension settings

### Problem: Chat not responding

**Possible Solutions:**
1. Check CLI is properly configured
2. Verify API key and provider settings
3. Restart VSCode
4. Check extension logs for errors

---

## Getting More Help

If you can't find a solution here:

1. Check the logs:
   ```bash
   personal-assistant logs
   ```

2. Enable debug mode:
   ```bash
   personal-assistant -v <command>
   ```

3. Search existing GitHub Issues:
   [https://github.com/badhope/personal-assistant/issues](https://github.com/badhope/personal-assistant/issues)

4. Create a new issue with:
   - Detailed description of the problem
   - Steps to reproduce
   - Error messages and logs
   - Your environment information (OS, Node.js version, etc.)

---

## Environment Information

To help diagnose issues, collect this information:

```bash
# Personal Assistant version
personal-assistant --version

# Node.js version
node --version

# npm version
npm --version

# OS information
uname -a  # Unix
systeminfo  # Windows

# Git version
git --version
```
