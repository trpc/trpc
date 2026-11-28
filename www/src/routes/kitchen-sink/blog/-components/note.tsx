import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@shared/ui/components/hover-card';
import { Skeleton } from '@shared/ui/components/skeleton';
import { ChevronRightIcon, InfoIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Notes for whoever reads this page, beside what they explain: which query a
 * part of the page loaded, and what it waited for. Hover or focus a note for
 * the details.
 */

/** The text of a note, such as what a Suspense fallback waits for */
export const noteTextClass =
  'text-xs text-muted-foreground [&_code]:font-mono [&_code]:text-foreground';

const cardClass =
  'flex w-80 flex-col gap-2 text-xs leading-relaxed [&_code]:font-mono [&_code]:text-foreground';

/** A small label, with the details in a card that opens on hover or focus */
export function DevNote(props: {
  /** What it says without hovering, such as "server-side waterfall" */
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <HoverCard>
      <HoverCardTrigger
        // A span, not a link: a note can be inside one, such as a list's row
        render={<span tabIndex={0} />}
        className="inline-flex w-fit cursor-help items-center gap-1 rounded-full border border-dashed px-2 py-0.5 align-middle font-mono text-[11px] leading-none text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
      >
        <InfoIcon className="size-3" />
        {props.label}
      </HoverCardTrigger>
      <HoverCardContent className={cardClass}>
        {props.children}
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * Text that opens the same card, for a value that is the note itself, such
 * as an author's name in a list
 */
export function DevNoteText(props: {
  readonly text: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <HoverCard>
      <HoverCardTrigger
        render={<span tabIndex={0} />}
        className="cursor-help underline decoration-dotted underline-offset-4 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
      >
        {props.text}
      </HoverCardTrigger>
      <HoverCardContent className={cardClass}>
        {props.children}
      </HoverCardContent>
    </HoverCard>
  );
}

/** A Suspense boundary's fallback that says what the part is waiting for */
export function DevFallback(props: {
  readonly className: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton className={props.className} />
      <p className={noteTextClass}>
        <span className="font-medium">Suspense: </span>
        {props.children}
      </p>
    </div>
  );
}

/**
 * What to do to see the feature work, such as which tab to open. Closed
 * until you open it, so it doesn't push the page down
 */
export function SeeItYourself(props: { readonly children: ReactNode }) {
  return (
    <details className="group rounded-lg border border-dashed px-4 py-2.5 text-sm text-muted-foreground [&_code]:font-mono [&_code]:text-foreground">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon
          aria-hidden
          className="size-4 transition-transform group-open:rotate-90"
        />
        See it yourself
      </summary>
      <div className="grid gap-2 pt-2">{props.children}</div>
    </details>
  );
}
