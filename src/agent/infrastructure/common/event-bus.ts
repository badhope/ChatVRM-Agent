/**
 * 跨平台事件总线
 * 支持浏览器和Node.js环境
 */

type EventHandler = (data: unknown) => void;

class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  /**
   * 注册事件监听器
   */
  on(eventName: string, handler: EventHandler): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, new Set());
    }
    this.handlers.get(eventName)!.add(handler);
  }

  /**
   * 移除事件监听器
   */
  off(eventName: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventName);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(eventName);
      }
    }
  }

  /**
   * 触发事件
   */
  emit(eventName: string, data: unknown): void {
    const handlers = this.handlers.get(eventName);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${eventName}:`, error);
        }
      }
    }
  }

  /**
   * 检查是否有监听器
   */
  hasListeners(eventName: string): boolean {
    return this.handlers.has(eventName) && this.handlers.get(eventName)!.size > 0;
  }

  /**
   * 清除所有监听器
   */
  clear(): void {
    this.handlers.clear();
  }
}

// 创建单例实例
export const eventBus = new EventBus();

export default eventBus;
