import * as vscode from 'vscode';
import { PersonalAssistantClient } from './client';
import { ChatViewProvider } from './views/chat';
import { PluginsViewProvider } from './views/plugins';
import { MCPViewProvider } from './views/mcp';
import { registerCommands } from './commands';

let client: PersonalAssistantClient;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // Initialize Personal Assistant CLI client
    client = new PersonalAssistantClient();
    await client.initialize();

    // Register views
    const chatProvider = new ChatViewProvider(context.extensionUri, client);
    const pluginsProvider = new PluginsViewProvider(client);
    const mcpProvider = new MCPViewProvider(client);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('personal-assistant.chat', chatProvider),
        vscode.window.registerTreeDataProvider('personal-assistant.plugins', pluginsProvider),
        vscode.window.registerTreeDataProvider('personal-assistant.mcp', mcpProvider)
    );

    // Register commands
    registerCommands(context, client);

    // Show welcome message
    vscode.window.showInformationMessage('Personal Assistant Agent activated');
}

export function deactivate(): void {
    client?.dispose();
}
