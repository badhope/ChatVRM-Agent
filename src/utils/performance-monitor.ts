/**
 * 性能监控工具
 */

export interface PerformanceMetric {
  name: string;
  durationMs: number;
  category: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface PerformanceReport {
  totalMetrics: number;
  averageDuration: number;
  metricsByCategory: Record<string, { count: number; totalDuration: number; averageDuration: number }>;
  slowestMetrics: PerformanceMetric[];
  recentMetrics: PerformanceMetric[];
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics: number = 1000;
  private isEnabled: boolean = true;

  /**
   * 启用/禁用性能监控
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * 开始一个性能测量
   */
  startMeasurement(name: string, category: string = 'general'): () => PerformanceMetric {
    if (!this.isEnabled) {
      return () => ({ name, durationMs: 0, category, timestamp: Date.now() });
    }

    const startTime = performance.now();
    const timestamp = Date.now();

    return (metadata?: Record<string, unknown>): PerformanceMetric => {
      const durationMs = performance.now() - startTime;
      const metric: PerformanceMetric = {
        name,
        durationMs,
        category,
        timestamp,
        metadata,
      };
      this.addMetric(metric);
      return metric;
    };
  }

  /**
   * 添加一个性能指标
   */
  private addMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  /**
   * 生成性能报告
   */
  generateReport(): PerformanceReport {
    if (this.metrics.length === 0) {
      return {
        totalMetrics: 0,
        averageDuration: 0,
        metricsByCategory: {},
        slowestMetrics: [],
        recentMetrics: [],
      };
    }

    // 计算总平均
    const totalDuration = this.metrics.reduce((sum, m) => sum + m.durationMs, 0);
    const averageDuration = totalDuration / this.metrics.length;

    // 按类别统计
    const metricsByCategory: PerformanceReport['metricsByCategory'] = {};
    for (const metric of this.metrics) {
      if (!metricsByCategory[metric.category]) {
        metricsByCategory[metric.category] = { count: 0, totalDuration: 0, averageDuration: 0 };
      }
      metricsByCategory[metric.category].count++;
      metricsByCategory[metric.category].totalDuration += metric.durationMs;
    }

    // 计算类别平均
    for (const category in metricsByCategory) {
      const cat = metricsByCategory[category];
      cat.averageDuration = cat.totalDuration / cat.count;
    }

    // 最慢的指标
    const slowestMetrics = [...this.metrics]
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 10);

    // 最近的指标
    const recentMetrics = [...this.metrics].slice(-10);

    return {
      totalMetrics: this.metrics.length,
      averageDuration,
      metricsByCategory,
      slowestMetrics,
      recentMetrics,
    };
  }

  /**
   * 打印性能报告
   */
  printReport(): void {
    const report = this.generateReport();
    console.log('='.repeat(60));
    console.log('📊 PERFORMANCE REPORT');
    console.log('='.repeat(60));
    console.log(`Total Metrics: ${report.totalMetrics}`);
    console.log(`Average Duration: ${report.averageDuration.toFixed(2)}ms`);
    console.log('');

    console.log('📂 Metrics by Category:');
    for (const [category, data] of Object.entries(report.metricsByCategory)) {
      console.log(
        `  ${category}: ${data.count} calls, avg ${data.averageDuration.toFixed(2)}ms`
      );
    }

    if (report.slowestMetrics.length > 0) {
      console.log('');
      console.log('🐢 Slowest Metrics:');
      for (const metric of report.slowestMetrics) {
        console.log(`  ${metric.name}: ${metric.durationMs.toFixed(2)}ms (${metric.category})`);
      }
    }

    console.log('='.repeat(60));
  }

  /**
   * 测量一个异步函数的执行时间
   */
  async measureAsync<T>(
    name: string,
    category: string,
    fn: () => Promise<T>,
    _metadata?: Record<string, unknown>
  ): Promise<T> {
    const end = this.startMeasurement(name, category);
    try {
      const result = await fn();
      end(); // 先结束测量
      return result;
    } catch (error) {
      end(); // 先结束测量
      throw error;
    }
  }

  /**
   * 测量一个同步函数的执行时间
   */
  measureSync<T>(
    name: string,
    category: string,
    fn: () => T,
    _metadata?: Record<string, unknown>
  ): T {
    const end = this.startMeasurement(name, category);
    try {
      const result = fn();
      end(); // 先结束测量
      return result;
    } catch (error) {
      end(); // 先结束测量
      throw error;
    }
  }

  /**
   * 清空所有指标
   */
  clear(): void {
    this.metrics = [];
  }
}

// 导出单例
export const performanceMonitor = new PerformanceMonitor();
