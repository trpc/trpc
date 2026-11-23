import type { ReactNode } from 'react';

/**
 * Notes for whoever reads this page, beside what they explain: which query a
 * part reads, and whether the page waited for it.
 */
export function Note(props: {
  readonly children: ReactNode;
  readonly label: string;
}) {
  return (
    <p className="text-xs text-muted-foreground [&_code]:font-mono [&_code]:text-foreground">
      <span className="mr-1.5 inline-block rounded-full border border-dashed px-2 py-0.5 font-mono text-[11px] leading-none">
        {props.label}
      </span>
      {props.children}
    </p>
  );
}

/** What to do to see the feature work, such as which tab to open. */
export function SeeItYourself(props: { readonly children: ReactNode }) {
  return (
    <div className="grid gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground [&_code]:font-mono [&_code]:text-foreground">
      <span className="font-medium text-foreground">See it yourself</span>
      {props.children}
    </div>
  );
}
