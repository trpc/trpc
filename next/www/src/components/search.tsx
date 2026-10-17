import { Button } from '@shared/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@shared/ui/components/dialog';
import { cn } from '@shared/ui/lib/utils';
import { useNavigate } from '@tanstack/react-router';
import { FileText, Hash, Search } from 'lucide-react';
import { useState } from 'react';

import { type DocsVersion, useDocsVersion, versions } from '~/content/docs.ts';

interface SearchEntry {
  readonly hash: string | undefined;
  readonly haystack: string;
  readonly id: string;
  readonly page: string;
  readonly slug: string;
  readonly text: string;
}

function entriesOf(version: DocsVersion): ReadonlyArray<SearchEntry> {
  return version.allDocs.flatMap((doc) => [
    {
      hash: undefined,
      haystack:
        `${doc.title} ${doc.label ?? ''} ${doc.description} ${doc.section}`.toLowerCase(),
      id: doc.slug,
      page: doc.section,
      slug: doc.slug,
      text: doc.label ?? doc.title,
    },
    ...doc.headings.map((heading) => ({
      hash: heading.id,
      haystack: `${heading.text} ${doc.title}`.toLowerCase(),
      id: `${doc.slug}#${heading.id}`,
      page: doc.label ?? doc.title,
      slug: doc.slug,
      text: heading.text,
    })),
  ]);
}

/** Each version's pages and headings: search looks in the version being read. */
const entriesByVersion = new Map(
  versions.map((version) => [version.id, entriesOf(version)]),
);

function search(
  version: DocsVersion,
  query: string,
): ReadonlyArray<SearchEntry> {
  const entries = entriesByVersion.get(version.id) ?? [];
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return entries.filter((entry) => entry.hash === undefined).slice(0, 8);
  }
  return entries
    .filter((entry) => terms.every((term) => entry.haystack.includes(term)))
    .map((entry) => {
      const text = entry.text.toLowerCase();
      const score =
        (text.startsWith(terms[0] ?? '') ? 4 : 0) +
        (terms.every((term) => text.includes(term)) ? 2 : 0) +
        (entry.hash === undefined ? 1 : 0);
      return { entry, score };
    })
    .toSorted((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((result) => result.entry);
}

export function SearchButton() {
  const [open, setOpen] = useState(false);
  const openOnShortcut = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      setOpen(true);
    }
  };
  return (
    <>
      <Button
        aria-keyshortcuts="Meta+K Control+K"
        className="w-9 justify-start px-0 text-muted-foreground sm:w-56 sm:px-3"
        onClick={() => {
          setOpen(true);
        }}
        ref={(button) => {
          if (button === null) {
            return;
          }
          window.addEventListener('keydown', openOnShortcut);
          return () => {
            window.removeEventListener('keydown', openOnShortcut);
          };
        }}
        size="sm"
        title="Search docs (⌘K)"
        variant="outline"
      >
        <Search className="mx-auto sm:mx-0" />
        <span className="hidden sm:inline">Search docs…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">
          ⌘K
        </kbd>
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        {/* On a phone the keyboard covers the bottom half of the screen. */}
        <DialogContent className="top-3 translate-y-0 gap-0 p-0 sm:top-[15%] sm:max-w-xl">
          <DialogTitle className="sr-only">Search the docs</DialogTitle>
          <DialogDescription className="sr-only">
            Type to find a page or a section
          </DialogDescription>
          {open ? (
            <SearchPanel
              onClose={() => {
                setOpen(false);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function SearchPanel(props: { readonly onClose: () => void }) {
  const navigate = useNavigate();
  const version = useDocsVersion();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = search(version, query);
  const selected = Math.min(active, Math.max(results.length - 1, 0));

  const go = (entry: SearchEntry) => {
    props.onClose();
    void navigate({
      ...(entry.hash === undefined ? {} : { hash: entry.hash }),
      params: { _splat: entry.slug },
      to: version.route,
    });
  };

  return (
    <div className="grid">
      <label className="flex items-center gap-3 border-b px-4">
        <Search className="size-4 text-muted-foreground" />
        <span className="sr-only">Search</span>
        <input
          aria-activedescendant={
            results[selected] ? `search-${results[selected].id}` : undefined
          }
          aria-controls="search-results"
          aria-expanded="true"
          autoFocus
          className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((selected + 1) % Math.max(results.length, 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive(
                (selected - 1 + results.length) % Math.max(results.length, 1),
              );
            } else if (event.key === 'Enter' && results[selected]) {
              event.preventDefault();
              go(results[selected]);
            }
          }}
          placeholder={
            version.id === 'v12'
              ? 'Search guides, APIs, options…'
              : 'Search the v11 docs…'
          }
          role="combobox"
          value={query}
        />
      </label>
      <ul
        className="max-h-[45vh] overflow-y-auto p-2 sm:max-h-[60vh]"
        id="search-results"
        role="listbox"
      >
        {results.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            No results for “{query}”
          </li>
        ) : null}
        {results.map((entry, index) => (
          <li
            aria-selected={index === selected}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm',
              index === selected && 'bg-accent',
            )}
            id={`search-${entry.id}`}
            key={entry.id}
            onClick={() => {
              go(entry);
            }}
            onPointerMove={() => {
              setActive(index);
            }}
            role="option"
          >
            {entry.hash === undefined ? (
              <FileText className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <Hash className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{entry.text}</span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {entry.page}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
