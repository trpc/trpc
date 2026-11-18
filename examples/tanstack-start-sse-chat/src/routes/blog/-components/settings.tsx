import { Button } from '@shared/ui/components/button';
import { Label } from '@shared/ui/components/label';
import { Switch } from '@shared/ui/components/switch';
import { ChevronDownIcon, RotateCcwIcon } from 'lucide-react';
import { createContext, use, useId } from 'react';
import type { BlogPreload, BlogSettings } from '~/lib/blog-settings';
import { blogSettingsDefaults } from '~/lib/blog-settings';

const preloadOptions: { value: BlogPreload; label: string }[] = [
  { value: false, label: 'Off' },
  { value: 'intent', label: 'On hover or focus' },
  { value: 'viewport', label: 'When in view' },
  { value: 'render', label: 'When rendered' },
];

const PreloadContext = createContext<BlogPreload>(blogSettingsDefaults.preload);

/** Gives the blog's links their `preload` */
export const BlogPreloadProvider = PreloadContext;

/** The `preload` for a link on a blog page */
export function useBlogPreload() {
  return use(PreloadContext);
}

/**
 * The blog's settings, together: how slow its queries are, when its links
 * load the page they go to, and a button to put both back as they were
 */
export function BlogSettingsBar(
  props: Readonly<{
    value: BlogSettings;
    onChange: (value: BlogSettings) => void;
  }>,
) {
  const { value, onChange } = props;
  const preloadId = useId();
  const isDefault =
    value.slowQueries === blogSettingsDefaults.slowQueries &&
    value.preload === blogSettingsDefaults.preload;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border px-4 py-3">
      <div className="flex items-center gap-3">
        <Switch
          id="slow-queries"
          checked={value.slowQueries}
          onCheckedChange={(checked) =>
            onChange({ ...value, slowQueries: checked })
          }
        />
        <Label
          htmlFor="slow-queries"
          className="flex flex-col items-start gap-1"
        >
          Slow queries
          <span className="text-xs font-normal text-muted-foreground">
            Every query of the blog takes 1 to 3 seconds
          </span>
        </Label>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <label htmlFor={preloadId}>Preload links</label>
        {/* Its own classes, so this app's styles have them */}
        <div className="relative">
          <select
            id={preloadId}
            className="h-7 appearance-none rounded-md border bg-background py-0.5 pr-7 pl-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
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
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2"
          />
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto"
        disabled={isDefault}
        onClick={() => onChange(blogSettingsDefaults)}
      >
        <RotateCcwIcon />
        Reset
      </Button>
    </div>
  );
}
