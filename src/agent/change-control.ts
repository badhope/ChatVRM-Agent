/**
 * 变更控制管理器
 * 
 * 提供统一的变更控制管理能力：
 * 1. 执行受保护的变更操作
 * 2. 管理变更记录
 * 3. 统计变更信息
 */

import type { ChangeRecord } from './infrastructure/change-control/types.js';
import { assessFileRisk, RiskLevel, isAutoApprovable, assessRisk, RISK_RULES } from './infrastructure/change-control/risk-assessor.js';
import { requestApproval, backupFile, createSnapshot, rollback } from './infrastructure/change-control/approval.js';

export { assessRisk, RISK_RULES, backupFile, rollback };

export class ChangeControlManager {
  private records: ChangeRecord[] = [];
  private enabled: boolean = true;
  private stats = {
    total: 0,
    byRisk: {} as Record<string, number>,
  };

  /**
   * 设置是否启用变更控制
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * 执行受保护的变更操作
   */
  async executeProtectedChange(
    action: ChangeRecord['action'],
    target: string,
    execute: () => Promise<unknown>
  ): Promise<{ success: boolean; result?: unknown }> {
    if (!this.enabled) {
      const result = await execute();
      return { success: true, result };
    }

    // 评估风险
    const assessment = assessFileRisk(action, target);
    
    // 创建变更记录
    const record: ChangeRecord = {
      id: `change-${Date.now()}`,
      action,
      target,
      risk: assessment.risk,
      backedUp: false,
      approved: isAutoApprovable(assessment.risk),
      timestamp: Date.now(),
    };

    // 更新统计
    this.stats.total++;
    this.stats.byRisk[assessment.risk] = (this.stats.byRisk[assessment.risk] || 0) + 1;

    // 备份文件
    if (assessment.risk >= RiskLevel.MEDIUM) {
      const backupResult = await backupFile(target);
      if (backupResult.success && backupResult.backupPath) {
        record.backedUp = true;
        record.backupPath = backupResult.backupPath;
      }
      
      // 创建内存快照
      const snapshot = await createSnapshot(target);
      if (snapshot !== null) {
        record.snapshot = snapshot;
      }
    }

    // 请求审批（如果需要）
    if (!record.approved) {
      const approval = await requestApproval(action, target, assessment, record);
      record.approved = approval.approved;
      
      if (!approval.approved) {
        return { success: false };
      }
    }

    // 执行变更
    try {
      const result = await execute();
      this.records.push(record);
      return { success: true, result };
    } catch (error) {
      return { success: false, result: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 获取变更记录统计
   */
  getStats() {
    return this.stats;
  }

  /**
   * 获取所有变更记录
   */
  getRecords(): ChangeRecord[] {
    return [...this.records];
  }

  /**
   * 获取变更历史（别名方法）
   */
  getHistory(): ChangeRecord[] {
    return this.getRecords();
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.stats = {
      total: 0,
      byRisk: {},
    };
  }
}
