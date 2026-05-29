export interface SkillDefinition {
  name: string;
  description: string;
  version: string;
  author?: string;
  tags: string[];
  triggers: string[];
  actions: SkillAction[];
  examples: SkillExample[];
  metadata: SkillMetadata;
}

export interface SkillAction {
  name: string;
  description: string;
  parameters?: SkillParameter[];
  handler: string;
  returns?: string;
}

export interface SkillParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: any;
  enum?: string[];
}

export interface SkillExample {
  trigger: string;
  description: string;
  expectedOutput: string;
}

export interface SkillMetadata {
  createdAt: string;
  updatedAt: string;
  rating?: number;
  downloads?: number;
  license?: string;
  repository?: string;
  issues?: string;
}

export interface SkillContext {
  message: string;
  user: {
    id: string;
    name: string;
    preferences?: Record<string, any>;
  };
  chat: {
    id: string;
    type: 'direct' | 'group' | 'channel';
  };
  attachments?: Array<{
    type: string;
    url: string;
    name?: string;
  }>;
  metadata?: Record<string, any>;
}

export interface SkillResult {
  success: boolean;
  output: string;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}

export interface Skill {
  definition: SkillDefinition;
  instance: SkillInstance;
}

export interface SkillInstance {
  id: string;
  skill: SkillDefinition;
  enabled: boolean;
  usageCount: number;
  lastUsed?: number;
  rating?: number;
}

export interface SkillMatch {
  skill: SkillDefinition;
  score: number;
  matchedTrigger: string;
}

export interface SkillExecutionContext {
  skill: SkillDefinition;
  action: SkillAction;
  parameters: Record<string, any>;
  context: SkillContext;
}

export interface SkillParserResult {
  success: boolean;
  skill?: SkillDefinition;
  errors?: Array<{
    line: number;
    message: string;
    severity: 'error' | 'warning';
  }>;
}

export interface SkillValidatorResult {
  valid: boolean;
  errors: Array<{
    field: string;
    message: string;
  }>;
  warnings: Array<{
    field: string;
    message: string;
  }>;
}

export interface SkillRegistryEntry {
  skill: SkillDefinition;
  path: string;
  loadedAt: number;
  checksum: string;
}

export interface SkillExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  lastExecution?: number;
}

export interface SkillPerformanceMetrics {
  skillName: string;
  executionCount: number;
  successRate: number;
  averageLatency: number;
  peakLatency: number;
  errorRate: number;
}

export interface SkillUpdate {
  skillName: string;
  version: string;
  changelog: string;
  breaking: boolean;
}

export interface SkillDependency {
  name: string;
  version: string;
  type: 'required' | 'optional';
}

export interface SkillPermissions {
  network: boolean;
  filesystem: boolean;
  shell: boolean;
  environment: boolean;
}

export interface SkillSandbox {
  permissions: SkillPermissions;
  timeout: number;
  memoryLimit?: number;
}

export default SkillDefinition;
