import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PerformanceMonitor } from '../../monitoring/performance.js';
import { UsageTracker } from '../../monitoring/usage.js';

describe('Monitoring Integration', () => {
  let monitor: PerformanceMonitor;
  let tracker: UsageTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    monitor = new PerformanceMonitor({ refreshInterval: 1000 });
    tracker = new UsageTracker('test-session', 'test-user');
  });

  afterEach(() => {
    monitor.destroy();
    tracker.destroy();
    vi.useRealTimers();
  });

  describe('Performance Monitoring Integration', () => {
    it('should track system metrics over time', async () => {
      const snapshots: any[] = [];
      
      monitor.on('snapshot', (snapshot) => {
        snapshots.push(snapshot);
      });

      monitor.start();
      
      vi.advanceTimersByTime(3000);
      
      expect(snapshots.length).toBeGreaterThan(2);
      
      const lastSnapshot = snapshots[snapshots.length - 1];
      expect(lastSnapshot.cpu).toBeDefined();
      expect(lastSnapshot.memory).toBeDefined();
      expect(lastSnapshot.eventLoop).toBeDefined();
    });

    it('should generate comprehensive dashboard data', () => {
      monitor.start();
      vi.advanceTimersByTime(5000);
      
      const dashboard = monitor.getDashboardData();
      
      expect(dashboard.current).toBeDefined();
      expect(dashboard.trends.length).toBeGreaterThan(0);
      expect(dashboard.alerts).toBeDefined();
      expect(dashboard.summary).toBeDefined();
      
      expect(dashboard.summary.uptime).toBeGreaterThan(0);
      expect(dashboard.summary.totalAlerts).toBeDefined();
    });

    it('should generate different report formats', () => {
      monitor.start();
      vi.advanceTimersByTime(2000);
      
      const jsonReport = monitor.generateReport('json');
      const textReport = monitor.generateReport('text');
      const markdownReport = monitor.generateReport('markdown');
      
      expect(typeof jsonReport).toBe('string');
      expect(typeof textReport).toBe('string');
      expect(typeof markdownReport).toBe('string');
      
      const parsed = JSON.parse(jsonReport);
      expect(parsed.current).toBeDefined();
      expect(parsed.summary).toBeDefined();
      
      expect(textReport).toContain('Performance Report');
      expect(markdownReport).toContain('# Performance Report');
    });

    it('should handle alert conditions', () => {
      const alertSpy = vi.fn();
      monitor.on('alert', alertSpy);
      
      monitor.start();
      
      vi.advanceTimersByTime(2000);
      
      const alerts = monitor.getAlerts(false);
      expect(Array.isArray(alerts)).toBe(true);
    });

    it('should record custom metrics', () => {
      monitor.recordMetric('custom.requests', 100, 'count', { endpoint: '/api/v1' });
      monitor.recordMetric('custom.latency', 150, 'ms');
      
      const history = monitor.getMetricHistory('custom.requests');
      expect(history.length).toBe(1);
      expect(history[0].value).toBe(100);
      expect(history[0].tags?.endpoint).toBe('/api/v1');
    });
  });

  describe('Usage Tracking Integration', () => {
    it('should track multiple event types', () => {
      tracker.trackCommand('build', true, 1000);
      tracker.trackSkill('code-analyzer', true, 5000);
      tracker.trackTask('task-1', 'completed');
      tracker.trackMessage('sent', 'telegram');
      tracker.trackFeature('autocomplete');
      
      const counts = tracker.getEventCountsByType();
      const eventTypes = Object.keys(counts);
      
      expect(eventTypes.length).toBeGreaterThan(3);
    });

    it('should generate usage report with trends', () => {
      vi.setSystemTime(new Date('2024-01-01'));
      
      for (let i = 0; i < 5; i++) {
        tracker.trackCommand('ls', true, 100);
        vi.advanceTimersByTime(3600000);
      }
      
      tracker.trackCommand('build', true, 5000);
      tracker.trackSkill('test-skill', true, 2000);
      
      const report = tracker.generateReport();
      
      expect(report.summary.totalEvents).toBeGreaterThan(5);
      expect(report.topCommands.length).toBeGreaterThan(0);
      expect(report.topSkills.length).toBeGreaterThan(0);
      
      expect(report.hourlyDistribution.length).toBe(24);
      expect(report.dailyDistribution.length).toBe(7);
    });

    it('should track user-specific statistics', () => {
      tracker.trackCommand('cmd1', true, 100);
      tracker.trackCommand('cmd1', true, 200);
      tracker.trackCommand('cmd1', false, 50);
      tracker.trackSkill('skill1', true, 1000);
      tracker.trackSkill('skill2', true, 2000);
      
      const stats = tracker.getUserStats('test-user');
      
      expect(stats).toBeDefined();
      expect(stats!.totalCommands).toBe(3);
      expect(stats!.successfulCommands).toBe(2);
      expect(stats!.failedCommands).toBe(1);
      expect(stats!.totalSkills).toBe(2);
      expect(stats!.skillsUsed.has('skill1')).toBe(true);
      expect(stats!.skillsUsed.has('skill2')).toBe(true);
    });

    it('should export and import data correctly', () => {
      tracker.trackCommand('test-command', true, 500);
      tracker.trackSkill('test-skill', true, 1000);
      
      const exported = tracker.exportToJSON();
      
      const newTracker = new UsageTracker();
      newTracker.importFromJSON(exported);
      
      const events = newTracker.queryEvents({});
      expect(events.length).toBe(2);
      
      newTracker.destroy();
    });

    it('should query events with filters', () => {
      vi.setSystemTime(new Date('2024-01-01'));
      tracker.trackCommand('cmd1', true, 100);
      
      vi.advanceTimersByTime(1000);
      tracker.trackCommand('cmd2', true, 200);
      
      vi.advanceTimersByTime(1000);
      tracker.trackSkill('skill1', true, 500);
      
      const commands = tracker.queryEvents({
        eventTypes: ['command_executed'] as any
      });
      
      expect(commands.length).toBe(2);
      
      const recent = tracker.getRecentEvents(2);
      expect(recent.length).toBe(2);
    });
  });

  describe('Performance and Usage Integration', () => {
    it('should work together to provide complete monitoring', () => {
      monitor.start();
      tracker.trackCommand('monitor.start', true, 100);
      
      vi.advanceTimersByTime(2000);
      
      const perfReport = monitor.generateReport('json');
      const usageReport = tracker.generateReport();
      
      const perfData = JSON.parse(perfReport);
      
      expect(perfData.current).toBeDefined();
      expect(perfData.summary.avgCPU).toBeDefined();
      expect(usageReport.summary.totalEvents).toBeGreaterThan(0);
    });

    it('should track monitoring system usage', () => {
      tracker.trackFeature('performance_monitor');
      tracker.trackCommand('generate_report', true, 500);
      
      const stats = tracker.getUserStats('test-user');
      
      expect(stats!.featureUsage.get('performance_monitor')).toBe(1);
    });
  });
});
