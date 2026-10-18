import { Link } from '@tanstack/react-router';
import { PackageX } from 'lucide-react';
import { useEffect } from 'react';
import { toast, Toaster } from 'sonner';

import { buttonVariants } from '@shared/ui/components/button';
import { cn } from '@shared/ui/lib/utils';
import { useDocsVersion, v11Docs } from '~/content/docs.ts';

/** A package manager command that names a `@trpc12/` package. */
const unpublishedCommand =
  /^[\s$>]*(?:pnpm|npm|npx|yarn|bun|bunx)\s[^\n]*@trpc12\/[^\n]*/m;

/** The first command in `text` that installs or runs an unpublished package. */
export function unpublishedCommandIn(text: string) {
  return unpublishedCommand
    .exec(text)?.[0]
    .replace(/^[\s$>]+/, '')
    .trim();
}

const toastId = 'unpublished';

/**
 * Warns that a copied command won't work yet: the `@trpc12/` packages aren't
 * on npm until tRPC v12 is released. Copying again replaces the toast.
 */
export function warnUnpublished(command: string) {
  toast.custom(() => <UnpublishedToast command={command} />, {
    duration: 10_000,
    id: toastId,
  });
}

function UnpublishedToast(props: { readonly command: string }) {
  const name = /@trpc12\/[\w-]+/.exec(props.command)?.[0] ?? '@trpc12/trpc';
  return (
    <div className="flex w-full gap-3 rounded-lg border border-[oklch(0.7_0.15_75/0.45)] bg-popover p-4 text-sm text-popover-foreground shadow-lg">
      <span className="relative mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[oklch(0.7_0.15_75/0.15)] text-[oklch(0.6_0.15_75)] dark:text-[oklch(0.8_0.15_75)]">
        <span className="absolute inset-0 animate-ping rounded-full bg-[oklch(0.7_0.15_75/0.25)] [animation-iteration-count:2] motion-reduce:hidden" />
        <PackageX className="size-4" />
      </span>
      <div className="grid min-w-0 flex-1 gap-1.5">
        <p className="font-semibold">Copied, but it’s not on npm yet</p>
        <p className="text-muted-foreground">
          The <code className="font-mono text-[0.9em]">@trpc12</code> packages
          aren’t published, so this fails until tRPC v12 is released.
        </p>
        <pre className="overflow-x-auto rounded-md bg-muted px-2.5 py-2 font-mono text-xs leading-relaxed">
          <span className="text-muted-foreground select-none">$ </span>
          {props.command}
          {'\n'}
          <span className="text-destructive">404 Not Found: {name}</span>
        </pre>
        <div className="mt-0.5 flex flex-wrap gap-2">
          <Link
            className={cn(buttonVariants({ size: 'xs' }))}
            onClick={() => toast.dismiss(toastId)}
            params={{ _splat: v11Docs.firstDoc }}
            to={v11Docs.route}
          >
            Use v11 today
          </Link>
          <button
            className={cn(buttonVariants({ size: 'xs', variant: 'ghost' }))}
            onClick={() => toast.dismiss(toastId)}
            type="button"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Warns when the reader copies a selection with an unpublished install
 * command in it, and holds the warnings. Copy buttons write the clipboard
 * themselves, which fires no `copy` event, and warn on their own
 * (`DocBody`).
 */
export function UnpublishedCopyWarning() {
  useEffect(() => {
    const onCopy = () => {
      const command = unpublishedCommandIn(
        document.getSelection()?.toString() ?? '',
      );
      if (command) {
        warnUnpublished(command);
      }
    };
    document.addEventListener('copy', onCopy);
    return () => document.removeEventListener('copy', onCopy);
  }, []);
  // The toast draws its own card, so it needs none of the toaster's styles.
  return <Toaster position="bottom-right" />;
}

/** Above the header everywhere but the older versions' docs, whose packages are on npm. */
export function UnpublishedBanner() {
  if (useDocsVersion().copied) {
    return null;
  }
  return (
    <div className="border-b border-[oklch(0.7_0.15_75/0.35)] bg-[oklch(0.7_0.15_75/0.1)] text-[oklch(0.4_0.1_75)] dark:text-[oklch(0.88_0.1_75)]">
      <p className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-1.5 text-center text-xs text-pretty sm:px-6 sm:text-sm">
        <PackageX aria-hidden className="size-4 shrink-0" />
        <span>
          <strong className="font-semibold">tRPC v12 isn’t on npm yet.</strong>{' '}
          The <code className="font-mono text-[0.9em]">@trpc12/*</code> packages
          on this site can’t be installed until it’s released.{' '}
          <Link
            className="font-medium underline underline-offset-2"
            params={{ _splat: v11Docs.firstDoc }}
            to={v11Docs.route}
          >
            Use v11 today
          </Link>
        </span>
      </p>
    </div>
  );
}
