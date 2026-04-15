import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface Props {
  content: string;
  /** compact = smaller gaps, used in chat bubbles */
  compact?: boolean;
}

export default function MarkdownContent({ content, compact = false }: Props) {
  const gap = compact ? 'space-y-1.5' : 'space-y-2.5';

  const components: Components = {
    // Headings
    h1: ({ children }) => (
      <p className="text-white font-bold text-base mt-4 mb-1">{children}</p>
    ),
    h2: ({ children }) => (
      <p className="text-white font-bold text-sm mt-4 mb-1">{children}</p>
    ),
    h3: ({ children }) => (
      <p className="text-white font-semibold text-sm mt-3 mb-0.5">{children}</p>
    ),

    // Paragraph
    p: ({ children }) => (
      <p className="text-white text-sm leading-relaxed">{children}</p>
    ),

    // Bold / italic
    strong: ({ children }) => (
      <strong className="font-bold text-white">{children}</strong>
    ),
    em: ({ children }) => (
      <em className="italic text-slate-300">{children}</em>
    ),

    // Unordered list
    ul: ({ children }) => (
      <ul className={`space-y-1 ${compact ? '' : 'my-1'}`}>{children}</ul>
    ),
    // Ordered list
    ol: ({ children }) => (
      <ol className={`space-y-1 ${compact ? '' : 'my-1'}`}>{children}</ol>
    ),
    // List item
    li: ({ children, ...props }) => {
      const isOrdered = (props as { ordered?: boolean }).ordered;
      return (
        <div className="flex gap-2 items-start">
          <span
            className="shrink-0 text-sm font-bold mt-0.5"
            style={{ color: '#8B5CF6' }}
          >
            {isOrdered ? '' : '•'}
          </span>
          <span className="text-white text-sm leading-relaxed">{children}</span>
        </div>
      );
    },

    // Horizontal rule
    hr: () => <hr className="border-slate-700 my-3" />,

    // Inline code
    code: ({ children }) => (
      <code className="bg-slate-800 text-purple-300 text-xs px-1.5 py-0.5 rounded font-mono">
        {children}
      </code>
    ),

    // Blockquote
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-purple-500 pl-3 text-slate-300 text-sm italic my-2">
        {children}
      </blockquote>
    ),
  };

  return (
    <div className={gap}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
