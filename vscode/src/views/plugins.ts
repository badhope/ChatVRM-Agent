import * as vscode from 'vscode';
import { DevFlowClient, PluginInfo } from '../client';

export class PluginsViewProvider implements vscode.TreeDataProvider<PluginItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<PluginItem | undefined | void>();
    public onDidChangeTreeData = this._onDidChangeTreeData.event;

    private plugins: PluginInfo[] = [];

    constructor(private client: DevFlowClient) {}

    public getTreeItem(element: PluginItem): vscode.TreeItem {
        return element;
    }

    public async getChildren(element?: PluginItem): Promise<PluginItem[]> {
        if (element) {
            return [];
        }

        try {
            const response = await this.client.listPlugins();
            if (response.success && response.data) {
                this.plugins = response.data;
            } else {
                this.plugins = [];
                if (response.error) {
                    vscode.window.showWarningMessage(`Failed to load plugins: ${response.error.message}`);
                }
            }
        } catch {
            this.plugins = [];
        }

        return this.plugins.map(p => new PluginItem(p.name, p.version, p.enabled));
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}

export class PluginItem extends vscode.TreeItem {
    constructor(
        public readonly name: string,
        public readonly version: string,
        public readonly enabled: boolean
    ) {
        super(name, vscode.TreeItemCollapsibleState.None);

        this.description = `v${version}`;
        this.tooltip = `${name} v${version} (${enabled ? 'enabled' : 'disabled'})`;
        this.contextValue = enabled ? 'enabledPlugin' : 'disabledPlugin';

        this.iconPath = new vscode.ThemeIcon(
            enabled ? 'check' : 'circle-outline'
        );

        this.command = {
            command: 'devflow.showPlugins',
            title: 'Show Plugin Details',
            arguments: [name]
        };
    }
}
