import { Button } from '@shared/ui/components/button';
import {
  ChevronDownIcon,
  RotateCcwIcon,
  TurtleIcon,
  ZapIcon,
} from 'lucide-react';
import { createContext, use, useId } from 'react';

import {
  type BlogPreload,
  type BlogSettings,
  blogSettingsDefaults,
} from '../-settings.ts';

const preloadOptions: ReadonlyArray<{
  readonly value: BlogPreload;
  readonly label: string;
}> = [
  { value: false, label: 'Off' },
  { value: 'intent', label: 'Hover' },
  { value: 'viewport', label: 'In view' },
  { value: 'render', label: 'Render' },
];

const PreloadContext = createContext<BlogPreload>(blogSettingsDefaults.preload);

/** Gives the blog's links their `preload` */
export const BlogPreloadProvider = PreloadContext;

/** The `preload` for a link on a blog page */
export function useBlogPreload() {
  return use(PreloadContext);
}

/**
 * The blog's settings, in one short row: how slow its queries are, when its
 * links load the page they go to, and a button to put both back as they
 * were
 */
export function BlogSettingsBar(props: {
  readonly value: BlogSettings;
  readonly onChange: (value: BlogSettings) => void;
}) {
  const { value, onChange } = props;
  const preloadId = useId();
  const isDefault =
    value.slowQueries === blogSettingsDefaults.slowQueries &&
    value.preload === blogSettingsDefaults.preload;
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs">
      <button
        type="button"
        aria-pressed={value.slowQueries}
        title="Every query your browser asks for takes 1 to 3 seconds"
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2 font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
        onClick={() => onChange({ ...value, slowQueries: !value.slowQueries })}
      >
        <TurtleIcon aria-hidden className="size-3.5" />
        Slow
      </button>
      <label
        htmlFor={preloadId}
        className="ml-1 font-medium whitespace-nowrap text-muted-foreground max-sm:sr-only"
      >
        Preload links
      </label>
      <div className="relative shrink-0">
        <ZapIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <select
          id={preloadId}
          title="When a link loads the page it goes to"
          className="h-7 appearance-none rounded-full border bg-background pr-6 pl-6 text-xs font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          value={String(value.preload)}
          onChange={(event) => {
            const picked = preloadOptions.find(
              (option) => String(option.value) === event.target.value,
            );
            onChange({
              ...value,
              preload: picked?.value ?? blogSettingsDefaults.preload,
            });
          }}
        >
          {preloadOptions.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2"
        />
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Reset settings"
        title="Reset settings"
        className="shrink-0"
        disabled={isDefault}
        onClick={() => onChange(blogSettingsDefaults)}
      >
        <RotateCcwIcon />
      </Button>
    </div>
  );
}
