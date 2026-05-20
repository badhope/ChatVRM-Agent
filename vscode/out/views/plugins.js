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
exports.PluginItem = exports.PluginsViewProvider = void 0;
const vscode = __importStar(require("vscode"));
class PluginsViewProvider {
    client;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    plugins = [];
    constructor(client) {
        this.client = client;
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (element) {
            return [];
        }
        try {
            const response = await this.client.listPlugins();
            if (response.success && response.data) {
                this.plugins = response.data;
            }
            else {
                this.plugins = [];
                if (response.error) {
                    vscode.window.showWarningMessage(`Failed to load plugins: ${response.error.message}`);
                }
            }
        }
        catch {
            this.plugins = [];
        }
        return this.plugins.map(p => new PluginItem(p.name, p.version, p.enabled));
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
}
exports.PluginsViewProvider = PluginsViewProvider;
class PluginItem extends vscode.TreeItem {
    name;
    version;
    enabled;
    constructor(name, version, enabled) {
        super(name, vscode.TreeItemCollapsibleState.None);
        this.name = name;
        this.version = version;
        this.enabled = enabled;
        this.description = `v${version}`;
        this.tooltip = `${name} v${version} (${enabled ? 'enabled' : 'disabled'})`;
        this.contextValue = enabled ? 'enabledPlugin' : 'disabledPlugin';
        this.iconPath = new vscode.ThemeIcon(enabled ? 'check' : 'circle-outline');
        this.command = {
            command: 'devflow.showPlugins',
            title: 'Show Plugin Details',
            arguments: [name]
        };
    }
}
exports.PluginItem = PluginItem;
//# sourceMappingURL=plugins.js.map