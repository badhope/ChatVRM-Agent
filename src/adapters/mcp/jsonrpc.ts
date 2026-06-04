/**
 * JSON-RPC 2.0 framing utilities for MCP.
 *
 * MCP rides on standard JSON-RPC 2.0 with a handful of conventions:
 *   - every request gets a unique `id` (we use monotonically increasing
 *     integers, kept in the {@link JsonRpcClient})
 *   - notifications have no `id` and no response
 *   - responses carry either `result` or `error` (with `code`, `message`)
 *
 * This module is transport-agnostic: it just turns (method, params)
 * into the right wire objects and validates incoming ones.
 */

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: number | string;
  result: unknown;
}

export interface JsonRpcError {
  jsonrpc: '2.0';
  id: number | string | null;
  error: { code: number; message: string; data?: unknown };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

export const JSONRPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // MCP-specific range: -32000 to -32099
  SERVER_NOT_INITIALIZED: -32002,
} as const;

export class JsonRpcErrorException extends Error {
  code: number;
  data: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

export function isResponse(m: JsonRpcMessage): m is JsonRpcResponse {
  return 'id' in m && ('result' in m || 'error' in m);
}

export function isRequest(m: JsonRpcMessage): m is JsonRpcRequest {
  return 'id' in m && 'method' in m && !('result' in m) && !('error' in m);
}

export function isNotification(m: JsonRpcMessage): m is JsonRpcNotification {
  return !('id' in m) && 'method' in m;
}
