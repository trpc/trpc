import { Link, useLocation } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@shared/ui/lib/utils';

import {
  type DocsVersion,
  slugAt,
  useDocsVersion,
  useListedDocs,
} from '~/content/docs.ts';
import { stripInlineCode } from '~/content/inline-code.ts';
import type { DocMeta, DocSection } from '~/content/types.ts';

import { TextWithCode } from '~/components/text-with-code.tsx';

interface NavNode {
  readonly children: ReadonlyArray<NavNode>;
  readonly doc: DocMeta;
}

/** A section's pages as a tree, from their reading order and `parent`s. */
function navTree(
  docs: ReadonlyArray<DocMeta>,
  parent?: string,
): ReadonlyArray<NavNode> {
  return docs
    .filter((doc) => doc.parent === parent)
    .map((doc) => ({ children: navTree(docs, doc.slug), doc }));
}

function contains(node: NavNode, slug: string | undefined): boolean {
  return (
    node.doc.slug === slug ||
    node.children.some((child) => contains(child, slug))
  );
}

export function DocsNav(props: { readonly onNavigate?: () => void }) {
  const reading = useDocsVersion();
  const version = useListedDocs(reading);
  const current = slugAt(
    reading,
    useLocation({ select: (location) => location.pathname }),
  );
  const currentSection = version.sections.findIndex((section) =>
    section.docs.some((doc) => doc.slug === current),
  );
  return (
    <nav
      aria-label={`Documentation, ${version.id}`}
      className="grid gap-1 text-sm"
    >
      {version.sections.map((section, index) => (
        <NavSection
          current={current}
          key={section.title}
          // Off the docs pages, the first section stands in for the current one.
          active={index === Math.max(currentSection, 0)}
          onNavigate={props.onNavigate}
          section={section}
          version={version}
        />
      ))}
    </nav>
  );
}

/** A sidebar section, folded unless it holds the current page or is opened. */
function NavSection(props: {
  readonly active: boolean;
  readonly current: string | undefined;
  readonly onNavigate: (() => void) | undefined;
  readonly section: DocSection;
  readonly version: DocsVersion;
}) {
  const [open, setOpen] = useState(props.active);
  useEffect(() => {
    if (props.active) {
      setOpen(true);
    }
  }, [props.active]);
  const id = `nav-${props.version.id}-section-${props.section.title.toLowerCase().replaceAll(/\W+/g, '-')}`;
  return (
    <div>
      <h2>
        <button
          aria-controls={id}
          aria-expanded={open}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground',
            props.active && 'text-foreground',
          )}
          onClick={() => setOpen(!open)}
          type="button"
        >
          {props.section.title}
          <ChevronRight
            aria-hidden
            className={cn(
              'size-3.5 shrink-0 transition-transform',
              open && 'rotate-90',
            )}
          />
        </button>
      </h2>
      <div className={cn('mt-0.5 mb-3', !open && 'hidden')} id={id}>
        <NavList
          current={props.current}
          nodes={navTree(props.section.docs)}
          onNavigate={props.onNavigate}
          version={props.version}
        />
      </div>
    </div>
  );
}

function NavList(props: {
  readonly current: string | undefined;
  readonly nodes: ReadonlyArray<NavNode>;
  readonly onNavigate: (() => void) | undefined;
  readonly version: DocsVersion;
}) {
  return (
    <ul className="grid gap-0.5">
      {props.nodes.map((node) => (
        <NavItem
          current={props.current}
          key={node.doc.slug}
          node={node}
          onNavigate={props.onNavigate}
          version={props.version}
        />
      ))}
    </ul>
  );
}

function NavItem(props: {
  readonly current: string | undefined;
  readonly node: NavNode;
  readonly onNavigate: (() => void) | undefined;
  readonly version: DocsVersion;
}) {
  const doc = props.node.doc;
  const hasChildren = props.node.children.length > 0;
  const inBranch = hasChildren && contains(props.node, props.current);
  const [open, setOpen] = useState(inBranch);
  // Navigating into a closed branch, from search or a link, opens it.
  useEffect(() => {
    if (inBranch) {
      setOpen(true);
    }
  }, [inBranch]);
  const childrenId = `nav-${props.version.id}-${doc.slug.replaceAll('/', '-')}`;
  return (
    <li>
      <div className="flex items-center gap-0.5">
        <Link
          // A parent's path prefixes its children's, which would make it active too.
          activeOptions={{ exact: true }}
          activeProps={{
            'aria-current': 'page',
            className:
              'bg-brand/10 font-semibold text-link hover:bg-brand/15 hover:text-link',
          }}
          className="block min-w-0 flex-1 rounded-md px-2 py-1.5 transition-colors"
          inactiveProps={{
            className: cn(
              'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              inBranch && 'text-foreground',
            ),
          }}
          onClick={props.onNavigate}
          params={{ _splat: doc.slug }}
          to={props.version.route}
        >
          <TextWithCode bare text={doc.label ?? doc.title} />
        </Link>
        {hasChildren ? (
          <button
            aria-controls={childrenId}
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${stripInlineCode(doc.label ?? doc.title)}`}
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            onClick={() => setOpen(!open)}
            type="button"
          >
            <ChevronRight
              className={cn(
                'size-3.5 transition-transform',
                open && 'rotate-90',
              )}
            />
          </button>
        ) : null}
      </div>
      {hasChildren ? (
        <div
          className={cn('mt-0.5 ml-3 border-l pl-2', !open && 'hidden')}
          id={childrenId}
        >
          <NavList
            current={props.current}
            nodes={props.node.children}
            onNavigate={props.onNavigate}
            version={props.version}
          />
        </div>
      ) : null}
    </li>
  );
}
