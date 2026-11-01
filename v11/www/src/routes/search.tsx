import { createFileRoute, Link } from '@tanstack/react-router';
import { FileText, Hash, Search } from 'lucide-react';

import { TextWithCode } from '~/components/text-with-code.tsx';
import { v11Docs } from '~/content/docs.ts';
import { searchDocs } from '~/content/search.ts';
import { searchPage, searchParam } from '~/pages.ts';
import { pageHead } from '~/seo.ts';

interface SearchSearch {
  readonly q?: string | undefined;
}

/**
 * The stable docs' pages and headings `?q=` finds, as trpc.io's search page
 * listed them. A query is rendered on request (`build/on-demand.ts`); the
 * prerendered page is the empty form, which works without JavaScript too.
 */
export const Route = createFileRoute('/search')({
  head: () => pageHead(searchPage),
  component: SearchPage,
  validateSearch: (search: Record<string, unknown>): SearchSearch => {
    const query = search[searchParam];
    return typeof query === 'string' && query !== '' ? { q: query } : {};
  },
});

function SearchPage() {
  const query = Route.useSearch({ select: (search) => search.q ?? '' });
  const navigate = Route.useNavigate();
  const results = query.trim() === '' ? [] : searchDocs(v11Docs.allDocs, query);
  return (
    <main className="mx-auto grid max-w-3xl content-start gap-8 px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-extrabold tracking-tight">
        {searchPage.title}
      </h1>
      <form
        action={searchPage.path}
        className="flex items-center gap-3 rounded-lg border px-4 focus-within:ring-3 focus-within:ring-ring/50"
        method="get"
        onSubmit={(event) => {
          event.preventDefault();
        }}
        role="search"
      >
        <Search className="size-4 text-muted-foreground" />
        <label className="sr-only" htmlFor="search-query">
          Search the docs
        </label>
        <input
          autoFocus
          className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          id="search-query"
          name={searchParam}
          onChange={(event) => {
            const q = event.target.value;
            void navigate({
              replace: true,
              resetScroll: false,
              search: q === '' ? {} : { q },
            });
          }}
          placeholder={`Search the ${v11Docs.id} docs…`}
          type="search"
          value={query}
        />
      </form>
      {query.trim() === '' ? null : results.length === 0 ? (
        <p className="text-muted-foreground">No results for “{query}”</p>
      ) : (
        <ul className="grid gap-2">
          {results.map((entry) => (
            <li key={entry.id}>
              <Link
                className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors hover:bg-accent/50"
                {...(entry.hash === undefined ? {} : { hash: entry.hash })}
                params={{ _splat: entry.slug }}
                to="/docs/$"
              >
                {entry.hash === undefined ? (
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Hash className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">
                  <TextWithCode bare text={entry.text} />
                </span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  <TextWithCode bare text={entry.page} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
