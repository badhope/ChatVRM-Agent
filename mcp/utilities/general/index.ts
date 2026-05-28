/**
 * 通用工具包
 * 提供常用的工具函数
 */

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import type { MCPToolPackage, MCPToolDefinition, MCPToolResult } from '../../../src/types/mcp.js';

/**
 * 获取当前时间
 */
const getCurrentTimeTool: MCPToolDefinition = {
  name: 'get_current_time',
  description: '获取当前时间',
  category: 'utilities',
  version: '1.0.0',
  parameters: [
    {
      name: 'format',
      type: 'string',
      description: '时间格式（ISO 或 timestamp）',
      required: false,
      default: 'ISO',
      enum: ['ISO', 'timestamp'],
    },
  ],
  execute: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const format = (args.format as string) || 'ISO';
    const now = new Date();

    if (format === 'timestamp') {
      return {
        success: true,
        output: String(now.getTime()),
        data: { timestamp: now.getTime() },
      };
    }

    return {
      success: true,
      output: now.toISOString(),
      data: { iso: now.toISOString(), timestamp: now.getTime() },
    };
  },
};

/**
 * 生成 UUID
 */
const generateUuidTool: MCPToolDefinition = {
  name: 'generate_uuid',
  description: '生成 UUID',
  category: 'utilities',
  version: '1.0.0',
  parameters: [
    {
      name: 'count',
      type: 'number',
      description: '生成数量',
      required: false,
      default: 1,
    },
  ],
  execute: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const count = Math.max(1, args.count as number || 1);
    const uuids: string[] = [];

    for (let i = 0; i < count; i++) {
      uuids.push(uuidv4());
    }

    return {
      success: true,
      output: uuids.join('\n'),
      data: { uuids },
    };
  },
};

/**
 * Base64 编码
 */
const base64EncodeTool: MCPToolDefinition = {
  name: 'base64_encode',
  description: 'Base64 编码',
  category: 'utilities',
  version: '1.0.0',
  parameters: [
    {
      name: 'text',
      type: 'string',
      description: '要编码的文本',
      required: true,
    },
  ],
  execute: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const text = args.text as string;
    const encoded = Buffer.from(text).toString('base64');
    return {
      success: true,
      output: encoded,
      data: { encoded },
    };
  },
};

/**
 * Base64 解码
 */
const base64DecodeTool: MCPToolDefinition = {
  name: 'base64_decode',
  description: 'Base64 解码',
  category: 'utilities',
  version: '1.0.0',
  parameters: [
    {
      name: 'encoded',
      type: 'string',
      description: '要解码的 Base64 字符串',
      required: true,
    },
  ],
  execute: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    try {
      const encoded = args.encoded as string;
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      return {
        success: true,
        output: decoded,
        data: { decoded },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: `Failed to decode Base64: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * 计算哈希值
 */
const calculateHashTool: MCPToolDefinition = {
  name: 'calculate_hash',
  description: '计算哈希值',
  category: 'utilities',
  version: '1.0.0',
  parameters: [
    {
      name: 'text',
      type: 'string',
      description: '要计算哈希的文本',
      required: true,
    },
    {
      name: 'algorithm',
      type: 'string',
      description: '哈希算法',
      required: false,
      default: 'sha256',
      enum: ['md5', 'sha1', 'sha256', 'sha512'],
    },
  ],
  execute: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    const text = args.text as string;
    const algorithm = (args.algorithm as string) || 'sha256';
    const hash = crypto.createHash(algorithm).update(text).digest('hex');

    return {
      success: true,
      output: hash,
      data: { hash, algorithm },
    };
  },
};

/**
 * 工具包定义
 */
const generalPackage: MCPToolPackage = {
  name: 'general',
  version: '1.0.0',
  description: '通用工具包，提供时间获取、UUID生成、Base64编解码、哈希计算等功能',
  category: 'utilities',
  author: 'Personal Assistant',
  tools: [
    getCurrentTimeTool,
    generateUuidTool,
    base64EncodeTool,
    base64DecodeTool,
    calculateHashTool,
  ],
  dependencies: [],
};

export default generalPackage;
