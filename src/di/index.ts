// ============================================================
// 依赖注入模块 - Barrel 导出
// ============================================================

// 必须先导入 reflect-metadata 以支持装饰器
import 'reflect-metadata';

// 导出令牌定义
export { TOKENS, type TokenType } from './tokens.js';

// 导出容器和注册函数
export {
  container,
  registerCoreServices,
  registerServices,
  initializeContainer,
  getConfigManager,
  getMemoryManager,
  getGitManager,
  getToolRegistry,
  getPluginLoader,
  getHistoryManager,
} from './container.js';
