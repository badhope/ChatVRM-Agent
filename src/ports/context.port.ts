export interface BuildOptions {
  rootDir: string;
  query?: string;
  maxTokens?: number;
  includeRepoMap?: boolean;
  includeKnowledge?: boolean;
  includeCodeSearch?: boolean;
}

export interface BuildResult {
  context: string;
  repoMapIncluded: boolean;
  codeEntryCount: number;
  knowledgeEntryCount: number;
}

export interface KnowledgeEntry {
  id: string;
  type: string;
  label: string;
  relevance: number;
  snippet?: string;
}

export interface IContextPort {
  build(options: BuildOptions): Promise<BuildResult>;
  queryKnowledge(query: string): Promise<KnowledgeEntry[]>;
  getRepoMap(): Promise<string>;
}