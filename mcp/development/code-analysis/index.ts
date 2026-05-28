/**
 * 代码分析工具包
 * 提供代码分析功能，基于 ts-morph
 */

import path from 'path';
import { TsMorphSymbolExtractor } from '../../../src/parser/ts-morph-extractor.js';
import type { MCPToolPackage, MCPToolDefinition, MCPToolResult } from '../../../src/types/mcp.js';

/**
 * 查找代码符号
 */
const findSymbolTool: MCPToolDefinition = {
  name: 'find_symbol',
  description: '查找代码符号',
  category: 'development',
  version: '1.0.0',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: '文件或目录路径',
      required: true,
    },
    {
      name: 'name',
      type: 'string',
      description: '符号名称（可选，模糊匹配）',
      required: false,
    },
    {
      name: 'kind',
      type: 'string',
      description: '符号类型（class, function, interface, type 等）',
      required: false,
    },
  ],
  execute: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    try {
      const filePath = path.resolve(args.path as string);
      const symbolName = args.name as string;
      const symbolKind = args.kind as string;

      const extractor = new TsMorphSymbolExtractor();
      const result = await extractor.parseFile(filePath);

      let symbols = result.symbols;

      if (symbolName) {
        symbols = symbols.filter(s => s.name.toLowerCase().includes(symbolName.toLowerCase()));
      }

      if (symbolKind) {
        symbols = symbols.filter(s => s.kind === symbolKind);
      }

      return {
        success: true,
        output: JSON.stringify(symbols, null, 2),
        data: { symbols, count: symbols.length },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: `Failed to find symbols: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * 获取函数信息
 */
const getFunctionInfoTool: MCPToolDefinition = {
  name: 'get_function_info',
  description: '获取函数详细信息',
  category: 'development',
  version: '1.0.0',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: '文件路径',
      required: true,
    },
    {
      name: 'functionName',
      type: 'string',
      description: '函数名称',
      required: true,
    },
  ],
  execute: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    try {
      const filePath = path.resolve(args.path as string);
      const funcName = args.functionName as string;

      const extractor = new TsMorphSymbolExtractor();
      const result = await extractor.parseFile(filePath);

      const func = result.symbols.find(s => s.kind === 'function' && s.name === funcName);

      if (!func) {
        return {
          success: false,
          error: `Function ${funcName} not found`,
        };
      }

      return {
        success: true,
        output: JSON.stringify(func, null, 2),
        data: func,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: `Failed to get function info: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * 获取类信息
 */
const getClassInfoTool: MCPToolDefinition = {
  name: 'get_class_info',
  description: '获取类详细信息',
  category: 'development',
  version: '1.0.0',
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: '文件路径',
      required: true,
    },
    {
      name: 'className',
      type: 'string',
      description: '类名称',
      required: true,
    },
  ],
  execute: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
    try {
      const filePath = path.resolve(args.path as string);
      const clsName = args.className as string;

      const extractor = new TsMorphSymbolExtractor();
      const result = await extractor.parseFile(filePath);

      const cls = result.symbols.find(s => s.kind === 'class' && s.name === clsName);

      if (!cls) {
        return {
          success: false,
          error: `Class ${clsName} not found`,
        };
      }

      return {
        success: true,
        output: JSON.stringify(cls, null, 2),
        data: cls,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: `Failed to get class info: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

/**
 * 工具包定义
 */
const codeAnalysisPackage: MCPToolPackage = {
  name: 'code-analysis',
  version: '1.0.0',
  description: '代码分析工具包，提供符号查找、函数信息、类信息等功能',
  category: 'development',
  author: 'Personal Assistant',
  tools: [
    findSymbolTool,
    getFunctionInfoTool,
    getClassInfoTool,
  ],
  dependencies: [],
};

export default codeAnalysisPackage;
