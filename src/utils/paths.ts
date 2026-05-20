import path from 'path';
import { fileURLToPath } from 'url';

function getProjectRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, '../..');
}

export const PROJECT_DIR = getProjectRoot();
export const DEVFLOW_DIR = path.join(PROJECT_DIR, '.devflow');
export const MEMORY_DIR = path.join(DEVFLOW_DIR, 'memory');
export const HISTORY_DIR = path.join(DEVFLOW_DIR, 'history');
export const TOOLS_DIR = path.join(DEVFLOW_DIR, 'tools');
export const BACKUP_DIR = path.join(DEVFLOW_DIR, 'backups');
