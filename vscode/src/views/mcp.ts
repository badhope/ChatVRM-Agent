import * as vscode from 'vscode';
import { DevFlowClient, MCPServiceInfo } from '../client';

export class MCPViewProvider implements vscode.TreeDataProvider<MCPItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<MCPItem | undefined | void>();
    public onDidChangeTreeData = this._onDidChangeTreeData.event;

    private services: MCPServiceInfo[] = [];

    constructor(private client: DevFlowClient) {}

    public getTreeItem(element: MCPItem): vscode.TreeItem {
        return element;
    }

    public async getChildren(element?: MCPItem): Promise<MCPItem[]> {
        if (element) {
            return [];
        }

        try {
            const response = await this.client.listMCPServices();
            if (response.success && response.data) {
                this.services = response.data;
            } else {
                this.services = [];
                if (response.error) {
                    vscode.window.showWarningMessage(`Failed to load MCP services: ${response.error.message}`);
                }
            }
        } catch {
            this.services = [];
        }

        return this.services.map(s => new MCPItem(s.name, s.description, s.enabled));
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public async toggleService(item: MCPItem): Promise<void> {
        try {
            let result;
            if (item.enabled) {
                result = await this.client.disableMCP(item.name);
            } else {
                result = await this.client.enableMCP(item.name);
            }
            if (result.success) {
                this.refresh();
            } else {
                vscode.window.showErrorMessage(`Failed to toggle MCP service: ${result.error?.message || 'Unknown error'}`);
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Failed to toggle MCP service: ${errorMsg}`);
        }
    }
}

export class MCPItem extends vscode.TreeItem {
    constructor(
        public readonly name: string,
        public readonly description: string,
        public readonly enabled: boolean
    ) {
        super(name, vscode.TreeItemCollapsibleState.None);

        this.description = description || '';
        this.tooltip = `${name}: ${description || 'No description'} (${enabled ? 'enabled' : 'disabled'})`;
        this.contextValue = enabled ? 'enabledMCP' : 'disabledMCP';

        this.iconPath = new vscode.ThemeIcon(
            enabled ? 'server' : 'server-environment'
        );

        this.command = {
            command: 'devflow.enableMCP',
            title: 'Toggle MCP Service',
            arguments: []
        };
    }
}
