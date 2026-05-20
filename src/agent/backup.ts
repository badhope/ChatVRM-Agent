/**
 * 变更控制系统 - 文件备份与回滚
 *
 * 提供文件备份、快照创建和回滚能力：
 * 1. 文件备份 - 将文件复制到备份目录
 * 2. 快照创建 - 读取文件当前内容作为内存快照
 * 3. 回滚 - 将文件恢复到修改前的状态
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { BACKUP_DIR } from '../utils/index.js';
import type { ChangeRecord } from './change-control.js';

/**
 * 文件备份 - 将文件复制到备份目录
 *
 * 在 `~/.devflow/backups/` 目录下创建备份文件。
 * 备份文件名格式：`原文件名_时间戳.bak`
 * 如果源文件不存在，返回成功但不创建备份。
 *
 * @param filePath - 需要备份的文件路径
 * @returns 备份结果，包含是否成功、备份路径或错误信息
 *
 * @example
 * ```typescript
 * const result = await backupFile('/project/config.json');
 * if (result.success) {
 *   console.log(`备份已创建: ${result.backupPath}`);
 * }
 * ```
 */
export async function backupFile(
  filePath: string
): Promise<{ success: boolean; backupPath?: string; error?: string }> {
  try {
    // 检查源文件是否存在
    try {
      await fs.access(filePath);
    } catch {
      // 文件不存在，返回成功但不创建备份
      return { success: true };
    }

    // 构建备份目录路径
    const backupDir = BACKUP_DIR;
    await fs.mkdir(backupDir, { recursive: true });

    // 构建备份文件名：原文件名_时间戳.bak
    const parsedPath = path.parse(filePath);
    const timestamp = Date.now();
    const backupFileName = `${parsedPath.name}_${timestamp}.bak`;
    const backupFilePath = path.join(backupDir, backupFileName);

    // 复制文件到备份目录
    await fs.copyFile(filePath, backupFilePath);

    return {
      success: true,
      backupPath: backupFilePath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `备份失败: ${errorMessage}`,
    };
  }
}

/**
 * 创建快照 - 读取文件当前内容作为快照
 *
 * 快照用于后续回滚操作，将文件内容保存在内存中。
 * 如果文件不存在，返回 null。
 *
 * @param filePath - 需要创建快照的文件路径
 * @returns 文件内容字符串，文件不存在时返回 null
 *
 * @example
 * ```typescript
 * const snapshot = await createSnapshot('/project/config.json');
 * if (snapshot !== null) {
 *   // 快照已创建，可以用于后续回滚
 *   console.log(`快照大小: ${snapshot.length} 字节`);
 * }
 * ```
 */
export async function createSnapshot(filePath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath);
    const MAX_SNAPSHOT_SIZE = 10 * 1024 * 1024; // 10MB
    if (stat.size > MAX_SNAPSHOT_SIZE) {
      return null;
    }

    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch {
    // 文件不存在或无法读取
    return null;
  }
}

/**
 * 回滚 - 将文件恢复到修改前的状态
 *
 * 使用变更记录中保存的快照内容，将文件恢复到修改前的状态。
 * 如果没有快照，则尝试从备份路径恢复。
 *
 * @param change - 变更记录，包含快照或备份路径
 * @returns 回滚结果，包含是否成功或错误信息
 *
 * @example
 * ```typescript
 * const result = await rollback(changeRecord);
 * if (result.success) {
 *   console.log('文件已回滚到修改前的状态');
 * }
 * ```
 */
export async function rollback(
  change: ChangeRecord
): Promise<{ success: boolean; error?: string }> {
  try {
    // 优先使用快照回滚
    if (change.snapshot !== undefined) {
      // 确保目标文件所在目录存在
      const targetDir = path.dirname(change.target);
      await fs.mkdir(targetDir, { recursive: true });

      // 将快照内容写入目标文件
      await fs.writeFile(change.target, change.snapshot, 'utf-8');
      return { success: true };
    }

    // 其次尝试从备份路径恢复
    if (change.backupPath) {
      try {
        await fs.access(change.backupPath);
      } catch {
        return {
          success: false,
          error: `备份文件不存在: ${change.backupPath}`,
        };
      }

      // 确保目标文件所在目录存在
      const targetDir = path.dirname(change.target);
      await fs.mkdir(targetDir, { recursive: true });

      // 从备份复制回目标文件
      await fs.copyFile(change.backupPath, change.target);
      return { success: true };
    }

    return {
      success: false,
      error: '没有可用的快照或备份，无法回滚',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `回滚失败: ${errorMessage}`,
    };
  }
}
