/**
 * 信任和安全系统
 */

export interface TrustLevel {
  id: string;
  level: 'low' | 'medium' | 'high' | 'full';
  score: number;
  history: Array<{
    timestamp: string;
    event: string;
    change: number;
  }>;
}

export interface SecurityPolicy {
  sensitiveOperations: string[];
  dangerousPatterns: RegExp[];
  requiredConfirmations: string[];
  auditLogRetention: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  operation: string;
  details: string;
  riskLevel: 'low' | 'medium' | 'high';
  success: boolean;
  userConfirmation?: boolean;
}

export class TrustAndSecurityService {
  private static trustLevel: TrustLevel = {
    id: 'default',
    level: 'medium',
    score: 0.5,
    history: [],
  };

  private static auditLog: AuditLogEntry[] = [];
  private static readonly MAX_AUDIT_LOG = 1000;

  private static securityPolicy: SecurityPolicy = {
    sensitiveOperations: [
      'delete_file',
      'delete_directory',
      'execute_command',
      'modify_system_config',
    ],
    dangerousPatterns: [
      /rm\s+-rf/,
      /del\s+\/s/,
      /format\s+/,
      /reg\s+delete/,
    ],
    requiredConfirmations: [
      'delete_file',
      'execute_command',
    ],
    auditLogRetention: 7 * 24 * 60 * 60 * 1000,
  };

  static getTrustLevel(): TrustLevel {
    return { ...this.trustLevel };
  }

  static updateTrust(
    event: string,
    change: number,
    reason: string
  ): void {
    this.trustLevel.score = Math.max(0, Math.min(1, this.trustLevel.score + change));

    if (this.trustLevel.score >= 0.8) {
      this.trustLevel.level = 'full';
    } else if (this.trustLevel.score >= 0.6) {
      this.trustLevel.level = 'high';
    } else if (this.trustLevel.score >= 0.4) {
      this.trustLevel.level = 'medium';
    } else {
      this.trustLevel.level = 'low';
    }

    this.trustLevel.history.push({
      timestamp: new Date().toISOString(),
      event: `${event}: ${reason}`,
      change,
    });

    if (this.trustLevel.history.length > 100) {
      this.trustLevel.history.shift();
    }
  }

  static recordSuccess(
    operation: string,
    details: string
  ): void {
    this.updateTrust(operation, 0.05, `成功完成${operation}`);
    this.logAudit(operation, details, 'low', true);
  }

  static recordFailure(
    operation: string,
    details: string
  ): void {
    this.updateTrust(operation, -0.08, `执行${operation}失败`);
    this.logAudit(operation, details, 'medium', false);
  }

  static recordDangerousAction(
    operation: string,
    details: string
  ): void {
    this.updateTrust(operation, -0.15, `执行危险操作${operation}`);
    this.logAudit(operation, details, 'high', true, true);
  }

  static requireConfirmation(
    operation: string,
    reason: string
  ): boolean {
    const requiresConfirmation =
      this.securityPolicy.requiredConfirmations.includes(operation) ||
      this.trustLevel.score < 0.5;

    if (requiresConfirmation) {
      this.logAudit(operation, `需要确认: ${reason}`, 'medium', false, false);
    }

    return requiresConfirmation;
  }

  static checkDangerousPatterns(input: string): {
    dangerous: boolean;
    matchedPatterns: string[];
    warning: string;
  } {
    const matched: string[] = [];
    for (const pattern of this.securityPolicy.dangerousPatterns) {
      if (pattern.test(input)) {
        matched.push(pattern.toString());
      }
    }

    let warning = '';
    if (matched.length > 0) {
      warning = `检测到 ${matched.length} 个潜在危险模式，请谨慎执行`;
    }

    return {
      dangerous: matched.length > 0,
      matchedPatterns: matched,
      warning,
    };
  }

  static assessOperationRisk(
    operation: string,
    context: string
  ): {
    riskLevel: 'low' | 'medium' | 'high';
    requiresConfirmation: boolean;
    recommendedAction: 'proceed' | 'review' | 'abort';
    warning: string;
  } {
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    let warning = '';
    let recommendedAction: 'proceed' | 'review' | 'abort' = 'proceed';

    if (this.securityPolicy.sensitiveOperations.includes(operation)) {
      riskLevel = 'high';
      warning = '此操作属于敏感操作';
      recommendedAction = 'review';
    }

    const patternCheck = this.checkDangerousPatterns(context);
    if (patternCheck.dangerous) {
      riskLevel = 'high';
      warning = patternCheck.warning;
      recommendedAction = 'abort';
    }

    if (this.trustLevel.score < 0.4) {
      riskLevel = riskLevel === 'low' ? 'medium' : riskLevel;
      if (warning) warning += '; ';
      warning += '信任等级较低';
      if (recommendedAction === 'proceed') recommendedAction = 'review';
    }

    const requiresConfirmation =
      this.requireConfirmation(operation, '风险评估') ||
      riskLevel !== 'low';

    return {
      riskLevel,
      requiresConfirmation,
      recommendedAction,
      warning,
    };
  }

  static logAudit(
    operation: string,
    details: string,
    riskLevel: 'low' | 'medium' | 'high',
    success: boolean,
    userConfirmation?: boolean
  ): void {
    const entry: AuditLogEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      operation,
      details,
      riskLevel,
      success,
      userConfirmation,
    };

    this.auditLog.push(entry);

    if (this.auditLog.length > this.MAX_AUDIT_LOG) {
      this.cleanupOldAuditLogs();
    }
  }

  private static cleanupOldAuditLogs(): void {
    const cutoff = Date.now() - this.securityPolicy.auditLogRetention;
    this.auditLog = this.auditLog.filter(
      entry => new Date(entry.timestamp).getTime() > cutoff
    );

    if (this.auditLog.length > this.MAX_AUDIT_LOG) {
      this.auditLog = this.auditLog.slice(-this.MAX_AUDIT_LOG);
    }
  }

  static getAuditLog(limit: number = 100): AuditLogEntry[] {
    return this.auditLog.slice(-limit).reverse();
  }

  static getSecuritySummary(): {
    trustLevel: string;
    trustScore: number;
    recentEvents: number;
    auditLogCount: number;
    highRiskOperations: number;
  } {
    const highRiskCount = this.auditLog.filter(
      entry => entry.riskLevel === 'high'
    ).length;

    const recentEvents = this.auditLog.filter(
      entry => new Date(entry.timestamp).getTime() > Date.now() - 24 * 60 * 60 * 1000
    ).length;

    return {
      trustLevel: this.trustLevel.level,
      trustScore: Math.round(this.trustLevel.score * 100) / 100,
      recentEvents,
      auditLogCount: this.auditLog.length,
      highRiskOperations: highRiskCount,
    };
  }

  static getRiskWarnings(): string[] {
    const warnings: string[] = [];

    if (this.trustLevel.score < 0.4) {
      warnings.push(`当前信任等级较低 (${this.trustLevel.score.toFixed(2)})，建议谨慎操作`);
    }

    const recentHighRisk = this.auditLog
      .filter(e =>
        e.riskLevel === 'high' &&
        new Date(e.timestamp).getTime() > Date.now() - 24 * 60 * 60 * 1000
      ).length;

    if (recentHighRisk > 3) {
      warnings.push(`过去24小时内有 ${recentHighRisk} 次高风险操作`);
    }

    return warnings;
  }

  static resetTrust(): void {
    this.trustLevel = {
      id: 'default',
      level: 'medium',
      score: 0.5,
      history: [],
    };
    this.logAudit('reset_trust', '重置信任等级', 'low', true);
  }

  static clearAuditLog(): void {
    const count = this.auditLog.length;
    this.auditLog = [];
    this.logAudit('clear_audit', `清除了 ${count} 条审计日志`, 'low', true);
  }
}
