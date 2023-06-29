import type { Theme } from '@code-hike/lighter';
import { highlight as lighterHighlight } from '@code-hike/lighter';
import { cn } from '~/components/cn';
import { cache, Fragment } from 'react';

const highlight = cache(lighterHighlight);

export interface CodeBlockProps {
  code: string;
  lang: string;
  theme?: Theme;
  className?: string;
}

export async function CodeBlock({
  code,
  lang,
  theme = 'github-light',
  className,
}: CodeBlockProps) {
  const { lines } = await highlight(code, lang, theme);

  return (
    <pre
      className={cn(
        'bg-muted relative overflow-x-auto rounded p-4 px-[0.33rem] py-[0.33rem] font-mono text-sm font-semibold',
        lang,
        className,
      )}
    >
      <code>
        {lines.map((tokenLine, i) => (
          <Fragment key={i}>
            <span>
              {tokenLine.map((token, j) => {
                return (
                  <span key={j} style={token.style}>
                    {token.content}
                  </span>
                );
              })}
            </span>
            {i < lines.length - 1 && '\n'}
          </Fragment>
        ))}
      </code>
    </pre>
  );
}

export function tokenizeCode(code: string, lang: string, theme: Theme) {
  return <CodeBlock code={code} lang={lang} theme={theme} />;
}
