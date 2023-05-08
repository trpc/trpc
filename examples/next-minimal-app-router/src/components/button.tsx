'use client';

import { experimental_useFormStatus as useFormStatus } from 'react-dom';
import { twMerge } from 'tailwind-merge';

/** Button that shows pending loading state */
export function SubmitButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement>,
) {
  // FIXME: Remove the optionality here: https://github.com/vercel/next.js/pull/49402
  const fs = useFormStatus?.();
  const pending = fs?.pending ?? false;

  return (
    <button
      {...props}
      type="submit"
      className={twMerge(
        'focus-visible:ring-accent ring-offset-background inline-flex h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        'text-primary-foreground hover:bg-primary/90 bg-primary',
        props.className,
      )}
      disabled={props.disabled || pending}
    >
      {pending && (
        <div className="mr-1" role="status">
          <div className="border-background h-3 w-3 animate-spin rounded-full border-2 border-r-transparent" />
          <span className="sr-only">Loading...</span>
        </div>
      )}
      {props.children}
    </button>
  );
}
