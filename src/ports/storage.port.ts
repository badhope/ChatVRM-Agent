export interface IStoragePort {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  list(path: string): Promise<string[]>;
  copy(src: string, dest: string): Promise<void>;
  move(src: string, dest: string): Promise<void>;
}