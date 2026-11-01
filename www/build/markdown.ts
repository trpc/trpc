import rehypeShiki from '@shikijs/rehype';
import {
  createTransformerFactory,
  rendererRich,
  type TwoslashRenderer,
  type TwoslashShikiFunction,
} from '@shikijs/twoslash/core';
import { Effect, FileSystem, Path } from 'effect';
import GithubSlugger from 'github-slugger';
import type { Element, ElementContent, Root as HastRoot } from 'hast';
import { toHtml } from 'hast-util-to-html';
import { toString } from 'hast-util-to-string';
import type {
  Blockquote,
  Code,
  Heading,
  Link,
  Root as MdastRoot,
  Paragraph,
} from 'mdast';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import type { ShikiTransformer, ShikiTransformerContext } from 'shiki';
import { createTwoslasher } from 'twoslash/core';
// Twoslash (0.3.9) runs the compiler through TypeScript 6's JavaScript API
// (`ts.sys`, a language service); TypeScript 7.1's API (`typescript/sync`) is
// a different one it can't use yet.
import ts from 'typescript6';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

import type { DocHeading } from '../src/content/types.ts';
import { versionsByPath } from '../src/site.ts';
import { collapseRegions } from './collapse.ts';
import { ContentError, messageOf } from './content-error.ts';
import { chartHtml, decodeChart } from './charts.ts';
import { appOf, sampleApps } from './sample-apps.ts';
import type { TwoslashCache } from './twoslash-cache.ts';

/** A link from one page to another, checked once every page has rendered. */
export interface DocLink {
  readonly hash: string | undefined;
  readonly slug: string;
}

export interface RenderedMarkdown {
  /** Every heading's id, which links can point at. */
  readonly anchors: ReadonlyArray<string>;
  /** The `h2` and `h3` headings, for the table of contents. */
  readonly headings: ReadonlyArray<DocHeading>;
  readonly html: string;
  readonly links: ReadonlyArray<DocLink>;
  /** Each `twoslash` block's `// ^?` types, in order. */
  readonly typeQueries: ReadonlyArray<ReadonlyArray<string>>;
}

const alertTitles = {
  CAUTION: 'Caution',
  IMPORTANT: 'Important',
  NOTE: 'Note',
  TIP: 'Tip',
  WARNING: 'Warning',
} as const;

type AlertKind = keyof typeof alertTitles;

function isAlertKind(value: string): value is AlertKind {
  return Object.hasOwn(alertTitles, value);
}

/**
 * Splits a paragraph's inline content at its first line break: the first
 * line, and the rest.
 */
function splitFirstLine(children: Paragraph['children']) {
  const breakAt = children.findIndex(
    (child) => child.type === 'text' && child.value.includes('\n'),
  );
  const at = children[breakAt];
  if (breakAt === -1 || at?.type !== 'text') {
    return { first: children, rest: [] };
  }
  const newline = at.value.indexOf('\n');
  return {
    first: [
      ...children.slice(0, breakAt),
      { type: 'text' as const, value: at.value.slice(0, newline) },
    ],
    rest: [
      { type: 'text' as const, value: at.value.slice(newline + 1) },
      ...children.slice(breakAt + 1),
    ],
  };
}

/**
 * GitHub's `> [!NOTE]` alerts become `<aside class="callout">`. Text after
 * the marker, on its line, replaces the default title: `> [!TIP] AI agents`.
 */
function remarkAlerts() {
  return (tree: MdastRoot) => {
    visit(tree, 'blockquote', (node: Blockquote) => {
      const first = node.children[0];
      if (first?.type !== 'paragraph') {
        return;
      }
      const text = first.children[0];
      if (text?.type !== 'text') {
        return;
      }
      const match = /^\[!(\w+)\][ \t]*/.exec(text.value);
      const kind = match?.[1]?.toUpperCase();
      if (!match || !kind || !isAlertKind(kind)) {
        return;
      }
      text.value = text.value.slice(match[0].length);
      const lines = splitFirstLine(first.children);
      const custom = lines.first.some(
        (child) => child.type !== 'text' || child.value.trim() !== '',
      );
      const title: Paragraph = {
        children: custom
          ? lines.first
          : [{ type: 'text', value: alertTitles[kind] }],
        data: { hProperties: { className: ['callout-title'] } },
        type: 'paragraph',
      };
      first.children = custom
        ? lines.rest
        : [
            { type: 'text', value: text.value.replace(/^\s+/, '') },
            ...first.children.slice(1),
          ];
      if (
        first.children.every(
          (child) => child.type === 'text' && child.value.trim() === '',
        )
      ) {
        node.children.shift();
      }
      node.children.unshift(title);
      node.data = {
        hName: 'aside',
        hProperties: {
          className: ['callout', `callout-${kind.toLowerCase()}`],
        },
      };
    });
  };
}

/** Where a link written in a page's markdown points. */
export type ResolvedLink =
  | { readonly kind: 'doc'; readonly link: DocLink }
  | { readonly kind: 'source'; readonly path: string }
  | { readonly kind: 'other' };

/**
 * Links are written as relative paths between the `.md` files
 * (`../client/links.md#batching`), so they work on GitHub too. A link to a
 * page points at its `pagePath`, and a link out of the docs folder (an
 * example, a design note) points at the file on GitHub, by its path from
 * where `contentPath` (the folder's path there) puts the folder. A path from
 * `/` is a page of the site, as written: one of these pages if it's under
 * the `basePath` of `served` (where they're served) and no other version's.
 */
export function resolveLink(
  fromSlug: string,
  url: string,
  contentPath = 'docs',
  served?: Pick<RenderOptions, 'basePath' | 'firstDoc'>,
): ResolvedLink {
  if (url.startsWith('/') && served) {
    return servedLink(url, served);
  }
  if (
    /^[a-z][a-z\d+.-]*:/i.test(url) ||
    url.startsWith('#') ||
    url.startsWith('/')
  ) {
    return { kind: 'other' };
  }
  const folder = `/${contentPath}/`;
  const base = new URL(`file://${folder}${fromSlug}.md`);
  const target = new URL(url, base);
  const hash = target.hash
    ? decodeURIComponent(target.hash.slice(1))
    : undefined;
  const pathname = decodeURIComponent(target.pathname);
  const slug = pathname.startsWith(folder)
    ? /^(.+)\.md$/.exec(pathname.slice(folder.length))?.[1]
    : undefined;
  if (slug !== undefined) {
    return { kind: 'doc', link: { hash, slug } };
  }
  return { kind: 'source', path: `${pathname.slice(1)}${target.hash}` };
}

function servedLink(
  url: string,
  served: Pick<RenderOptions, 'basePath' | 'firstDoc'>,
): ResolvedLink {
  const target = new URL(url, 'https://site.invalid');
  const pathname = decodeURIComponent(target.pathname);
  const version = versionsByPath.find(
    (candidate) =>
      pathname === candidate.basePath ||
      pathname.startsWith(`${candidate.basePath}/`),
  );
  const slug =
    pathname === served.basePath
      ? served.firstDoc
      : pathname.slice(served.basePath.length + 1);
  if (version?.basePath !== served.basePath || !slug) {
    return { kind: 'other' };
  }
  const hash = target.hash
    ? decodeURIComponent(target.hash.slice(1))
    : undefined;
  return { kind: 'doc', link: { hash, slug } };
}

/** A page's path: `<basePath>/<slug>`, and `basePath` itself for `firstDoc`. */
export const pagePath = (
  options: {
    readonly basePath: string;
    readonly firstDoc?: string | undefined;
  },
  slug: string,
) =>
  slug === options.firstDoc ? options.basePath : `${options.basePath}/${slug}`;

/** The options a page's links resolve with. */
type LinkOptions =
  | 'basePath'
  | 'contentPath'
  | 'firstDoc'
  | 'slug'
  | 'sourceUrl';

function remarkLinks(
  options: Pick<RenderOptions, LinkOptions>,
  links: Array<DocLink>,
) {
  return () => (tree: MdastRoot) => {
    visit(tree, 'link', (node: Link) => {
      const resolved = resolveLink(
        options.slug,
        node.url,
        options.contentPath,
        options,
      );
      if (resolved.kind === 'doc') {
        links.push(resolved.link);
        node.url = `${pagePath(options, resolved.link.slug)}${resolved.link.hash ? `#${resolved.link.hash}` : ''}`;
      } else if (resolved.kind === 'source') {
        node.url = `${options.sourceUrl}/${resolved.path}`;
      }
    });
  };
}

/**
 * `## Title {#id}` gives a heading its own id instead of one from its
 * text, as Docusaurus does, so links to the v11 pages' headings still land.
 */
function remarkHeadingIds() {
  return (tree: MdastRoot) => {
    visit(tree, 'heading', (node: Heading) => {
      const last = node.children.at(-1);
      const match =
        last?.type === 'text' ? /\s*\{#([\w-]+)\}\s*$/.exec(last.value) : null;
      if (last?.type !== 'text' || !match?.[1]) {
        return;
      }
      last.value = last.value.slice(0, match.index);
      node.data = {
        ...node.data,
        hProperties: { ...node.data?.hProperties, id: match[1] },
      };
    });
  };
}

const packageManagers = ['pnpm', 'npm', 'yarn', 'bun'] as const;

function installCommand(
  manager: (typeof packageManagers)[number],
  packages: string,
  dev: boolean,
) {
  const flag = dev ? (manager === 'bun' ? ' -d' : ' -D') : '';
  const verb = manager === 'npm' ? 'install' : 'add';
  return `${manager} ${verb}${flag} ${packages}`;
}

/** v12's npm scope. Its packages aren't published yet. */
const unpublishedScope = '@trpc12/';

/**
 * A `package-install` fence lists packages (`-D` first for dev
 * dependencies) and shows the install command for each package manager, as
 * tabs. The reader's choice applies to every block (`DocBody`). A block
 * that installs a `@trpc12/` package is marked `data-unpublished`, which
 * `rehypeCodeTabs` badges.
 */
function remarkPackageInstall() {
  return (tree: MdastRoot) => {
    visit(tree, 'code', (node: Code, index, parent) => {
      if (node.lang !== 'package-install' || !parent || index === undefined) {
        return;
      }
      const words = node.value.trim().split(/\s+/);
      const dev = words[0] === '-D';
      const packages = (dev ? words.slice(1) : words).join(' ');
      const tabs: Paragraph = {
        // SAFETY: remark-rehype turns this into a `div` of `pre`s; mdast only
        // types a paragraph's children as phrasing content.
        children: packageManagers.map((manager) => ({
          lang: 'sh',
          meta: `tab="${manager}"`,
          type: 'code',
          value: installCommand(manager, packages, dev),
        })) as unknown as Paragraph['children'],
        data: {
          hName: 'div',
          hProperties: {
            className: ['code-tabs'],
            dataTabs: 'package-manager',
            ...(packages
              .split(' ')
              .some((name) => name.startsWith(unpublishedScope))
              ? { dataUnpublished: '' }
              : {}),
          },
        },
        type: 'paragraph',
      };
      parent.children[index] = tabs;
    });
  };
}

/**
 * A `chart` fence holds a bar chart as JSON (`Chart` in `charts.ts`) and
 * becomes its figure. `benchmark` fences expand into them.
 */
function remarkCharts() {
  return (tree: MdastRoot) => {
    visit(tree, 'code', (node: Code, index, parent) => {
      if (node.lang !== 'chart' || !parent || index === undefined) {
        return;
      }
      parent.children[index] = {
        type: 'html',
        value: chartHtml(decodeChart(node.value)),
      };
    });
  };
}

/**
 * A fence's meta (`twoslash title="server.ts"`) is `data` on the hast
 * `<code>`, which `rehype-raw` drops. Shiki also reads it from the
 * `metastring` property, which survives.
 */
function remarkCodeMeta() {
  return (tree: MdastRoot) => {
    visit(tree, 'code', (node: Code) => {
      if (node.meta) {
        node.data = {
          ...node.data,
          hProperties: { ...node.data?.hProperties, metastring: node.meta },
        };
      }
    });
  };
}

/** Ids and anchor links for every heading; `h2` / `h3` are collected for the table of contents. */
function rehypeHeadings(headings: Array<DocHeading>, anchors: Array<string>) {
  return () => (tree: HastRoot) => {
    const slugger = new GithubSlugger();
    visit(tree, 'element', (node: Element) => {
      if (!/^h[2-6]$/.test(node.tagName)) {
        return;
      }
      const text = toString(node).trim();
      const id =
        typeof node.properties.id === 'string'
          ? node.properties.id
          : slugger.slug(text);
      node.properties.id = id;
      anchors.push(id);
      if (node.tagName === 'h2' || node.tagName === 'h3') {
        headings.push({ depth: node.tagName === 'h2' ? 2 : 3, id, text });
      }
      node.children = [
        {
          children: node.children,
          properties: { className: ['heading-anchor'], href: `#${id}` },
          tagName: 'a',
          type: 'element',
        },
      ];
    });
  };
}

/** Keeps a fence's `title="…"`, its tab and its language on the `<pre>`. */
const codeMeta: ShikiTransformer = {
  name: 'trpc-docs:code-meta',
  pre(node) {
    const raw = this.options.meta?.['__raw'] ?? '';
    const title = /title="([^"]+)"/.exec(raw)?.[1];
    if (title) {
      node.properties['data-title'] = title;
    }
    const tab = /tab="([^"]+)"/.exec(raw)?.[1];
    if (tab) {
      node.properties['data-tab'] = tab;
    }
    node.properties['data-language'] = this.options.lang;
    node.properties['tabindex'] = '0';
  },
};

/** Wraps each highlighted block with its title and a copy button. */
function rehypeCodeBlocks() {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'pre' || !parent || index === undefined) {
        return;
      }
      const title = node.properties['data-title'];
      const tab = node.properties['data-tab'];
      const header: Array<ElementContent> = [];
      if (title) {
        header.push({
          children: [{ type: 'text', value: String(title) }],
          properties: { className: ['code-title'] },
          tagName: 'div',
          type: 'element',
        });
      }
      parent.children[index] = {
        children: [
          ...header,
          node,
          {
            children: [{ type: 'text', value: 'Copy' }],
            properties: {
              ariaLabel: 'Copy code',
              className: ['code-copy'],
              dataCopy: '',
              type: 'button',
            },
            tagName: 'button',
            type: 'element',
          },
        ],
        properties: {
          className: ['code-block'],
          ...(tab ? { dataTab: String(tab) } : {}),
        },
        tagName: 'div',
        type: 'element',
      };
      return 'skip';
    });
  };
}

/** Puts a button per tab above a `code-tabs` group's blocks. */
function rehypeCodeTabs() {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element) => {
      if (node.properties['dataTabs'] === undefined) {
        return;
      }
      const group = String(node.properties['dataTabs']);
      // Shiki leaves each highlighted block in a root of its own.
      // SAFETY: a root's children are element content once it sits in an
      // element.
      node.children = node.children.flatMap((child) =>
        (child as ElementContent | HastRoot).type === 'root'
          ? ((child as unknown as HastRoot).children as Array<ElementContent>)
          : [child],
      );
      const blocks = node.children.filter(
        (child): child is Element =>
          child.type === 'element' && child.properties['dataTab'] !== undefined,
      );
      const tabs = blocks.map((block) => String(block.properties['dataTab']));
      // A tab marked `data-active`, or else the first, shows until `DocBody`
      // applies the reader's choice.
      const shown = Math.max(
        blocks.findIndex(
          (block) => block.properties['dataActive'] !== undefined,
        ),
        0,
      );
      for (const [index, block] of blocks.entries()) {
        if (index === shown) {
          block.properties['dataActive'] = '';
        } else {
          delete block.properties['dataActive'];
        }
      }
      node.children.unshift({
        children: tabs.map((tab, index): Element => ({
          children: [{ type: 'text', value: tab }],
          properties: {
            ariaSelected: String(index === shown),
            className: ['code-tab'],
            dataTabGroup: group,
            dataTabSelect: tab,
            role: 'tab',
            type: 'button',
          },
          tagName: 'button',
          type: 'element',
        })),
        properties: { className: ['code-tabs-list'], role: 'tablist' },
        tagName: 'div',
        type: 'element',
      });
      if (node.properties['dataUnpublished'] === undefined) {
        return;
      }
      // Outside the tablist, whose children are tabs only; CSS sets it on
      // the tablist's row.
      node.children.unshift({
        children: [{ type: 'text', value: 'Not on npm yet' }],
        properties: {
          className: ['code-unpublished'],
          title:
            'The @trpc12 packages aren’t published until tRPC v12 is released',
        },
        tagName: 'span',
        type: 'element',
      });
    });
  };
}

interface Project {
  readonly compilerOptions: ts.CompilerOptions;
  /**
   * Every file of a sample app, by path from its root, so a block's
   * program has what `tsc` has.
   */
  readonly extraFiles: Record<string, string>;
}

function flatten(diagnostic: ts.Diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
}

/**
 * A sample app's `tsconfig.json` and the files it includes, read for each
 * render, so a block sees edits to the rest of its app.
 */
const loadProject = Effect.fn('loadProject')(function* (app: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(app, 'tsconfig.json');
  // TypeScript resolves `extends` and `include` itself, through `ts.sys`.
  const parsed = yield* Effect.try({
    catch: (cause) =>
      new ContentError({ cause, message: `${file}: ${messageOf(cause)}` }),
    try: () =>
      ts.getParsedCommandLineOfConfigFile(file, undefined, {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
          throw new Error(flatten(diagnostic));
        },
      }),
  });
  if (!parsed || parsed.errors.length > 0) {
    return yield* new ContentError({
      message: `${file}: ${parsed?.errors.map(flatten).join('\n') ?? 'invalid tsconfig'}`,
    });
  }
  const extraFiles = yield* Effect.forEach(
    parsed.fileNames,
    (name) =>
      Effect.map(
        fs.readFileString(name),
        (contents) =>
          [
            path.relative(app, name).split(path.sep).join('/'),
            contents,
          ] as const,
      ),
    { concurrency: 'unbounded' },
  );
  const project: Project = {
    compilerOptions: parsed.options,
    extraFiles: Object.fromEntries(extraFiles),
  };
  return project;
});

/** The parts of a `@typescript/vfs` environment read here. */
interface Environment {
  createFile(fileName: string, content: string): void;
  deleteFile(fileName: string): void;
  readonly languageService: ts.LanguageService;
}

/**
 * Compiles a block, and returns the program it compiled in, for the cache to
 * know which files it read. `program` is missing if it wasn't seen.
 */
type Twoslasher = (...args: Parameters<TwoslashShikiFunction>) => {
  readonly program: ts.Program | undefined;
  readonly result: ReturnType<TwoslashShikiFunction>;
};

/** The program a block compiled in, once twoslash is done with it. */
interface SeenProgram {
  program?: ts.Program | undefined;
}

/** A twoslasher per project root; each keeps a TypeScript environment per set of compiler options. */
const twoslashers = new Map<string, Twoslasher>();

/**
 * How many TypeScript environments stay alive, across roots. Each is a
 * program with its own parse of the app's and libraries' types, 100–250 MB,
 * and a block's inline flags (`// @target: esnext`, `// @jsxImportSource:
 * preact`) make another, so keeping them all ran a cold build out of heap.
 * A build renders in three processes (`render-pool.ts`), each with its own.
 */
const liveEnvironments = 2;

/** The live environments, least recently used first, each with what drops it from its twoslasher. */
const usedEnvironments = new Map<Environment, () => void>();

function useEnvironment(environment: Environment, drop: () => void) {
  usedEnvironments.delete(environment);
  usedEnvironments.set(environment, drop);
  for (const [oldest, dropOldest] of usedEnvironments) {
    if (usedEnvironments.size <= liveEnvironments) {
      break;
    }
    usedEnvironments.delete(oldest);
    dropOldest();
    oldest.languageService.dispose();
  }
}

/**
 * Lets go of every twoslasher and its environments, once the pages are
 * compiled: the prerender runs in the same process. A later block makes a
 * new one.
 */
export function releaseTwoslashers() {
  twoslashers.clear();
  for (const environment of usedEnvironments.keys()) {
    environment.languageService.dispose();
  }
  usedEnvironments.clear();
}

function twoslasherFor(root: string, tsLibDirectory: string) {
  const existing = twoslashers.get(root);
  if (existing) {
    return existing;
  }
  let onClear: ((program: ts.Program | undefined) => void) | undefined;
  // Twoslash empties a block's files once it's done with them; until then
  // the environment's program is the one the block compiled in. They're
  // deleted instead: an emptied `a.ts` still resolves, so a later block's
  // `import './a'` would find it, with no text, before its own `a.tsx`.
  const environments = new (class extends Map<string, Environment> {
    override get(key: string) {
      const environment = super.get(key);
      if (environment) {
        useEnvironment(environment, () => this.delete(key));
      }
      return environment;
    }
    override set(key: string, environment: Environment) {
      const createFile = environment.createFile.bind(environment);
      environment.createFile = (fileName, content) => {
        if (content !== '') {
          createFile(fileName, content);
          return;
        }
        if (onClear) {
          onClear(environment.languageService.getProgram());
          onClear = undefined;
        }
        environment.deleteFile(fileName);
      };
      super.set(key, environment);
      useEnvironment(environment, () => this.delete(key));
      return this;
    }
  })();
  const twoslasher = createTwoslasher({
    // @ts-expect-error -- typed as `@typescript/vfs`'s environment, from a package www doesn't depend on
    cache: environments,
    tsLibDirectory,
    // @ts-expect-error -- twoslash types `tsModule` as the `typescript` package, which here is TypeScript 7.1's, without TypeScript 6's JavaScript API
    tsModule: ts,
    vfsRoot: root,
  });
  const run: Twoslasher = (code, lang, options) => {
    const seen: SeenProgram = {};
    onClear = (program) => {
      seen.program = program;
    };
    try {
      const result = twoslasher(code, lang, options);
      return { program: seen.program, result };
    } finally {
      onClear = undefined;
    }
  };
  twoslashers.set(root, run);
  return run;
}

/**
 * Highlighted popup types, by text and options. A renderer highlights each
 * hover's type on its own, and most recur (a page's `t`, `router`), so a
 * build highlighted the same ones thousands of times.
 */
const popupHighlights = new Map<string, HastRoot>();

/**
 * `renderer` with its popups' highlighting (its only `codeToHast`) read
 * from {@link popupHighlights}. Each use gets a copy, as later transformers
 * change the tree.
 */
function reusingPopups(renderer: TwoslashRenderer): TwoslashRenderer {
  const reusingHighlights = (
    context: ShikiTransformerContext,
  ): ShikiTransformerContext => {
    const codeToHast: ShikiTransformerContext['codeToHast'] = (
      code,
      options,
    ) => {
      const key = JSON.stringify([code, options]);
      let root = popupHighlights.get(key);
      if (!root) {
        root = context.codeToHast(code, options);
        popupHighlights.set(key, root);
      }
      return structuredClone(root);
    };
    return Object.create(context, { codeToHast: { value: codeToHast } });
  };
  const methods = Object.entries(renderer).map(([name, method]) => {
    if (typeof method !== 'function') {
      return [name, method] as const;
    }
    function reusing(this: ShikiTransformerContext, ...args: Array<unknown>) {
      return Reflect.apply(method, reusingHighlights(this), args);
    }
    return [name, reusing] as const;
  });
  // SAFETY: each method is the renderer's own, called with its arguments.
  return Object.fromEntries(methods) as unknown as TwoslashRenderer;
}

const blockFilename = /^\/\/ @filename: (.+)$/gm;

/** The app that inline blocks compile in, beside its `src/` files, unless a page's docs name another. */
const defaultInlineApp = 'docs';

/**
 * Fences with `twoslash` in their meta are compiled, so hovering a name shows
 * its type, `// ^?` pins a type under the line, and `// @errors: 2345` shows
 * an expected error. A compile error the block doesn't expect fails the
 * build.
 *
 * A block written inline is a file in the `docs` sample app's `src/` (the
 * v11 docs' are in `v11`'s), so it can import the app's files
 * (`./server.ts`) behind a `// ---cut---`. Its `// @filename: client.ts`
 * lines name more files there.
 *
 * A `sample` fence's block (`expandSnippets`) is a file of a sample app
 * (`samples/<app>/`), named by its `// @filename`, a path from the samples
 * dir, and compiles in that app's project.
 *
 * Both kinds compile with every file of their app, so they see what `tsc`
 * sees.
 */
const twoslashTransformer = Effect.fn('twoslashTransformer')(function* (
  markdown: string,
  samplesDir: string,
  cache: TwoslashCache | undefined,
  inlineApp: string,
) {
  const path = yield* Path.Path;
  const apps = yield* sampleApps(samplesDir);
  const appOfFile = (filename: string) =>
    appOf(path, path.join(samplesDir, filename), apps);
  const inline = path.join(samplesDir, inlineApp);
  const used = new Set([
    inline,
    ...Array.from(markdown.matchAll(blockFilename), (match) =>
      appOfFile(match[1] ?? ''),
    ).filter((app) => app !== undefined),
  ]);
  const projects = new Map(
    yield* Effect.forEach(
      used,
      (app) =>
        Effect.map(loadProject(app), (project) => [app, project] as const),
      { concurrency: 'unbounded' },
    ),
  );
  const tsLibDirectory = path.dirname(
    yield* path.fromFileUrl(new URL(import.meta.resolve('typescript6'))),
  );
  const session = cache ? yield* cache.open : undefined;
  const compile = (
    root: string,
    ...[code, lang, options]: Parameters<TwoslashShikiFunction>
  ) => {
    const key = session?.key({ code, lang, options, root });
    const cached = key === undefined ? undefined : session?.get(key);
    if (cached) {
      return cached;
    }
    const compiled = twoslasherFor(root, tsLibDirectory)(code, lang, options);
    const program = compiled.program;
    if (key !== undefined && program) {
      // The app's files (its tsconfig's), which the key covers, and the
      // block's, which twoslash writes and then empties (the code before
      // its first `// @filename` in `index.<extension>`), aren't listed.
      // Every other file is, with the app's own outside its tsconfig (the
      // stubs in `decisions/open/`). TypeScript's own libs come with the
      // key's tools.
      const keyed = new Set(
        [
          'index.ts',
          'index.tsx',
          ...Array.from(code.matchAll(blockFilename), (match) => match[1]),
          ...Object.keys(options?.extraFiles ?? {}),
        ].map((name) => path.join(root, name ?? '')),
      );
      const appFile = (fileName: string) => keyed.has(fileName);
      session?.set(
        key,
        compiled.result,
        program
          .getSourceFiles()
          .filter(
            (file) =>
              !appFile(file.fileName) &&
              !program.isSourceFileDefaultLibrary(file),
          ),
      );
    }
    return compiled.result;
  };
  const compileBlock: TwoslashShikiFunction = (code, lang, twoslashOptions) => {
    const filename = new RegExp(blockFilename.source, 'm').exec(code)?.[1];
    const app = filename === undefined ? undefined : appOfFile(filename);
    if (app === undefined) {
      const project = projects.get(inline);
      const extension = lang === 'tsx' ? 'tsx' : 'ts';
      const inSrc =
        filename === undefined
          ? `// ---cut-start---\n// @filename: src/block.twoslash.${extension}\n// ---cut-end---\n${code}`
          : code.replaceAll(
              blockFilename,
              (_line, name: string) => `// @filename: src/${name}`,
            );
      return compile(inline, inSrc, lang, { ...twoslashOptions, ...project });
    }
    const project = projects.get(app);
    if (!project) {
      throw new Error(`"// @filename: ${filename}" isn't in a sample app`);
    }
    const inApp = code.replaceAll(
      blockFilename,
      (_line, name: string) =>
        `// @filename: ${path
          .relative(app, path.join(samplesDir, name))
          .split(path.sep)
          .join('/')}`,
    );
    return compile(app, inApp, lang, { ...twoslashOptions, ...project });
  };
  const twoslasher: TwoslashShikiFunction = (code, lang, twoslashOptions) => {
    const result = compileBlock(code, lang, twoslashOptions);
    // A `// ---cut-after---` indented inside a hidden wrapper's object keeps
    // the line break before it, which would show as an empty line.
    return { ...result, code: result.code.trimEnd() };
  };
  return {
    flush: session?.flush ?? Effect.void,
    transformer: createTransformerFactory(
      twoslasher,
      reusingPopups(rendererRich({ jsdoc: false, queryRendering: 'line' })),
    )({ explicitTrigger: true }),
  };
});

export interface RenderOptions {
  /** Where the pages are served: `/docs`. Links between them point under it. */
  readonly basePath: string;
  /** The page served at `basePath` itself, if any. */
  readonly firstDoc?: string | undefined;
  /** The dir of the sample apps the code blocks compile in. */
  readonly samplesDir: string;
  /** The sample app inline blocks compile in: `docs`, or `v11` for the v11 docs. */
  readonly inlineApp?: string | undefined;
  /** The page's slug, which its relative links resolve from. */
  readonly slug: string;
  /** Where the files around the docs folder are browsable, for links to them. */
  readonly sourceUrl: string;
  /** The docs folder's path under `sourceUrl` (`www/docs`), which links out of it resolve from: `docs` unless named. */
  readonly contentPath?: string | undefined;
  /** Where compiled blocks are kept between renders and builds. */
  readonly twoslashCache?: TwoslashCache | undefined;
}

/** Markdown to hast, up to highlighting the code blocks. */
function parsing(
  options: Pick<RenderOptions, LinkOptions>,
  headings: Array<DocHeading>,
  anchors: Array<string>,
  links: Array<DocLink>,
) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkAlerts)
    .use(remarkHeadingIds)
    .use(remarkLinks(options, links))
    .use(remarkCharts)
    .use(remarkPackageInstall)
    .use(remarkCodeMeta)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeHeadings(headings, anchors));
}

/** The ids of the headings a page renders, which links can point at. */
export const anchorsOf = Effect.fn('anchorsOf')(function* (markdown: string) {
  const anchors: Array<string> = [];
  const processor = parsing(
    { basePath: '/docs', slug: 'index', sourceUrl: '' },
    [],
    anchors,
    [],
  );
  yield* Effect.tryPromise({
    catch: (cause) => new ContentError({ cause, message: messageOf(cause) }),
    try: async () => processor.run(processor.parse(markdown)),
  });
  return anchors;
});

const twoslashFence = /^[ \t]*```\w*[^\n]*\btwoslash\b/m;

export const renderMarkdown = Effect.fn('renderMarkdown')(function* (
  markdown: string,
  options: RenderOptions,
) {
  const headings: Array<DocHeading> = [];
  const anchors: Array<string> = [];
  const links: Array<DocLink> = [];
  const typeQueries: Array<ReadonlyArray<string>> = [];
  let collapseId = 0;
  // Setting up Twoslash reads a sample app, which a page without blocks
  // to compile doesn't need.
  const blocks = twoslashFence.test(markdown)
    ? yield* twoslashTransformer(
        markdown,
        options.samplesDir,
        options.twoslashCache,
        options.inlineApp ?? defaultInlineApp,
      )
    : undefined;
  const processor = parsing(options, headings, anchors, links)
    .use(rehypeShiki, {
      defaultColor: false,
      // Loading all of Shiki's languages took seconds per process, so
      // others load on first use, and an unknown one fails the render. A
      // block in a language loaded on first use highlights after the rest,
      // so `ts` and `tsx` load up front: `typeQueries` is in page order.
      langs: ['ts', 'tsx'],
      lazy: true,
      themes: { dark: 'github-dark', light: 'github-light' },
      transformers: [
        ...(blocks ? [blocks.transformer] : []),
        collapseRegions(() => {
          collapseId += 1;
          return `code-collapse-${collapseId}`;
        }),
        codeMeta,
        {
          name: 'trpc-docs:type-queries',
          pre() {
            const twoslash = this.meta.twoslash;
            if (twoslash) {
              typeQueries.push(
                twoslash.nodes.flatMap((node) =>
                  node.type === 'query' ? [node.text] : [],
                ),
              );
            }
          },
        },
      ],
    })
    .use(rehypeCodeBlocks)
    .use(rehypeCodeTabs);
  const tree = yield* Effect.tryPromise({
    catch: (cause) => new ContentError({ cause, message: messageOf(cause) }),
    try: async () => processor.run(processor.parse(markdown)),
  }).pipe(Effect.ensuring(blocks?.flush ?? Effect.void));
  const rendered: RenderedMarkdown = {
    anchors,
    headings,
    html: toHtml(tree),
    links,
    typeQueries,
  };
  return rendered;
});
