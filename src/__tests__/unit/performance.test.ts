import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PerformanceMonitor } from '../../monitoring/performance.js';
import type { DashboardConfig } from '../../monitoring/performance.js';

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    monitor = new PerformanceMonitor({
      refreshInterval: 1000,
      historySize: 100
    });
  });

  afterEach(() => {
    monitor.destroy();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const defaultMonitor = new PerformanceMonitor();
      expect(defaultMonitor).toBeDefined();
      defaultMonitor.destroy();
    });

    it('should create instance with custom config', () => {
      const config: Partial<DashboardConfig> = {
        refreshInterval: 5000,
        historySize: 500
      };
      const customMonitor = new PerformanceMonitor(config);
      expect(customMonitor).toBeDefined();
      customMonitor.destroy();
    });

    it('should set alert thresholds', () => {
      const monitorWithAlerts = new PerformanceMonitor({
        alertThresholds: {
          cpuUsage: 90,
          memoryUsage: 95
        }
      });
      expect(monitorWithAlerts).toBeDefined();
      monitorWithAlerts.destroy();
    });
  });

  describe('start/stop', () => {
    it('should start monitoring', () => {
      const startSpy = vi.fn();
      monitor.on('started', startSpy);
      
      monitor.start();
      vi.advanceTimersByTime(2000);
      
      expect(startSpy).toHaveBeenCalled();
    });

    it('should not start twice', () => {
      const startSpy = vi.fn();
      monitor.on('started', startSpy);
      
      monitor.start();
      monitor.start();
      
      expect(startSpy).toHaveBeenCalledTimes(1);
    });

    it('should stop monitoring', () => {
      const stopSpy = vi.fn();
      monitor.on('stopped', stopSpy);
      
      monitor.start();
      monitor.stop();
      
      expect(stopSpy).toHaveBeenCalled();
    });
  });

  describe('metrics', () => {
    it('should record metrics', () => {
      const metricSpy = vi.fn();
      monitor.on('metric', metricSpy);
      
      monitor.recordMetric('test.metric', 42, 'count', { tag: 'value' });
      
      expect(metricSpy).toHaveBeenCalled();
    });

    it('should get metric history', () => {
      monitor.recordMetric('test.metric', 10);
      monitor.recordMetric('test.metric', 20);
      monitor.recordMetric('test.metric', 30);
      
      const history = monitor.getMetricHistory('test.metric');
      expect(history).toHaveLength(3);
    });

    it('should get filtered metric history', () => {
      monitor.recordMetric('test.metric', 10);
      
      vi.advanceTimersByTime(60000);
      
      monitor.recordMetric('test.metric', 20);
      
      const history = monitor.getMetricHistory('test.metric', 30000);
      expect(history).toHaveLength(1);
    });
  });

  describe('snapshots', () => {
    it('should collect snapshots', () => {
      const snapshotSpy = vi.fn();
      monitor.on('snapshot', snapshotSpy);
      
      monitor.start();
      vi.advanceTimersByTime(2000);
      
      expect(snapshotSpy).toHaveBeenCalled();
    });

    it('should get current metrics', () => {
      monitor.start();
      vi.advanceTimersByTime(1500);
      
      const current = monitor.getCurrentMetrics();
      expect(current).toBeDefined();
      expect(current.cpu).toBeDefined();
      expect(current.memory).toBeDefined();
      expect(current.eventLoop).toBeDefined();
    });

    it('should limit snapshot history', () => {
      const smallMonitor = new PerformanceMonitor({ historySize: 5 });
      
      smallMonitor.start();
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(1000);
      }
      smallMonitor.stop();
      
      const snapshots = smallMonitor.getSnapshots();
      expect(snapshots.length).toBeLessThanOrEqual(5);
      
      smallMonitor.destroy();
    });
  });

  describe('alerts', () => {
    it('should create alert when threshold exceeded', () => {
      const alertSpy = vi.fn();
      const alertMonitor = new PerformanceMonitor({
        refreshInterval: 1000,
        alertThresholds: {
          cpuUsage: 0,
          memoryUsage: 0,
          eventLoopLag: 0,
          responseTime: 0
        }
      });
      alertMonitor.on('alert', alertSpy);
      
      alertMonitor.start();
      vi.advanceTimersByTime(2000);
      
      expect(alertSpy).toHaveBeenCalled();
      
      alertMonitor.destroy();
    });

    it('should get unresolved alerts', () => {
      monitor.start();
      vi.advanceTimersByTime(2000);
      
      const alerts = monitor.getAlerts(false);
      expect(Array.isArray(alerts)).toBe(true);
    });

    it('should resolve alert', () => {
      monitor.start();
      vi.advanceTimersByTime(2000);
      
      const alerts = monitor.getAlerts(false);
      if (alerts.length > 0) {
        monitor.resolveAlert(alerts[0].id);
        const resolvedAlerts = monitor.getAlerts(true);
        expect(resolvedAlerts.length).toBeGreaterThan(0);
      }
    });

    it('should clear resolved alerts', () => {
      monitor.start();
      vi.advanceTimersByTime(2000);
      
      const alerts = monitor.getAlerts(false);
      if (alerts.length > 0) {
        monitor.resolveAlert(alerts[0].id);
        monitor.clearResolvedAlerts();
      }
    });
  });

  describe('dashboard', () => {
    it('should get dashboard data', () => {
      monitor.start();
      vi.advanceTimersByTime(2000);
      
      const data = monitor.getDashboardData();
      
      expect(data).toBeDefined();
      expect(data.current).toBeDefined();
      expect(data.trends).toBeDefined();
      expect(data.alerts).toBeDefined();
      expect(data.summary).toBeDefined();
    });

    it('should include summary metrics', () => {
      monitor.start();
      vi.advanceTimersByTime(2000);
      
      const data = monitor.getDashboardData();
      
      expect(data.summary.uptime).toBeGreaterThan(0);
      expect(data.summary.avgCPU).toBeGreaterThanOrEqual(0);
      expect(data.summary.avgMemory).toBeGreaterThanOrEqual(0);
    });

    it('should calculate trends', () => {
      monitor.start();
      vi.advanceTimersByTime(3000);
      
      const data = monitor.getDashboardData();
      
      expect(data.trends.length).toBeGreaterThan(0);
      for (const trend of data.trends) {
        expect(['increasing', 'decreasing', 'stable']).toContain(trend.trend);
      }
    });
  });

  describe('reports', () => {
    it('should generate JSON report', () => {
      monitor.start();
      vi.advanceTimersByTime(2000);
      
      const report = monitor.generateReport('json');
      
      expect(typeof report).toBe('string');
      const parsed = JSON.parse(report);
      expect(parsed).toBeDefined();
    });

    it('should generate text report', () => {
      monitor.start();
      vi.advanceTimersByTime(2000);
      
      const report = monitor.generateReport('text');
      
      expect(typeof report).toBe('string');
      expect(report).toContain('Performance Report');
    });

    it('should generate markdown report', () => {
      monitor.start();
      vi.advanceTimersByTime(2000);
      
      const report = monitor.generateReport('markdown');
      
      expect(typeof report).toBe('string');
      expect(report).toContain('# Performance Report');
    });
  });
});
