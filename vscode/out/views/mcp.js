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
exports.MCPItem = exports.MCPViewProvider = void 0;
const vscode = __importStar(require("vscode"));
class MCPViewProvider {
    client;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    services = [];
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
            const response = await this.client.listMCPServices();
            if (response.success && response.data) {
                this.services = response.data;
            }
            else {
                this.services = [];
                if (response.error) {
                    vscode.window.showWarningMessage(`Failed to load MCP services: ${response.error.message}`);
                }
            }
        }
        catch {
            this.services = [];
        }
        return this.services.map(s => new MCPItem(s.name, s.description, s.enabled));
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    async toggleService(item) {
        try {
            let result;
            if (item.enabled) {
                result = await this.client.disableMCP(item.name);
            }
            else {
                result = await this.client.enableMCP(item.name);
            }
            if (result.success) {
                this.refresh();
            }
            else {
                vscode.window.showErrorMessage(`Failed to toggle MCP service: ${result.error?.message || 'Unknown error'}`);
            }
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Failed to toggle MCP service: ${errorMsg}`);
        }
    }
}
exports.MCPViewProvider = MCPViewProvider;
class MCPItem extends vscode.TreeItem {
    name;
    description;
    enabled;
    constructor(name, description, enabled) {
        super(name, vscode.TreeItemCollapsibleState.None);
        this.name = name;
        this.description = description;
        this.enabled = enabled;
        this.description = description || '';
        this.tooltip = `${name}: ${description || 'No description'} (${enabled ? 'enabled' : 'disabled'})`;
        this.contextValue = enabled ? 'enabledMCP' : 'disabledMCP';
        this.iconPath = new vscode.ThemeIcon(enabled ? 'server' : 'server-environment');
        this.command = {
            command: 'devflow.enableMCP',
            title: 'Toggle MCP Service',
            arguments: []
        };
    }
}
exports.MCPItem = MCPItem;
//# sourceMappingURL=mcp.js.map