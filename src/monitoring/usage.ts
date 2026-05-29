import { createLogger, Logger } from '../services/logger.js';
import { EventEmitter } from 'eventemitter3';

export interface UsageEvent {
  id: string;
  type: EventType;
  userId?: string;
  sessionId: string;
  metadata: Record<string, any>;
  timestamp: number;
  duration?: number;
}

export enum EventType {
  CommandExecuted = 'command_executed',
  SkillInvoked = 'skill_invoked',
  PluginLoaded = 'plugin_loaded',
  TaskCreated = 'task_created',
  TaskCompleted = 'task_completed',
  TaskFailed = 'task_failed',
  MessageSent = 'message_sent',
  MessageReceived = 'message_received',
  FileCreated = 'file_created',
  FileModified = 'file_modified',
  FileDeleted = 'file_deleted',
  ErrorOccurred = 'error_occurred',
  UserLogin = 'user_login',
  UserLogout = 'user_logout',
  FeatureUsed = 'feature_used',
  SettingsChanged = 'settings_changed',
  APIRequest = 'api_request',
  BrowserAction = 'browser_action',
  SchedulerTriggered = 'scheduler_triggered',
  WebhookReceived = 'webhook_received'
}

export interface UserStats {
  userId?: string;
  sessionId: string;
  totalCommands: number;
  successfulCommands: number;
  failedCommands: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalSkills: number;
  skillsUsed: Set<string>;
  activeTime: number;
  lastActive: number;
  featureUsage: Map<string, number>;
  commandHistory: CommandUsage[];
}

export interface CommandUsage {
  command: string;
  count: number;
  lastUsed: number;
  avgDuration: number;
  successRate: number;
}

export interface UsageReport {
  generatedAt: number;
  period: {
    start: number;
    end: number;
  };
  summary: {
    totalEvents: number;
    uniqueUsers: number;
    uniqueSessions: number;
    totalDuration: number;
  };
  topCommands: CommandUsage[];
  topSkills: Array<{ name: string; count: number }>;
  errorSummary: {
    total: number;
    byType: Record<string, number>;
  };
  hourlyDistribution: number[];
  dailyDistribution: number[];
  userStats: UserStats[];
}

export interface UsageQuery {
  startDate?: number;
  endDate?: number;
  eventTypes?: EventType[];
  userId?: string;
  sessionId?: string;
  limit?: number;
  offset?: number;
}

export class UsageTracker extends EventEmitter {
  private logger: Logger;
  private events: UsageEvent[] = [];
  private sessionId: string;
  private userId?: string;
  private currentSessionStart: number;
  private activeTime = 0;
  private lastActiveTime = Date.now();
  private maxEvents = 10000;
  private eventIdCounter = 0;
  private userStats: Map<string, UserStats> = new Map();

  constructor(sessionId?: string, userId?: string) {
    super();
    this.logger = createLogger('UsageTracker');
    this.sessionId = sessionId || this.generateSessionId();
    this.userId = userId;
    this.currentSessionStart = Date.now();
    
    this.startActivityTracking();
    
    this.logger.info({ sessionId: this.sessionId, userId: this.userId }, 'Usage tracker initialized');
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private startActivityTracking(): void {
    setInterval(() => {
      this.activeTime += Date.now() - this.lastActiveTime;
      this.lastActiveTime = Date.now();
    }, 60000);
  }

  public trackEvent(
    type: EventType,
    metadata: Record<string, any> = {},
    duration?: number
  ): UsageEvent {
    const event: UsageEvent = {
      id: `event-${++this.eventIdCounter}`,
      type,
      userId: this.userId,
      sessionId: this.sessionId,
      metadata,
      timestamp: Date.now(),
      duration
    };

    this.events.push(event);
    this.updateUserStats(event);
    this.cleanupOldEvents();

    this.emit('event', event);
    this.logger.debug({ eventId: event.id, type }, 'Usage event tracked');

    return event;
  }

  public trackCommand(command: string, success: boolean, duration: number, metadata?: Record<string, any>): UsageEvent {
    return this.trackEvent(
      EventType.CommandExecuted,
      {
        command,
        success,
        duration,
        ...metadata
      },
      duration
    );
  }

  public trackSkill(skillName: string, success: boolean, duration: number): UsageEvent {
    return this.trackEvent(
      EventType.SkillInvoked,
      {
        skill: skillName,
        success,
        duration
      },
      duration
    );
  }

  public trackTask(taskId: string, status: 'created' | 'completed' | 'failed', metadata?: Record<string, any>): UsageEvent {
    const eventType = status === 'completed' ? EventType.TaskCompleted :
                       status === 'failed' ? EventType.TaskFailed : EventType.TaskCreated;

    return this.trackEvent(eventType, { taskId, ...metadata });
  }

  public trackMessage(direction: 'sent' | 'received', channel: string, metadata?: Record<string, any>): UsageEvent {
    return this.trackEvent(
      direction === 'sent' ? EventType.MessageSent : EventType.MessageReceived,
      { channel, ...metadata }
    );
  }

  public trackFile(operation: 'created' | 'modified' | 'deleted', filePath: string): UsageEvent {
    const eventType = operation === 'created' ? EventType.FileCreated :
                      operation === 'modified' ? EventType.FileModified : EventType.FileDeleted;

    return this.trackEvent(eventType, { filePath });
  }

  public trackError(error: Error, context?: Record<string, any>): UsageEvent {
    return this.trackEvent(
      EventType.ErrorOccurred,
      {
        error: error.message,
        stack: error.stack,
        ...context
      }
    );
  }

  public trackFeature(featureName: string, metadata?: Record<string, any>): UsageEvent {
    return this.trackEvent(
      EventType.FeatureUsed,
      { feature: featureName, ...metadata }
    );
  }

  public setUserId(userId: string): void {
    this.userId = userId;
    this.logger.info({ userId }, 'User ID set');
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public getCurrentSession(): { sessionId: string; userId?: string; startTime: number; activeTime: number } {
    return {
      sessionId: this.sessionId,
      userId: this.userId,
      startTime: this.currentSessionStart,
      activeTime: this.activeTime
    };
  }

  private updateUserStats(event: UsageEvent): void {
    const userId = event.userId || 'anonymous';
    let stats = this.userStats.get(userId);

    if (!stats) {
      stats = {
        userId: event.userId,
        sessionId: event.sessionId,
        totalCommands: 0,
        successfulCommands: 0,
        failedCommands: 0,
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        totalSkills: 0,
        skillsUsed: new Set(),
        activeTime: 0,
        lastActive: Date.now(),
        featureUsage: new Map(),
        commandHistory: []
      };
      this.userStats.set(userId, stats);
    }

    stats.lastActive = Date.now();
    stats.activeTime += event.duration || 0;

    if (event.type === EventType.CommandExecuted) {
      stats.totalCommands++;
      if (event.metadata.success) {
        stats.successfulCommands++;
      } else {
        stats.failedCommands++;
      }

      const existing = stats.commandHistory.find(c => c.command === event.metadata.command);
      if (existing) {
        existing.count++;
        existing.lastUsed = event.timestamp;
        existing.avgDuration = (existing.avgDuration * (existing.count - 1) + (event.duration || 0)) / existing.count;
        existing.successRate = stats.successfulCommands / stats.totalCommands;
      } else {
        stats.commandHistory.push({
          command: event.metadata.command,
          count: 1,
          lastUsed: event.timestamp,
          avgDuration: event.duration || 0,
          successRate: event.metadata.success ? 1 : 0
        });
      }
    }

    if (event.type === EventType.SkillInvoked) {
      stats.totalSkills++;
      stats.skillsUsed.add(event.metadata.skill);
    }

    if (event.type === EventType.TaskCompleted) {
      stats.totalTasks++;
      stats.completedTasks++;
    } else if (event.type === EventType.TaskFailed) {
      stats.totalTasks++;
      stats.failedTasks++;
    }

    if (event.type === EventType.FeatureUsed) {
      const feature = event.metadata.feature;
      stats.featureUsage.set(feature, (stats.featureUsage.get(feature) || 0) + 1);
    }
  }

  private cleanupOldEvents(): void {
    if (this.events.length > this.maxEvents) {
      const removed = this.events.splice(0, this.events.length - this.maxEvents);
      this.logger.debug({ removed: removed.length }, 'Old events cleaned up');
    }
  }

  public queryEvents(query: UsageQuery): UsageEvent[] {
    let filtered = [...this.events];

    if (query.startDate) {
      filtered = filtered.filter(e => e.timestamp >= query.startDate!);
    }

    if (query.endDate) {
      filtered = filtered.filter(e => e.timestamp <= query.endDate!);
    }

    if (query.eventTypes && query.eventTypes.length > 0) {
      filtered = filtered.filter(e => query.eventTypes!.includes(e.type));
    }

    if (query.userId) {
      filtered = filtered.filter(e => e.userId === query.userId);
    }

    if (query.sessionId) {
      filtered = filtered.filter(e => e.sessionId === query.sessionId);
    }

    const offset = query.offset || 0;
    const limit = query.limit || filtered.length;

    return filtered
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(offset, offset + limit);
  }

  public generateReport(startDate?: number, endDate?: number): UsageReport {
    const start = startDate || Date.now() - 24 * 60 * 60 * 1000;
    const end = endDate || Date.now();

    const events = this.queryEvents({ startDate: start, endDate: end });

    const summary = {
      totalEvents: events.length,
      uniqueUsers: new Set(events.map(e => e.userId)).size,
      uniqueSessions: new Set(events.map(e => e.sessionId)).size,
      totalDuration: events.reduce((sum, e) => sum + (e.duration || 0), 0)
    };

    const commandEvents = events.filter(e => e.type === EventType.CommandExecuted);
    const commandCounts = new Map<string, number>();
    for (const event of commandEvents) {
      commandCounts.set(event.metadata.command, (commandCounts.get(event.metadata.command) || 0) + 1);
    }

    const topCommands: CommandUsage[] = Array.from(commandCounts.entries())
      .map(([command, count]) => {
        const commandEventsList = commandEvents.filter(e => e.metadata.command === command);
        const successCount = commandEventsList.filter(e => e.metadata.success).length;
        const avgDuration = commandEventsList.reduce((sum, e) => sum + (e.duration || 0), 0) / commandEventsList.length;

        return {
          command,
          count,
          lastUsed: Math.max(...commandEventsList.map(e => e.timestamp)),
          avgDuration,
          successRate: successCount / commandEventsList.length
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const skillEvents = events.filter(e => e.type === EventType.SkillInvoked);
    const skillCounts = new Map<string, number>();
    for (const event of skillEvents) {
      skillCounts.set(event.metadata.skill, (skillCounts.get(event.metadata.skill) || 0) + 1);
    }

    const topSkills = Array.from(skillCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const errorEvents = events.filter(e => e.type === EventType.ErrorOccurred);
    const errorByType = new Map<string, number>();
    for (const event of errorEvents) {
      const type = event.metadata.error || 'Unknown';
      errorByType.set(type, (errorByType.get(type) || 0) + 1);
    }

    const hourlyDistribution = new Array(24).fill(0);
    for (const event of events) {
      const hour = new Date(event.timestamp).getHours();
      hourlyDistribution[hour]++;
    }

    const dailyDistribution = new Array(7).fill(0);
    for (const event of events) {
      const day = new Date(event.timestamp).getDay();
      dailyDistribution[day]++;
    }

    return {
      generatedAt: Date.now(),
      period: { start, end },
      summary,
      topCommands,
      topSkills,
      errorSummary: {
        total: errorEvents.length,
        byType: Object.fromEntries(errorByType)
      },
      hourlyDistribution,
      dailyDistribution,
      userStats: Array.from(this.userStats.values())
    };
  }

  public getUserStats(userId: string): UserStats | undefined {
    return this.userStats.get(userId);
  }

  public getAllUserStats(): UserStats[] {
    return Array.from(this.userStats.values());
  }

  public getRecentEvents(limit: number = 100): UsageEvent[] {
    return this.events
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  public getEventCountsByType(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const event of this.events) {
      counts[event.type] = (counts[event.type] || 0) + 1;
    }
    return counts;
  }

  public exportToJSON(filename?: string): string {
    const data = {
      sessionId: this.sessionId,
      userId: this.userId,
      sessionStart: this.currentSessionStart,
      events: this.events,
      userStats: Array.from(this.userStats.entries()).map(([k, v]) => [k, {
        ...v,
        skillsUsed: Array.from(v.skillsUsed),
        featureUsage: Array.from(v.featureUsage.entries())
      }]),
      exportedAt: new Date().toISOString()
    };

    const json = JSON.stringify(data, null, 2);

    if (filename) {
      const fs = require('fs');
      fs.writeFileSync(filename, json);
      this.logger.info({ filename, eventCount: this.events.length }, 'Usage data exported');
    }

    return json;
  }

  public importFromJSON(json: string): void {
    const data = JSON.parse(json);

    this.sessionId = data.sessionId;
    this.userId = data.userId;
    this.currentSessionStart = data.sessionStart;
    this.events = data.events;

    this.userStats = new Map(data.userStats.map(([k, v]: [string, any]) => [
      k,
      {
        ...v,
        skillsUsed: new Set(v.skillsUsed),
        featureUsage: new Map(v.featureUsage)
      }
    ]));

    this.logger.info({ eventCount: this.events.length }, 'Usage data imported');
  }

  public reset(): void {
    this.events = [];
    this.userStats.clear();
    this.activeTime = 0;
    this.eventIdCounter = 0;
    this.currentSessionStart = Date.now();
    this.logger.info('Usage tracker reset');
  }

  public destroy(): void {
    this.reset();
    this.logger.info('Usage tracker destroyed');
  }
}

export default UsageTracker;
