import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// Unified Error Types matching backend
export class DevFlowError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DevFlowError';
  }
}

export class ValidationError extends DevFlowError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class NotFoundError extends DevFlowError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} not found`, 404);
  }
}

export class AuthenticationError extends DevFlowError {
  constructor(message: string = 'Authentication required') {
    super('AUTH_ERROR', message, 401);
  }
}

export class NetworkError extends DevFlowError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('NETWORK_ERROR', message, 0, details);
  }
}

// Format error to unified format
function formatError(error: unknown): { code: string; message: string; details?: Record<string, unknown> } {
  if (error instanceof DevFlowError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  if (error instanceof Error) {
    return { code: 'UNKNOWN_ERROR', message: error.message };
  }
  return { code: 'UNKNOWN_ERROR', message: String(error) };
}

// Unified API Response type
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
}

export interface PluginInfo {
    name: string;
    version: string;
    enabled: boolean;
}

export interface MCPServiceInfo {
    name: string;
    description: string;
    enabled: boolean;
}

export interface AgentResult {
    success: boolean;
    output: string;
    steps: unknown[];
    changedFiles: string[];
    duration: number;
}

// Progress reporting interface
interface ProgressReporter {
    report: (item: { message?: string; increment?: number }) => void;
}

export class DevFlowClient {
    private cliPath: string | null = null;
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('DevFlow');
    }

    async initialize(): Promise<void> {
        this.cliPath = this.findCliPath();
        if (!this.cliPath) {
            vscode.window.showWarningMessage(
                'DevFlow CLI not found. Please install or configure path in settings.'
            );
        } else {
            this.outputChannel.appendLine(`DevFlow CLI found at: ${this.cliPath}`);
        }
    }

    async runAgent(
        input: string,
        options?: { model?: string; planFirst?: boolean },
        progress?: ProgressReporter
    ): Promise<ApiResponse<AgentResult>> {
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
        } catch (error) {
            const formatted = formatError(error);
            this.outputChannel.appendLine(`Error: ${formatted.code} - ${formatted.message}`);
            return {
                success: false,
                error: formatted,
                timestamp: new Date().toISOString(),
            };
        }
    }

    async generateRepoMap(progress?: ProgressReporter): Promise<ApiResponse<string>> {
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
        } catch (error) {
            const formatted = formatError(error);
            this.outputChannel.appendLine(`Error: ${formatted.code} - ${formatted.message}`);
            return {
                success: false,
                error: formatted,
                timestamp: new Date().toISOString(),
            };
        }
    }

    async listPlugins(): Promise<ApiResponse<PluginInfo[]>> {
        try {
            const output = await this.exec(['plugins', 'list']);
            const plugins = this.parsePluginList(output);
            return {
                success: true,
                data: plugins,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            const formatted = formatError(error);
            this.outputChannel.appendLine(`Error: ${formatted.code} - ${formatted.message}`);
            return {
                success: false,
                error: formatted,
                timestamp: new Date().toISOString(),
            };
        }
    }

    async listMCPServices(): Promise<ApiResponse<MCPServiceInfo[]>> {
        try {
            const output = await this.exec(['mcp', 'list']);
            const services = this.parseMCPList(output);
            return {
                success: true,
                data: services,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            const formatted = formatError(error);
            this.outputChannel.appendLine(`Error: ${formatted.code} - ${formatted.message}`);
            return {
                success: false,
                error: formatted,
                timestamp: new Date().toISOString(),
            };
        }
    }

    async enableMCP(name: string): Promise<ApiResponse<void>> {
        try {
            await this.exec(['mcp', 'enable', name]);
            return {
                success: true,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            const formatted = formatError(error);
            this.outputChannel.appendLine(`Error: ${formatted.code} - ${formatted.message}`);
            return {
                success: false,
                error: formatted,
                timestamp: new Date().toISOString(),
            };
        }
    }

    async disableMCP(name: string): Promise<ApiResponse<void>> {
        try {
            await this.exec(['mcp', 'disable', name]);
            return {
                success: true,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            const formatted = formatError(error);
            this.outputChannel.appendLine(`Error: ${formatted.code} - ${formatted.message}`);
            return {
                success: false,
                error: formatted,
                timestamp: new Date().toISOString(),
            };
        }
    }

    async gitCheckpoint(message?: string): Promise<ApiResponse<string>> {
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
        } catch (error) {
            const formatted = formatError(error);
            this.outputChannel.appendLine(`Error: ${formatted.code} - ${formatted.message}`);
            return {
                success: false,
                error: formatted,
                timestamp: new Date().toISOString(),
            };
        }
    }

    async gitUndo(): Promise<ApiResponse<string>> {
        try {
            const output = await this.exec(['git', 'undo']);
            return {
                success: true,
                data: output,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            const formatted = formatError(error);
            this.outputChannel.appendLine(`Error: ${formatted.code} - ${formatted.message}`);
            return {
                success: false,
                error: formatted,
                timestamp: new Date().toISOString(),
            };
        }
    }

    async chat(message: string): Promise<ApiResponse<string>> {
        try {
            const output = await this.exec(['chat', message]);
            return {
                success: true,
                data: output,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            const formatted = formatError(error);
            this.outputChannel.appendLine(`Error: ${formatted.code} - ${formatted.message}`);
            return {
                success: false,
                error: formatted,
                timestamp: new Date().toISOString(),
            };
        }
    }

    private exec(args: string[]): Promise<string> {
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
                } else {
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

    private findCliPath(): string | null {
        const config = vscode.workspace.getConfiguration('devflow');
        const configPath = config.get<string>('cliPath');

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
            } catch {
                // Continue checking other paths
            }
        }

        return null;
    }

    private checkCommandExists(cmd: string): boolean {
        try {
            const result = cp.execSync(`which ${cmd}`, { encoding: 'utf-8' });
            return !!result;
        } catch {
            return false;
        }
    }

    private parsePluginList(output: string): PluginInfo[] {
        const plugins: PluginInfo[] = [];
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

    private parseMCPList(output: string): MCPServiceInfo[] {
        const services: MCPServiceInfo[] = [];
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

    dispose(): void {
        this.outputChannel.dispose();
    }
}
