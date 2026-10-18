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
import { useLocation, useRouter } from '@tanstack/react-router';
import { FlaskConical } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';

import {
  applyFlagParam,
  type FlagName,
  flagNames,
  flagParam,
  flags,
  flagsOn,
  getOverrides,
  setOverrides,
  siteEnv,
  useFlagOverrides,
  withFlag,
} from '~/flags.ts';

/**
 * Applies a `?flags=` in the URL, then takes it out of the URL, so a link
 * copied afterwards doesn't carry it.
 */
function useFlagsFromUrl() {
  const router = useRouter();
  const searchStr = useLocation({ select: (location) => location.searchStr });
  useEffect(() => {
    const params = new URLSearchParams(searchStr);
    const param = params.get(flagParam);
    if (param === null) {
      return;
    }
    const next = applyFlagParam(getOverrides(), param);
    setOverrides(next);
    params.delete(flagParam);
    const rest = params.toString();
    router.history.replace(
      `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`,
    );
    toast.custom(() => <FlagsToast />, { duration: 4000, id: 'flags' });
  }, [router, searchStr]);
}

function FlagsToast() {
  const overrides = getOverrides();
  return (
    <div className="flex w-full items-start gap-3 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-lg">
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-brand" />
      <div className="grid gap-1">
        <p className="font-semibold">Feature flags updated</p>
        <ul className="text-muted-foreground">
          {flagNames.map((name) => (
            <li key={name}>
              {flags[name].label}: {overrides[name] === true ? 'on' : 'off'}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * The flags on now or at any point since the page loaded, in `flagNames`
 * order, so a flag turned off from the menu stays in it until the next load.
 */
function useFlagsOnThisVisit(on: ReadonlyArray<FlagName>) {
  const [seen, setSeen] = useState<ReadonlyArray<FlagName>>([]);
  if (on.some((name) => !seen.includes(name))) {
    const next = flagNames.filter(
      (name) => seen.includes(name) || on.includes(name),
    );
    setSeen(next);
    return next;
  }
  return seen;
}

/**
 * Switches for the feature flags (`src/flags.ts`), in a corner of every
 * page. Development and preview builds always show it, with every flag. On
 * production, flags are turned on only with `?flags=`: the menu shows once
 * one is on in this browser, with the ones turned on, to turn them off; with
 * none left on, it's gone from the next page load.
 */
export function DevMenu() {
  useFlagsFromUrl();
  const overrides = useFlagOverrides();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const on = flagsOn(overrides);
  const onThisVisit = useFlagsOnThisVisit(on);
  const production = siteEnv === 'production';
  const listed = production ? onThisVisit : flagNames;
  if (!mounted || listed.length === 0) {
    return null;
  }
  const productionHint =
    on.length > 0
      ? 'Nobody else sees them. With every flag off, this menu is gone from the next page load.'
      : 'Every flag is off. This menu is gone from the next page load.';
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            aria-label="Dev menu"
            className="fixed bottom-4 left-4 z-50 flex size-9 items-center justify-center rounded-full border bg-background/90 text-muted-foreground shadow-lg backdrop-blur transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 print:hidden"
            title="Dev menu"
            type="button"
          />
        }
      >
        <FlaskConical className="size-4" />
        {on.length > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white ring-2 ring-background">
            {on.length}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80" side="top">
        <PopoverHeader>
          <PopoverTitle className="flex items-center justify-between gap-2">
            Feature flags
            <Badge className="font-mono" variant="outline">
              {siteEnv}
            </Badge>
          </PopoverTitle>
          <PopoverDescription>
            {production
              ? 'Turned on in this browser with ?flags=. Turn them off here.'
              : 'Kept in this browser.'}
          </PopoverDescription>
        </PopoverHeader>
        <ul className="-mx-1 grid">
          {listed.map((name) => (
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
                  checked={overrides[name] === true}
                  className="mt-0.5"
                  onCheckedChange={(checked) =>
                    setOverrides(withFlag(getOverrides(), name, checked))
                  }
                />
              </label>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-3 border-t pt-2.5">
          <p className="text-xs text-pretty text-muted-foreground">
            {production ? (
              productionHint
            ) : (
              <>
                <code className="font-mono">?{flagParam}=-name</code> turns one
                off; <code className="font-mono">?{flagParam}=reset</code> turns
                them all off.
              </>
            )}
          </p>
          <Button
            className="shrink-0"
            disabled={on.length === 0}
            onClick={() => setOverrides({})}
            size="xs"
            variant="outline"
          >
            {production ? 'Turn all off' : 'Reset'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
