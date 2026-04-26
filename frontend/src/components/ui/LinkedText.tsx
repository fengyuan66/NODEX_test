import type { ReactNode } from 'react';

interface LinkedTextProps {
  text: string;
  className?: string;
  sourceLabel?: boolean;
}

interface LinkToken {
  kind: 'text' | 'link';
  value: string;
  href?: string;
}

const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+)/gi;

function tokenizeLinks(text: string): LinkToken[] {
  const tokens: LinkToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = LINK_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ kind: 'text', value: text.slice(lastIndex, match.index) });
    }

    const markdownLabel = match[1];
    const markdownHref = match[2];
    const bareHref = match[3];
    const href = markdownHref || bareHref || '';
    if (href) {
      tokens.push({
        kind: 'link',
        value: markdownLabel || href,
        href,
      });
    }
    lastIndex = LINK_PATTERN.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ kind: 'text', value: text.slice(lastIndex) });
  }

  return tokens;
}

function renderTextWithBreaks(value: string, keyBase: string): ReactNode[] {
  const lines = value.split('\n');
  const out: ReactNode[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (i > 0) out.push(<br key={`${keyBase}-br-${i}`} />);
    out.push(<span key={`${keyBase}-txt-${i}`}>{lines[i]}</span>);
  }
  return out;
}

export default function LinkedText({ text, className, sourceLabel = true }: LinkedTextProps) {
  const tokens = tokenizeLinks(text || '');
  if (!tokens.length) return <span className={className} />;

  return (
    <span className={className}>
      {tokens.map((token, idx) => {
        const key = `tok-${idx}`;
        if (token.kind === 'text') {
          return <span key={key}>{renderTextWithBreaks(token.value, key)}</span>;
        }

        const href = token.href || '';
        const label = sourceLabel ? '(source)' : token.value;
        return (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-source-link"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {label}
          </a>
        );
      })}
    </span>
  );
}
