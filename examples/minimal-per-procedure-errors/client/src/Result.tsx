import { cn } from '@shared/ui/lib/utils';
import type { ReactNode } from 'react';

export function Result(props: {
  testId: string;
  tone?: 'default' | 'error';
  children: ReactNode;
}) {
  return (
    <pre
      data-testid={props.testId}
      className={cn(
        'overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-sm',
        props.tone === 'error' &&
          'border-destructive/30 bg-destructive/10 text-destructive',
      )}
    >
      {props.children}
    </pre>
  );
}
