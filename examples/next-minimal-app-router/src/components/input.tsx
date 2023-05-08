import * as React from 'react';
import { twMerge } from 'tailwind-merge';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={twMerge(
        'border-foreground-muted ring-offset-background focus-visible:ring-foreground-muted flex h-10 w-full rounded-md border bg-transparent px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        props.className,
      )}
    />
  );
}
