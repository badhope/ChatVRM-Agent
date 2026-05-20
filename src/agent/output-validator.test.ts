/**
 * Output Validator 模块单元测试
 *
 * 测试覆盖 Zod schema 验证和所有验证器函数
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  JsonSchema,
  CodeBlockSchema,
  MarkdownHeadingSchema,
  ToolCallSchema,
  MultipleToolCallsSchema,
  OutputValidator,
  createObjectSchema,
  createArraySchema,
  createStringSchema,
  DEFAULT_SCHEMAS,
  DEFAULT_ZOD_SCHEMAS,
  type OutputSchema,
} from './output-validator';

// ==================== Zod Schema Tests ====================

describe('JsonSchema', () => {
  it('应该验证有效的 JSON 对象', () => {
    const result = JsonSchema.safeParse({ key: 'value' });
    expect(result.success).toBe(true);
  });

  it('应该验证有效的 JSON 数组', () => {
    const result = JsonSchema.safeParse([1, 2, 3]);
    expect(result.success).toBe(true);
  });

  it('应该验证 null 值', () => {
    const result = JsonSchema.safeParse(null);
    expect(result.success).toBe(true);
  });

  it('应该验证数字', () => {
    const result = JsonSchema.safeParse(42);
    expect(result.success).toBe(true);
  });

  it('应该验证字符串', () => {
    const result = JsonSchema.safeParse('hello');
    expect(result.success).toBe(true);
  });

  it('应该验证布尔值', () => {
    const result = JsonSchema.safeParse(true);
    expect(result.success).toBe(true);
  });

  it('应该拒绝 undefined', () => {
    const result = JsonSchema.safeParse(undefined);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('undefined');
    }
  });

  it('应该验证嵌套对象', () => {
    const result = JsonSchema.safeParse({
      nested: {
        deep: {
          value: 'test',
        },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('CodeBlockSchema', () => {
  it('应该验证带有语言的代码块', () => {
    const result = CodeBlockSchema.safeParse({
      language: 'typescript',
      content: 'const x = 1;',
    });
    expect(result.success).toBe(true);
  });

  it('应该验证不带语言的代码块', () => {
    const result = CodeBlockSchema.safeParse({
      content: 'some code here',
    });
    expect(result.success).toBe(true);
  });

  it('应该拒绝空内容', () => {
    const result = CodeBlockSchema.safeParse({
      language: 'javascript',
      content: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((e) => e.message.includes('不能为空'))).toBe(true);
    }
  });

  it('应该拒绝缺少内容的代码块', () => {
    const result = CodeBlockSchema.safeParse({
      language: 'python',
    });
    expect(result.success).toBe(false);
  });

  it('应该验证多行代码内容', () => {
    const result = CodeBlockSchema.safeParse({
      language: 'python',
      content: 'def hello():\n    print("Hello")\n    return True',
    });
    expect(result.success).toBe(true);
  });
});

describe('MarkdownHeadingSchema', () => {
  it('应该验证有效的标题（级别 1-6）', () => {
    for (let level = 1; level <= 6; level++) {
      const result = MarkdownHeadingSchema.safeParse({
        level,
        text: `Heading ${level}`,
      });
      expect(result.success).toBe(true);
    }
  });

  it('应该拒绝级别为 0 的标题', () => {
    const result = MarkdownHeadingSchema.safeParse({
      level: 0,
      text: 'Invalid Heading',
    });
    expect(result.success).toBe(false);
  });

  it('应该拒绝级别为 7 的标题', () => {
    const result = MarkdownHeadingSchema.safeParse({
      level: 7,
      text: 'Invalid Heading',
    });
    expect(result.success).toBe(false);
  });

  it('应该拒绝非整数级别', () => {
    const result = MarkdownHeadingSchema.safeParse({
      level: 1.5,
      text: 'Invalid Heading',
    });
    expect(result.success).toBe(false);
  });

  it('应该拒绝空标题文本', () => {
    const result = MarkdownHeadingSchema.safeParse({
      level: 1,
      text: '',
    });
    expect(result.success).toBe(false);
  });

  it('应该拒绝缺少级别字段', () => {
    const result = MarkdownHeadingSchema.safeParse({
      text: 'Heading without level',
    });
    expect(result.success).toBe(false);
  });
});

describe('ToolCallSchema', () => {
  it('应该验证有效的工具调用', () => {
    const result = ToolCallSchema.safeParse({
      name: 'readFile',
      arguments: { path: '/test/file.ts' },
    });
    expect(result.success).toBe(true);
  });

  it('应该验证不带参数的工具调用', () => {
    const result = ToolCallSchema.safeParse({
      name: 'listFiles',
    });
    expect(result.success).toBe(true);
  });

  it('应该验证带空参数对象的工具调用', () => {
    const result = ToolCallSchema.safeParse({
      name: 'ping',
      arguments: {},
    });
    expect(result.success).toBe(true);
  });

  it('应该拒绝空工具名称', () => {
    const result = ToolCallSchema.safeParse({
      name: '',
      arguments: {},
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((e) => e.message.includes('不能为空'))).toBe(true);
    }
  });

  it('应该拒绝缺少工具名称', () => {
    const result = ToolCallSchema.safeParse({
      arguments: { key: 'value' },
    });
    expect(result.success).toBe(false);
  });

  it('应该验证复杂参数对象', () => {
    const result = ToolCallSchema.safeParse({
      name: 'executeCommand',
      arguments: {
        command: 'npm test',
        options: {
          timeout: 30000,
          env: { NODE_ENV: 'test' },
        },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('MultipleToolCallsSchema', () => {
  it('应该验证多个工具调用的数组', () => {
    const result = MultipleToolCallsSchema.safeParse([
      { name: 'readFile', arguments: { path: '/a.ts' } },
      { name: 'writeFile', arguments: { path: '/b.ts', content: 'code' } },
    ]);
    expect(result.success).toBe(true);
  });

  it('应该验证单个工具调用的数组', () => {
    const result = MultipleToolCallsSchema.safeParse([
      { name: 'singleTool' },
    ]);
    expect(result.success).toBe(true);
  });

  it('应该拒绝空数组', () => {
    const result = MultipleToolCallsSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it('应该拒绝非数组输入', () => {
    const result = MultipleToolCallsSchema.safeParse({
      name: 'tool',
    });
    expect(result.success).toBe(false);
  });

  it('应该拒绝包含无效工具调用的数组', () => {
    const result = MultipleToolCallsSchema.safeParse([
      { name: 'validTool' },
      { name: '' }, // 无效：空名称
    ]);
    expect(result.success).toBe(false);
  });
});

// ==================== OutputValidator Class Tests ====================

describe('OutputValidator', () => {
  let validator: OutputValidator;

  beforeEach(() => {
    validator = new OutputValidator();
  });

  describe('validate()', () => {
    it('未注册 schema 时应该返回验证通过', () => {
      const result = validator.validate('any output', 'unknown-intent');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('使用注册的 OutputSchema 验证有效输入', () => {
      validator.registerSchema('test', {
        type: 'text',
        required: ['hello'],
      });
      const result = validator.validate('hello world', 'test');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('使用注册的 OutputSchema 验证无效输入', () => {
      validator.registerSchema('test', {
        type: 'text',
        required: ['required-text'],
      });
      const result = validator.validate('hello world', 'test');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('required-text'));
    });

    it('使用注册的 Zod schema 验证有效 JSON', () => {
      validator.registerZodSchema(
        'user',
        z.object({
          name: z.string(),
          age: z.number(),
        })
      );
      const result = validator.validate(JSON.stringify({ name: 'Alice', age: 30 }), 'user');
      expect(result.valid).toBe(true);
    });

    it('使用注册的 Zod schema 验证无效 JSON', () => {
      validator.registerZodSchema(
        'user',
        z.object({
          name: z.string(),
          age: z.number(),
        })
      );
      const result = validator.validate(JSON.stringify({ name: 'Alice' }), 'user');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('同时使用 OutputSchema 和 Zod schema 验证', () => {
      validator.registerSchema('combined', {
        type: 'json',
        minLength: 5,
      });
      validator.registerZodSchema(
        'combined',
        z.object({
          id: z.number(),
        })
      );
      const result = validator.validate(JSON.stringify({ id: 1 }), 'combined');
      expect(result.valid).toBe(true);
    });

    it('验证失败时返回有意义的错误信息', () => {
      validator.registerSchema('test', {
        type: 'text',
        required: ['必须包含的内容'],
        minLength: 100,
      });
      const result = validator.validate('短文本', 'test');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // 检查错误信息是否包含具体细节
      const errorStr = result.errors.join(' ');
      expect(errorStr).toContain('必须包含的内容');
    });
  });

  describe('validateJson()', () => {
    it('应该验证有效的 JSON 字符串', () => {
      const result = validator.validateJson('{"key": "value"}');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该验证有效的 JSON 数组', () => {
      const result = validator.validateJson('[1, 2, 3]');
      expect(result.valid).toBe(true);
    });

    it('应该拒绝无效的 JSON 字符串', () => {
      const result = validator.validateJson('not valid json');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('JSON 解析错误');
    });

    it('应该拒绝不完整的 JSON', () => {
      const result = validator.validateJson('{"key": ');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('JSON 解析错误');
    });

    it('应该验证 null JSON 值', () => {
      const result = validator.validateJson('null');
      expect(result.valid).toBe(true);
    });

    it('应该验证嵌套 JSON 对象', () => {
      const result = validator.validateJson(
        JSON.stringify({
          level1: {
            level2: {
              level3: 'deep value',
            },
          },
        })
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('validateCode()', () => {
    it('应该验证有效的代码块', () => {
      const result = validator.validateCode('```typescript\nconst x = 1;\n```');
      expect(result.valid).toBe(true);
    });

    it('应该验证普通代码（非代码块格式）', () => {
      const result = validator.validateCode('function hello() { return "world"; }');
      expect(result.valid).toBe(true);
    });

    it('应该检测括号不匹配', () => {
      const result = validator.validateCode('function test() { return;');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('花括号不匹配'))).toBe(true);
    });

    it('应该检测圆括号不匹配', () => {
      const result = validator.validateCode('const result = func(;');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('圆括号不匹配'))).toBe(true);
    });

    it('应该检测方括号不匹配', () => {
      const result = validator.validateCode('const arr = [1, 2;');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('方括号不匹配'))).toBe(true);
    });

    it('应该检测函数名以数字开头的错误', () => {
      const result = validator.validateCode('function 123invalid() {}');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('函数名不能以数字开头'))).toBe(true);
    });

    it('应该检测变量名以数字开头的错误', () => {
      const result = validator.validateCode('const 123var = 1;');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('变量名不能以数字开头'))).toBe(true);
    });

    it('应该检测未闭合的模板字符串', () => {
      const result = validator.validateCode('const str = `unclosed');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('模板字符串未正确闭合'))).toBe(true);
    });

    it('应该为 console.log 生成建议', () => {
      const result = validator.validateCode('console.log("debug");');
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions?.some((s) => s.includes('console.log'))).toBe(true);
    });

    it('应该为 debugger 语句生成建议', () => {
      const result = validator.validateCode('debugger;');
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions?.some((s) => s.includes('debugger'))).toBe(true);
    });

    it('应该为 var 使用生成建议', () => {
      const result = validator.validateCode('var x = 1;');
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions?.some((s) => s.includes('let/const'))).toBe(true);
    });

    it('应该为 == 使用生成建议', () => {
      const result = validator.validateCode('if (a == b) {}');
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions?.some((s) => s.includes('==='))).toBe(true);
    });

    it('应该验证空代码块内容', () => {
      const result = validator.validateCode('```\n```');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('不能为空'))).toBe(true);
    });
  });

  describe('validateMarkdown()', () => {
    it('应该验证有效的 Markdown', () => {
      const result = validator.validateMarkdown('# Heading\n\nParagraph text.');
      expect(result.valid).toBe(true);
    });

    it('应该验证多级标题', () => {
      const markdown = `# H1
## H2
### H3
#### H4
##### H5
###### H6`;
      const result = validator.validateMarkdown(markdown);
      expect(result.valid).toBe(true);
    });

    it('应该检测未闭合的代码块', () => {
      const result = validator.validateMarkdown('```javascript\nconst x = 1;');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('代码块未正确闭合'))).toBe(true);
    });

    it('应该检测无效的链接格式', () => {
      const result = validator.validateMarkdown('[](url)');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('无效链接格式'))).toBe(true);
    });

    it('应该验证有效的链接', () => {
      const result = validator.validateMarkdown('[Link Text](https://example.com)');
      expect(result.valid).toBe(true);
    });

    it('应该验证包含代码块的 Markdown', () => {
      const markdown = `# Code Example

\`\`\`typescript
const x = 1;
\`\`\`

End of document.`;
      const result = validator.validateMarkdown(markdown);
      expect(result.valid).toBe(true);
    });

    it('应该验证纯文本 Markdown', () => {
      const result = validator.validateMarkdown('Just plain text without any formatting.');
      expect(result.valid).toBe(true);
    });
  });

  describe('registerSchema()', () => {
    it('应该成功注册 OutputSchema', () => {
      const schema: OutputSchema = {
        type: 'text',
        required: ['test'],
      };
      validator.registerSchema('my-intent', schema);
      const result = validator.validate('test content', 'my-intent');
      expect(result.valid).toBe(true);
    });

    it('应该覆盖已存在的 schema', () => {
      validator.registerSchema('test', { type: 'text', required: ['first'] });
      validator.registerSchema('test', { type: 'text', required: ['second'] });

      const result1 = validator.validate('first', 'test');
      expect(result1.valid).toBe(false);

      const result2 = validator.validate('second', 'test');
      expect(result2.valid).toBe(true);
    });
  });

  describe('registerZodSchema()', () => {
    it('应该成功注册 Zod schema', () => {
      validator.registerZodSchema(
        'person',
        z.object({
          name: z.string(),
          age: z.number().positive(),
        })
      );
      const result = validator.validate(
        JSON.stringify({ name: 'Bob', age: 25 }),
        'person'
      );
      expect(result.valid).toBe(true);
    });

    it('应该覆盖已存在的 Zod schema', () => {
      validator.registerZodSchema('test', z.string().min(5));
      validator.registerZodSchema('test', z.string().min(2));

      const result = validator.validate('"ab"', 'test');
      expect(result.valid).toBe(true);
    });
  });
});

// ==================== Custom Schema Tests ====================

describe('自定义 Schema 测试', () => {
  let validator: OutputValidator;

  beforeEach(() => {
    validator = new OutputValidator();
  });

  it('应该使用自定义 Zod schema 验证复杂对象', () => {
    const UserSchema = z.object({
      id: z.number().int().positive(),
      name: z.string().min(1).max(100),
      email: z.string().email(),
      roles: z.array(z.enum(['admin', 'user', 'guest'])),
      metadata: z.record(z.unknown()).optional(),
    });

    validator.registerZodSchema('user', UserSchema);

    const validUser = JSON.stringify({
      id: 1,
      name: 'Alice',
      email: 'alice@example.com',
      roles: ['admin', 'user'],
    });

    const result = validator.validate(validUser, 'user');
    expect(result.valid).toBe(true);
  });

  it('自定义 schema 应该返回详细的验证错误', () => {
    const ProductSchema = z.object({
      name: z.string().min(1),
      price: z.number().positive(),
      quantity: z.number().int().nonnegative(),
    });

    validator.registerZodSchema('product', ProductSchema);

    const invalidProduct = JSON.stringify({
      name: '',
      price: -10,
      quantity: 1.5,
    });

    const result = validator.validate(invalidProduct, 'product');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('应该支持嵌套对象验证', () => {
    const NestedSchema = z.object({
      user: z.object({
        profile: z.object({
          name: z.string(),
          settings: z.object({
            theme: z.enum(['light', 'dark']),
          }),
        }),
      }),
    });

    validator.registerZodSchema('nested', NestedSchema);

    const validData = JSON.stringify({
      user: {
        profile: {
          name: 'Test',
          settings: { theme: 'dark' },
        },
      },
    });

    const result = validator.validate(validData, 'nested');
    expect(result.valid).toBe(true);
  });

  it('应该支持联合类型验证', () => {
    const UnionSchema = z.union([
      z.object({ type: z.literal('text'), content: z.string() }),
      z.object({ type: z.literal('image'), url: z.string() }),
    ]);

    validator.registerZodSchema('media', UnionSchema);

    const textMedia = JSON.stringify({ type: 'text', content: 'Hello' });
    const imageMedia = JSON.stringify({ type: 'image', url: 'https://example.com/img.png' });

    expect(validator.validate(textMedia, 'media').valid).toBe(true);
    expect(validator.validate(imageMedia, 'media').valid).toBe(true);
  });
});

// ==================== Helper Function Tests ====================

describe('createObjectSchema()', () => {
  it('应该创建基本的对象 schema', () => {
    const schema = createObjectSchema({
      name: z.string(),
      age: z.number(),
    });

    const result = schema.safeParse({ name: 'Alice', age: 30 });
    expect(result.success).toBe(true);
  });

  it('应该拒绝缺少必需字段的对象', () => {
    const schema = createObjectSchema({
      id: z.number(),
      title: z.string(),
    });

    const result = schema.safeParse({ id: 1 });
    expect(result.success).toBe(false);
  });

  it('应该支持可选字段', () => {
    const schema = createObjectSchema({
      required: z.string(),
      optional: z.string().optional(),
    });

    const result = schema.safeParse({ required: 'value' });
    expect(result.success).toBe(true);
  });

  it('应该支持嵌套对象', () => {
    const schema = createObjectSchema({
      user: z.object({
        name: z.string(),
      }),
    });

    const result = schema.safeParse({ user: { name: 'Bob' } });
    expect(result.success).toBe(true);
  });
});

describe('createArraySchema()', () => {
  it('应该创建基本的数组 schema', () => {
    const schema = createArraySchema(z.number());

    const result = schema.safeParse([1, 2, 3, 4, 5]);
    expect(result.success).toBe(true);
  });

  it('应该支持最小长度约束', () => {
    const schema = createArraySchema(z.string(), { min: 2 });

    expect(schema.safeParse(['a', 'b']).success).toBe(true);
    expect(schema.safeParse(['a']).success).toBe(false);
  });

  it('应该支持最大长度约束', () => {
    const schema = createArraySchema(z.number(), { max: 3 });

    expect(schema.safeParse([1, 2, 3]).success).toBe(true);
    expect(schema.safeParse([1, 2, 3, 4]).success).toBe(false);
  });

  it('应该支持同时设置最小和最大长度', () => {
    const schema = createArraySchema(z.string(), { min: 1, max: 3 });

    expect(schema.safeParse([]).success).toBe(false);
    expect(schema.safeParse(['a']).success).toBe(true);
    expect(schema.safeParse(['a', 'b', 'c']).success).toBe(true);
    expect(schema.safeParse(['a', 'b', 'c', 'd']).success).toBe(false);
  });

  it('应该验证数组元素类型', () => {
    const schema = createArraySchema(z.number().positive());

    expect(schema.safeParse([1, 2, 3]).success).toBe(true);
    expect(schema.safeParse([1, -2, 3]).success).toBe(false);
  });

  it('应该支持复杂元素类型', () => {
    const schema = createArraySchema(
      z.object({
        id: z.number(),
        name: z.string(),
      })
    );

    const result = schema.safeParse([
      { id: 1, name: 'First' },
      { id: 2, name: 'Second' },
    ]);
    expect(result.success).toBe(true);
  });
});

describe('createStringSchema()', () => {
  it('应该创建基本的字符串 schema', () => {
    const schema = createStringSchema();

    expect(schema.safeParse('hello').success).toBe(true);
    expect(schema.safeParse('').success).toBe(true);
  });

  it('应该支持最小长度约束', () => {
    const schema = createStringSchema({ min: 3 });

    expect(schema.safeParse('abc').success).toBe(true);
    expect(schema.safeParse('ab').success).toBe(false);
  });

  it('应该支持最大长度约束', () => {
    const schema = createStringSchema({ max: 5 });

    expect(schema.safeParse('hello').success).toBe(true);
    expect(schema.safeParse('hello world').success).toBe(false);
  });

  it('应该支持正则表达式约束', () => {
    const schema = createStringSchema({ pattern: /^[a-z]+$/ });

    expect(schema.safeParse('hello').success).toBe(true);
    expect(schema.safeParse('Hello123').success).toBe(false);
  });

  it('应该支持组合约束', () => {
    const schema = createStringSchema({
      min: 3,
      max: 10,
      pattern: /^[a-z]+$/,
    });

    expect(schema.safeParse('hello').success).toBe(true);
    expect(schema.safeParse('hi').success).toBe(false); // 太短
    expect(schema.safeParse('helloworld!').success).toBe(false); // 太长
    expect(schema.safeParse('Hello').success).toBe(false); // 不匹配正则
  });
});

// ==================== Default Schemas Tests ====================

describe('DEFAULT_SCHEMAS', () => {
  it('应该包含 bug-hunter schema', () => {
    expect(DEFAULT_SCHEMAS['bug-hunter']).toBeDefined();
    expect(DEFAULT_SCHEMAS['bug-hunter'].type).toBe('text');
    expect(DEFAULT_SCHEMAS['bug-hunter'].required).toContain('问题');
    expect(DEFAULT_SCHEMAS['bug-hunter'].required).toContain('原因');
    expect(DEFAULT_SCHEMAS['bug-hunter'].required).toContain('修复');
  });

  it('应该包含 fullstack schema', () => {
    expect(DEFAULT_SCHEMAS['fullstack']).toBeDefined();
    expect(DEFAULT_SCHEMAS['fullstack'].type).toBe('code');
    expect(DEFAULT_SCHEMAS['fullstack'].patterns).toBeDefined();
    expect(DEFAULT_SCHEMAS['fullstack'].forbidden).toBeDefined();
  });

  it('应该包含 code-review schema', () => {
    expect(DEFAULT_SCHEMAS['code-review']).toBeDefined();
    expect(DEFAULT_SCHEMAS['code-review'].type).toBe('markdown');
    expect(DEFAULT_SCHEMAS['code-review'].required).toContain('审查');
    expect(DEFAULT_SCHEMAS['code-review'].required).toContain('建议');
  });

  it('应该包含 refactor schema', () => {
    expect(DEFAULT_SCHEMAS['refactor']).toBeDefined();
    expect(DEFAULT_SCHEMAS['refactor'].type).toBe('code');
  });

  it('应该包含 security schema', () => {
    expect(DEFAULT_SCHEMAS['security']).toBeDefined();
    expect(DEFAULT_SCHEMAS['security'].type).toBe('markdown');
    expect(DEFAULT_SCHEMAS['security'].required).toContain('漏洞');
    expect(DEFAULT_SCHEMAS['security'].required).toContain('风险');
    expect(DEFAULT_SCHEMAS['security'].required).toContain('建议');
  });

  it('应该包含 testing schema', () => {
    expect(DEFAULT_SCHEMAS['testing']).toBeDefined();
    expect(DEFAULT_SCHEMAS['testing'].type).toBe('code');
    expect(DEFAULT_SCHEMAS['testing'].patterns).toBeDefined();
  });

  it('所有 schema 应该有 maxLength 限制', () => {
    for (const [name, schema] of Object.entries(DEFAULT_SCHEMAS)) {
      expect(schema.maxLength).toBeDefined();
      expect(schema.maxLength).toBeGreaterThan(0);
    }
  });
});

describe('DEFAULT_ZOD_SCHEMAS', () => {
  describe('api-response schema', () => {
    it('应该验证成功的 API 响应', () => {
      const schema = DEFAULT_ZOD_SCHEMAS['api-response'];
      const result = schema.safeParse({
        success: true,
        data: { id: 1, name: 'Test' },
      });
      expect(result.success).toBe(true);
    });

    it('应该验证失败的 API 响应', () => {
      const schema = DEFAULT_ZOD_SCHEMAS['api-response'];
      const result = schema.safeParse({
        success: false,
        error: 'Something went wrong',
      });
      expect(result.success).toBe(true);
    });

    it('应该拒绝缺少 success 字段的响应', () => {
      const schema = DEFAULT_ZOD_SCHEMAS['api-response'];
      const result = schema.safeParse({
        data: { id: 1 },
      });
      expect(result.success).toBe(false);
    });

    it('应该拒绝 success 为非布尔值的响应', () => {
      const schema = DEFAULT_ZOD_SCHEMAS['api-response'];
      const result = schema.safeParse({
        success: 'true',
        data: null,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('task-result schema', () => {
    it('应该验证有效的任务结果', () => {
      const schema = DEFAULT_ZOD_SCHEMAS['task-result'];
      const validStatuses = ['pending', 'running', 'completed', 'failed'];

      for (const status of validStatuses) {
        const result = schema.safeParse({
          taskId: 'task-123',
          status,
        });
        expect(result.success).toBe(true);
      }
    });

    it('应该验证带结果的任务', () => {
      const schema = DEFAULT_ZOD_SCHEMAS['task-result'];
      const result = schema.safeParse({
        taskId: 'task-456',
        status: 'completed',
        result: { output: 'success' },
      });
      expect(result.success).toBe(true);
    });

    it('应该验证带错误的任务', () => {
      const schema = DEFAULT_ZOD_SCHEMAS['task-result'];
      const result = schema.safeParse({
        taskId: 'task-789',
        status: 'failed',
        error: 'Task execution failed',
      });
      expect(result.success).toBe(true);
    });

    it('应该拒绝无效的状态值', () => {
      const schema = DEFAULT_ZOD_SCHEMAS['task-result'];
      const result = schema.safeParse({
        taskId: 'task-123',
        status: 'invalid-status',
      });
      expect(result.success).toBe(false);
    });

    it('应该拒绝缺少 taskId 的任务', () => {
      const schema = DEFAULT_ZOD_SCHEMAS['task-result'];
      const result = schema.safeParse({
        status: 'pending',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('code-analysis schema', () => {
    it('应该验证有效的代码分析结果', () => {
      const schema = DEFAULT_ZOD_SCHEMAS['code-analysis'];
      const result = schema.safeParse({
        issues: [
          { type: 'syntax', severity: 'error', message: 'Missing semicolon', line: 10 },
          { type: 'style', severity: 'warning', message: 'Unused variable', line: 15 },
          { type: 'info', severity: 'info', message: 'Consider refactoring' },
        ],
        summary: 'Found 3 issues',
      });
      expect(result.success).toBe(true);
    });

    it('应该验证空的 issues 数组', () => {
      const schema = DEFAULT_ZOD_SCHEMAS['code-analysis'];
      const result = schema.safeParse({
        issues: [],
      });
      expect(result.success).toBe(true);
    });

    it('应该拒绝无效的 severity 值', () => {
      const schema = DEFAULT_ZOD_SCHEMAS['code-analysis'];
      const result = schema.safeParse({
        issues: [
          { type: 'error', severity: 'critical', message: 'Critical error' },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('应该拒绝缺少必需字段的 issue', () => {
      const schema = DEFAULT_ZOD_SCHEMAS['code-analysis'];
      const result = schema.safeParse({
        issues: [
          { type: 'syntax', severity: 'error' }, // 缺少 message
        ],
      });
      expect(result.success).toBe(false);
    });

    it('应该拒绝非数组的 issues', () => {
      const schema = DEFAULT_ZOD_SCHEMAS['code-analysis'];
      const result = schema.safeParse({
        issues: 'not an array',
      });
      expect(result.success).toBe(false);
    });
  });
});

// ==================== Edge Cases ====================

describe('边界情况测试', () => {
  let validator: OutputValidator;

  beforeEach(() => {
    validator = new OutputValidator();
  });

  describe('空输入处理', () => {
    it('validate() 应该处理空字符串', () => {
      validator.registerSchema('test', { type: 'text' });
      const result = validator.validate('', 'test');
      expect(result.valid).toBe(true);
    });

    it('validateJson() 应该拒绝空字符串', () => {
      const result = validator.validateJson('');
      expect(result.valid).toBe(false);
    });

    it('validateCode() 应该处理空代码', () => {
      const result = validator.validateCode('');
      expect(result.valid).toBe(true);
    });

    it('validateMarkdown() 应该处理空 Markdown', () => {
      const result = validator.validateMarkdown('');
      expect(result.valid).toBe(true);
    });
  });

  describe('Null/Undefined 处理', () => {
    it('validateJson() 应该正确处理 null JSON', () => {
      const result = validator.validateJson('null');
      expect(result.valid).toBe(true);
    });

    it('Zod schema 应该正确处理 null 值', () => {
      validator.registerZodSchema('nullable', z.null());
      const result = validator.validate('null', 'nullable');
      expect(result.valid).toBe(true);
    });

    it('Zod schema 应该拒绝 undefined', () => {
      validator.registerZodSchema('test', JsonSchema);
      // JSON.parse('null') 返回 null，不是 undefined
      // 直接测试 JsonSchema
      const result = JsonSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });
  });

  describe('大输入处理', () => {
    it('应该处理很长的字符串', () => {
      const longString = 'a'.repeat(10000);
      validator.registerSchema('test', {
        type: 'text',
        maxLength: 20000,
      });
      const result = validator.validate(longString, 'test');
      expect(result.valid).toBe(true);
    });

    it('应该检测超过 maxLength 的输入', () => {
      const longString = 'a'.repeat(10000);
      validator.registerSchema('test', {
        type: 'text',
        maxLength: 100,
      });
      const result = validator.validate(longString, 'test');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('过长'))).toBe(true);
    });

    it('应该处理深度嵌套的 JSON', () => {
      let nested: Record<string, unknown> = { value: 1 };
      for (let i = 0; i < 100; i++) {
        nested = { nested };
      }
      const result = validator.validateJson(JSON.stringify(nested));
      expect(result.valid).toBe(true);
    });

    it('应该处理大型数组', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `item-${i}` }));
      validator.registerZodSchema(
        'large-array',
        z.array(z.object({ id: z.number(), value: z.string() }))
      );
      const result = validator.validate(JSON.stringify(largeArray), 'large-array');
      expect(result.valid).toBe(true);
    });
  });

  describe('嵌套结构验证', () => {
    it('应该验证复杂的嵌套对象', () => {
      const complexSchema = z.object({
        users: z.array(
          z.object({
            profile: z.object({
              name: z.string(),
              contacts: z.object({
                email: z.string().email().optional(),
                phone: z.string().optional(),
              }),
            }),
            roles: z.array(z.string()),
          })
        ),
        meta: z.object({
          total: z.number(),
          page: z.number(),
        }),
      });

      validator.registerZodSchema('complex', complexSchema);

      const validData = {
        users: [
          {
            profile: {
              name: 'Alice',
              contacts: { email: 'alice@example.com' },
            },
            roles: ['admin', 'user'],
          },
        ],
        meta: { total: 1, page: 1 },
      };

      const result = validator.validate(JSON.stringify(validData), 'complex');
      expect(result.valid).toBe(true);
    });

    it('应该检测嵌套结构中的错误', () => {
      const nestedSchema = z.object({
        level1: z.object({
          level2: z.object({
            value: z.number(),
          }),
        }),
      });

      validator.registerZodSchema('nested', nestedSchema);

      const invalidData = {
        level1: {
          level2: {
            value: 'not a number',
          },
        },
      };

      const result = validator.validate(JSON.stringify(invalidData), 'nested');
      expect(result.valid).toBe(false);
      // 错误信息应该包含路径
      expect(result.errors.some((e) => e.includes('level1') || e.includes('level2') || e.includes('value'))).toBe(true);
    });
  });

  describe('特殊字符处理', () => {
    it('应该处理包含特殊字符的代码', () => {
      const code = 'const regex = /[\\s\\S]+/g;\nconst str = "Hello\\nWorld";';
      const result = validator.validateCode(code);
      expect(result.valid).toBe(true);
    });

    it('应该处理包含 Unicode 的 Markdown', () => {
      const markdown = '# 标题 🎉\n\n内容包含中文和 emoji 🚀';
      const result = validator.validateMarkdown(markdown);
      expect(result.valid).toBe(true);
    });

    it('应该处理包含转义字符的 JSON', () => {
      const json = '{"text": "Line1\\nLine2\\tTabbed"}';
      const result = validator.validateJson(json);
      expect(result.valid).toBe(true);
    });
  });

  describe('模式组合测试', () => {
    it('应该正确应用多个 required 模式', () => {
      validator.registerSchema('multi-required', {
        type: 'text',
        required: ['第一', '第二', '第三'],
      });

      expect(validator.validate('第一 第二 第三', 'multi-required').valid).toBe(true);
      expect(validator.validate('第一 第二', 'multi-required').valid).toBe(false);
    });

    it('应该正确应用多个 patterns 模式', () => {
      validator.registerSchema('multi-patterns', {
        type: 'text',
        patterns: [/function/, /return/, /}/],
      });

      expect(validator.validate('function test() { return 1; }', 'multi-patterns').valid).toBe(true);
      expect(validator.validate('function test() { }', 'multi-patterns').valid).toBe(false);
    });

    it('应该正确应用多个 forbidden 模式', () => {
      validator.registerSchema('no-dangerous', {
        type: 'code',
        forbidden: [/eval\s*\(/, /Function\s*\(/, /document\.write/],
      });

      expect(validator.validate('const x = 1;', 'no-dangerous').valid).toBe(true);
      expect(validator.validate('eval("code")', 'no-dangerous').valid).toBe(false);
      expect(validator.validate('new Function("return 1")', 'no-dangerous').valid).toBe(false);
    });

    it('应该正确组合所有验证规则', () => {
      validator.registerSchema('combined', {
        type: 'code',
        required: ['function'],
        patterns: [/function\s+\w+/],
        forbidden: [/eval/],
        minLength: 10,
        maxLength: 100,
      });

      const validCode = 'function test() { return 1; }';
      expect(validator.validate(validCode, 'combined').valid).toBe(true);

      // 太短
      expect(validator.validate('func()', 'combined').valid).toBe(false);

      // 包含禁止内容
      expect(validator.validate('function test() { eval("x"); }', 'combined').valid).toBe(false);
    });
  });
});

// ==================== Schema Composition Tests ====================

describe('Schema 组合测试', () => {
  it('应该支持 schema 扩展', () => {
    const BaseSchema = z.object({
      id: z.number(),
      createdAt: z.string(),
    });

    const ExtendedSchema = BaseSchema.extend({
      name: z.string(),
      email: z.string().email(),
    });

    const result = ExtendedSchema.safeParse({
      id: 1,
      createdAt: '2024-01-01',
      name: 'Test',
      email: 'test@example.com',
    });

    expect(result.success).toBe(true);
  });

  it('应该支持 schema 合并', () => {
    const SchemaA = z.object({
      a: z.string(),
    });

    const SchemaB = z.object({
      b: z.number(),
    });

    const MergedSchema = SchemaA.merge(SchemaB);

    const result = MergedSchema.safeParse({
      a: 'hello',
      b: 42,
    });

    expect(result.success).toBe(true);
  });

  it('应该支持 schema pick', () => {
    const FullSchema = z.object({
      id: z.number(),
      name: z.string(),
      email: z.string(),
    });

    const PartialSchema = FullSchema.pick({ id: true, name: true });

    expect(PartialSchema.safeParse({ id: 1, name: 'Test' }).success).toBe(true);
    expect(PartialSchema.safeParse({ id: 1, name: 'Test', email: 'test@example.com' }).success).toBe(true);
  });

  it('应该支持 schema omit', () => {
    const FullSchema = z.object({
      id: z.number(),
      name: z.string(),
      internal: z.string(),
    });

    const PublicSchema = FullSchema.omit({ internal: true });

    expect(PublicSchema.safeParse({ id: 1, name: 'Test' }).success).toBe(true);
    expect(PublicSchema.safeParse({ id: 1, name: 'Test', internal: 'secret' }).success).toBe(true);
  });

  it('应该支持 partial schema', () => {
    const FullSchema = z.object({
      id: z.number(),
      name: z.string(),
      email: z.string(),
    });

    const PartialSchema = FullSchema.partial();

    expect(PartialSchema.safeParse({}).success).toBe(true);
    expect(PartialSchema.safeParse({ id: 1 }).success).toBe(true);
    expect(PartialSchema.safeParse({ id: 1, name: 'Test' }).success).toBe(true);
  });
});

// ==================== Error Message Tests ====================

describe('错误信息测试', () => {
  let validator: OutputValidator;

  beforeEach(() => {
    validator = new OutputValidator();
  });

  it('JSON 解析错误应该包含具体信息', () => {
    const result = validator.validateJson('{invalid json}');
    expect(result.errors[0]).toContain('JSON 解析错误');
  });

  it('Zod 验证错误应该包含字段路径', () => {
    validator.registerZodSchema(
      'user',
      z.object({
        name: z.string(),
        age: z.number(),
      })
    );

    const result = validator.validate(JSON.stringify({ name: 'Test' }), 'user');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('age'))).toBe(true);
  });

  it('必需内容错误应该包含缺失的内容', () => {
    validator.registerSchema('test', {
      type: 'text',
      required: ['必须包含的内容'],
    });

    const result = validator.validate('其他内容', 'test');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('必须包含的内容'))).toBe(true);
  });

  it('长度错误应该包含具体数值', () => {
    validator.registerSchema('test', {
      type: 'text',
      minLength: 100,
    });

    const result = validator.validate('短文本', 'test');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('过短'))).toBe(true);
  });

  it('括号不匹配错误应该包含具体数量', () => {
    const result = validator.validateCode('function test() { return;');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /开:\d+ 闭:\d+/.test(e))).toBe(true);
  });
});
