import type { ApiResponse, AgentResult } from '../types/index.js';

// API Types
export interface Plugin {
  name: string;
  enabled: boolean;
  description?: string;
}

export interface MCPService {
  name: string;
  enabled: boolean;
  description?: string;
}

export interface Settings {
  model: string;
  autoCheckpoint: boolean;
  maxTokens: number;
  temperature: number;
  workspace: string;
}

// API State Types
export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: { code: string; message: string; details?: any } | null;
}

// API Client with unified error handling
const API_BASE = '/api';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: Record<string, any>) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} not found`, 404);
  }
}

export class NetworkError extends ApiError {
  constructor(message: string, details?: Record<string, any>) {
    super('NETWORK_ERROR', message, 0, details);
  }
}

// Format error to unified format
function formatApiError(error: unknown): { code: string; message: string; details?: any } {
  if (error instanceof ApiError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  if (error instanceof Error) {
    return { code: 'UNKNOWN_ERROR', message: error.message };
  }
  return { code: 'UNKNOWN_ERROR', message: String(error) };
}

// Parse API response and handle errors
function parseResponse<T>(response: ApiResponse<T>): T {
  if (!response.success) {
    const errorInfo = response.error || { code: 'ERROR', message: 'Unknown error' };
    throw new ApiError(errorInfo.code, errorInfo.message, 0, errorInfo.details);
  }
  if (response.data === undefined) {
    throw new ApiError('INVALID_RESPONSE', 'Response missing data', 0);
  }
  return response.data;
}

// Fetch with error handling
async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  } catch (err) {
    throw new NetworkError(`Network request failed: ${(err as Error).message}`);
  }

  if (!response.ok) {
    let errorBody: { code?: string; message?: string; details?: any } = {};
    try {
      const text = await response.text();
      const parsed = JSON.parse(text);
      if (parsed.error) {
        errorBody = parsed.error;
      } else if (parsed.message) {
        errorBody.message = parsed.message;
      }
    } catch {
      // Use status text if parsing fails
      errorBody.message = response.statusText;
    }

    const code = errorBody.code || `HTTP_${response.status}`;
    const message = errorBody.message || `HTTP Error ${response.status}`;

    if (response.status === 400) {
      throw new ValidationError(message, errorBody.details);
    } else if (response.status === 404) {
      throw new NotFoundError(message);
    } else {
      throw new ApiError(code, message, response.status, errorBody.details);
    }
  }

  return response.json();
}

// Create initial state
export function createInitialState<T>(): ApiState<T> {
  return {
    data: null,
    loading: false,
    error: null,
  };
}

// API Functions with unified error handling

export async function runAgent(input: string): Promise<ApiResponse<AgentResult>> {
  try {
    const response = await fetchJSON<ApiResponse<{ output: string }>>(`${API_BASE}/agent/run`, {
      method: 'POST',
      body: JSON.stringify({ input }),
    });
    const data = parseResponse(response);
    return {
      success: true,
      data: {
        success: true,
        output: data.output,
        steps: [],
        changedFiles: [],
        duration: 0,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: formatApiError(error),
      timestamp: new Date().toISOString(),
    };
  }
}

export async function generateRepoMap(): Promise<ApiResponse<string>> {
  try {
    const response = await fetchJSON<ApiResponse<{ map: string }>>(`${API_BASE}/repo-map`);
    const data = parseResponse(response);
    return {
      success: true,
      data: data.map,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: formatApiError(error),
      timestamp: new Date().toISOString(),
    };
  }
}

export async function listPlugins(): Promise<ApiResponse<Plugin[]>> {
  try {
    const response = await fetchJSON<ApiResponse<Plugin[]>>(`${API_BASE}/plugins`);
    const data = parseResponse(response);
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: formatApiError(error),
      timestamp: new Date().toISOString(),
    };
  }
}

export async function togglePlugin(name: string, enabled: boolean): Promise<ApiResponse<void>> {
  try {
    await fetchJSON<ApiResponse<null>>(`${API_BASE}/plugins/${name}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
    return {
      success: true,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: formatApiError(error),
      timestamp: new Date().toISOString(),
    };
  }
}

export async function listMCPServices(): Promise<ApiResponse<MCPService[]>> {
  try {
    const response = await fetchJSON<ApiResponse<MCPService[]>>(`${API_BASE}/mcp`);
    const data = parseResponse(response);
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: formatApiError(error),
      timestamp: new Date().toISOString(),
    };
  }
}

export async function toggleMCPService(name: string, enabled: boolean): Promise<ApiResponse<void>> {
  try {
    await fetchJSON<ApiResponse<null>>(`${API_BASE}/mcp/${name}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
    return {
      success: true,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: formatApiError(error),
      timestamp: new Date().toISOString(),
    };
  }
}

export async function getSettings(): Promise<ApiResponse<Settings>> {
  try {
    const response = await fetchJSON<ApiResponse<Settings>>(`${API_BASE}/settings`);
    const data = parseResponse(response);
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: formatApiError(error),
      timestamp: new Date().toISOString(),
    };
  }
}

export async function updateSettings(settings: Partial<Settings>): Promise<ApiResponse<void>> {
  try {
    await fetchJSON<ApiResponse<null>>(`${API_BASE}/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    return {
      success: true,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: formatApiError(error),
      timestamp: new Date().toISOString(),
    };
  }
}
