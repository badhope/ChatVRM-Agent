export interface GitStatus {
  branch: string;
  modified: string[];
  added: string[];
  deleted: string[];
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface IGitPort {
  isRepo(): Promise<boolean>;
  getStatus(): Promise<GitStatus>;
  commit(message: string): Promise<void>;
  createBranch(name: string): Promise<void>;
  checkout(branch: string): Promise<void>;
  diff(): Promise<string>;
  log(limit?: number): Promise<GitCommit[]>;
}