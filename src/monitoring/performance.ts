import { createLogger, Logger } from '../services/logger.js';
import { EventEmitter } from 'eventemitter3';
import * as os from 'os';
import * as fs from 'fs';

export interface MetricData {
  name: string;
  value: number;
  unit?: string;
  tags?: Record<string, string>;
  timestamp: number;
}

export interface PerformanceSnapshot {
  timestamp: number;
  cpu: CPUMetrics;
  memory: MemoryMetrics;
  eventLoop: EventLoopMetrics;
  gc?: GCMetrics;
  network?: NetworkMetrics;
}

export interface CPUMetrics {
  usage: number;
  userTime: number;
  systemTime: number;
  cores: number;
}

export interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  heapLimit: number;
  rss: number;
  external: number;
  arrayBuffers: number;
}

export interface EventLoopMetrics {
  lag: number;
  latency: {
    min: number;
    max: number;
    avg: number;
  };
  paused: boolean;
}

export interface GCMetrics {
  type: 'Scavenge' | 'MarkSweep' | 'MarkSweepCompact' | 'Incremental';
  duration: number;
  before?: number;
  after?: number;
}

export interface NetworkMetrics {
  requests: number;
  responses: number;
  errors: number;
  bytesIn: number;
  bytesOut: number;
}

export interface Alert {
  id: string;
  level: AlertLevel;
  message: string;
  metric: string;
  threshold: number;
  currentValue: number;
  timestamp: number;
  resolved: boolean;
}

export enum AlertLevel {
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
  Critical = 'critical'
}

export interface DashboardConfig {
  refreshInterval: number;
  historySize: number;
  alertThresholds: Record<string, number>;
}

export interface TrendData {
  metric: string;
  dataPoints: Array<{ timestamp: number; value: number }>;
  trend: 'increasing' | 'decreasing' | 'stable';
  changePercent: number;
}

export class PerformanceMonitor extends EventEmitter {
  private logger: Logger;
  private metrics: Map<string, MetricData[]> = new Map();
  private snapshots: PerformanceSnapshot[] = [];
  private alerts: Alert[] = [];
  private config: DashboardConfig;
  private collectionInterval: NodeJS.Timeout | null = null;
  private isCollecting = false;
  private eventLoopLagHistory: number[] = [];
  private maxHistorySize = 3600;
  private alertIdCounter = 0;

  constructor(config?: Partial<DashboardConfig>) {
    super();
    this.logger = createLogger('PerformanceMonitor');
    
    this.config = {
      refreshInterval: config?.refreshInterval || 5000,
      historySize: config?.historySize || 3600,
      alertThresholds: {
        cpuUsage: 80,
        memoryUsage: 85,
        eventLoopLag: 50,
        responseTime: 1000,
        ...config?.alertThresholds
      }
    };

    this.logger.info({ config: this.config }, 'Performance monitor initialized');
  }

  public start(): void {
    if (this.isCollecting) {
      this.logger.warn('Performance monitoring already running');
      return;
    }

    this.isCollecting = true;
    this.collectSnapshot();
    
    this.collectionInterval = setInterval(() => {
      this.collectSnapshot();
    }, this.config.refreshInterval);

    this.logger.info('Performance monitoring started');
    this.emit('started');
  }

  public stop(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }
    
    this.isCollecting = false;
    this.logger.info('Performance monitoring stopped');
    this.emit('stopped');
  }

  private collectSnapshot(): void {
    try {
      const snapshot = this.createSnapshot();
      this.snapshots.push(snapshot);

      if (this.snapshots.length > this.config.historySize) {
        this.snapshots.shift();
      }

      this.checkAlerts(snapshot);
      this.emit('snapshot', snapshot);
    } catch (error) {
      this.logger.error({ error }, 'Failed to collect snapshot');
    }
  }

  private createSnapshot(): PerformanceSnapshot {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    let eventLoopLag = 0;
    const before = process.hrtime.bigint();
    setImmediate(() => {
      const diff = Number(process.hrtime.bigint() - before);
      eventLoopLag = diff / 1_000_000;
    });
    
    setTimeout(() => {}, 0).unref();

    this.eventLoopLagHistory.push(eventLoopLag);
    if (this.eventLoopLagHistory.length > 100) {
      this.eventLoopLagHistory.shift();
    }

    const snapshot: PerformanceSnapshot = {
      timestamp: Date.now(),
      cpu: {
        usage: this.calculateCPUUsage(cpuUsage),
        userTime: cpuUsage.user,
        systemTime: cpuUsage.system,
        cores: os.cpus().length
      },
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        heapLimit: 0,
        rss: memoryUsage.rss,
        external: memoryUsage.external,
        arrayBuffers: 0
      },
      eventLoop: {
        lag: eventLoopLag,
        latency: this.calculateLatencyStats(),
        paused: false
      }
    };

    return snapshot;
  }

  private calculateCPUUsage(usage: { user: number; system: number }): number {
    const total = usage.user + usage.system;
    return Math.min(100, total / 1_000_000);
  }

  private calculateLatencyStats(): EventLoopMetrics['latency'] {
    if (this.eventLoopLagHistory.length === 0) {
      return { min: 0, max: 0, avg: 0 };
    }

    const sorted = [...this.eventLoopLagHistory].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / sorted.length
    };
  }

  private checkAlerts(snapshot: PerformanceSnapshot): void {
    const thresholds = this.config.alertThresholds;

    if (snapshot.cpu.usage > thresholds.cpuUsage) {
      this.createAlert(
        AlertLevel.Warning,
        'CPU usage exceeded threshold',
        'cpuUsage',
        thresholds.cpuUsage,
        snapshot.cpu.usage
      );
    }

    const memoryPercent = (snapshot.memory.heapUsed / snapshot.memory.heapTotal) * 100;
    if (memoryPercent > thresholds.memoryUsage) {
      this.createAlert(
        AlertLevel.Error,
        'Memory usage exceeded threshold',
        'memoryUsage',
        thresholds.memoryUsage,
        memoryPercent
      );
    }

    if (snapshot.eventLoop.lag > thresholds.eventLoopLag) {
      this.createAlert(
        AlertLevel.Warning,
        'Event loop lag exceeded threshold',
        'eventLoopLag',
        thresholds.eventLoopLag,
        snapshot.eventLoop.lag
      );
    }
  }

  private createAlert(
    level: AlertLevel,
    message: string,
    metric: string,
    threshold: number,
    currentValue: number
  ): void {
    const existingAlert = this.alerts.find(
      a => a.metric === metric && !a.resolved && a.level === level
    );

    if (existingAlert) {
      return;
    }

    const alert: Alert = {
      id: `alert-${++this.alertIdCounter}`,
      level,
      message,
      metric,
      threshold,
      currentValue,
      timestamp: Date.now(),
      resolved: false
    };

    this.alerts.push(alert);
    this.logger.warn({ alert }, 'Alert created');
    this.emit('alert', alert);
  }

  public recordMetric(name: string, value: number, unit?: string, tags?: Record<string, string>): void {
    const metric: MetricData = {
      name,
      value,
      unit,
      tags,
      timestamp: Date.now()
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metricHistory = this.metrics.get(name)!;
    metricHistory.push(metric);

    if (metricHistory.length > this.maxHistorySize) {
      metricHistory.shift();
    }

    this.emit('metric', metric);
  }

  public getCurrentMetrics(): PerformanceSnapshot {
    return this.snapshots[this.snapshots.length - 1] || this.createSnapshot();
  }

  public getMetricHistory(name: string, duration?: number): MetricData[] {
    const history = this.metrics.get(name) || [];
    
    if (!duration) {
      return history;
    }

    const cutoff = Date.now() - duration;
    return history.filter(m => m.timestamp >= cutoff);
  }

  public getSnapshots(duration?: number): PerformanceSnapshot[] {
    if (!duration) {
      return this.snapshots;
    }

    const cutoff = Date.now() - duration;
    return this.snapshots.filter(s => s.timestamp >= cutoff);
  }

  public getAlerts(resolved?: boolean): Alert[] {
    if (resolved === undefined) {
      return this.alerts;
    }
    return this.alerts.filter(a => a.resolved === resolved);
  }

  public resolveAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      this.logger.info({ alertId }, 'Alert resolved');
      this.emit('alert:resolved', alert);
    }
  }

  public clearResolvedAlerts(): void {
    const before = this.alerts.length;
    this.alerts = this.alerts.filter(a => !a.resolved);
    this.logger.info({ cleared: before - this.alerts.length }, 'Resolved alerts cleared');
  }

  public getDashboardData(): {
    current: PerformanceSnapshot;
    trends: TrendData[];
    alerts: Alert[];
    summary: {
      uptime: number;
      avgCPU: number;
      avgMemory: number;
      peakMemory: number;
      totalAlerts: number;
    };
  } {
    const current = this.getCurrentMetrics();
    const recentSnapshots = this.getSnapshots(60000);

    const avgCPU = recentSnapshots.length > 0
      ? recentSnapshots.reduce((sum, s) => sum + s.cpu.usage, 0) / recentSnapshots.length
      : 0;

    const memoryValues = recentSnapshots.map(s => s.memory.heapUsed);
    const avgMemory = memoryValues.length > 0
      ? memoryValues.reduce((sum, v) => sum + v, 0) / memoryValues.length
      : 0;
    const peakMemory = memoryValues.length > 0
      ? Math.max(...memoryValues)
      : 0;

    const trends: TrendData[] = [
      this.calculateTrend('CPU', recentSnapshots.map(s => ({ timestamp: s.timestamp, value: s.cpu.usage }))),
      this.calculateTrend('Memory', recentSnapshots.map(s => ({ timestamp: s.timestamp, value: s.memory.heapUsed }))),
      this.calculateTrend('EventLoop', recentSnapshots.map(s => ({ timestamp: s.timestamp, value: s.eventLoop.lag })))
    ];

    return {
      current,
      trends,
      alerts: this.getAlerts(false),
      summary: {
        uptime: Date.now() - (this.snapshots[0]?.timestamp || Date.now()),
        avgCPU,
        avgMemory,
        peakMemory,
        totalAlerts: this.alerts.length
      }
    };
  }

  private calculateTrend(
    metric: string,
    dataPoints: Array<{ timestamp: number; value: number }>
  ): TrendData {
    if (dataPoints.length < 2) {
      return {
        metric,
        dataPoints,
        trend: 'stable',
        changePercent: 0
      };
    }

    const firstValue = dataPoints[0].value;
    const lastValue = dataPoints[dataPoints.length - 1].value;
    
    const changePercent = firstValue !== 0 
      ? ((lastValue - firstValue) / firstValue) * 100 
      : 0;

    let trend: TrendData['trend'] = 'stable';
    if (changePercent > 5) trend = 'increasing';
    else if (changePercent < -5) trend = 'decreasing';

    return {
      metric,
      dataPoints,
      trend,
      changePercent
    };
  }

  public generateReport(format: 'json' | 'text' | 'markdown' = 'json'): string {
    const data = this.getDashboardData();

    switch (format) {
      case 'text':
        return this.generateTextReport(data);
      case 'markdown':
        return this.generateMarkdownReport(data);
      case 'json':
      default:
        return JSON.stringify(data, null, 2);
    }
  }

  private generateTextReport(data: any): string {
    const lines = [
      '=== Performance Report ===',
      `Time: ${new Date().toISOString()}`,
      '',
      'Current Metrics:',
      `  CPU: ${data.current.cpu.usage.toFixed(2)}%`,
      `  Memory: ${(data.current.memory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      `  Event Loop Lag: ${data.current.eventLoop.lag.toFixed(2)} ms`,
      '',
      'Summary:',
      `  Avg CPU: ${data.summary.avgCPU.toFixed(2)}%`,
      `  Avg Memory: ${(data.summary.avgMemory / 1024 / 1024).toFixed(2)} MB`,
      `  Peak Memory: ${(data.summary.peakMemory / 1024 / 1024).toFixed(2)} MB`,
      `  Active Alerts: ${data.alerts.length}`,
      ''
    ];

    if (data.alerts.length > 0) {
      lines.push('Active Alerts:');
      for (const alert of data.alerts) {
        lines.push(`  [${alert.level.toUpperCase()}] ${alert.message} (${alert.currentValue.toFixed(2)})`);
      }
    }

    return lines.join('\n');
  }

  private generateMarkdownReport(data: any): string {
    const lines = [
      '# Performance Report',
      '',
      `**Generated:** ${new Date().toISOString()}`,
      '',
      '## Current Metrics',
      '',
      '| Metric | Value |',
      '|--------|-------|',
      `| CPU Usage | ${data.current.cpu.usage.toFixed(2)}% |`,
      `| Memory Used | ${(data.current.memory.heapUsed / 1024 / 1024).toFixed(2)} MB |`,
      `| Memory Total | ${(data.current.memory.heapTotal / 1024 / 1024).toFixed(2)} MB |`,
      `| Event Loop Lag | ${data.current.eventLoop.lag.toFixed(2)} ms |`,
      '',
      '## Summary',
      '',
      '| Statistic | Value |',
      '|-----------|-------|',
      `| Uptime | ${Math.floor(data.summary.uptime / 1000)}s |`,
      `| Avg CPU | ${data.summary.avgCPU.toFixed(2)}% |`,
      `| Avg Memory | ${(data.summary.avgMemory / 1024 / 1024).toFixed(2)} MB |`,
      `| Peak Memory | ${(data.summary.peakMemory / 1024 / 1024).toFixed(2)} MB |`,
      `| Total Alerts | ${data.summary.totalAlerts} |`
    ];

    if (data.alerts.length > 0) {
      lines.push('', '## Active Alerts', '');
      lines.push('| Level | Message | Value | Time |');
      lines.push('|------|---------|-------|------|');
      
      for (const alert of data.alerts) {
        const time = new Date(alert.timestamp).toLocaleTimeString();
        lines.push(`| ${alert.level.toUpperCase()} | ${alert.message} | ${alert.currentValue.toFixed(2)} | ${time} |`);
      }
    }

    lines.push('', '## Trends', '');
    lines.push('| Metric | Trend | Change |');
    lines.push('|--------|-------|--------|');
    
    for (const trend of data.trends) {
      const emoji = trend.trend === 'increasing' ? '📈' : trend.trend === 'decreasing' ? '📉' : '➡️';
      lines.push(`| ${trend.metric} | ${emoji} ${trend.trend} | ${trend.changePercent.toFixed(2)}% |`);
    }

    return lines.join('\n');
  }

  public exportMetrics(filename: string): void {
    const data = {
      snapshots: this.snapshots,
      metrics: Object.fromEntries(this.metrics),
      alerts: this.alerts,
      exportedAt: new Date().toISOString()
    };

    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    this.logger.info({ filename, size: data.snapshots.length }, 'Metrics exported');
  }

  public destroy(): void {
    this.stop();
    this.metrics.clear();
    this.snapshots = [];
    this.alerts = [];
    this.logger.info('Performance monitor destroyed');
  }
}

export default PerformanceMonitor;
