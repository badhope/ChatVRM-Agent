import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { TextLoader } from '../../../loaders/text.loader.js';
import { CsvLoader } from '../../../loaders/csv.loader.js';
import { JsonLoader } from '../../../loaders/json.loader.js';
import { HtmlLoader } from '../../../loaders/html.loader.js';
import { AutoLoader } from '../../../loaders/auto.loader.js';

describe('TextLoader', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-text-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('reads .md files', async () => {
    const f = path.join(tmpDir, 'a.md');
    await fs.writeFile(f, '# heading\nbody', 'utf8');
    const docs = await new TextLoader().load(f);
    expect(docs).toHaveLength(1);
    expect(docs[0].text).toContain('# heading');
    expect(docs[0].source).toBe(f);
  });

  it('reads a buffer', async () => {
    const docs = await new TextLoader().loadBuffer(Buffer.from('hi'));
    expect(docs[0].text).toBe('hi');
  });
});

describe('CsvLoader', () => {
  it('parses simple csv with header', async () => {
    const csv = 'name,age\nAlice,30\nBob,25';
    const docs = await new CsvLoader().loadBuffer(Buffer.from(csv));
    expect(docs).toHaveLength(2);
    expect(docs[0].text).toBe('name: Alice | age: 30');
    expect(docs[0].metadata?.headers).toEqual(['name', 'age']);
    expect(docs[0].locator).toBe('row:1');
  });

  it('handles quoted fields and escaped quotes', async () => {
    const csv = 'q,r\n"he said ""hi""",ok';
    const docs = await new CsvLoader().loadBuffer(Buffer.from(csv));
    expect(docs[0].text).toBe('q: he said "hi" | r: ok');
  });

  it('handles CRLF and missing trailing newline', async () => {
    const csv = 'a,b\r\n1,2\r\n3,4';
    const docs = await new CsvLoader().loadBuffer(Buffer.from(csv));
    expect(docs).toHaveLength(2);
    expect(docs[1].text).toBe('a: 3 | b: 4');
  });
});

describe('JsonLoader', () => {
  it('flattens an array of objects', async () => {
    const json = JSON.stringify([{ name: 'A' }, { name: 'B' }]);
    const docs = await new JsonLoader().loadBuffer(Buffer.from(json));
    expect(docs).toHaveLength(2);
    expect(docs[0].text).toBe('name: A');
  });

  it('parses JSONL', async () => {
    const jl = '{"a":1}\n{"a":2}\nnot json\n';
    const docs = await new JsonLoader().loadBuffer(Buffer.from(jl), 'jsonl');
    expect(docs).toHaveLength(3);
    expect(docs[2].metadata?.parseError).toBe(true);
  });

  it('falls back to raw text on invalid JSON', async () => {
    const docs = await new JsonLoader().loadBuffer(Buffer.from('not json {'));
    expect(docs).toHaveLength(1);
    expect(docs[0].metadata?.parseError).toBe(true);
  });
});

describe('HtmlLoader', () => {
  it('strips tags and decodes entities', async () => {
    const html = '<html><head><title>T</title></head><body><h1>Hi</h1><p>tom &amp; jerry</p></body></html>';
    const docs = await new HtmlLoader().loadBuffer(Buffer.from(html));
    expect(docs[0].text).toContain('Hi');
    expect(docs[0].text).toContain('tom & jerry');
    expect(docs[0].text).not.toContain('<p>');
    expect(docs[0].metadata?.title).toBe('T');
  });

  it('removes script and style blocks', async () => {
    const html = '<script>alert(1)</script><style>body{}</style><p>ok</p>';
    const docs = await new HtmlLoader().loadBuffer(Buffer.from(html));
    expect(docs[0].text).not.toContain('alert');
    expect(docs[0].text).toContain('ok');
  });
});

describe('AutoLoader', () => {
  it('picks the right loader for the extension', async () => {
    const al = new AutoLoader();
    expect(al.pick('a.csv').extensions).toContain('.csv');
    expect(al.pick('a.json').extensions).toContain('.json');
    expect(al.pick('a.html').extensions).toContain('.html');
    expect(al.pick('a.md').extensions).toContain('.md');
    expect(al.pick('a.unknown').extensions).toContain('.md'); // fallback to text
  });
});
