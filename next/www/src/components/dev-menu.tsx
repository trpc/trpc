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
import { useEffect, useSyncExternalStore } from 'react';
import { toast } from 'sonner';

import {
  applyFlagParam,
  flagNames,
  flagParam,
  flags,
  getOverrides,
  setOverrides,
  siteEnv,
  useFlagOverrides,
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
              {flags[name].label}: {overrides[name] ? 'on' : 'off'}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Switches for the feature flags (`src/flags.ts`), in a corner of every
 * page. Development and preview builds always show it; production only once
 * `?flags=` has set a flag in this browser, until `?flags=reset`.
 */
export function DevMenu() {
  useFlagsFromUrl();
  const overrides = useFlagOverrides();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const overridden = Object.keys(overrides).length > 0;
  if (!mounted || (siteEnv === 'production' && !overridden)) {
    return null;
  }
  const on = flagNames.filter((name) => overrides[name]).length;
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
        {on > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white ring-2 ring-background">
            {on}
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
          <PopoverDescription>Kept in this browser.</PopoverDescription>
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
                  checked={overrides[name] ?? false}
                  className="mt-0.5"
                  onCheckedChange={(checked) =>
                    setOverrides({ ...getOverrides(), [name]: checked })
                  }
                />
              </label>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-3 border-t pt-2.5">
          <p className="text-xs text-pretty text-muted-foreground">
            <code className="font-mono">?{flagParam}=-name</code> turns one off;{' '}
            <code className="font-mono">?{flagParam}=reset</code>
            {siteEnv === 'production'
              ? ' forgets them and hides this menu.'
              : ' forgets them.'}
          </p>
          <Button
            disabled={!overridden}
            onClick={() => setOverrides({})}
            size="xs"
            variant="outline"
          >
            Reset
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
