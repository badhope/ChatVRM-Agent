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
exports.DevFlowClient = exports.NetworkError = exports.AuthenticationError = exports.NotFoundError = exports.ValidationError = exports.DevFlowError = void 0;
const vscode = __importStar(require("vscode"));
const cp = __importStar(require("child_process"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
// Unified Error Types matching backend
class DevFlowError extends Error {
    code;
    statusCode;
    details;
    constructor(code, message, statusCode = 500, details) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.name = 'DevFlowError';
    }
}
exports.DevFlowError = DevFlowError;
class ValidationError extends DevFlowError {
    constructor(message, details) {
        super('VALIDATION_ERROR', message, 400, details);
    }
}
exports.ValidationError = ValidationError;
class NotFoundError extends DevFlowError {
    constructor(resource) {
        super('NOT_FOUND', `${resource} not found`, 404);
    }
}
exports.NotFoundError = NotFoundError;
class AuthenticationError extends DevFlowError {
    constructor(message = 'Authentication required') {
        super('AUTH_ERROR', message, 401);
    }
}
exports.AuthenticationError = AuthenticationError;
class NetworkError extends DevFlowError {
    constructor(message, details) {
        super('NETWORK_ERROR', message, 0, details);
    }
}
exports.NetworkError = NetworkError;
// Format error to unified format
function formatError(error) {
    if (error instanceof DevFlowError) {
        return { code: error.code, message: error.message, details: error.details };
    }
    if (error instanceof Error) {
        return { code: 'UNKNOWN_ERROR', message: error.message };
    }
    return { code: 'UNKNOWN_ERROR', message: String(error) };
}
class DevFlowClient {
    cliPath = null;
    outputChannel;
    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('DevFlow');
    }
    async initialize() {
        this.cliPath = this.findCliPath();
        if (!this.cliPath) {
            vscode.window.showWarningMessage('DevFlow CLI not found. Please install or configure path in settings.');
        }
        else {
            this.outputChannel.appendLine(`DevFlow CLI found at: ${this.cliPath}`);
        }
    }
    async runAgent(input, options, progress) {
        try {
            if (progress) {
                progress.report({ message: 'Starting agent...' });
            }
            const args = ['agent', 'run', input];
            if (options?.model) {
                args.push('--model', options.model);
            }
            if (options?.planFirst) {
                args.push('--plan');
            }
            if (progress) {
                progress.report({ message: 'Executing agent task...' });
            }
            const output = await this.exec(args);
            if (progress) {
                progress.report({ message: 'Agent completed successfully' });
            }
            return {
                success: true,
                data: {
                    success: true,
                    output,
                    steps: [],
                    changedFiles: [],
                    duration: 0,
                },
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            const formatted = formatError(error);
            this.outputChannel.appendLine(`Error: ${formatted.code} - ${formatted.message}`);
            return {
                success: false,
                error: formatted,
                timestamp: new Date().toISOString(),
            };
        }
    }
    async generateRepoMap(progress) {
        try {
            if (progress) {
                progress.report({ message: 'Generating repository map...' });
            }
            const output = await this.exec(['agent', 'repo-map']);
            if (progress) {
                progress.report({ message: 'Repository map generated' });
            }
            return {
                success: true,
                data: output,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            const formatted = formatError(error);
            this.outputChannel.appendLine(`Error: ${formatted.code} - ${formatted.message}`);
            return {
                success: false,
                error: formatted,
                timestamp: new Date().toISOString(),
            };
        }
    }
    async listPlugins() {
        try {
            const output = await this.exec(['plugins', 'list']);
            const plugins = this.parsePluginList(output);
            return {
                success: true,
                data: plugins,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            const formatted = formatError(error);
            this.outputChannel.appendLine(`Error: ${formatted.code} - ${formatted.message}`);
            return {
                success: false,
                error: formatted,
                timestamp: new Date().toISOString(),
            };
        }
    }
    async listMCPServices() {
        try {
            const output = await this.exec(['mcp', 'list']);
            const services = this.parseMCPList(output);
            return {
                success: true,
                data: services,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            const formatted = formatError(error);
            this.outputChannel.appendLine(`Error: ${formatted.code} - ${formatted.message}`);
            return {
                success: false,
                error: formatted,
                timestamp: new Date().toISOString(),
            };
        }
    }
    async enableMCP(name) {
        try {
            await this.exec(['mcp', 'enable', name]);
            return {
                success: true,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            const formatted = formatError(error);
            this.outputChannel.appendLine(`Error: ${formatted.code} - ${formatted.message}`);
            return {
                success: false,
                error: formatted,
                timestamp: new Date().toISOString(),
            };
        }
    }
    async disableMCP(name) {
        try {
            await this.exec(['mcp', 'disable', name]);
            return {
                success: true,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            const formatted = formatError(error);
            this.outputChannel.appendLine(`Error: ${formatted.code} - ${formatted.message}`);
            return {
                success: false,
                error: formatted,
                timestamp: new Date().toISOString(),
            };
        }
    }
    async gitCheckpoint(message) {
        try {
            const args = ['git', 'checkpoint'];
            if (message) {
                args.push('--message', message);
            }
            const output = await this.exec(args);
            return {
                success: true,
                data: output,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            const formatted = formatError(error);
            this.outputChannel.appendLine(`Error: ${formatted.code} - ${formatted.message}`);
            return {
                success: false,
                error: formatted,
                timestamp: new Date().toISOString(),
            };
        }
    }
    async gitUndo() {
        try {
            const output = await this.exec(['git', 'undo']);
            return {
                success: true,
                data: output,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            const formatted = formatError(error);
            this.outputChannel.appendLine(`Error: ${formatted.code} - ${formatted.message}`);
            return {
                success: false,
                error: formatted,
                timestamp: new Date().toISOString(),
            };
        }
    }
    async chat(message) {
        try {
            const output = await this.exec(['chat', message]);
            return {
                success: true,
                data: output,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            const formatted = formatError(error);
            this.outputChannel.appendLine(`Error: ${formatted.code} - ${formatted.message}`);
            return {
                success: false,
                error: formatted,
                timestamp: new Date().toISOString(),
            };
        }
    }
    exec(args) {
        return new Promise((resolve, reject) => {
            if (!this.cliPath) {
                reject(new NetworkError('DevFlow CLI not found'));
                return;
            }
            const config = vscode.workspace.getConfiguration('devflow');
            const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            this.outputChannel.appendLine(`Executing: devflow ${args.join(' ')}`);
            const proc = cp.spawn(this.cliPath, args, {
                cwd,
                env: { ...process.env, NODE_ENV: 'production' }
            });
            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (data) => {
                stdout += data.toString();
                this.outputChannel.append(data.toString());
            });
            proc.stderr.on('data', (data) => {
                stderr += data.toString();
                this.outputChannel.append(data.toString());
            });
            proc.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout.trim());
                }
                else {
                    // Parse error to determine type
                    const errorMessage = stderr.trim() || `Command failed with code ${code}`;
                    reject(new DevFlowError('COMMAND_FAILED', errorMessage, code || 500));
                }
            });
            proc.on('error', (err) => {
                reject(new NetworkError(`Failed to spawn process: ${err.message}`));
            });
        });
    }
    findCliPath() {
        const config = vscode.workspace.getConfiguration('devflow');
        const configPath = config.get('cliPath');
        if (configPath && fs.existsSync(configPath)) {
            return configPath;
        }
        // Check common locations
        const commonPaths = [
            'devflow',
            '/usr/local/bin/devflow',
            '/usr/bin/devflow',
            path.join(process.env.HOME || '', '.local', 'bin', 'devflow'),
            path.join(process.env.HOME || '', 'node_modules', '.bin', 'devflow')
        ];
        for (const p of commonPaths) {
            try {
                if (fs.existsSync(p) || this.checkCommandExists(p)) {
                    return p;
                }
            }
            catch {
                // Continue checking other paths
            }
        }
        return null;
    }
    checkCommandExists(cmd) {
        try {
            const result = cp.execSync(`which ${cmd}`, { encoding: 'utf-8' });
            return !!result;
        }
        catch {
            return false;
        }
    }
    parsePluginList(output) {
        const plugins = [];
        const lines = output.split('\n').filter(line => line.trim());
        for (const line of lines) {
            const match = line.match(/^[\s-*]*([^\s]+)\s+v?([\d.]+)?/);
            if (match) {
                plugins.push({
                    name: match[1],
                    version: match[2] || 'unknown',
                    enabled: !line.includes('(disabled)')
                });
            }
        }
        return plugins;
    }
    parseMCPList(output) {
        const services = [];
        const lines = output.split('\n').filter(line => line.trim());
        for (const line of lines) {
            const match = line.match(/^[\s-*]*([^\s]+)/);
            if (match) {
                services.push({
                    name: match[1],
                    description: line.substring(line.indexOf(match[1]) + match[1].length).trim(),
                    enabled: !line.includes('(disabled)')
                });
            }
        }
        return services;
    }
    dispose() {
        this.outputChannel.dispose();
    }
}
exports.DevFlowClient = DevFlowClient;
//# sourceMappingURL=client.js.map