'use client';

import { cn } from '@shared/ui/lib/utils';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

const storageKey = 'trpc-docs:theme';

/**
 * Sets `dark` or `light` on <html> from the stored choice, or from the system
 * setting when there is none. Stringified into `themeScript`, so it can't use
 * anything from its module scope.
 */
function applyTheme(key: string) {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(key);
  } catch {
    // Storage is blocked: follow the system setting.
  }
  const dark =
    stored === 'dark' ||
    (stored !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.classList.toggle('light', !dark);
}

/** Runs before first paint, so a dark page never flashes light. */
export const themeScript = `(${applyTheme.toString()})(${JSON.stringify(storageKey)});`;

const options = [
  { Icon: Monitor, label: 'System theme', value: 'system' },
  { Icon: Sun, label: 'Light theme', value: 'light' },
  { Icon: Moon, label: 'Dark theme', value: 'dark' },
] as const;

export function ThemeToggle() {
  const themeState = useTheme();
  // next-themes resolves the theme after mount; until then nothing is pressed.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <div
      aria-label="Theme"
      className="flex items-center gap-0.5 rounded-full border p-0.5"
      role="group"
    >
      {options.map((option) => (
        <button
          aria-label={option.label}
          aria-pressed={mounted && themeState.theme === option.value}
          className={cn(
            'flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
            mounted &&
              themeState.theme === option.value &&
              'bg-muted text-foreground',
          )}
          key={option.value}
          onClick={() => {
            themeState.setTheme(option.value);
          }}
          title={option.label}
          type="button"
        >
          <option.Icon aria-hidden className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
