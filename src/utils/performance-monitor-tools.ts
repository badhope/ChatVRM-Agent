import type { ToolDefinition, ToolResult } from '../tools/registry.js';
import { createLogger } from '../services/logger.js';
import * as os from 'os';

const logger = createLogger('PerformanceTools');

interface PerformanceMetrics {
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
    cores: number;
  };
  uptime: number;
  timestamp: number;
}

interface PerformanceSnapshot {
  timestamp: number;
  operation: string;
  duration: number;
  memory: number;
}

class PerformanceMonitor {
  private snapshots: Map<string, PerformanceSnapshot[]> = new Map();
  private operationTimers: Map<string, number> = new Map();
  private static instance: PerformanceMonitor;

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  startTimer(label: string): void {
    this.operationTimers.set(label, Date.now());
  }

  endTimer(label: string): number {
    const startTime = this.operationTimers.get(label);
    if (!startTime) {
      return 0;
    }
    const duration = Date.now() - startTime;
    this.operationTimers.delete(label);
    return duration;
  }

  recordSnapshot(operation: string, duration: number, memoryUsage?: number): void {
    if (!this.snapshots.has(operation)) {
      this.snapshots.set(operation, []);
    }

    const snapshots = this.snapshots.get(operation)!;
    snapshots.push({
      timestamp: Date.now(),
      operation,
      duration,
      memory: memoryUsage || process.memoryUsage().heapUsed,
    });

    if (snapshots.length > 100) {
      snapshots.shift();
    }
  }

  getMetrics(): PerformanceMetrics {
    const memUsage = process.memoryUsage();
    const memUsedMB = memUsage.heapUsed / 1024 / 1024;
    const memTotalMB = memUsage.heapTotal / 1024 / 1024;

    return {
      memory: {
        used: Math.round(memUsedMB),
        total: Math.round(memTotalMB),
        percentage: Math.round((memUsedMB / memTotalMB) * 100),
      },
      cpu: {
        usage: Math.round(process.cpuUsage().user / 1000000),
        cores: os.cpus().length,
      },
      uptime: process.uptime(),
      timestamp: Date.now(),
    };
  }

  getSnapshots(operation: string): PerformanceSnapshot[] {
    return this.snapshots.get(operation) || [];
  }

  getStatistics(operation: string): {
    count: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    totalDuration: number;
  } | null {
    const snapshots = this.getSnapshots(operation);
    if (snapshots.length === 0) {
      return null;
    }

    const durations = snapshots.map(s => s.duration);
    return {
      count: snapshots.length,
      avgDuration: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      totalDuration: durations.reduce((a, b) => a + b, 0),
    };
  }

  clear(): void {
    this.snapshots.clear();
    this.operationTimers.clear();
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();

export const systemMetricsTool: ToolDefinition = {
  name: 'system_metrics',
  description: '获取系统性能指标',
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    try {
      const metrics = performanceMonitor.getMetrics();

      return {
        success: true,
        output: `
💻 系统性能指标

🧠 内存使用:
   已使用: ${metrics.memory.used} MB
   总计: ${metrics.memory.total} MB
   使用率: ${metrics.memory.percentage}%

⚙️ CPU信息:
   核心数: ${metrics.cpu.cores}
   用户时间: ${metrics.cpu.usage}秒

⏱️ 系统运行时间: ${Math.floor(metrics.uptime / 60)}分钟

🖥️ 系统信息:
   平台: ${os.platform()}
   CPU架构: ${os.arch()}
   负载: ${os.loadavg().map((l: number) => l.toFixed(2)).join(', ')}
   总内存: ${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB
   可用内存: ${Math.round(os.freemem() / 1024 / 1024 / 1024)} GB
        `.trim(),
      };
    } catch (error) {
      return { success: false, output: '', error: `获取性能指标失败: ${error}` };
    }
  },
};

export const operationMetricsTool: ToolDefinition = {
  name: 'operation_metrics',
  description: '查看特定操作的性能指标',
  parameters: [
    { name: 'operation', type: 'string', description: '操作名称', required: false },
    { name: 'clear', type: 'string', description: '是否清空数据 (true/false)', required: false },
  ],
  execute: async (args: Record<string, string>): Promise<ToolResult> => {
    try {
      if (args.clear === 'true') {
        performanceMonitor.clear();
        return { success: true, output: '✅ 性能数据已清空' };
      }

      if (args.operation) {
        const stats = performanceMonitor.getStatistics(args.operation);
        if (!stats) {
          return { success: true, output: `没有找到操作 "${args.operation}" 的性能数据` };
        }

        return {
          success: true,
          output: `
📊 操作性能统计: ${args.operation}

   执行次数: ${stats.count}
   平均耗时: ${stats.avgDuration}ms
   最短耗时: ${stats.minDuration}ms
   最长耗时: ${stats.maxDuration}ms
   总耗时: ${stats.totalDuration}ms
          `.trim(),
        };
      }

      const operations = Array.from(performanceMonitor['snapshots'].keys());
      if (operations.length === 0) {
        return { success: true, output: '暂无性能数据记录' };
      }

      const summary = operations.map(op => {
        const stats = performanceMonitor.getStatistics(op)!;
        return `${op}: 平均 ${stats.avgDuration}ms (${stats.count}次)`;
      }).join('\n');

      return {
        success: true,
        output: `📊 性能指标汇总:\n\n${summary}`,
      };
    } catch (error: unknown) {
      return { success: false, output: '', error: `获取操作指标失败: ${error}` };
    }
  },
};

export const performanceProfileTool: ToolDefinition = {
  name: 'performance_profile',
  description: '生成性能分析报告',
  parameters: [
    { name: 'operation', type: 'string', description: '要分析的操作名称', required: true },
  ],
  execute: async (args: Record<string, string>): Promise<ToolResult> => {
    try {
      const snapshots = performanceMonitor.getSnapshots(args.operation);
      if (snapshots.length === 0) {
        return { success: true, output: `没有找到操作 "${args.operation}" 的性能数据` };
      }

      const durations = snapshots.map(s => s.duration);
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const memoryUsages = snapshots.map(s => s.memory);
      const avgMemory = memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length;

      const sorted = [...durations].sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];

      const trend = analyzeTrend(snapshots);

      return {
        success: true,
        output: `
🎯 性能分析报告: ${args.operation}

📈 统计摘要:
   执行次数: ${snapshots.length}
   平均耗时: ${avgDuration.toFixed(2)}ms
   内存使用: ${(avgMemory / 1024 / 1024).toFixed(2)}MB

📊 耗时分布:
   P50: ${p50}ms
   P95: ${p95}ms
   P99: ${p99}ms
   最小: ${Math.min(...durations)}ms
   最大: ${Math.max(...durations)}ms

📉 趋势分析:
   ${trend}

${generateRecommendations(avgDuration, p95, memoryUsages)}
        `.trim(),
      };
    } catch (error) {
      return { success: false, output: '', error: `生成性能报告失败: ${error}` };
    }
  },
};

function analyzeTrend(snapshots: PerformanceSnapshot[]): string {
  if (snapshots.length < 3) {
    return '数据不足，无法分析趋势';
  }

  const recent = snapshots.slice(-5);
  const older = snapshots.slice(-10, -5);

  if (older.length === 0) {
    return '最近5次执行暂无明显趋势';
  }

  const recentAvg = recent.map(s => s.duration).reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.map(s => s.duration).reduce((a, b) => a + b, 0) / older.length;

  const change = ((recentAvg - olderAvg) / olderAvg) * 100;

  if (change > 10) {
    return `⚠️ 性能下降: 耗时增加 ${Math.abs(change).toFixed(1)}%`;
  } else if (change < -10) {
    return `✅ 性能提升: 耗时减少 ${Math.abs(change).toFixed(1)}%`;
  } else {
    return `➡️ 性能稳定: 耗时变化 ${change.toFixed(1)}%`;
  }
}

function generateRecommendations(avgDuration: number, p95: number, memoryUsages: number[]): string {
  const recommendations: string[] = [];

  if (avgDuration > 1000) {
    recommendations.push('💡 平均耗时较高(>1s)，建议优化算法或增加缓存');
  }

  if (p95 / avgDuration > 2) {
    recommendations.push('💡 P95与平均值差异大，存在性能抖动，考虑排查异常情况');
  }

  const maxMemory = Math.max(...memoryUsages);
  if (maxMemory > 100 * 1024 * 1024) {
    recommendations.push('💡 内存使用峰值较高(>100MB)，建议优化内存占用');
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ 性能表现良好，无需特别优化');
  }

  return '\n' + recommendations.join('\n');
}
