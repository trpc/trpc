import { cn } from '@shared/ui/lib/utils';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

import type { DocHeading } from '~/content/types.ts';

/** "On this page", highlighting the section being read. */
export function TableOfContents(props: {
  readonly headings: ReadonlyArray<DocHeading>;
}) {
  const [active, setActive] = useState<string | undefined>(undefined);
  const headings = props.headings;
  if (headings.length === 0) {
    return null;
  }
  return (
    <nav
      aria-label="On this page"
      className="text-sm"
      ref={() => {
        // The section being read is the last heading scrolled past. Linked
        // headings stop at the 4.5rem `scroll-padding-top`, above this line.
        const line = 96;
        const update = () => {
          const atEnd =
            window.scrollY > 0 &&
            window.innerHeight + window.scrollY >=
              document.documentElement.scrollHeight - 2;
          let current: string | undefined;
          for (const heading of headings) {
            const element = document.getElementById(heading.id);
            if (
              element &&
              (atEnd || element.getBoundingClientRect().top <= line)
            ) {
              current = heading.id;
            }
          }
          setActive(current);
        };
        update();
        window.addEventListener('scroll', update, { passive: true });
        return () => {
          window.removeEventListener('scroll', update);
        };
      }}
    >
      <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        On this page
      </p>
      <ul className="grid gap-1.5 border-l">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              aria-current={active === heading.id ? 'location' : undefined}
              className={cn(
                '-ml-px block border-l border-transparent py-0.5 text-muted-foreground transition-colors hover:text-foreground',
                heading.depth === 2 ? 'pl-3' : 'pl-6 text-[13px]',
                active === heading.id &&
                  'border-brand text-link hover:text-link',
              )}
              href={`#${heading.id}`}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * "On this page" for screens without room for the side column: a disclosure
 * above the page, closed again once a section is picked.
 */
export function CollapsedTableOfContents(props: {
  readonly className?: string;
  readonly headings: ReadonlyArray<DocHeading>;
}) {
  if (props.headings.length === 0) {
    return null;
  }
  return (
    <details
      className={cn('group rounded-lg border text-sm', props.className)}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('a')) {
          event.currentTarget.open = false;
        }
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 font-medium select-none [&::-webkit-details-marker]:hidden">
        On this page
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <nav aria-label="On this page" className="border-t px-2 py-2">
        <ul className="grid">
          {props.headings.map((heading) => (
            <li key={heading.id}>
              <a
                className={cn(
                  'block rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  heading.depth === 3 && 'pl-6 text-[13px]',
                )}
                href={`#${heading.id}`}
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  );
}
