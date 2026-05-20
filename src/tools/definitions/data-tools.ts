import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import type { ToolDefinition } from '../registry.js';
import { validatePath } from '../security.js';
import { getErrorMessage } from '../../utils/error-handling.js';

// ==================== JSON 类型定义 ====================

/**
 * JSON 值类型 - 表示有效的 JSON 值
 */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonPrimitive = string | number | boolean | null;
export interface JsonObject { [key: string]: JsonValue }
export interface JsonArray extends Array<JsonValue> {}

// ==================== 辅助函数 ====================

function validateUrl(url: string): void {
  const parsed = new URL(url);

  // 只允许 http 和 https
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Access denied: only http and https protocols are allowed');
  }

  // 完整的私有IP检查
  const hostname = parsed.hostname.toLowerCase();

  // 阻止 localhost 和回环地址
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
    throw new Error('Access denied: cannot access localhost or loopback addresses');
  }

  // 阻止 IPv4 私有地址段
  if (hostname.startsWith('10.') ||
      hostname.startsWith('172.16.') || hostname.startsWith('172.17.') ||
      hostname.startsWith('172.18.') || hostname.startsWith('172.19.') ||
      hostname.startsWith('172.20.') || hostname.startsWith('172.21.') ||
      hostname.startsWith('172.22.') || hostname.startsWith('172.23.') ||
      hostname.startsWith('172.24.') || hostname.startsWith('172.25.') ||
      hostname.startsWith('172.26.') || hostname.startsWith('172.27.') ||
      hostname.startsWith('172.28.') || hostname.startsWith('172.29.') ||
      hostname.startsWith('172.30.') || hostname.startsWith('172.31.') ||
      hostname.startsWith('192.168.')) {
    throw new Error('Access denied: cannot access private IP ranges');
  }

  // 阻止链路本地地址 (169.254.x.x)
  if (hostname.startsWith('169.254.')) {
    throw new Error('Access denied: cannot access link-local addresses');
  }

  // 阻止 IPv6 私有地址
  if (hostname.startsWith('fc00:') || hostname.startsWith('fd') ||
      hostname.startsWith('fe80:') || hostname === '::1') {
    throw new Error('Access denied: cannot access IPv6 private or link-local addresses');
  }

  // 阻止 AWS/GCP/Azure 元数据端点
  if (hostname === '169.254.169.254' ||
      hostname === 'metadata.google.internal' ||
      hostname.includes('.internal.')) {
    throw new Error('Access denied: cannot access cloud metadata endpoints');
  }
}

// ==================== HTML 内容提取辅助函数 ====================

/**
 * 从 HTML 中提取正文内容，转换为简洁的 Markdown
 */
function extractHtmlContent(html: string, url: string): string {
  let text = html;

  // 移除 script 和 style 标签及其内容
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

  // 移除 HTML 注释
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // 将常见块级标签转换为换行
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|pre|section|article|header|footer|nav|main)[^>]*>/gi, '\n');

  // 将行内标签移除
  text = text.replace(/<[^>]+>/g, '');

  // 解码 HTML 实体
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');

  // 将连续多个换行合并为最多两个
  text = text.replace(/\n{3,}/g, '\n\n');

  // 提取 title
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  let result = '';
  if (titleMatch) {
    result += `# ${titleMatch[1].trim()}\n\n`;
  }
  result += `来源: ${url}\n\n`;
  result += text.trim().slice(0, 8000);

  if (text.trim().length > 8000) {
    result += '\n\n[内容过长，已截断]';
  }

  return result;
}

// ==================== HTTP 请求工具 ====================

export const httpTool: ToolDefinition = {
  name: 'http',
  description: '发送 HTTP 请求',
  parameters: [
    { name: 'url', type: 'string', description: '请求 URL', required: true },
    { name: 'method', type: 'string', description: 'HTTP 方法 (GET/POST/PUT/DELETE)', required: false },
    { name: 'body', type: 'string', description: '请求体 (JSON)', required: false },
    { name: 'headers', type: 'string', description: '请求头 (JSON)', required: false },
    { name: 'timeout', type: 'number', description: '超时时间(ms)', required: false },
  ],
  execute: async (args) => {
    try {
      validateUrl(args.url);
      const method = (args.method || 'GET').toUpperCase();
      const timeout = args.timeout ? parseInt(args.timeout, 10) : 10000;
      const headers: Record<string, string> = args.headers
        ? JSON.parse(args.headers)
        : { 'Content-Type': 'application/json' };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const fetchOpts: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (args.body && method !== 'GET') {
        fetchOpts.body = args.body;
      }

      const response = await fetch(args.url, fetchOpts);
      clearTimeout(timer);

      const contentType = response.headers.get('content-type') || '';
      let outputText: string;

      if (contentType.includes('json')) {
        const json = await response.json();
        outputText = JSON.stringify(json, null, 2);
      } else {
        outputText = await response.text();
      }

      // HTML 内容自动提取
      if (contentType.includes('text/html') && outputText.includes('<html')) {
        try {
          outputText = extractHtmlContent(outputText, args.url);
        } catch {
          // 提取失败，返回原始 HTML（截断）
          outputText = outputText.slice(0, 10000) + '\n\n[HTML 内容过长，已截断]';
        }
      }

      return {
        success: response.ok,
        output: `[${response.status} ${response.statusText}]\n\n${outputText.slice(0, 10000)}`,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error: unknown) {
      return { success: false, output: '', error: `请求失败: ${getErrorMessage(error)}` };
    }
  },
};

// ==================== JSON 处理工具 ====================

export const jsonTool: ToolDefinition = {
  name: 'json',
  description: 'JSON 处理（格式化/查询/转换）',
  parameters: [
    { name: 'input', type: 'string', description: 'JSON 字符串或文件路径', required: true },
    { name: 'query', type: 'string', description: 'JSONPath 查询（如 .name, .items[0].id）', required: false },
    { name: 'action', type: 'string', description: '操作: format/query/keys/values/count', required: false },
  ],
  execute: async (args) => {
    try {
      const action = args.action || 'format';
      let jsonStr = args.input;

      // 如果是文件路径，先验证再读取
      if (!jsonStr.startsWith('{') && !jsonStr.startsWith('[') && !jsonStr.startsWith('"')) {
        try {
          const safePath = validatePath(jsonStr);  // 验证路径安全
          const stat = await fs.stat(safePath);
          if (stat.isFile()) {
            // 验证文件大小
            if (stat.size > 5 * 1024 * 1024) {
              return { success: false, output: '', error: 'JSON 文件过大（最大5MB）' };
            }
            jsonStr = await fs.readFile(safePath, 'utf-8');
          }
        } catch (error) {
        // Not a valid file path, treat as string
      }
      }

      const obj = JSON.parse(jsonStr);

      switch (action) {
        case 'format':
          return { success: true, output: JSON.stringify(obj, null, 2) };
        case 'keys':
          return { success: true, output: Object.keys(obj).join('\n') };
        case 'values':
          return { success: true, output: Object.values(obj).map(v => String(v)).join('\n') };
        case 'count':
          if (Array.isArray(obj)) {
            return { success: true, output: `数组长度: ${obj.length}` };
          }
          return { success: true, output: `对象属性数: ${Object.keys(obj).length}` };
        case 'query': {
          if (!args.query) return { success: false, output: '', error: '查询模式需要 --query 参数' };
          const parts = args.query.replace(/^\./, '').split('.');
          let result: JsonValue = obj;
          for (const part of parts) {
            const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
            if (arrayMatch) {
              const objPart = (result as JsonObject)?.[arrayMatch[1]];
              const arr = objPart as JsonArray | undefined;
              result = arr?.[parseInt(arrayMatch[2])] as JsonValue;
            } else {
              result = (result as JsonObject)?.[part] as JsonValue;
            }
            if (result === undefined) break;
          }
          return { success: true, output: typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result) };
        }
        default:
          return { success: true, output: JSON.stringify(obj, null, 2) };
      }
    } catch (error: unknown) {
      return { success: false, output: '', error: `JSON 处理失败: ${getErrorMessage(error)}` };
    }
  },
};

// ==================== 文本处理工具 ====================

export const textTool: ToolDefinition = {
  name: 'text',
  description: '文本处理（统计/替换/提取/排序/去重）',
  parameters: [
    { name: 'input', type: 'string', description: '输入文本', required: true },
    { name: 'action', type: 'string', description: '操作: count/replace/extract/sort/unique/upper/lower/reverse/lines', required: false },
    { name: 'pattern', type: 'string', description: '匹配模式（用于 replace/extract）', required: false },
    { name: 'replacement', type: 'string', description: '替换文本', required: false },
  ],
  execute: async (args) => {
    try {
      const action = args.action || 'count';
      const input = args.input;

      switch (action) {
        case 'count': {
          const chars = input.length;
          const lines = input.split('\n').length;
          const words = input.split(/\s+/).filter(Boolean).length;
          const bytes = Buffer.byteLength(input, 'utf-8');
          return { success: true, output: `字符: ${chars}\n行数: ${lines}\n词数: ${words}\n字节: ${bytes}` };
        }
        case 'replace':
          if (!args.pattern) return { success: false, output: '', error: 'replace 需要 --pattern 参数' };
          return { success: true, output: input.replace(new RegExp(args.pattern, 'g'), args.replacement || '') };
        case 'extract':
          if (!args.pattern) return { success: false, output: '', error: 'extract 需要 --pattern 参数' };
          return { success: true, output: [...input.matchAll(new RegExp(args.pattern, 'g'))].map(m => m[0]).join('\n') };
        case 'sort':
          return { success: true, output: input.split('\n').sort().join('\n') };
        case 'unique':
          return { success: true, output: [...new Set(input.split('\n'))].join('\n') };
        case 'upper':
          return { success: true, output: input.toUpperCase() };
        case 'lower':
          return { success: true, output: input.toLowerCase() };
        case 'reverse':
          return { success: true, output: input.split('\n').reverse().join('\n') };
        case 'lines':
          return { success: true, output: input.split('\n').map((line, i) => `${String(i + 1).padStart(4)} | ${line}`).join('\n') };
        default:
          return { success: true, output: input };
      }
    } catch (error: unknown) {
      return { success: false, output: '', error: `文本处理失败: ${getErrorMessage(error)}` };
    }
  },
};

// ==================== 文件哈希工具 ====================

export const hashTool: ToolDefinition = {
  name: 'hash',
  description: '计算文件或文本的哈希值',
  parameters: [
    { name: 'input', type: 'string', description: '文件路径或文本内容', required: true },
    { name: 'algorithm', type: 'string', description: '哈希算法 (md5/sha1/sha256/sha512)', required: false },
  ],
  execute: async (args) => {
    try {
      const algo = args.algorithm || 'sha256';
      let data: Buffer;

      try {
        const stat = await fs.stat(args.input);
        if (stat.isFile()) {
          data = await fs.readFile(args.input);
        } else {
          data = Buffer.from(args.input);
        }
      } catch {
        data = Buffer.from(args.input);
      }

      const hash = createHash(algo).update(data).digest('hex');
      return { success: true, output: `${algo.toUpperCase()}: ${hash}` };
    } catch (error: unknown) {
      return { success: false, output: '', error: getErrorMessage(error) };
    }
  },
};
