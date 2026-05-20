/**
 * 变更控制系统模块 (Change Control System)
 *
 * 提供 AI Agent 操作文件和执行命令时的安全控制能力，包括：
 * 1. 风险评估 - 根据操作类型和目标路径自动评估风险等级
 * 2. 文件备份 - 在高风险操作前自动备份文件
 * 3. 用户批准流程 - 对中高风险操作请求用户确认
 * 4. 快照与回滚 - 支持将文件恢复到修改前的状态
 *
 * @example
 * ```typescript
 * import { ChangeControlManager } from './change-control/index.js';
 *
 * const manager = new ChangeControlManager();
 *
 * // 执行带保护的变更
 * const result = await manager.executeProtectedChange(
 *   'modify',
 *   '/project/config.json',
 *   async () => {
 *     await fs.writeFile('/project/config.json', newContent);
 *     return '修改完成';
 *   }
 * );
 * ```
 */

import crypto from 'node:crypto';
import chalk from 'chalk';

// 从子模块导入风险规则与评估
import {
  RiskLevel,
  RISK_LEVEL_WEIGHT,
  RISK_LEVEL_LABEL,
  RISK_LEVEL_STYLE,
  RISK_RULES,
  assessRisk,
} from './risk-rules.js';
import type { ChangeAction } from './risk-rules.js';

// 从备份子模块导入
import { backupFile, createSnapshot, rollback } from './backup.js';

// 从类型子模块导入
import type { ChangeRecord } from './change-control/types.js';

// 从风险评估子模块导入
import {
  assessFileRisk,
  getRiskStyle,
  getRiskLabel,
  isRiskAtOrAbove,
  isAutoApprovable,
} from './change-control/risk-assessor.js';

// 从审批子模块导入
import {
  formatRiskSummary,
  requestApproval,
  isInteractiveMode,
} from './change-control/approval.js';

// Re-export 风险规则模块的公共接口
export {
  RiskLevel,
  RISK_LEVEL_WEIGHT,
  RISK_LEVEL_LABEL,
  RISK_LEVEL_STYLE,
  RISK_RULES,
  assessRisk,
};

// Re-export 备份模块的公共接口
export { backupFile, createSnapshot, rollback };

// Re-export 类型
export type { ChangeRecord } from './change-control/types.js';

// ==================== 内部工具函数 ====================

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return crypto.randomUUID();
}

// ==================== ChangeControlManager 类 ====================

/**
 * 变更控制管理器
 *
 * 提供完整的变更控制流程，包括：
 * - 记录变更
 * - 评估风险并请求批准
 * - 执行带保护的变更（自动备份 + 风险评估 + 审批）
 * - 变更历史查询与统计
 */
export class ChangeControlManager {
  /** 变更记录列表 */
  private records: ChangeRecord[] = [];
  /** 是否启用变更控制 */
  private enabled: boolean = true;

  /**
   * 记录一个变更
   *
   * 创建变更记录并添加到历史列表中。不执行风险评估和审批流程。
   *
   * @param action - 操作类型
   * @param target - 操作目标
   * @returns 创建的变更记录
   */
  recordChange(
    action: ChangeRecord['action'],
    target: string
  ): ChangeRecord {
    const assessment = assessFileRisk(action, target);

    const record: ChangeRecord = {
      id: generateId(),
      action,
      target,
      risk: assessment.risk,
      backedUp: false,
      approved: isAutoApprovable(assessment.risk),
      timestamp: Date.now(),
    };

    this.records.push(record);

    // 自动清理旧记录（保留最近 500 条）
    if (this.records.length > 500) {
      this.records = this.records.slice(-400);
    }

    // 在控制台输出变更记录
    const style = getRiskStyle(assessment.risk);
    console.log(
      chalk.dim(`[变更记录] `) +
      `${style(`[${getRiskLabel(assessment.risk)}]`)} ` +
      `${chalk.cyan(action)} ` +
      chalk.dim(target) +
      (assessment.reason ? chalk.dim(` (${assessment.reason})`) : '')
    );

    return record;
  }

  /**
   * 评估并请求批准
   *
   * 对操作进行风险评估，如果风险等级达到 MEDIUM 或以上，
   * 则在终端中请求用户确认。
   *
   * @param action - 操作类型
   * @param target - 操作目标
   * @returns 批准结果和对应的变更记录
   */
  async evaluateAndApprove(
    action: ChangeRecord['action'],
    target: string
  ): Promise<{ approved: boolean; record: ChangeRecord }> {
    const assessment = assessFileRisk(action, target);

    const record: ChangeRecord = {
      id: generateId(),
      action,
      target,
      risk: assessment.risk,
      backedUp: false,
      approved: false,
      timestamp: Date.now(),
    };

    // 低风险操作自动批准
    if (isAutoApprovable(assessment.risk)) {
      record.approved = true;
      this.records.push(record);
      return { approved: true, record };
    }

    // 中风险及以上需要用户确认
    const approvalResult = await requestApproval(action, target, assessment, record);
    record.approved = approvalResult.approved;

    if (approvalResult.approved) {
      this.records.push(record);
    }

    return { approved: approvalResult.approved, record };
  }

  /**
   * 执行带保护的变更
   *
   * 完整的变更保护流程：
   * 1. 评估风险
   * 2. 如果风险 >= HIGH，自动备份文件
   * 3. 如果风险 >= MEDIUM，请求用户确认
   * 4. 如果风险 >= HIGH，创建快照
   * 5. 执行操作
   * 6. 记录变更
   *
   * @param action - 操作类型
   * @param target - 操作目标
   * @param executeFn - 实际执行操作的异步函数
   * @returns 执行结果，包含是否成功、操作返回值和变更记录
   */
  async executeProtectedChange(
    action: ChangeRecord['action'],
    target: string,
    executeFn: () => Promise<unknown>
  ): Promise<{ success: boolean; result?: unknown; record: ChangeRecord }> {
    // 如果变更控制已禁用，直接执行
    if (!this.enabled) {
      const record = this.recordChange(action, target);
      try {
        const result = await executeFn();
        return { success: true, result, record };
      } catch (error) {
        return { success: false, record };
      }
    }

    // 步骤 1: 评估风险
    const assessment = assessFileRisk(action, target);

    const record: ChangeRecord = {
      id: generateId(),
      action,
      target,
      risk: assessment.risk,
      backedUp: false,
      approved: false,
      timestamp: Date.now(),
    };

    // 步骤 2: 如果风险 >= HIGH，自动备份文件（仅对文件操作）
    if (isRiskAtOrAbove(assessment.risk, RiskLevel.HIGH)) {
      if (action !== 'shell' && action !== 'read') {
        const backupResult = await backupFile(target);
        if (backupResult.success && backupResult.backupPath) {
          record.backedUp = true;
          record.backupPath = backupResult.backupPath;
          console.log(chalk.green(`[变更控制] 已创建备份: ${backupResult.backupPath}`));
        } else if (backupResult.error) {
          console.log(chalk.yellow(`[变更控制] 备份失败: ${backupResult.error}`));
        }
      }
    }

    // 步骤 3: 如果风险 >= MEDIUM，请求用户确认
    if (isRiskAtOrAbove(assessment.risk, RiskLevel.MEDIUM)) {
      const backupInfo = record.backedUp
        ? { backedUp: record.backedUp, backupPath: record.backupPath }
        : undefined;

      const approvalResult = await requestApproval(action, target, assessment, record, backupInfo);

      if (!approvalResult.approved) {
        this.records.push(record);
        return { success: false, record };
      }

      record.approved = true;
    } else {
      // 低风险操作自动批准
      record.approved = true;
    }

    // 步骤 4: 如果风险 >= HIGH，创建快照（仅对文件操作）
    if (isRiskAtOrAbove(assessment.risk, RiskLevel.HIGH)) {
      if (action !== 'shell' && action !== 'read') {
        const snapshot = await createSnapshot(target);
        if (snapshot !== null) {
          record.snapshot = snapshot;
          console.log(chalk.green(`[变更控制] 已创建快照 (${snapshot.length} 字节)`));
        }
      }
    }

    // 步骤 5: 执行操作
    try {
      const result = await executeFn();

      // 步骤 6: 记录变更
      this.records.push(record);

      console.log(
        chalk.dim(`[变更控制] `) +
        chalk.green('操作执行成功') +
        chalk.dim(` [${record.id.slice(0, 8)}]`)
      );

      return { success: true, result, record };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.records.push(record);

      console.log(
        chalk.dim(`[变更控制] `) +
        chalk.red('操作执行失败') +
        chalk.dim(`: ${errorMessage} [${record.id.slice(0, 8)}]`)
      );

      return { success: false, record };
    }
  }

  /**
   * 获取变更历史
   *
   * @returns 所有变更记录列表（按时间升序排列）
   */
  getHistory(): ChangeRecord[] {
    return [...this.records];
  }

  /**
   * 获取变更统计
   *
   * @returns 统计信息，包含总数、按风险等级分布和按操作类型分布
   */
  getStats(): {
    total: number;
    byRisk: Record<RiskLevel, number>;
    byAction: Record<string, number>;
  } {
    const byRisk: Record<RiskLevel, number> = {
      [RiskLevel.NEGLIGIBLE]: 0,
      [RiskLevel.LOW]: 0,
      [RiskLevel.MEDIUM]: 0,
      [RiskLevel.HIGH]: 0,
      [RiskLevel.CRITICAL]: 0,
    };

    const byAction: Record<string, number> = {};

    for (const record of this.records) {
      byRisk[record.risk]++;
      byAction[record.action] = (byAction[record.action] || 0) + 1;
    }

    return {
      total: this.records.length,
      byRisk,
      byAction,
    };
  }

  /**
   * 清空变更历史
   */
  clearHistory(): void {
    this.records = [];
    console.log(chalk.dim('[变更控制] 历史记录已清空'));
  }

  /**
   * 启用或禁用变更控制
   *
   * 禁用后，所有操作将跳过风险评估和审批流程，直接执行。
   *
   * @param enabled - 是否启用
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    const status = enabled ? chalk.green('已启用') : chalk.red('已禁用');
    console.log(chalk.dim(`[变更控制] 变更控制${status}`));
  }
}
