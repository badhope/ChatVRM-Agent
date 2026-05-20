import type { EntityType, RelationshipType, Entity, Relationship, MemoryEntry } from './types.js';

// ============================================================
// 技术关键词列表
// ============================================================

const TECH_KEYWORDS: string[] = [
  'JavaScript', 'TypeScript', 'Python', 'Rust', 'Go', 'Java', 'C++', 'C#',
  'Ruby', 'PHP', 'Swift', 'Kotlin', 'Dart', 'Scala', 'Haskell', 'Elixir',
  'React', 'Vue', 'Angular', 'Svelte', 'Next.js', 'Nuxt', 'Gatsby',
  'Node.js', 'Deno', 'Bun', 'Express', 'Koa', 'Fastify', 'NestJS',
  'Docker', 'Kubernetes', 'K8s', 'Terraform', 'Ansible',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQLite', 'Elasticsearch',
  'GraphQL', 'REST', 'gRPC', 'WebSocket',
  'Git', 'GitHub', 'GitLab', 'Bitbucket',
  'AWS', 'Azure', 'GCP', 'Vercel', 'Netlify', 'Cloudflare',
  'Linux', 'Ubuntu', 'Debian', 'CentOS', 'Alpine',
  'TailwindCSS', 'Bootstrap', 'Sass', 'Less', 'CSS', 'HTML',
  'Webpack', 'Vite', 'esbuild', 'Rollup', 'Turbopack',
  'Jest', 'Vitest', 'Mocha', 'Cypress', 'Playwright',
  'TensorFlow', 'PyTorch', 'OpenCV', 'Pandas', 'NumPy',
  'Flutter', 'React Native', 'Electron', 'Tauri',
  'Nginx', 'Apache', 'Caddy', 'Traefik',
  'RabbitMQ', 'Kafka', 'Zookeeper', 'Consul',
  'Elasticsearch', 'Logstash', 'Kibana', 'Prometheus', 'Grafana',
  'OAuth', 'JWT', 'SAML', 'SSO', 'LDAP',
  'CI/CD', 'GitHub Actions', 'Jenkins', 'Travis CI', 'CircleCI',
  'Figma', 'Sketch', 'Adobe XD',
  'Lua', 'Perl', 'R', 'MATLAB', 'Shell', 'Bash', 'PowerShell',
  'Zig', 'Carbon', 'Nim', 'V', 'Crystal', 'Julia',
  'SolidJS', 'Qwik', 'Astro', 'Remix', 'SolidStart',
  'tRPC', 'Prisma', 'Drizzle', 'TypeORM', 'Sequelize',
  'Supabase', 'Firebase', 'Appwrite', 'PocketBase',
  'Hono', 'Fastify', 'Axum', 'Actix', 'Spring',
  'Django', 'Flask', 'FastAPI', 'Rails', 'Laravel', 'Phoenix',
  'Redis', 'Memcached', 'Cassandra', 'DynamoDB', 'CockroachDB',
  'Neo4j', 'ArangoDB', 'InfluxDB', 'TimescaleDB',
  'WebSocket', 'SSE', 'Socket.io', 'MQTT',
  'OpenAI', 'Anthropic', 'LangChain', 'LlamaIndex',
  'MCP', 'Claude', 'GPT', 'BERT', 'Transformer',
];

/** 导出技术关键词供外部使用 */
export { TECH_KEYWORDS };

// ============================================================
// 分类器
// ============================================================

/**
 * 根据名称推断实体类型
 */
export function classifyEntityType(name: string): EntityType {
  // 检查是否是技术关键词
  if (TECH_KEYWORDS.some((tech) => tech.toLowerCase() === name.toLowerCase())) {
    return 'tech';
  }

  // 检查是否包含编程语言常见后缀
  if (/\.(js|ts|py|rs|go|java|rb|php|swift|kt|dart|c|cpp|h|cs|lua|pl|r|m|sh|ps1)$/i.test(name)) {
    return 'tech';
  }

  // 检查是否是框架/库名（驼峰或短横线命名）
  if (/^[A-Z][a-zA-Z0-9]*$/.test(name) || /^[a-z]+-[a-z]+(-[a-z]+)*$/.test(name)) {
    return 'tech';
  }

  // 默认为概念
  return 'concept';
}

/**
 * 根据文本内容推断关系类型
 */
export function classifyRelationship(text: string): RelationshipType | null {
  const lowerText = text.toLowerCase();

  if (/喜欢|偏好|最爱/.test(lowerText)) return 'likes';
  if (/使用|在用|采用|用了/.test(lowerText)) return 'uses';
  if (/知道|了解|熟悉/.test(lowerText)) return 'knows';
  if (/项目叫|项目名为|项目名是/.test(lowerText)) return 'created';

  return null;
}

// ============================================================
// 提取器
// ============================================================

/**
 * 从记忆中提取实体
 */
export function extractEntities(memories: MemoryEntry[]): Array<{
  type: EntityType;
  label: string;
  attributes?: Record<string, string>;
}> {
  const entities: Array<{ type: EntityType; label: string; attributes?: Record<string, string> }> = [];
  const processedEntities = new Set<string>();

  for (const memory of memories) {
    const text = `${memory.input} ${memory.output || ''}`;

    // 规则 1: "我是/叫/名字是 XXX" → person 实体
    const personPatterns = [
      /我是\s*([^\s,，。.!！?？]+)/g,
      /我叫\s*([^\s,，。.!！?？]+)/g,
      /名字是\s*([^\s,，。.!！?？]+)/g,
      /我的名字是\s*([^\s,，。.!！?？]+)/g,
    ];
    for (const pattern of personPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1].trim();
        if (name && !processedEntities.has(`person:${name}`)) {
          entities.push({ type: 'person', label: name });
          processedEntities.add(`person:${name}`);
        }
      }
    }

    // 规则 2: "项目叫/名为 XXX" → project 实体
    const projectPatterns = [
      /项目叫\s*([^\s,，。.!！?？]+)/g,
      /项目名为\s*([^\s,，。.!！?？]+)/g,
      /项目名是\s*([^\s,，。.!！?？]+)/g,
      /项目[名是叫]\s*[""\u300c\u300d]([^""\u300c\u300d]+)[""\u300c\u300d]/g,
    ];
    for (const pattern of projectPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const projectName = match[1].trim();
        if (projectName && !processedEntities.has(`project:${projectName}`)) {
          entities.push({ type: 'project', label: projectName });
          processedEntities.add(`project:${projectName}`);
        }
      }
    }

    // 规则 3: 技术关键词 → tech 实体
    for (const tech of TECH_KEYWORDS) {
      const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      if (regex.test(text)) {
        if (!processedEntities.has(`tech:${tech}`)) {
          entities.push({ type: 'tech', label: tech });
          processedEntities.add(`tech:${tech}`);
        }
      }
    }
  }

  return entities;
}

/**
 * 从记忆中提取关系（基于已有的实体）
 */
export function extractRelationships(
  memories: MemoryEntry[],
  entities: Array<{ type: EntityType; label: string }>,
): Array<{
  fromLabel: string;
  toLabel: string;
  type: RelationshipType;
  weight: number;
}> {
  const relationships: Array<{ fromLabel: string; toLabel: string; type: RelationshipType; weight: number }> = [];
  const processedRelationships = new Set<string>();

  // 构建实体查找集合
  const entityLabels = new Set(entities.map((e) => e.label));

  // 当前用户标签
  let currentUserLabel: string | undefined;

  for (const memory of memories) {
    const text = `${memory.input} ${memory.output || ''}`;

    // 识别当前用户
    const personPatterns = [
      /我是\s*([^\s,，。.!！?？]+)/g,
      /我叫\s*([^\s,，。.!！?？]+)/g,
      /名字是\s*([^\s,，。.!！?？]+)/g,
      /我的名字是\s*([^\s,，。.!！?？]+)/g,
    ];
    for (const pattern of personPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1].trim();
        if (name) currentUserLabel = name;
      }
    }

    // 规则: "喜欢/偏好/常用 XXX" → likes 关系
    const likePatterns = [
      /喜欢\s*([^\s,，。.!！?？]+)/g,
      /偏好\s*([^\s,，。.!！?？]+)/g,
      /常用\s*([^\s,，。.!！?？]+)/g,
      /最爱\s*([^\s,，。.!！?？]+)/g,
    ];
    for (const pattern of likePatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const target = match[1].trim();
        if (!target || !entityLabels.has(target)) continue;

        if (currentUserLabel) {
          const relKey = `${currentUserLabel}:likes:${target}`;
          if (!processedRelationships.has(relKey)) {
            relationships.push({ fromLabel: currentUserLabel, toLabel: target, type: 'likes', weight: 0.7 });
            processedRelationships.add(relKey);
          }
        }
      }
    }

    // 规则: "使用/用了 XXX" → uses 关系
    const usePatterns = [
      /使用\s*([^\s,，。.!！?？]+)/g,
      /用了\s*([^\s,，。.!！?？]+)/g,
      /在用\s*([^\s,，。.!！?？]+)/g,
      /正在用\s*([^\s,，。.!！?？]+)/g,
      /采用\s*([^\s,，。.!！?？]+)/g,
    ];
    for (const pattern of usePatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const target = match[1].trim();
        if (!target || !entityLabels.has(target)) continue;

        if (currentUserLabel) {
          const relKey = `${currentUserLabel}:uses:${target}`;
          if (!processedRelationships.has(relKey)) {
            relationships.push({ fromLabel: currentUserLabel, toLabel: target, type: 'uses', weight: 0.6 });
            processedRelationships.add(relKey);
          }
        }
      }
    }

    // 规则: "项目叫/名为 XXX" → created 关系
    const projectPatterns = [
      /项目叫\s*([^\s,，。.!！?？]+)/g,
      /项目名为\s*([^\s,，。.!！?？]+)/g,
      /项目名是\s*([^\s,，。.!！?？]+)/g,
      /项目[名是叫]\s*[""\u300c\u300d]([^""\u300c\u300d]+)[""\u300c\u300d]/g,
    ];
    for (const pattern of projectPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const projectName = match[1].trim();
        if (!projectName || !entityLabels.has(projectName)) continue;

        if (currentUserLabel) {
          const relKey = `${currentUserLabel}:created:${projectName}`;
          if (!processedRelationships.has(relKey)) {
            relationships.push({ fromLabel: currentUserLabel, toLabel: projectName, type: 'created', weight: 0.8 });
            processedRelationships.add(relKey);
          }
        }
      }
    }

    // 规则: "知道/了解/熟悉 XXX" → knows 关系
    const knowPatterns = [
      /知道\s*([^\s,，。.!！?？]+)/g,
      /了解\s*([^\s,，。.!！?？]+)/g,
      /熟悉\s*([^\s,，。.!！?？]+)/g,
    ];
    for (const pattern of knowPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const target = match[1].trim();
        if (!target || !entityLabels.has(target)) continue;

        if (currentUserLabel) {
          const relKey = `${currentUserLabel}:knows:${target}`;
          if (!processedRelationships.has(relKey)) {
            relationships.push({ fromLabel: currentUserLabel, toLabel: target, type: 'knows', weight: 0.6 });
            processedRelationships.add(relKey);
          }
        }
      }
    }
  }

  return relationships;
}
