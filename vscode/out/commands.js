"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCommands = registerCommands;
const vscode = __importStar(require("vscode"));
function registerCommands(context, client) {
    // devflow.runAgent
    context.subscriptions.push(vscode.commands.registerCommand('devflow.runAgent', async () => {
        const input = await vscode.window.showInputBox({
            prompt: 'Enter task for DevFlow',
            placeHolder: 'Describe what you want DevFlow to do...'
        });
        if (input) {
            const config = vscode.workspace.getConfiguration('devflow');
            const model = config.get('defaultModel');
            const autoCheckpoint = config.get('autoCheckpoint');
            try {
                if (autoCheckpoint) {
                    const checkpointResult = await client.gitCheckpoint('Auto-checkpoint before agent run');
                    if (!checkpointResult.success) {
                        vscode.window.showWarningMessage('Auto-checkpoint failed, continuing anyway...');
                    }
                }
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'DevFlow Agent running...',
                    cancellable: false
                }, async (progress) => {
                    const result = await client.runAgent(input, { model }, progress);
                    if (!result.success) {
                        throw new Error(result.error?.message || 'Agent failed');
                    }
                    return result;
                });
                vscode.window.showInformationMessage('DevFlow completed successfully');
            }
            catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`DevFlow error: ${errorMsg}`);
            }
        }
    }));
    // devflow.openChat
    context.subscriptions.push(vscode.commands.registerCommand('devflow.openChat', () => {
        vscode.commands.executeCommand('devflow.chat.focus');
    }));
    // devflow.generateRepoMap
    context.subscriptions.push(vscode.commands.registerCommand('devflow.generateRepoMap', async () => {
        try {
            const result = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Generating repository map...'
            }, async (progress) => {
                const response = await client.generateRepoMap(progress);
                if (!response.success) {
                    throw new Error(response.error?.message || 'Failed to generate repo map');
                }
                return response.data;
            });
            if (result) {
                const doc = await vscode.workspace.openTextDocument({
                    content: result,
                    language: 'markdown'
                });
                vscode.window.showTextDocument(doc);
            }
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Failed to generate repo map: ${errorMsg}`);
        }
    }));
    // devflow.showPlugins
    context.subscriptions.push(vscode.commands.registerCommand('devflow.showPlugins', async () => {
        try {
            const response = await client.listPlugins();
            if (!response.success) {
                throw new Error(response.error?.message || 'Failed to list plugins');
            }
            const plugins = response.data || [];
            const items = plugins.map(p => ({
                label: p.name,
                description: `v${p.version}`,
                detail: p.enabled ? 'Enabled' : 'Disabled'
            }));
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a plugin'
            });
            if (selected) {
                vscode.window.showInformationMessage(`Plugin: ${selected.label}`);
            }
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Failed to list plugins: ${errorMsg}`);
        }
    }));
    // devflow.enableMCP
    context.subscriptions.push(vscode.commands.registerCommand('devflow.enableMCP', async () => {
        try {
            const response = await client.listMCPServices();
            if (!response.success) {
                throw new Error(response.error?.message || 'Failed to list MCP services');
            }
            const services = response.data || [];
            const items = services.map(s => ({
                label: s.name,
                description: s.description,
                picked: s.enabled
            }));
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select MCP service to enable',
                canPickMany: true
            });
            if (selected) {
                for (const item of selected) {
                    const toggleResult = await client.enableMCP(item.label);
                    if (!toggleResult.success) {
                        vscode.window.showWarningMessage(`Failed to enable ${item.label}`);
                    }
                }
                vscode.window.showInformationMessage('MCP services updated');
            }
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Failed to enable MCP: ${errorMsg}`);
        }
    }));
    // devflow.gitCheckpoint
    context.subscriptions.push(vscode.commands.registerCommand('devflow.gitCheckpoint', async () => {
        const message = await vscode.window.showInputBox({
            prompt: 'Checkpoint message',
            placeHolder: 'Describe this checkpoint...'
        });
        if (message !== undefined) {
            try {
                const result = await client.gitCheckpoint(message || undefined);
                if (!result.success) {
                    throw new Error(result.error?.message || 'Checkpoint failed');
                }
                vscode.window.showInformationMessage(`Checkpoint created: ${result.data}`);
            }
            catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`Checkpoint failed: ${errorMsg}`);
            }
        }
    }));
    // devflow.gitUndo
    context.subscriptions.push(vscode.commands.registerCommand('devflow.gitUndo', async () => {
        const confirm = await vscode.window.showWarningMessage('Undo last checkpoint? This will revert recent changes.', 'Yes', 'No');
        if (confirm === 'Yes') {
            try {
                const result = await client.gitUndo();
                if (!result.success) {
                    throw new Error(result.error?.message || 'Undo failed');
                }
                vscode.window.showInformationMessage(`Undo completed: ${result.data}`);
            }
            catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`Undo failed: ${errorMsg}`);
            }
        }
    }));
}
//# sourceMappingURL=commands.js.map