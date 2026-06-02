import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { cn, copyToClipboard } from '@/utils';

interface MarkdownProps {
  content: string;
  className?: string;
}

function CodeBlock({ language, value }: { language: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-3 rounded-lg overflow-hidden border border-border bg-bg-soft/60 group/code">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-bg-soft text-[11px] text-fg-mute">
        <span className="font-mono lowercase">{language || 'text'}</span>
        <button
          onClick={async () => {
            await copyToClipboard(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="opacity-0 group-hover/code:opacity-100 transition-opacity inline-flex items-center gap-1 text-fg-soft hover:text-fg"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '12px 16px',
          background: 'transparent',
          fontSize: '12.5px',
          lineHeight: 1.6,
        }}
        wrapLongLines
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
}

export function Markdown({ content, className }: MarkdownProps) {
  return (
    <div className={cn('prose-chat', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ inline, className: cls, children }: any) {
            const match = /language-(\w+)/.exec(cls || '');
            const value = String(children).replace(/\n$/, '');
            if (!inline && match) {
              return <CodeBlock language={match[1]} value={value} />;
            }
            return (
              <code className="px-1.5 py-0.5 rounded bg-bg-soft text-[0.85em] font-mono text-fg-soft">
                {children}
              </code>
            );
          },
          p({ children }) {
            return <p className="my-2 leading-relaxed">{children}</p>;
          },
          ul({ children }) {
            return <ul className="my-2 ml-5 list-disc space-y-1">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="my-2 ml-5 list-decimal space-y-1">{children}</ol>;
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          h1({ children }) {
            return <h1 className="text-xl font-semibold mt-4 mb-2">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-lg font-semibold mt-3 mb-2">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-base font-semibold mt-3 mb-1.5">{children}</h3>;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:underline underline-offset-2"
              >
                {children}
              </a>
            );
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-border-strong pl-3 my-2 text-fg-soft italic">
                {children}
              </blockquote>
            );
          },
          table({ children }) {
            return (
              <div className="my-3 overflow-x-auto">
                <table className="min-w-full text-sm border-collapse">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="border border-border px-3 py-1.5 bg-bg-soft text-left font-semibold">
                {children}
              </th>
            );
          },
          td({ children }) {
            return <td className="border border-border px-3 py-1.5">{children}</td>;
          },
          hr() {
            return <hr className="my-4 border-border" />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
