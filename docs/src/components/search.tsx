'use client';

import { cn } from '@/lib/cn';
import { OramaClient } from '@oramacloud/client';
import { useDocsSearch } from 'fumadocs-core/search/client';
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogFooter,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SharedProps,
} from 'fumadocs-ui/components/dialog/search';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from 'fumadocs-ui/components/ui/popover';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

const client = new OramaClient({
  endpoint: 'https://cloud.orama.run/v1/indexes/docs-fk97oe',
  api_key: 'oPZjdlFbq5BpR54bV5Vj57RYt83Xosk7',
});

const items = [
  {
    name: 'All',
    value: undefined,
  },
  {
    name: 'Framework',
    description: 'Only results about tRPC Framework & guides',
    value: 'framework',
  },
  {
    name: 'Server',
    description: 'Only results about tRPC Server',
    value: 'server',
  },
  {
    name: 'Client',
    description: 'Only results about tRPC Client',
    value: 'client',
  },
];

export default function CustomSearchDialog(props: SharedProps) {
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState<string | undefined>();
  const { search, setSearch, query } = useDocsSearch({
    // type: 'orama-cloud',
    // client,
    type: 'fetch',
    tag,
  });

  return (
    <SearchDialog
      search={search}
      onSearchChange={setSearch}
      isLoading={query.isLoading}
      {...props}
    >
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList items={query.data !== 'empty' ? query.data : null} />
        <SearchDialogFooter className="flex flex-row flex-wrap items-center gap-2">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              className={buttonVariants({
                size: 'sm',
                color: 'ghost',
                className: '-m-1.5 me-auto',
              })}
            >
              <span className="text-fd-muted-foreground/80 me-2">Filter</span>
              {items.find((item) => item.value === tag)?.name}
              <ChevronDown className="text-fd-muted-foreground size-3.5" />
            </PopoverTrigger>
            <PopoverContent className="flex flex-col gap-1 p-1" align="start">
              {items.map((item, i) => {
                const isSelected = item.value === tag;

                return (
                  <button
                    key={i}
                    onClick={() => {
                      setTag(item.value);
                      setOpen(false);
                    }}
                    className={cn(
                      'rounded-lg px-2 py-1.5 text-start',
                      isSelected
                        ? 'text-fd-primary bg-fd-primary/10'
                        : 'hover:text-fd-accent-foreground hover:bg-fd-accent',
                    )}
                  >
                    <p className="mb-0.5 font-medium">{item.name}</p>
                    <p className="text-xs opacity-70">{item.description}</p>
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
          <a
            href="https://orama.com"
            rel="noreferrer noopener"
            className="text-fd-muted-foreground text-nowrap text-xs"
          >
            Powered by Orama
          </a>
        </SearchDialogFooter>
      </SearchDialogContent>
    </SearchDialog>
  );
}
