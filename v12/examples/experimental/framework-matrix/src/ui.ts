/**
 * `@shared/ui`'s shadcn classes for the pieces each page uses. Its components
 * are React, so the Vue, Solid and Svelte pages share its theme
 * (`styles.css`) and these classes instead.
 */
export const ui = {
  page: 'mx-auto flex max-w-md flex-col gap-6 p-6',
  card: 'flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10',
  header: 'flex items-start justify-between gap-2 px-4',
  title: 'text-base leading-snug font-medium',
  description: 'text-sm text-muted-foreground',
  content: 'flex flex-col gap-2 px-4',
  row: 'flex items-baseline justify-between gap-4',
  footer: 'flex items-center justify-between gap-2 border-t bg-muted/50 p-4',
  button:
    'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium whitespace-nowrap text-primary-foreground transition-all outline-none hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
  badge:
    'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 rounded-4xl border border-border px-2 py-0.5 text-xs font-medium whitespace-nowrap text-foreground',
  link: 'text-sm font-medium underline underline-offset-4',
};
