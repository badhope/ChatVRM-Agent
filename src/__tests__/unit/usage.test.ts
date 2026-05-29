import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UsageTracker, EventType } from '../../monitoring/usage.js';
import type { EventType as EventTypeEnum } from '../../monitoring/usage.js';

describe('UsageTracker', () => {
  let tracker: UsageTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    tracker = new UsageTracker('test-session', 'test-user');
  });

  afterEach(() => {
    tracker.destroy();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create instance with session ID', () => {
      const customTracker = new UsageTracker('custom-session');
      expect(customTracker.getSessionId()).toBe('custom-session');
      customTracker.destroy();
    });

    it('should create instance with user ID', () => {
      const customTracker = new UsageTracker('session', 'user123');
      expect(customTracker.getSessionId()).toBe('session');
      customTracker.destroy();
    });

    it('should generate session ID if not provided', () => {
      const autoTracker = new UsageTracker();
      expect(autoTracker.getSessionId()).toBeDefined();
      expect(autoTracker.getSessionId()).toContain('session-');
      autoTracker.destroy();
    });
  });

  describe('trackEvent', () => {
    it('should track event', () => {
      const eventSpy = vi.fn();
      tracker.on('event', eventSpy);
      
      const event = tracker.trackEvent(EventType.CommandExecuted, { command: 'test' });
      
      expect(event).toBeDefined();
      expect(event.id).toBeDefined();
      expect(event.type).toBe(EventType.CommandExecuted);
      expect(eventSpy).toHaveBeenCalled();
    });

    it('should include session and user ID', () => {
      const event = tracker.trackEvent(EventType.FeatureUsed, { feature: 'test' });
      
      expect(event.sessionId).toBe('test-session');
      expect(event.userId).toBe('test-user');
    });

    it('should include timestamp', () => {
      vi.setSystemTime(new Date('2024-01-01'));
      
      const event = tracker.trackEvent(EventType.TaskCreated, {});
      
      expect(event.timestamp).toBe(new Date('2024-01-01').getTime());
    });

    it('should include duration', () => {
      const event = tracker.trackEvent(EventType.CommandExecuted, {}, 1000);
      
      expect(event.duration).toBe(1000);
    });
  });

  describe('trackCommand', () => {
    it('should track command execution', () => {
      const event = tracker.trackCommand('ls', true, 500);
      
      expect(event.type).toBe(EventType.CommandExecuted);
      expect(event.metadata.command).toBe('ls');
      expect(event.metadata.success).toBe(true);
      expect(event.metadata.duration).toBe(500);
    });

    it('should track failed command', () => {
      const event = tracker.trackCommand('invalid', false, 100);
      
      expect(event.metadata.success).toBe(false);
    });
  });

  describe('trackSkill', () => {
    it('should track skill invocation', () => {
      const event = tracker.trackSkill('code-analyzer', true, 2000);
      
      expect(event.type).toBe(EventType.SkillInvoked);
      expect(event.metadata.skill).toBe('code-analyzer');
      expect(event.metadata.success).toBe(true);
      expect(event.metadata.duration).toBe(2000);
    });
  });

  describe('trackTask', () => {
    it('should track task creation', () => {
      const event = tracker.trackTask('task-1', 'created');
      
      expect(event.type).toBe(EventType.TaskCreated);
      expect(event.metadata.taskId).toBe('task-1');
    });

    it('should track task completion', () => {
      const event = tracker.trackTask('task-1', 'completed');
      
      expect(event.type).toBe(EventType.TaskCompleted);
    });

    it('should track task failure', () => {
      const event = tracker.trackTask('task-1', 'failed');
      
      expect(event.type).toBe(EventType.TaskFailed);
    });
  });

  describe('trackMessage', () => {
    it('should track sent message', () => {
      const event = tracker.trackMessage('sent', 'telegram');
      
      expect(event.type).toBe(EventType.MessageSent);
      expect(event.metadata.channel).toBe('telegram');
    });

    it('should track received message', () => {
      const event = tracker.trackMessage('received', 'discord');
      
      expect(event.type).toBe(EventType.MessageReceived);
    });
  });

  describe('trackFile', () => {
    it('should track file creation', () => {
      const event = tracker.trackFile('created', '/path/to/file.ts');
      
      expect(event.type).toBe(EventType.FileCreated);
      expect(event.metadata.filePath).toBe('/path/to/file.ts');
    });

    it('should track file modification', () => {
      const event = tracker.trackFile('modified', '/path/to/file.ts');
      
      expect(event.type).toBe(EventType.FileModified);
    });

    it('should track file deletion', () => {
      const event = tracker.trackFile('deleted', '/path/to/file.ts');
      
      expect(event.type).toBe(EventType.FileDeleted);
    });
  });

  describe('trackError', () => {
    it('should track error', () => {
      const error = new Error('Test error');
      const event = tracker.trackError(error);
      
      expect(event.type).toBe(EventType.ErrorOccurred);
      expect(event.metadata.error).toBe('Test error');
      expect(event.metadata.stack).toBeDefined();
    });
  });

  describe('trackFeature', () => {
    it('should track feature usage', () => {
      const event = tracker.trackFeature('autocomplete');
      
      expect(event.type).toBe(EventType.FeatureUsed);
      expect(event.metadata.feature).toBe('autocomplete');
    });
  });

  describe('queryEvents', () => {
    beforeEach(() => {
      vi.setSystemTime(new Date('2024-01-01'));
      tracker.trackEvent(EventType.CommandExecuted, { command: 'cmd1' });
      
      vi.advanceTimersByTime(1000);
      tracker.trackEvent(EventType.SkillInvoked, { skill: 'skill1' });
      
      vi.advanceTimersByTime(1000);
      tracker.trackEvent(EventType.CommandExecuted, { command: 'cmd2' });
    });

    it('should query all events', () => {
      const events = tracker.queryEvents({});
      
      expect(events.length).toBe(3);
    });

    it('should filter by date range', () => {
      const startDate = new Date('2024-01-01').getTime();
      const endDate = new Date('2024-01-01').getTime() + 1500;
      
      const events = tracker.queryEvents({ startDate, endDate });
      
      expect(events.length).toBe(2);
    });

    it('should filter by event types', () => {
      const events = tracker.queryEvents({
        eventTypes: [EventType.CommandExecuted]
      });
      
      expect(events.length).toBe(2);
    });

    it('should filter by session ID', () => {
      const events = tracker.queryEvents({ sessionId: 'test-session' });
      
      expect(events.length).toBe(3);
    });

    it('should limit results', () => {
      const events = tracker.queryEvents({ limit: 2 });
      
      expect(events.length).toBe(2);
    });

    it('should offset results', () => {
      const events = tracker.queryEvents({ limit: 2, offset: 1 });
      
      expect(events.length).toBe(2);
    });
  });

  describe('generateReport', () => {
    beforeEach(() => {
      vi.setSystemTime(new Date('2024-01-01'));
      tracker.trackCommand('ls', true, 100);
      tracker.trackCommand('cd', true, 50);
      tracker.trackCommand('invalid', false, 10);
      tracker.trackSkill('code-analyzer', true, 500);
    });

    it('should generate report', () => {
      const report = tracker.generateReport();
      
      expect(report).toBeDefined();
      expect(report.generatedAt).toBeDefined();
      expect(report.period).toBeDefined();
      expect(report.summary).toBeDefined();
    });

    it('should include event summary', () => {
      const report = tracker.generateReport();
      
      expect(report.summary.totalEvents).toBeGreaterThan(0);
    });

    it('should calculate top commands', () => {
      const report = tracker.generateReport();
      
      expect(report.topCommands.length).toBeGreaterThan(0);
      expect(report.topCommands[0].command).toBe('ls');
    });

    it('should calculate top skills', () => {
      const report = tracker.generateReport();
      
      expect(report.topSkills.length).toBeGreaterThan(0);
      expect(report.topSkills[0].name).toBe('code-analyzer');
    });

    it('should include hourly distribution', () => {
      const report = tracker.generateReport();
      
      expect(report.hourlyDistribution.length).toBe(24);
    });

    it('should include daily distribution', () => {
      const report = tracker.generateReport();
      
      expect(report.dailyDistribution.length).toBe(7);
    });

    it('should filter by date range', () => {
      const startDate = new Date('2024-01-01').getTime();
      const endDate = new Date('2024-01-01').getTime() + 100;
      
      const report = tracker.generateReport(startDate, endDate);
      
      expect(report.summary.totalEvents).toBeGreaterThan(0);
    });
  });

  describe('userStats', () => {
    it('should track command stats', () => {
      tracker.trackCommand('ls', true, 100);
      tracker.trackCommand('ls', true, 150);
      tracker.trackCommand('ls', false, 50);
      
      const stats = tracker.getUserStats('test-user');
      
      expect(stats).toBeDefined();
      expect(stats!.totalCommands).toBe(3);
      expect(stats!.successfulCommands).toBe(2);
      expect(stats!.failedCommands).toBe(1);
    });

    it('should track skill usage', () => {
      tracker.trackSkill('skill1', true, 500);
      tracker.trackSkill('skill2', true, 300);
      tracker.trackSkill('skill1', true, 400);
      
      const stats = tracker.getUserStats('test-user');
      
      expect(stats!.totalSkills).toBe(3);
      expect(stats!.skillsUsed.has('skill1')).toBe(true);
      expect(stats!.skillsUsed.has('skill2')).toBe(true);
    });

    it('should track feature usage', () => {
      tracker.trackFeature('feature1');
      tracker.trackFeature('feature1');
      tracker.trackFeature('feature2');
      
      const stats = tracker.getUserStats('test-user');
      
      expect(stats!.featureUsage.get('feature1')).toBe(2);
      expect(stats!.featureUsage.get('feature2')).toBe(1);
    });

    it('should get all user stats', () => {
      tracker.trackCommand('test', true, 100);
      
      const allStats = tracker.getAllUserStats();
      
      expect(allStats.length).toBeGreaterThan(0);
    });
  });

  describe('export/import', () => {
    it('should export to JSON', () => {
      tracker.trackEvent(EventType.CommandExecuted, { command: 'test' });
      
      const json = tracker.exportToJSON();
      
      expect(typeof json).toBe('string');
      const data = JSON.parse(json);
      expect(data.sessionId).toBe('test-session');
      expect(data.events.length).toBeGreaterThan(0);
    });

    it('should import from JSON', () => {
      tracker.trackEvent(EventType.CommandExecuted, { command: 'test' });
      
      const json = tracker.exportToJSON();
      
      const newTracker = new UsageTracker();
      newTracker.importFromJSON(json);
      
      const events = newTracker.queryEvents({});
      expect(events.length).toBeGreaterThan(0);
      
      newTracker.destroy();
    });
  });

  describe('reset', () => {
    it('should reset tracker', () => {
      tracker.trackEvent(EventType.CommandExecuted, { command: 'test' });
      
      tracker.reset();
      
      const events = tracker.queryEvents({});
      expect(events.length).toBe(0);
    });
  });

  describe('getEventCountsByType', () => {
    it('should count events by type', () => {
      tracker.trackEvent(EventType.CommandExecuted, {});
      tracker.trackEvent(EventType.CommandExecuted, {});
      tracker.trackEvent(EventType.SkillInvoked, {});
      
      const counts = tracker.getEventCountsByType();
      
      expect(counts[EventType.CommandExecuted]).toBe(2);
      expect(counts[EventType.SkillInvoked]).toBe(1);
    });
  });

  describe('getRecentEvents', () => {
    it('should get recent events', () => {
      for (let i = 0; i < 5; i++) {
        tracker.trackEvent(EventType.CommandExecuted, { command: `cmd${i}` });
        vi.advanceTimersByTime(1000);
      }
      
      const recent = tracker.getRecentEvents(3);
      
      expect(recent.length).toBe(3);
    });
  });
});
