import { Button } from '@shared/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@shared/ui/components/dialog';
import { cn } from '@shared/ui/lib/utils';
import {
  Link,
  useLocation,
  useNavigate,
  useSearch,
} from '@tanstack/react-router';
import { Search, SearchX, X } from 'lucide-react';
import {
  type MouseEvent,
  type ReactNode,
  useDeferredValue,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import { SearchHit } from '~/components/search-hit.tsx';
import { type DocsVersion, useSearchedDocs } from '~/content/docs.ts';
import {
  entriesById,
  groupBySection,
  noMatch,
  type SearchEntry,
  type SearchHit as Hit,
  searchDocs,
} from '~/content/search.ts';
import { useHydrated } from '~/flags.ts';
import { searchPage } from '~/pages.ts';
import { readRecent, withRecent, writeRecent } from '~/recent-searches.ts';
import { site, v11 } from '~/site.ts';

/** The `/search` page's field, which the shortcuts focus there. */
export const searchInputId = 'search-query';

/** How long typing pauses before the URL catches up. */
const urlDelayMs = 300;

/** Rewrites `?q=` in place: the same history entry, no scrolling, the hash kept. */
function useReplaceQuery() {
  const navigate = useNavigate();
  return (query: string) =>
    void navigate({
      hash: true,
      hashScrollIntoView: false,
      replace: true,
      resetScroll: false,
      search: (prev) => ({ ...prev, q: query === '' ? undefined : query }),
      to: '.',
    });
}

/**
 * A search field's text, kept in `?q=`: in the field at once, in the URL
 * once typing pauses. A URL changed from elsewhere (a link, the browser's
 * own search) replaces it.
 */
export function useSearchQuery() {
  const urlQuery = useSearch({ select: (search) => search.q, strict: false });
  const replaceQuery = useReplaceQuery();
  const [query, setQuery] = useState(urlQuery ?? '');
  const written = useRef(urlQuery);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (urlQuery !== written.current) {
      clearTimeout(timer.current);
      written.current = urlQuery;
      setQuery(urlQuery ?? '');
    }
  }, [urlQuery]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    /** Drops a change the URL hasn't caught up with, when leaving. */
    cancel: () => {
      clearTimeout(timer.current);
    },
    change: (next: string) => {
      setQuery(next);
      written.current = next === '' ? undefined : next;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        replaceQuery(next);
      }, urlDelayMs);
    },
    query,
  };
}

const isEditing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));

/**
 * The header's search: a dialog over the page, opened by ⌘K, Ctrl+K or `/`,
 * and by `?q=` in the URL, which it keeps in step. On `/search` it moves to
 * that page's field instead.
 */
export function SearchButton() {
  const hydrated = useHydrated();
  const urlQuery = useSearch({ select: (search) => search.q, strict: false });
  const onSearchPage = useLocation({
    select: (location) => location.pathname === searchPage.path,
  });
  const replaceQuery = useReplaceQuery();
  const [open, setOpen] = useState(false);
  const show = () => {
    if (onSearchPage) {
      const input = document.getElementById(searchInputId);
      if (input instanceof HTMLInputElement) {
        input.focus();
        input.select();
      }
    } else {
      setOpen(true);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modK =
        event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey);
      const slash =
        event.key === '/' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isEditing(event.target);
      if (modK || slash) {
        event.preventDefault();
        show();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  // A link to `?q=` opens it, once the page has hydrated.
  const linked = hydrated && !onSearchPage && urlQuery !== undefined;
  useEffect(() => {
    if (linked) {
      setOpen(true);
    }
  }, [linked]);

  return (
    <>
      {/* An icon from `md` to `lg`, where the header's nav takes its room. */}
      <Button
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K /"
        className="w-9 justify-start px-0 text-muted-foreground sm:w-56 sm:px-3 md:w-9 md:px-0 lg:w-56 lg:px-3"
        onClick={show}
        size="sm"
        title="Search docs (⌘K)"
        variant="outline"
      >
        <Search className="mx-auto sm:mx-0 md:mx-auto lg:mx-0" />
        <span className="hidden sm:inline md:hidden lg:inline">
          Search docs…
        </span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline md:hidden lg:inline">
          ⌘K
        </kbd>
      </Button>
      <Dialog
        onOpenChange={(next) => {
          setOpen(next);
          if (!next && urlQuery !== undefined) {
            replaceQuery('');
          }
        }}
        open={open}
      >
        {/* On a phone the keyboard covers the bottom half of the screen. */}
        <DialogContent
          className="top-3 translate-y-0 grid-cols-1 gap-0 p-0 sm:top-[12%] sm:max-w-2xl"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Search the docs</DialogTitle>
          <DialogDescription className="sr-only">
            Type to find a page or a section. Use the up and down arrows to pick
            a result and Enter to open it.
          </DialogDescription>
          {open ? (
            <SearchPanel
              onFollow={() => {
                setOpen(false);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

interface Group {
  readonly hits: ReadonlyArray<Hit>;
  readonly title: string;
}

/** A click the browser takes: to a new tab or window, or a download. */
const modified = (event: MouseEvent) =>
  event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

function SearchPanel(props: { readonly onFollow: () => void }) {
  // Experiments' pages too: opening one turns its experiment on.
  const version = useSearchedDocs();
  const search = useSearchQuery();
  const query = useDeferredValue(search.query);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState(() => ({
    ids: readRecent(version.id),
    version: version.id,
  }));
  // Back or forward to another version's page keeps the dialog open.
  const recentIds =
    recent.version === version.id ? recent.ids : readRecent(version.id);
  const saveRecent = (ids: ReadonlyArray<string>) => {
    writeRecent(version.id, ids);
    setRecent({ ids, version: version.id });
  };
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const searching = query.trim() !== '';
  const hits = searching ? searchDocs(version.allDocs, query, 20) : [];
  const groups: ReadonlyArray<Group> = searching
    ? groupBySection(hits).map((group) => ({
        hits: group.hits,
        title: group.section,
      }))
    : emptyQueryGroups(version, recentIds);
  const options = groups.flatMap((group) => group.hits);
  const selected = Math.min(active, Math.max(options.length - 1, 0));
  const optionId = (index: number) => `${listId}-option-${index}`;

  // A new query starts at the top; arrowing keeps the pick in view.
  useEffect(() => {
    if (selected === 0) {
      listRef.current?.scrollTo({ top: 0 });
    } else {
      document
        .getElementById(`${listId}-option-${selected}`)
        ?.scrollIntoView({ block: 'nearest' });
    }
  }, [listId, query, selected]);

  const remember = (entry: SearchEntry) => {
    saveRecent(withRecent(recentIds, entry.id));
  };
  const follow = (entry: SearchEntry) => {
    remember(entry);
    search.cancel();
    props.onFollow();
  };

  const change = (next: string) => {
    search.change(next);
    setActive(0);
  };

  let start = 0;
  return (
    <div className="grid min-w-0 grid-cols-1">
      <div className="flex items-center gap-2 border-b pr-2 pl-4">
        <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <input
          aria-activedescendant={
            options.length > 0 ? optionId(selected) : undefined
          }
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={options.length > 0}
          aria-label="Search the docs"
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          autoFocus
          className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
          enterKeyHint="go"
          inputMode="search"
          onChange={(event) => {
            change(event.target.value);
          }}
          onKeyDown={(event) => {
            const count = options.length;
            if (event.nativeEvent.isComposing) {
              return;
            }
            if (event.key === 'ArrowDown' && count > 0) {
              event.preventDefault();
              setActive((selected + 1) % count);
            } else if (event.key === 'ArrowUp' && count > 0) {
              event.preventDefault();
              setActive((selected - 1 + count) % count);
            } else if (event.key === 'Enter' && options[selected]) {
              event.preventDefault();
              const link = document.getElementById(optionId(selected));
              if (!(link instanceof HTMLAnchorElement)) {
                return;
              }
              if (event.metaKey || event.ctrlKey) {
                remember(options[selected].entry);
                window.open(link.href, '_blank', 'noopener');
              } else {
                link.click();
              }
            }
          }}
          placeholder={
            version.copied
              ? `Search the ${version.id} docs…`
              : 'Search guides, APIs, options…'
          }
          ref={inputRef}
          role="combobox"
          spellCheck={false}
          type="text"
          value={search.query}
        />
        {search.query === '' ? null : (
          <Button
            aria-label="Clear the search"
            onClick={() => {
              change('');
              inputRef.current?.focus();
            }}
            size="icon-sm"
            variant="ghost"
          >
            <X />
          </Button>
        )}
        <DialogClose
          render={
            <Button
              className="text-muted-foreground"
              size="sm"
              variant="ghost"
            />
          }
        >
          <span className="sm:hidden">Cancel</span>
          <kbd
            aria-hidden
            className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline"
          >
            Esc
          </kbd>
          <span className="sr-only max-sm:hidden">Close</span>
        </DialogClose>
      </div>
      <p aria-live="polite" className="sr-only">
        {searching
          ? hits.length === 0
            ? `No results for ${query}`
            : `${hits.length} ${hits.length === 1 ? 'result' : 'results'}`
          : ''}
      </p>
      {searching && hits.length === 0 ? <NoResults query={query} /> : null}
      <ul
        aria-label="Search results"
        className={cn(
          'max-h-[55dvh] overflow-y-auto overscroll-contain p-2 sm:max-h-[min(60vh,32rem)]',
          options.length === 0 && 'hidden',
        )}
        id={listId}
        ref={listRef}
        role="listbox"
      >
        {groups.map((group, groupIndex) => {
          const first = start;
          start += group.hits.length;
          const titleId = `${listId}-group-${groupIndex}`;
          return (
            <li key={group.title} role="presentation">
              <div
                className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground"
                id={titleId}
              >
                {group.title}
              </div>
              <ul aria-labelledby={titleId} className="mb-1" role="group">
                {group.hits.map((hit, at) => {
                  const index = first + at;
                  const entry = hit.entry;
                  return (
                    <li key={entry.id} role="presentation">
                      {/* The link is the option, so it's a real link: it
                          opens in a new tab with a modifier or a middle click. */}
                      <Link
                        aria-selected={index === selected}
                        className="flex items-start gap-3 rounded-md px-3 py-2 text-sm aria-selected:bg-accent"
                        {...(entry.hash === undefined
                          ? {}
                          : { hash: entry.hash })}
                        id={optionId(index)}
                        onAuxClick={(event) => {
                          if (event.button === 1) {
                            remember(entry);
                          }
                        }}
                        onClick={(event) => {
                          if (modified(event)) {
                            remember(entry);
                          } else {
                            follow(entry);
                          }
                        }}
                        onPointerMove={() => {
                          setActive(index);
                        }}
                        params={{ _splat: entry.slug }}
                        role="option"
                        tabIndex={-1}
                        to={version.route}
                      >
                        <SearchHit hit={hit} withDescription={searching} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
        <span className="hidden items-center gap-1.5 sm:flex">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> to move
        </span>
        <span className="hidden items-center gap-1.5 sm:flex">
          <Kbd>↵</Kbd> to open
        </span>
        <span className="hidden items-center gap-1.5 sm:flex">
          <Kbd>⌘↵</Kbd> in a new tab
        </span>
        {!searching && recentIds.length > 0 ? (
          <button
            className="ml-auto font-medium hover:text-foreground"
            onClick={() => {
              saveRecent([]);
              setActive(0);
              inputRef.current?.focus();
            }}
            type="button"
          >
            Clear recent
          </button>
        ) : null}
        {hits.length > 0 && version.id === v11.id ? (
          <Link
            className="ml-auto font-medium text-link hover:underline"
            onClick={() => {
              search.cancel();
              props.onFollow();
            }}
            search={{ q: search.query }}
            to={searchPage.path}
          >
            All results
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** Before a query: what the reader opened last, then where to start. */
function emptyQueryGroups(
  version: DocsVersion,
  recentIds: ReadonlyArray<string>,
): ReadonlyArray<Group> {
  const recent = entriesById(version.allDocs, recentIds).map((entry) => ({
    entry,
    match: noMatch,
  }));
  const recentIdSet = new Set(recentIds);
  const suggested = searchDocs(version.allDocs, '', 8).filter(
    (hit) => !recentIdSet.has(hit.entry.id),
  );
  const groups: ReadonlyArray<Group> = [
    { hits: recent, title: 'Recent' },
    { hits: suggested, title: 'Start here' },
  ];
  return groups.filter((group) => group.hits.length > 0);
}

export function NoResults(props: { readonly query: string }) {
  return (
    <div className="grid justify-items-center gap-2 px-6 py-10 text-center text-sm">
      <SearchX aria-hidden className="size-6 text-muted-foreground" />
      <p>
        No results for “
        <span className="font-medium break-all">{props.query}</span>”
      </p>
      <p className="text-pretty text-muted-foreground">
        Check the spelling or try fewer words. Still stuck?{' '}
        <a
          className="text-link hover:underline"
          href={`${site.github}/discussions?discussions_q=${encodeURIComponent(props.query)}`}
        >
          Search GitHub Discussions
        </a>
      </p>
    </div>
  );
}

function Kbd(props: { readonly children: ReactNode }) {
  return (
    <kbd className="rounded border bg-muted px-1.5 font-mono text-[10px]">
      {props.children}
    </kbd>
  );
}
