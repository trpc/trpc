import { Button } from '@shared/ui/components/button';
import { Search } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';

const AlgoliaSearch = lazy(() => import('./algolia-search.tsx'));

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
      {/* An icon from `md` to `lg`, where the header's nav takes its room. */}
      <Button
        aria-keyshortcuts="Meta+K Control+K"
        className="w-9 justify-start px-0 text-muted-foreground sm:w-56 sm:px-3 md:w-9 md:px-0 lg:w-56 lg:px-3"
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
        <Search className="mx-auto sm:mx-0 md:mx-auto lg:mx-0" />
        <span className="hidden sm:inline md:hidden lg:inline">
          Search docs…
        </span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline md:hidden lg:inline">
          ⌘K
        </kbd>
      </Button>
      {open ? (
        <Suspense>
          <AlgoliaSearch
            onClose={() => {
              setOpen(false);
            }}
          />
        </Suspense>
      ) : null}
    </>
  );
}
