import { createFileRoute, Link } from '@tanstack/react-router';
import { Search, X } from 'lucide-react';
import { type KeyboardEvent, useDeferredValue, useRef } from 'react';

import {
  NoResults,
  searchInputId,
  useSearchQuery,
} from '~/components/search.tsx';
import { SearchHit } from '~/components/search-hit.tsx';
import { v11Docs } from '~/content/docs.ts';
import { groupBySection, searchDocs } from '~/content/search.ts';
import { searchPage, searchParam } from '~/pages.ts';
import { pageHead } from '~/seo.ts';

/**
 * The stable docs' pages and headings `?q=` (`validateQuerySearch`, on the
 * root route) finds, as trpc.io's search page listed them. A query is
 * rendered on request (`build/on-demand.ts`); the prerendered page is the
 * empty form, which works without JavaScript too.
 */
export const Route = createFileRoute('/search')({
  head: () => pageHead(searchPage),
  component: SearchPage,
});

/** Up and down move between the field and the results, as in the dialog. */
function moveFocus(
  event: KeyboardEvent<HTMLElement>,
  list: HTMLElement | null,
) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
    return;
  }
  const links = [
    ...(list?.querySelectorAll<HTMLAnchorElement>('a[data-search-hit]') ?? []),
  ];
  const at = links.findIndex((link) => link === document.activeElement);
  const next =
    event.key === 'ArrowDown'
      ? links[at + 1]
      : at <= 0
        ? document.getElementById(searchInputId)
        : links[at - 1];
  if (next) {
    event.preventDefault();
    next.focus();
  }
}

function SearchPage() {
  const search = useSearchQuery();
  const query = useDeferredValue(search.query);
  const listRef = useRef<HTMLDivElement>(null);
  const searching = query.trim() !== '';
  const hits = searching ? searchDocs(v11Docs.allDocs, query, 50) : [];
  return (
    <main className="mx-auto grid w-full max-w-3xl grid-cols-1 content-start gap-6 px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-4xl font-extrabold tracking-tight">
        {searchPage.title}
      </h1>
      <form
        action={searchPage.path}
        className="flex items-center gap-3 rounded-lg border pr-2 pl-4 focus-within:ring-3 focus-within:ring-ring/50"
        method="get"
        onSubmit={(event) => {
          event.preventDefault();
        }}
        role="search"
      >
        <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <label className="sr-only" htmlFor={searchInputId}>
          Search the docs
        </label>
        <input
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          autoFocus
          className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm [&::-webkit-search-cancel-button]:appearance-none"
          enterKeyHint="search"
          id={searchInputId}
          name={searchParam}
          onChange={(event) => {
            search.change(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              moveFocus(event, listRef.current);
            }
          }}
          placeholder={`Search the ${v11Docs.id} docs…`}
          spellCheck={false}
          type="search"
          value={search.query}
        />
        {search.query === '' ? null : (
          <button
            aria-label="Clear the search"
            className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => {
              search.change('');
              document.getElementById(searchInputId)?.focus();
            }}
            type="button"
          >
            <X className="size-4" />
          </button>
        )}
      </form>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {searching
          ? hits.length === 0
            ? ''
            : `${hits.length}${hits.length === 50 ? '+' : ''} ${hits.length === 1 ? 'result' : 'results'} for “${query}”`
          : 'Find a page, or a section of one, in the docs. Press / or ⌘K to search from any page.'}
      </p>
      {searching && hits.length === 0 ? <NoResults query={query} /> : null}
      <div
        className="grid grid-cols-1 gap-8"
        onKeyDown={(event) => {
          moveFocus(event, listRef.current);
        }}
        ref={listRef}
      >
        {groupBySection(hits).map((group) => (
          <section
            aria-label={group.section}
            className="grid grid-cols-1 gap-2"
            key={group.section}
          >
            <h2 className="text-sm font-semibold text-muted-foreground">
              {group.section}
            </h2>
            <ul className="grid grid-cols-1 gap-2">
              {group.hits.map((hit) => (
                <li key={hit.entry.id}>
                  <Link
                    className="flex items-start gap-3 rounded-lg border px-4 py-3 text-sm transition-colors hover:bg-accent/50 focus-visible:bg-accent/50"
                    data-search-hit
                    {...(hit.entry.hash === undefined
                      ? {}
                      : { hash: hit.entry.hash })}
                    params={{ _splat: hit.entry.slug }}
                    to="/docs/$"
                  >
                    <SearchHit hit={hit} withDescription />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
