import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@shared/ui/components/hover-card';
import { Skeleton } from '@shared/ui/components/skeleton';
import { InfoIcon } from 'lucide-react';

/**
 * Notes for whoever reads this example, next to what they are about: which
 * query a part of the page loaded, and what it waited for.
 * Hover or focus a note for the details.
 */

const noteText = 'text-xs text-muted-foreground [&_code]:font-mono';

// Here rather than only in the shared card, so this app's styles have them
const cardClass =
  'flex w-80 flex-col gap-2 rounded-lg border bg-background p-3 text-xs leading-relaxed text-foreground shadow-md [&_code]:font-mono [&_code]:text-foreground';

/** A small label, with the details in a card that opens on hover or focus */
export function DevNote(
  props: Readonly<{
    /** What it says without hovering, such as "server-side waterfall" */
    label: string;
    children: React.ReactNode;
  }>,
) {
  return (
    <HoverCard>
      <HoverCardTrigger
        // A span, not a link: a note can be inside one, such as a list's row
        render={<span tabIndex={0} />}
        className="inline-flex w-fit cursor-help items-center gap-1 rounded-full border border-dashed px-2 py-0.5 align-middle font-mono text-[11px] leading-none text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
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
export function DevNoteText(
  props: Readonly<{ text: React.ReactNode; children: React.ReactNode }>,
) {
  return (
    <HoverCard>
      <HoverCardTrigger
        render={<span tabIndex={0} />}
        className="cursor-help underline decoration-dotted underline-offset-4 focus-visible:outline-none"
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
export function DevFallback(
  props: Readonly<{ className: string; children: React.ReactNode }>,
) {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton className={props.className} />
      <p className={noteText}>
        <span className="font-medium">Suspense: </span>
        {props.children}
      </p>
    </div>
  );
}
