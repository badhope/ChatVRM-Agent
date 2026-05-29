# Personal Assistant VSCode Extension

AI-powered development assistant integrated directly into VS Code.

## Features

### 🤖 AI Chat
- Interactive chat interface in the sidebar
- Ask questions about your codebase
- Get AI-powered suggestions and explanations

### 🧠 Smart Agent
- Run the Personal Assistant agent directly from VS Code
- Automatic git checkpoints before changes
- Undo checkpoints easily
- Real-time progress updates

### 📁 File Analysis
- Generate repository maps
- Analyze code quality
- Understand codebase structure quickly

### 🔌 Plugins & MCP
- Manage Personal Assistant plugins
- Configure MCP (Model Context Protocol) servers
- Extend functionality with custom tools

## Installation

### From VSIX (Manual)
1. Download the `.vsix` file
2. Open VS Code
3. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
4. Type "Install from VSIX"
5. Select the downloaded file

### From Marketplace (Coming Soon)
Search for "Personal Assistant" in the VS Code Extension Marketplace.

## Getting Started

### 1. Configure the CLI Path
1. Open VS Code Settings (`Ctrl+,` or `Cmd+,`)
2. Search for "Personal Assistant"
3. Set the `Cli Path` to your `personal-assistant` executable (auto-detected if in PATH)

### 2. Set Up Your AI Provider
1. Run `personal-assistant config init` in your terminal
2. Configure your preferred AI provider and API key

### 3. Start Using!
- Open the Personal Assistant sidebar
- Use the chat interface
- Or run commands from the Command Palette

## Commands

| Command | Description |
|---------|-------------|
| `Personal Assistant: Run Agent` | Execute an AI agent task |
| `Personal Assistant: Open Chat` | Open the chat interface |
| `Personal Assistant: Generate Repo Map` | Generate a codebase structure map |
| `Personal Assistant: Show Plugins` | List and manage plugins |
| `Personal Assistant: Enable MCP` | Configure MCP servers |
| `Personal Assistant: Git Checkpoint` | Create a git checkpoint |
| `Personal Assistant: Git Undo` | Undo last checkpoint |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `personal-assistant.cliPath` | `""` | Path to personal-assistant CLI |
| `personal-assistant.defaultModel` | `"claude-3-5-sonnet-20241022"` | Default AI model |
| `personal-assistant.autoCheckpoint` | `true` | Auto-create git checkpoints |
| `personal-assistant.showRepoMap` | `true` | Show repo map on startup |

## Usage Examples

### Running an Agent Task
1. Open the Command Palette (`Ctrl+Shift+P`)
2. Type "Personal Assistant: Run Agent"
3. Enter your task description (e.g., "Add error handling to the auth module")
4. Watch the agent work!

### Using Chat
1. Open the Personal Assistant sidebar
2. Type your question in the chat input
3. Press Enter or click Send
4. Get AI-powered responses with context from your codebase

### Creating a Checkpoint
1. Make some changes to your code
2. Run "Personal Assistant: Git Checkpoint"
3. Enter a description (optional)
4. Your changes are safely checkpointed!

## Troubleshooting

### CLI Not Found
- Ensure `personal-assistant` is in your PATH
- Or set the full path in settings

### AI Provider Errors
- Check your API key configuration
- Verify you have credits/quota available
- Try a different model or provider

### Git Operations Fail
- Ensure git is initialized in your workspace
- Check git permissions
- Verify you have no uncommitted changes if required

## Architecture

The extension uses the Personal Assistant CLI under the hood:

```
VSCode Extension
    ↓
Personal Assistant CLI
    ↓
AI Provider (Claude, GPT, etc.)
    ↓
Your Codebase
```

## Contributing

Contributions are welcome! See the main Personal Assistant repository for more information.

## License

MIT

## Support

- GitHub Issues: [https://github.com/badhope/personal-assistant/issues](https://github.com/badhope/personal-assistant/issues)
- Documentation: [https://github.com/badhope/personal-assistant](https://github.com/badhope/personal-assistant)

