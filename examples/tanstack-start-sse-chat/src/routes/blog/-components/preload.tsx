import { ChevronDownIcon } from 'lucide-react';
import { createContext, use, useId } from 'react';

/**
 * When the blog's links load the page they go to, as TanStack Router's
 * `preload` takes it. Off by default, so each page loads when it is opened
 * and its request is easy to find in the network panel.
 */
export type BlogPreload = false | 'intent' | 'viewport' | 'render';

const options: { value: BlogPreload; label: string }[] = [
  { value: false, label: 'Off' },
  { value: 'intent', label: 'On hover or focus' },
  { value: 'viewport', label: 'When in view' },
  { value: 'render', label: 'When rendered' },
];

const PreloadContext = createContext<BlogPreload>(false);

export const BlogPreloadProvider = PreloadContext;

/** The `preload` for a link on a blog page */
export function useBlogPreload() {
  return use(PreloadContext);
}

/** Picks when the blog's links load the page they go to */
export function BlogPreloadSelect(
  props: Readonly<{
    value: BlogPreload;
    onChange: (value: BlogPreload) => void;
  }>,
) {
  const id = useId();
  return (
    <div className="flex items-center gap-2 self-end text-xs text-muted-foreground">
      <label htmlFor={id}>Preload links</label>
      {/* Its own classes, so this app's styles have them */}
      <div className="relative">
        <select
          id={id}
          className="h-7 appearance-none rounded-md border bg-background py-0.5 pr-7 pl-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          value={String(props.value)}
          onChange={(event) => {
            const picked = options.find(
              (option) => String(option.value) === event.target.value,
            );
            props.onChange(picked?.value ?? false);
          }}
        >
          {options.map((option) => (
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
  );
}
