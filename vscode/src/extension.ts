import * as vscode from 'vscode';
import { DevFlowClient } from './client';
import { ChatViewProvider } from './views/chat';
import { PluginsViewProvider } from './views/plugins';
import { MCPViewProvider } from './views/mcp';
import { registerCommands } from './commands';

let client: DevFlowClient;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // Initialize DevFlow CLI client
    client = new DevFlowClient();
    await client.initialize();

    // Register views
    const chatProvider = new ChatViewProvider(context.extensionUri, client);
    const pluginsProvider = new PluginsViewProvider(client);
    const mcpProvider = new MCPViewProvider(client);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('devflow.chat', chatProvider),
        vscode.window.registerTreeDataProvider('devflow.plugins', pluginsProvider),
        vscode.window.registerTreeDataProvider('devflow.mcp', mcpProvider)
    );

    // Register commands
    registerCommands(context, client);

    // Show welcome message
    vscode.window.showInformationMessage('DevFlow Agent activated');
}

export function deactivate(): void {
    client?.dispose();
}
