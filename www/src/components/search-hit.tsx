import { cn } from '@shared/ui/lib/utils';
import { ChevronRight, FileText, FlaskConical, Hash } from 'lucide-react';
import { Fragment } from 'react';

import { textParts } from '~/content/inline-code.ts';
import {
  highlight,
  type SearchHit as Hit,
  type SearchMatch,
} from '~/content/search.ts';

/**
 * `text` as `TextWithCode` shows it in lists, with the words `match` found
 * marked.
 */
export function Highlighted(props: {
  readonly match: SearchMatch;
  readonly text: string;
}) {
  return textParts(props.text).map((part, index) => {
    const runs = highlight(part.text, props.match).map((run, at) =>
      run.marked ? (
        <mark
          className="rounded-[0.2em] bg-brand/15 text-inherit dark:bg-brand/30"
          key={at}
        >
          {run.text}
        </mark>
      ) : (
        <Fragment key={at}>{run.text}</Fragment>
      ),
    );
    return part.code ? (
      <code
        className="font-mono text-[0.875em] [overflow-wrap:anywhere]"
        key={index}
      >
        {runs}
      </code>
    ) : (
      <Fragment key={index}>{runs}</Fragment>
    );
  });
}

/**
 * A result: what was found, with where it sits under its section (the pages
 * above it and, for a heading, its page) and a page's description.
 */
export function SearchHit(props: {
  readonly hit: Hit;
  /** Shows the page's description under it. */
  readonly withDescription: boolean;
}) {
  const entry = props.hit.entry;
  const match = props.hit.match;
  const isHeading = entry.hash !== undefined;
  const Icon = isHeading ? Hash : FileText;
  return (
    <>
      <Icon
        aria-label={isHeading ? 'Section' : 'Page'}
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        role="img"
      />
      <span className="grid min-w-0 flex-1 grid-cols-1 gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">
            <Highlighted match={match} text={entry.text} />
          </span>
          {entry.experimental ? (
            <FlaskConical
              aria-label="Experimental"
              className="size-3.5 shrink-0 text-brand"
              role="img"
            />
          ) : null}
        </span>
        {entry.trail.length > 0 ? (
          <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <span className="sr-only">{isHeading ? 'on' : 'under'}</span>
            {entry.trail.map((crumb, index) => (
              <Fragment key={index}>
                {index > 0 ? (
                  <ChevronRight aria-hidden className="size-3 shrink-0" />
                ) : null}
                <span
                  className={cn(
                    'truncate',
                    index === entry.trail.length - 1 && 'shrink-[0.25]',
                  )}
                >
                  <Highlighted match={match} text={crumb} />
                </span>
              </Fragment>
            ))}
          </span>
        ) : null}
        {props.withDescription && entry.description !== '' ? (
          <span className="line-clamp-2 text-xs text-pretty text-muted-foreground">
            <Highlighted match={match} text={entry.description} />
          </span>
        ) : null}
      </span>
    </>
  );
}
