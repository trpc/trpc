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
import { useNavigate } from '@tanstack/react-router';
import { FlaskConical } from 'lucide-react';

import {
  type FlagName,
  flagNames,
  flagParam,
  flagParamFor,
  flags,
  siteEnv,
  useFlagsOn,
  withFlag,
} from '~/flags.ts';

/**
 * The header's switches for the feature flags (`src/flags.ts`), in every
 * environment. A switch rewrites `?flags=` in the URL, where the flags live;
 * the page stays where it is.
 */
export function ExperimentsMenu() {
  const on = useFlagsOn();
  const navigate = useNavigate();
  const setFlags = (next: ReadonlyArray<FlagName>) =>
    void navigate({
      hash: true,
      hashScrollIntoView: false,
      replace: true,
      resetScroll: false,
      search: (prev) => ({ ...prev, flags: flagParamFor(next) }),
      to: '.',
    });
  return (
    <Popover>
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
      <PopoverContent align="end" className="w-80" side="bottom">
        <PopoverHeader>
          <PopoverTitle className="flex items-center justify-between gap-2">
            Experiments
            <Badge className="font-mono" variant="outline">
              {siteEnv}
            </Badge>
          </PopoverTitle>
          <PopoverDescription>
            Features we're trying out, off unless you turn them on. Kept in the
            URL, so a link you copy shares them.
          </PopoverDescription>
        </PopoverHeader>
        <ul className="-mx-1 grid">
          {flagNames.map((name) => (
            <li key={name}>
              <label className="flex cursor-pointer items-start justify-between gap-4 rounded-md p-2 hover:bg-accent/50">
                <span className="grid gap-0.5">
                  <span className="font-medium">{flags[name].label}</span>
                  <span className="text-xs text-pretty text-muted-foreground">
                    {flags[name].description}
                  </span>
                  <code className="mt-1 w-fit rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-muted-foreground">
                    ?{flagParam}={name}
                  </code>
                </span>
                <Switch
                  checked={on.includes(name)}
                  className="mt-0.5"
                  onCheckedChange={(checked) =>
                    setFlags(withFlag(on, name, checked))
                  }
                />
              </label>
            </li>
          ))}
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
