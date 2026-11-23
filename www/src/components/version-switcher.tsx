import { Button } from '@shared/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@shared/ui/components/dropdown-menu';
import { Link, useLocation } from '@tanstack/react-router';
import { Check, ChevronDown } from 'lucide-react';

import {
  type DocsVersion,
  slugAt,
  switchedSlug,
  useDocsVersion,
  versions,
} from '~/content/docs.ts';

/**
 * Picks the docs' version, as Docusaurus's version dropdown does: switching
 * on a page goes to the page on its topic in the other version, if there is
 * one.
 */
export function VersionSwitcher(props: {
  /** The version to show, where the path doesn't say: the home page's. */
  readonly version?: DocsVersion | undefined;
}) {
  const atPath = useDocsVersion();
  const current = props.version ?? atPath;
  const pathname = useLocation({ select: (location) => location.pathname });
  const slug = slugAt(current, pathname);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Docs version: ${current.id}, ${current.status}`}
            className="gap-1 rounded-full px-2 font-mono text-[11px] text-muted-foreground"
            size="xs"
            variant="outline"
          />
        }
      >
        {current.id}
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-auto min-w-52">
        {versions.map((version) => (
          <DropdownMenuItem
            key={version.id}
            render={
              <Link
                params={{ _splat: switchedSlug(current, slug, version) }}
                to={version.route}
              />
            }
          >
            <span className="font-mono">{version.id}</span>
            <span className="text-xs text-muted-foreground">
              {version.status}
            </span>
            {version.id === current.id ? (
              <Check aria-label="Current" className="ml-auto" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
