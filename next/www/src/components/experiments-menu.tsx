import { Badge } from '@shared/ui/components/badge';
import { Button } from '@shared/ui/components/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@shared/ui/components/popover';
import { Switch } from '@shared/ui/components/switch';
import { cn } from '@shared/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { FlaskConical } from 'lucide-react';
import { useState } from 'react';

import { TextWithCode } from '~/components/text-with-code.tsx';
import { v12Docs } from '~/content/docs.ts';
import { experimentIds, experiments } from '~/experiments.ts';
import {
  flagParam,
  flagParamFor,
  siteEnv,
  useFlagsOn,
  useSetFlags,
  withFlag,
} from '~/flags.ts';

/**
 * The header's switches for the experiments (`src/experiments.ts`), in every
 * environment, each with links to its pages. A switch rewrites `?flags=` in
 * the URL, where the experiments live; the page stays where it is.
 */
export function ExperimentsMenu() {
  const on = useFlagsOn();
  const setFlags = useSetFlags();
  const [open, setOpen] = useState(false);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-label={
              on.length > 0 ? `Experiments, ${on.length} on` : 'Experiments'
            }
            className={cn(
              'text-muted-foreground hover:text-foreground',
              on.length > 0 && 'text-foreground',
            )}
            size="sm"
            title="Experiments"
            variant="ghost"
          />
        }
      >
        <FlaskConical className={cn(on.length > 0 && 'text-brand')} />
        <span className="hidden lg:inline">Experiments</span>
        {on.length > 0 ? (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white tabular-nums">
            {on.length}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[calc(100dvh-5rem)] w-96 overflow-y-auto"
        side="bottom"
      >
        <PopoverHeader>
          <PopoverTitle className="flex items-center justify-between gap-2">
            Experiments
            <Badge className="font-mono" variant="outline">
              {siteEnv}
            </Badge>
          </PopoverTitle>
          <PopoverDescription>
            Features we're trying out, with their docs pages. They might change
            or go away in any release. Each is off until you turn it on or open
            one of its pages. Kept in the URL, so a link you copy shares them.
          </PopoverDescription>
        </PopoverHeader>
        <ul className="-mx-1 grid">
          {experimentIds.map((id) => {
            const pages = v12Docs.allDocs.filter(
              (doc) => doc.experiment === id,
            );
            return (
              <li className="grid gap-1.5 rounded-md p-2" key={id}>
                <label className="flex cursor-pointer items-start justify-between gap-4">
                  <span className="grid gap-0.5">
                    <span className="font-medium">{experiments[id].label}</span>
                    <span className="text-xs text-pretty text-muted-foreground">
                      <TextWithCode text={experiments[id].description} />
                    </span>
                  </span>
                  <Switch
                    checked={on.includes(id)}
                    className="mt-0.5"
                    onCheckedChange={(checked) =>
                      setFlags(withFlag(on, id, checked))
                    }
                  />
                </label>
                <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {pages.map((page) => (
                    <li key={page.slug}>
                      <Link
                        className="text-link hover:underline"
                        onClick={() => setOpen(false)}
                        params={{ _splat: page.slug }}
                        search={(prev) => ({
                          ...prev,
                          flags: flagParamFor(withFlag(on, id, true)),
                        })}
                        to={v12Docs.route}
                      >
                        <TextWithCode bare text={page.label ?? page.title} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-3 border-t pt-2.5">
          <p className="text-xs text-pretty text-muted-foreground">
            Links on the site keep{' '}
            <code className="font-mono">?{flagParam}=</code>; a URL without it
            has every experiment off.
          </p>
          <Button
            className="shrink-0"
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
