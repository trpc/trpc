import { Badge } from '@shared/ui/components/badge';
import { Button, buttonVariants } from '@shared/ui/components/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@shared/ui/components/input-group';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from '@shared/ui/components/popover';
import { Switch } from '@shared/ui/components/switch';
import { cn } from '@shared/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { Check, ChevronRight, FlaskConical, Link2, Search } from 'lucide-react';
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';

import { TextWithCode } from '~/components/text-with-code.tsx';
import { v12Docs } from '~/content/docs.ts';
import {
  type ExperimentId,
  experimentIds,
  experiments,
} from '~/experiments.ts';
import {
  flagParamFor,
  menuOpen,
  siteEnv,
  useFlagsOn,
  useHydrated,
  useMenuState,
  useSetFlags,
  useSetMenuState,
  withFlag,
} from '~/flags.ts';

const pagesOf = (id: ExperimentId) =>
  v12Docs.allDocs.filter((doc) => doc.experiment === id);

/** Whether `id`'s label, description or pages mention `query`. */
function matches(id: ExperimentId, query: string) {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return true;
  }
  return [
    id,
    experiments[id].label,
    experiments[id].description,
    ...pagesOf(id).map((page) => page.label ?? page.title),
  ].some((text) => text.replaceAll('`', '').toLowerCase().includes(needle));
}

/**
 * The header's switches for the experiments (`src/experiments.ts`), in every
 * environment, each with links to its pages. A switch rewrites `?flags=` in
 * the URL, where the experiments live, and the menu is open while the URL
 * has `?experiments=` (`open`, or the experiment whose pages it shows), so a
 * link opens it, the header's button among them: it's a link to this URL with
 * `?experiments=` toggled, so it can be opened in a new tab or copied. None
 * of them adds a history entry or scrolls the page; following any other link
 * drops `?experiments=`, closing it.
 */
export function ExperimentsMenu(props: { readonly hidden?: boolean }) {
  const on = useFlagsOn();
  const setFlags = useSetFlags();
  const state = useMenuState();
  const setState = useSetMenuState();
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLAnchorElement>(null);
  const popupId = useId();
  const hydrated = useHydrated();
  const open = state !== undefined && props.hidden !== true;
  const shown = experimentIds.filter((id) => matches(id, query));

  // Opened on an experiment (a link to it), brings its row into view: the
  // list's scroll, not the page's.
  const revealPicked = useEffectEvent(() => {
    const row = list.current?.querySelector<HTMLElement>(
      `[data-experiment="${state}"]`,
    );
    if (row && list.current && state !== menuOpen) {
      list.current.scrollTop = row.offsetTop - 4;
    }
  });
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => revealPicked());
    }
  }, [open]);

  return (
    <Popover
      onOpenChange={(next, details) => {
        // Pressing the link toggles the menu itself, through its href.
        if (
          details.reason === 'outside-press' &&
          details.event.target instanceof Node &&
          trigger.current?.contains(details.event.target)
        ) {
          details.cancel();
          return;
        }
        setState(next ? (state ?? menuOpen) : undefined);
        if (!next) {
          setQuery('');
        }
      }}
      open={open}
    >
      <Link
        aria-controls={open ? popupId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          on.length > 0 ? `Experiments, ${on.length} on` : 'Experiments'
        }
        className={cn(
          buttonVariants({ size: 'sm', variant: 'ghost' }),
          'relative text-muted-foreground hover:text-foreground',
          on.length > 0 && 'text-foreground',
        )}
        // The server doesn't know the URL's hash, so it joins the href after
        // hydration.
        {...(hydrated ? { hash: true } : {})}
        hashScrollIntoView={false}
        ref={trigger}
        replace
        resetScroll={false}
        search={(prev) => ({
          ...prev,
          experiments: open ? undefined : menuOpen,
        })}
        title="Experiments"
        to="."
      >
        <FlaskConical className={cn(on.length > 0 && 'text-brand')} />
        <span className="hidden lg:inline">Experiments</span>
        {/* Below `lg` the count sits on the icon's corner: inline, it doesn't
            fit a 360px phone's header. */}
        {on.length > 0 ? (
          <span className="absolute top-0 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white tabular-nums lg:static">
            {on.length}
          </span>
        ) : null}
      </Link>
      <PopoverContent
        align="end"
        anchor={trigger}
        className="max-h-[min(40rem,calc(100dvh-5rem))] w-[26rem] max-w-[calc(100vw-1rem)] gap-0 p-0"
        finalFocus={trigger}
        id={popupId}
        initialFocus={(type) => (type === 'touch' ? true : search.current)}
        side="bottom"
      >
        <PopoverHeader className="gap-2 border-b p-3">
          <PopoverTitle className="flex items-center gap-2">
            Experiments
            <Badge className="font-mono" variant="outline">
              {siteEnv}
            </Badge>
            <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
              {on.length} of {experimentIds.length} on
            </span>
          </PopoverTitle>
          <PopoverDescription className="text-xs text-pretty">
            Features we're trying out, with their docs pages. They might change
            or go away in any release. Each is off until you turn it on or open
            one of its pages; the URL keeps them, so a link shares them.
          </PopoverDescription>
          <InputGroup className="mt-1">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Filter experiments"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by name or page"
              ref={search}
              type="search"
              value={query}
            />
          </InputGroup>
        </PopoverHeader>
        <ul
          className="relative grid min-h-0 flex-1 content-start gap-0.5 overflow-y-auto overscroll-contain p-1.5"
          ref={list}
        >
          {shown.length === 0 ? (
            <li className="p-4 text-center text-xs text-muted-foreground">
              No experiment matches “{query.trim()}”.
            </li>
          ) : null}
          {shown.map((id) => {
            const pages = pagesOf(id);
            const enabled = on.includes(id);
            const expanded = state === id || query.trim() !== '';
            return (
              <li
                className={cn(
                  'grid gap-1.5 rounded-md px-2 py-1.5 transition-colors',
                  enabled
                    ? 'bg-brand/8 ring-1 ring-brand/20 ring-inset'
                    : 'hover:bg-accent/50',
                )}
                data-experiment={id}
                data-on={enabled}
                key={id}
              >
                <div className="flex items-start gap-3">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                    <Switch
                      checked={enabled}
                      className="mt-0.5"
                      onCheckedChange={(checked) =>
                        setFlags(withFlag(on, id, checked))
                      }
                      size="sm"
                    />
                    <span className="grid min-w-0 gap-0.5">
                      <span className="leading-tight font-medium">
                        {experiments[id].label}
                      </span>
                      <span
                        className={cn(
                          'text-xs text-pretty text-muted-foreground',
                          !expanded && 'line-clamp-1',
                        )}
                      >
                        <TextWithCode text={experiments[id].description} />
                      </span>
                    </span>
                  </label>
                  <Button
                    aria-expanded={expanded}
                    className="shrink-0 text-muted-foreground"
                    onClick={() => setState(state === id ? menuOpen : id)}
                    size="xs"
                    variant="ghost"
                  >
                    {pages.length} {pages.length === 1 ? 'page' : 'pages'}
                    <ChevronRight
                      className={cn(
                        'transition-transform',
                        expanded && 'rotate-90',
                      )}
                    />
                  </Button>
                </div>
                {expanded ? (
                  <ul className="ml-9 grid gap-0.5 text-xs">
                    {pages.map((page) => (
                      <li key={page.slug}>
                        <Link
                          className="text-link hover:underline"
                          params={{ _splat: page.slug }}
                          search={(prev) => ({
                            ...prev,
                            experiments: undefined,
                            flags: flagParamFor(withFlag(on, id, true)),
                          })}
                          to={v12Docs.route}
                        >
                          <TextWithCode bare text={page.label ?? page.title} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-1.5 border-t p-2">
          <Button
            onClick={() => {
              void navigator.clipboard.writeText(location.href).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            size="xs"
            title="Copy a link that opens this menu, with these experiments on"
            variant="ghost"
          >
            {copied ? <Check /> : <Link2 />}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          <Button
            className="ml-auto"
            disabled={on.length === experimentIds.length}
            onClick={() => setFlags(experimentIds)}
            size="xs"
            variant="outline"
          >
            Turn all on
          </Button>
          <Button
            disabled={on.length === 0}
            onClick={() => setFlags([])}
            size="xs"
            variant="outline"
          >
            Turn all off
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
