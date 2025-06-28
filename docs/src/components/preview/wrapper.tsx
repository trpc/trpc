import { cn } from '@/lib/cn';
import type { HTMLAttributes } from 'react';

export function Wrapper(props: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        'bg-radial-[at_bottom] border-fd-primary/10 prose-no-margin rounded-lg border from-blue-500/20 p-4 dark:bg-black/20',
        props.className,
      )}
    >
      {props.children}
    </div>
  );
}
