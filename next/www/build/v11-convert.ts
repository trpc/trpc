/**
 * Turns the v11 docs (Docusaurus MDX in the repo root's `www/docs`) into
 * pages of this site: Markdown with this site's frontmatter, which
 * `build/content.ts` renders like any other page. `v11-copy.ts` reads the
 * files and writes the result; everything here is a pure function of them.
 *
 * Twoslash blocks become plain code, showing what trpc.io shows: the hidden
 * setup, `// @…` directives and `// ^?` markers go. Admonitions become
 * alerts, `<Tabs>` become tab groups, partials and the few components the
 * pages use are inlined, and links point at the copied pages, or at
 * trpc.io for anything else. Whatever the copy can't convert is a problem,
 * so a new construct in the v11 docs fails the copy instead of rendering
 * as raw MDX.
 */
import { removeTwoslashNotations } from 'twoslash/fallback';

import { v11 } from '../src/site.ts';

/** A page of the v11 sidebar. */
export interface V11Page {
  readonly description: string;
  /** Path under `www/`: `docs/server/procedures.md`. */
  readonly file: string;
  /** Its sidebar label, where it differs from the title. */
  readonly label: string | undefined;
  /** Position in the sidebar, from 0. */
  readonly order: number;
  readonly section: string;
  /** Path under `/docs` on trpc.io, and under `/v11/docs` here. */
  readonly slug: string;
  readonly title: string;
}

export interface V11Docs {
  /**
   * The docs of the versions before v11 (`versioned_docs/`), which trpc.io
   * still serves: their URL paths, by path under `www/`.
   */
  readonly archived: ReadonlyMap<string, string>;
  /** What the pages read, by path under `www/`: the pages, partials and components. */
  readonly files: ReadonlyMap<string, string>;
  readonly pages: ReadonlyArray<V11Page>;
}

export interface ConvertedPage {
  /** Static files the page shows, by path under `www/`: `static/img/x.svg`. */
  readonly images: ReadonlyArray<string>;
  readonly markdown: string;
  /** What couldn't be converted, one message each. */
  readonly problems: ReadonlyArray<string>;
}

const packageManagers = new Set(['bun', 'deno', 'npm', 'pnpm', 'yarn']);

/** Docusaurus admonitions, as GitHub alerts and the title Docusaurus shows. */
const admonitions: Readonly<
  Record<string, { readonly kind: string; readonly title?: string }>
> = {
  caution: { kind: 'WARNING', title: 'Caution' },
  danger: { kind: 'CAUTION', title: 'Danger' },
  info: { kind: 'NOTE', title: 'Info' },
  note: { kind: 'NOTE' },
  tip: { kind: 'TIP' },
  warning: { kind: 'WARNING' },
};

interface Fence {
  /** Index of the opening line. */
  readonly start: number;
  /** Index of the closing line, or the last line if it's never closed. */
  readonly end: number;
  readonly indent: string;
  readonly info: string;
  readonly marker: string;
}

const fenceOpen = /^([ \t]*)(`{3,}|~{3,})(.*)$/;

/** The fenced code blocks among `lines`. */
export function fencesOf(lines: ReadonlyArray<string>): ReadonlyArray<Fence> {
  const fences: Array<Fence> = [];
  let index = 0;
  while (index < lines.length) {
    const open = fenceOpen.exec(lines[index] ?? '');
    const marker = open?.[2];
    if (!open || marker === undefined) {
      index++;
      continue;
    }
    const start = index;
    index++;
    while (index < lines.length) {
      const close = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(lines[index] ?? '');
      if (
        close?.[1] &&
        close[1][0] === marker[0] &&
        close[1].length >= marker.length
      ) {
        break;
      }
      index++;
    }
    fences.push({
      end: Math.min(index, lines.length - 1),
      indent: open[1] ?? '',
      info: (open[3] ?? '').trim(),
      marker,
      start,
    });
    index++;
  }
  return fences;
}

/** For each line, whether it belongs to a fenced code block. */
function inFences(lines: ReadonlyArray<string>) {
  const mask = lines.map(() => false);
  for (const fence of fencesOf(lines)) {
    for (let index = fence.start; index <= fence.end; index++) {
      mask[index] = true;
    }
  }
  return mask;
}

/** Applies `edit` to each run of lines outside code blocks, as one string. */
function editProse(
  lines: ReadonlyArray<string>,
  edit: (prose: string) => string,
): Array<string> {
  const mask = inFences(lines);
  const output: Array<string> = [];
  let run: Array<string> = [];
  const flush = () => {
    if (run.length > 0) {
      output.push(...edit(run.join('\n')).split('\n'));
      run = [];
    }
  };
  for (const [index, line] of lines.entries()) {
    if (mask[index]) {
      flush();
      output.push(line);
    } else {
      run.push(line);
    }
  }
  flush();
  return output;
}

/** `server/procedures` to `client/links` is `../client/links.md`. */
export function relativeLink(fromSlug: string, toSlug: string) {
  const from = fromSlug.split('/').slice(0, -1);
  const to = toSlug.split('/');
  let shared = 0;
  while (
    shared < from.length &&
    shared < to.length - 1 &&
    from[shared] === to[shared]
  ) {
    shared++;
  }
  const up = from.length - shared;
  const rest = to.slice(shared).join('/');
  return `${up === 0 ? './' : '../'.repeat(up)}${rest}.md`;
}

/** Where a v11 link points: a copied page, or else trpc.io. */
type Target =
  | { readonly kind: 'page'; readonly slug: string; readonly hash: string }
  | { readonly kind: 'image'; readonly file: string }
  | { readonly kind: 'url'; readonly url: string };

function hashOf(url: URL) {
  return url.hash ? url.hash.slice(1) : '';
}

/**
 * Resolves a link as Docusaurus does: a path to an `.md` or `.mdx` file is
 * that file, relative to the linking file (or to `docs/` from `/docs/`);
 * any other path is a URL, relative to the page's URL on trpc.io.
 */
export function resolveV11Link(
  url: string,
  context: {
    /** The file the link is written in, under `www/`. */
    readonly file: string;
    /** The page the link renders on. */
    readonly slug: string;
    readonly pages: ReadonlyArray<V11Page>;
    readonly archived?: ReadonlyMap<string, string> | undefined;
  },
): Target | undefined {
  if (url.startsWith('#') || url === '') {
    return undefined;
  }
  const scheme = /^[a-z][a-z\d+.-]*:/i.test(url);
  const onSite = scheme
    ? /^https?:\/\/(?:www\.)?trpc\.io(?=\/|$)/.exec(url)
    : undefined;
  if (scheme && !onSite) {
    return undefined;
  }
  const local = onSite ? url.slice(onSite[0].length) || '/' : url;
  const byFile = (file: string) =>
    context.pages.find((page) => page.file === file);
  const bySlug = (slug: string) =>
    context.pages.find((page) => page.slug === slug);
  const pathOnly = local.split(/[?#]/)[0] ?? '';
  if (/\.mdx?$/.test(pathOnly)) {
    const base = local.startsWith('/docs/')
      ? 'file:///'
      : `file:///${context.file}`;
    const target = new URL(local, base);
    const file = decodeURIComponent(target.pathname.slice(1));
    const page = byFile(file);
    if (page) {
      return { hash: hashOf(target), kind: 'page', slug: page.slug };
    }
    const archived = context.archived?.get(file);
    if (archived !== undefined) {
      return { kind: 'url', url: `${v11.url}${archived}${target.hash}` };
    }
  }
  const pageUrl = `${v11.url}/docs/${context.slug}`;
  const target = new URL(local, pageUrl);
  const pathname = decodeURIComponent(target.pathname).replace(/\/$/, '');
  const docs = /^\/docs(?:\/(.*))?$/.exec(pathname);
  if (docs) {
    const page = bySlug(docs[1] || v11.firstDoc);
    if (page) {
      return { hash: hashOf(target), kind: 'page', slug: page.slug };
    }
  }
  const image = /^\/img\/([\w.-]+)$/.exec(pathname);
  if (image?.[1]) {
    return { file: `static/img/${image[1]}`, kind: 'image' };
  }
  return {
    kind: 'url',
    url: `${v11.url}${target.pathname}${target.search}${target.hash}`,
  };
}

function imageUrl(file: string) {
  return `${v11.imagePath}/${file.split('/').at(-1) ?? file}`;
}

/** Parses JSX attributes: `value="zod" default style={{ width: '100%' }}`. */
function attributesOf(source: string) {
  const attributes = new Map<string, string | true>();
  for (const match of source.matchAll(
    /([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|\{\{([^}]*)\}\}|\{([^}]*)\}))?/g,
  )) {
    const name = match[1];
    if (!name) {
      continue;
    }
    const value = match[2] ?? match[3] ?? match[4] ?? match[5];
    attributes.set(
      name,
      value === undefined
        ? true
        : match[4] === undefined
          ? value
          : `{{${value}}}`,
    );
  }
  return attributes;
}

/** `{ marginBottom: '12px', flex: 1 }` as CSS: `margin-bottom: 12px; flex: 1px`. */
export function styleOf(object: string) {
  return Array.from(
    object.matchAll(/(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|(-?[\d.]+)(?![\w%]))/g),
    (match) => {
      const property = (match[1] ?? '').replaceAll(
        /[A-Z]/g,
        (letter) => `-${letter.toLowerCase()}`,
      );
      const number = match[4];
      const value =
        number === undefined
          ? (match[2] ?? match[3] ?? '')
          : number === '0'
            ? '0'
            : `${number}px`;
      return `${property}: ${value}`;
    },
  ).join('; ');
}

/** JSX that is static HTML apart from its spelling (`className`, `style={{}}`, `{' '}`) as HTML. */
export function jsxToHtml(jsx: string) {
  return jsx
    .replaceAll(/\{\s*(['"])\s\1\s*\}/g, ' ')
    .replaceAll(/\bclassName=/g, 'class=')
    .replaceAll(
      /\bstyle=\{\{([^}]*)\}\}/g,
      (_style, object: string) => `style="${styleOf(object)}"`,
    );
}

/** A component without props that returns static JSX, as HTML. */
function inlineComponent(source: string) {
  const body =
    /\(\s*\)\s*(?:=>|\{)[\s\S]*?return\s*\(\s*([\s\S]*?)\s*\);\s*\n\}/.exec(
      source,
    )?.[1];
  if (body === undefined) {
    return undefined;
  }
  const html = jsxToHtml(body)
    .split('\n')
    .filter((line) => line.trim() !== '')
    .join('\n');
  return /=\{|\{[^}]*\}/.test(html) ? undefined : html;
}

/** Plain code for a Twoslash block: what trpc.io shows of it. */
export function plainCode(
  code: string,
  includes: ReadonlyMap<string, string>,
  problems: Array<string>,
) {
  let expanded = code;
  for (let depth = 0; depth < 5; depth++) {
    expanded = expanded.replaceAll(
      /^[ \t]*\/\/ @include: (\S+)[ \t]*$/gm,
      (line, name: string) => {
        const included = includes.get(name);
        if (included === undefined) {
          problems.push(`\`${line.trim()}\`: no \`twoslash include ${name}\``);
          return '';
        }
        return included.replace(/\n$/, '');
      },
    );
  }
  const lines = removeTwoslashNotations(expanded)
    .split('\n')
    .filter((line) => !/^[ \t]*\/\/ @(?:filename|include): /.test(line));
  while (lines[0]?.trim() === '') {
    lines.shift();
  }
  while (lines.at(-1)?.trim() === '') {
    lines.pop();
  }
  return lines.join('\n');
}

/** A fence's info, without `twoslash` and with its title in double quotes. */
function plainInfo(info: string) {
  const lang = /^[\w-]*/.exec(info)?.[0] ?? '';
  const title = /\btitle\s*=\s*(["'])(.*?)\1/.exec(info)?.[2];
  return `${lang}${title === undefined ? '' : ` title="${title}"`}`;
}

interface PageContext {
  readonly docs: V11Docs;
  /** The file being converted: the page, or a partial it includes. */
  readonly file: string;
  readonly images: Set<string>;
  readonly problems: Array<string>;
  /** The page the result renders on, which its links are relative to. */
  readonly slug: string;
}

function rewriteUrl(url: string, context: PageContext, html: boolean) {
  const target = resolveV11Link(url, {
    archived: context.docs.archived,
    file: context.file,
    pages: context.docs.pages,
    slug: context.slug,
  });
  if (!target) {
    return url;
  }
  if (target.kind === 'image') {
    context.images.add(target.file);
    return imageUrl(target.file);
  }
  if (target.kind === 'url') {
    if (/\.mdx?(?:[?#]|$)/.test(target.url)) {
      context.problems.push(
        `${context.file}: ${url} isn't a page of the sidebar`,
      );
    }
    return target.url;
  }
  const hash = target.hash ? `#${target.hash}` : '';
  return html
    ? `${v11.basePath}/${target.slug}${hash}`
    : `${relativeLink(context.slug, target.slug)}${hash}`;
}

/** Resolves an import's specifier to a path under `www/`, or a `@theme/` name. */
function resolveImport(specifier: string, from: string) {
  if (specifier.startsWith('@theme/')) {
    return specifier;
  }
  if (specifier.startsWith('@site/')) {
    return specifier.slice('@site/'.length);
  }
  return new URL(specifier, `file:///${from}`).pathname.slice(1);
}

const inlineCode = /(`+)(?!`)(?:(?!\1)[^\n])+?\1(?!`)/g;

/** Replaces the inline code in `prose` while `edit` runs, so it stays as written. */
function keepingInlineCode(prose: string, edit: (masked: string) => string) {
  const spans: Array<string> = [];
  const masked = prose.replaceAll(inlineCode, (span) => {
    spans.push(span);
    return `\uE000${spans.length - 1}\uE000`;
  });
  return edit(masked).replaceAll(
    /\uE000(\d+)\uE000/g,
    (_marker, index: string) => spans[Number(index)] ?? '',
  );
}

interface Converting extends PageContext {
  readonly imports: Map<string, string>;
  readonly includes: Map<string, string>;
  /** Partials to splice in at the end, by their marker's number. */
  readonly partials: Array<string>;
}

function takeImports(lines: ReadonlyArray<string>, context: Converting) {
  const mask = inFences(lines);
  return lines.filter((line, index) => {
    if (mask[index]) {
      return true;
    }
    if (/^export\s/.test(line)) {
      context.problems.push(`${context.file}: \`${line}\``);
      return false;
    }
    if (!/^import\s/.test(line)) {
      return true;
    }
    const match =
      /^import\s+(?:(\w+)|\{\s*(\w+)\s*\})\s+from\s+['"]([^'"]+)['"];?\s*$/.exec(
        line,
      );
    const name = match?.[1] ?? match?.[2];
    if (!match?.[3] || !name) {
      context.problems.push(`${context.file}: \`${line}\``);
      return false;
    }
    context.imports.set(name, resolveImport(match[3], context.file));
    return false;
  });
}

function takeIncludes(lines: ReadonlyArray<string>, context: Converting) {
  const drop = new Set<number>();
  for (const fence of fencesOf(lines)) {
    const name = /^twoslash include (\S+)/.exec(fence.info)?.[1];
    if (!name) {
      continue;
    }
    context.includes.set(
      name,
      lines.slice(fence.start + 1, fence.end).join('\n'),
    );
    for (let index = fence.start; index <= fence.end; index++) {
      drop.add(index);
    }
    if (lines[fence.end + 1]?.trim() === '') {
      drop.add(fence.end + 1);
    }
  }
  return lines.filter((_line, index) => !drop.has(index));
}

function convertFences(lines: ReadonlyArray<string>, context: Converting) {
  const output = [...lines];
  for (const fence of fencesOf(lines).toReversed()) {
    const twoslash = /\btwoslash\b/.test(fence.info);
    const opening = `${fence.indent}${fence.marker}${plainInfo(fence.info)}`;
    if (!twoslash) {
      output[fence.start] = opening;
      continue;
    }
    const body = lines
      .slice(fence.start + 1, fence.end)
      .map((line) =>
        line.startsWith(fence.indent) ? line.slice(fence.indent.length) : line,
      )
      .join('\n');
    const problems: Array<string> = [];
    const code = plainCode(body, context.includes, problems);
    context.problems.push(
      ...problems.map((problem) => `${context.file}: ${problem}`),
    );
    output.splice(
      fence.start,
      fence.end - fence.start + 1,
      opening,
      ...code
        .split('\n')
        .map((line) => (line === '' ? '' : `${fence.indent}${line}`)),
      `${fence.indent}${fence.marker}`,
    );
  }
  return output;
}

function youTubeEmbed(attributes: ReadonlyMap<string, string | true>) {
  const id = attributes.get('videoId');
  const title = attributes.get('title');
  if (typeof id !== 'string' || typeof title !== 'string') {
    return undefined;
  }
  return `<iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${title}" style="aspect-ratio: 16 / 9; width: 100%; max-width: 42rem; border: 0" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
}

/** A self-closing component, as Markdown or HTML. */
function expandComponent(
  tag: string,
  name: string,
  attributes: ReadonlyMap<string, string | true>,
  context: Converting,
) {
  const source = context.imports.get(name);
  const problem = (why: string) => {
    context.problems.push(`${context.file}: \`${tag.trim()}\`: ${why}`);
    return tag;
  };
  if (source === undefined) {
    return problem('not imported');
  }
  if (source.endsWith('/InstallSnippet')) {
    const packages = attributes.get('pkgs');
    return typeof packages === 'string'
      ? `\n\`\`\`package-install\n${packages}\n\`\`\`\n`
      : problem('no `pkgs`');
  }
  if (source.endsWith('/YouTubeEmbed')) {
    return youTubeEmbed(attributes) ?? problem('no `videoId` or `title`');
  }
  if (source.endsWith('.svg')) {
    context.images.add(source);
    const style = attributes.get('style');
    return `<img src="${imageUrl(source)}" alt=""${
      typeof style === 'string' && style.startsWith('{{')
        ? ` style="${styleOf(style)}"`
        : ''
    } />`;
  }
  if (source.endsWith('.mdx')) {
    if (!context.docs.files.has(source)) {
      return problem(`${source} isn't there`);
    }
    context.partials.push(source);
    return `\n\uE001${context.partials.length - 1}\uE001\n`;
  }
  if (source.startsWith('src/components/')) {
    const component = context.docs.files.get(`${source}.tsx`);
    const html =
      attributes.size === 0 && component !== undefined
        ? inlineComponent(component)
        : undefined;
    return html === undefined
      ? problem('only components without props that return static JSX inline')
      : `\n${html}\n`;
  }
  return problem(`no conversion for ${source}`);
}

function convertProse(lines: ReadonlyArray<string>, context: Converting) {
  return editProse(lines, (prose) =>
    keepingInlineCode(prose, (masked) => {
      const converted = masked
        .replaceAll(/<head>[\s\S]*?<\/head>\n?/g, '')
        .replaceAll(/[ \t]*<script\b[\s\S]*?<\/script>/g, '')
        .replaceAll(/\{\/\*[\s\S]*?\*\/\}\n?/g, '')
        .replaceAll(
          /<([A-Z][\w.]*)((?:\s+[\w-]+(?:=(?:"[^"]*"|'[^']*'|\{\{[^}]*\}\}|\{[^}]*\}))?)*)\s*\/>/g,
          (tag, name: string, attributes: string) =>
            expandComponent(tag, name, attributesOf(attributes), context),
        )
        .replaceAll(/<[a-z][\w-]*\b[^>]*>/g, jsxToHtml)
        .replaceAll(/\{\s*(['"])\s\1\s*\}/g, ' ')
        .replaceAll(
          /\b(href|src)="([^"]*)"/g,
          (_attribute, name: string, url: string) =>
            `${name}="${rewriteUrl(url, context, true)}"`,
        )
        .replaceAll(
          /\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g,
          (_link, url: string, title: string) =>
            `](${rewriteUrl(url, context, false)}${title})`,
        )
        .replaceAll(/^<\/?p>[ \t]*$/gm, '');
      for (const match of converted.matchAll(/<\/?([A-Z][\w.]*)/g)) {
        if (match[1] !== 'Tabs' && match[1] !== 'TabItem') {
          context.problems.push(
            `${context.file}: no conversion for <${match[1]}>`,
          );
        }
      }
      for (const match of converted.matchAll(/<[a-z][\w-]*\b[^>]*=\{[^>]*>/g)) {
        context.problems.push(
          `${context.file}: a JSX expression in \`${match[0]}\``,
        );
      }
      return converted;
    }),
  );
}

function slugOfLabel(label: string) {
  return label
    .toLowerCase()
    .replaceAll(/[^a-z\d]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

/**
 * `<Tabs>` of `<TabItem>`s become a tab group (`rehypeCodeTabs`): a panel
 * per tab, with its Markdown. Groups of package managers switch with the
 * install commands.
 */
function convertTabs(lines: ReadonlyArray<string>, context: Converting) {
  const output: Array<string> = [];
  const mask = inFences(lines);
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    const open = mask[index] ? null : /^\s*<Tabs\b([^>]*)>\s*$/.exec(line);
    if (!open) {
      output.push(line);
      index++;
      continue;
    }
    const groupId = attributesOf(open[1] ?? '').get('groupId');
    const items: Array<{
      readonly active: boolean;
      readonly label: string;
      readonly lines: Array<string>;
    }> = [];
    let current: Array<string> | undefined;
    index++;
    for (; index < lines.length; index++) {
      const inner = lines[index] ?? '';
      if (mask[index]) {
        current?.push(inner);
        continue;
      }
      if (/^\s*<\/Tabs>\s*$/.test(inner)) {
        break;
      }
      const item = /^\s*<TabItem\b([^>]*)>\s*$/.exec(inner);
      if (item) {
        const attributes = attributesOf(item[1] ?? '');
        const value = attributes.get('value');
        const label = attributes.get('label') ?? value;
        if (typeof label !== 'string') {
          context.problems.push(
            `${context.file}: \`${inner.trim()}\` has no label`,
          );
        }
        current = [];
        items.push({
          active: attributes.get('default') === true,
          label: typeof label === 'string' ? label : `Tab ${items.length + 1}`,
          lines: current,
        });
        continue;
      }
      if (/^\s*<\/TabItem>\s*$/.test(inner)) {
        current = undefined;
        continue;
      }
      if (current) {
        current.push(inner.trimStart());
      } else if (inner.trim() !== '') {
        context.problems.push(
          `${context.file}: \`${inner.trim()}\` outside a <TabItem>`,
        );
      }
    }
    index++;
    const labels = items.map((item) => item.label);
    const group =
      typeof groupId === 'string'
        ? groupId
        : labels.every((label) => packageManagers.has(label))
          ? 'package-manager'
          : `tabs-${labels.map(slugOfLabel).join('-')}`;
    output.push(`<div class="code-tabs" data-tabs="${group}">`);
    for (const item of items) {
      const body = item.lines;
      while (body[0]?.trim() === '') {
        body.shift();
      }
      while (body.at(-1)?.trim() === '') {
        body.pop();
      }
      output.push(
        `<div data-tab="${item.label}"${item.active ? ' data-active' : ''}>`,
        '',
        ...body,
        '',
        '</div>',
      );
    }
    output.push('</div>');
  }
  return output;
}

/** `:::tip Title` … `:::` becomes `> [!TIP] Title` and the lines quoted. */
function convertAdmonitions(lines: ReadonlyArray<string>, context: Converting) {
  const output: Array<string> = [];
  const mask = inFences(lines);
  let open: { readonly indent: string } | undefined;
  for (const [index, line] of lines.entries()) {
    const fenced = mask[index];
    const start = fenced
      ? null
      : /^([ \t]*):::(\w+)(?:[ \t]+(.*))?$/.exec(line);
    if (start) {
      const admonition = admonitions[start[2] ?? ''];
      if (open || !admonition) {
        context.problems.push(`${context.file}: \`${line.trim()}\``);
        output.push(line);
        continue;
      }
      const title = start[3]?.trim() || admonition.title;
      open = { indent: start[1] ?? '' };
      // An alert is a block of its own, as an admonition is in MDX: a line
      // of HTML right above it would otherwise swallow it.
      if ((output.at(-1) ?? '').trim() !== '') {
        output.push('');
      }
      output.push(
        `${open.indent}> [!${admonition.kind}]${title ? ` ${title}` : ''}`,
      );
      continue;
    }
    if (!open) {
      output.push(line);
      continue;
    }
    if (!fenced && /^[ \t]*:::[ \t]*$/.test(line)) {
      while (output.at(-1) === `${open.indent}>`) {
        output.pop();
      }
      output.push('');
      open = undefined;
      continue;
    }
    const inner = line.startsWith(open.indent)
      ? line.slice(open.indent.length)
      : line.trimStart();
    output.push(
      inner.trim() === '' ? `${open.indent}>` : `${open.indent}> ${inner}`,
    );
  }
  if (open) {
    context.problems.push(`${context.file}: an admonition isn't closed`);
  }
  return output;
}

/** Squeezes runs of blank lines outside code blocks into one. */
function squeezeBlankLines(lines: ReadonlyArray<string>) {
  const mask = inFences(lines);
  return lines.filter(
    (line, index) =>
      mask[index] ||
      line.trim() !== '' ||
      (index > 0 && lines[index - 1]?.trim() !== ''),
  );
}

/**
 * Drops HTML comments, which show nothing. A comment is a block of its own
 * up to the line that closes it, so a fence it comments out is no fence.
 */
function dropComments(lines: ReadonlyArray<string>) {
  const output: Array<string> = [];
  let fence: string | undefined;
  let comment = false;
  for (const line of lines) {
    if (comment) {
      const end = line.indexOf('-->');
      if (end !== -1) {
        comment = false;
        const rest = line.slice(end + '-->'.length);
        if (rest.trim() !== '') {
          output.push(rest);
        }
      }
      continue;
    }
    if (fence !== undefined) {
      output.push(line);
      const close = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(line)?.[1];
      if (
        close !== undefined &&
        close[0] === fence[0] &&
        close.length >= fence.length
      ) {
        fence = undefined;
      }
      continue;
    }
    const start = /^ {0,3}<!--/.exec(line);
    if (start) {
      const end = line.indexOf('-->', start[0].length);
      if (end === -1) {
        comment = true;
      } else if (line.slice(end + '-->'.length).trim() !== '') {
        output.push(line.slice(end + '-->'.length));
      }
      continue;
    }
    fence = fenceOpen.exec(line)?.[2];
    output.push(line);
  }
  return output;
}

function stripFrontmatter(raw: string) {
  return raw.replace(/^---\n[\s\S]*?\n---\n/, '');
}

function convertBody(source: string, context: PageContext): string {
  const converting: Converting = {
    ...context,
    imports: new Map(),
    includes: new Map(),
    partials: [],
  };
  let lines = dropComments(
    stripFrontmatter(source).replaceAll('\r\n', '\n').split('\n'),
  );
  lines = takeImports(lines, converting);
  lines = takeIncludes(lines, converting);
  lines = convertFences(lines, converting);
  lines = convertProse(lines, converting);
  lines = convertTabs(lines, converting);
  lines = convertAdmonitions(lines, converting);
  const body = lines
    .join('\n')
    .replaceAll(/\uE001(\d+)\uE001/g, (_marker, index: string) => {
      const file = converting.partials[Number(index)] ?? '';
      return convertBody(context.docs.files.get(file) ?? '', {
        ...context,
        file,
      }).trim();
    });
  return body;
}

function yamlString(value: string) {
  return JSON.stringify(value);
}

/** A v11 page as a page of this site: its frontmatter and Markdown. */
export function convertPage(page: V11Page, docs: V11Docs): ConvertedPage {
  const images = new Set<string>();
  const problems: Array<string> = [];
  const source = docs.files.get(page.file);
  if (source === undefined) {
    return { images: [], markdown: '', problems: [`${page.file} isn't there`] };
  }
  const body = convertBody(source, {
    docs,
    file: page.file,
    images,
    problems,
    slug: page.slug,
  });
  const frontmatter = [
    '---',
    `title: ${yamlString(page.title)}`,
    ...(page.label === undefined || page.label === page.title
      ? []
      : [`label: ${yamlString(page.label)}`]),
    `description: ${yamlString(page.description)}`,
    `section: ${yamlString(page.section)}`,
    `order: ${page.order}`,
    '---',
  ];
  const lines = squeezeBlankLines(body.split('\n'));
  while (lines[0]?.trim() === '') {
    lines.shift();
  }
  for (const line of lines) {
    if (/^[ \t>]*(?:`{3,}|~{3,})[^\n]*\btwoslash\b/.test(line)) {
      problems.push(`${page.file}: a Twoslash block is left in \`${line}\``);
    }
  }
  return {
    images: [...images].toSorted(),
    markdown: `${[...frontmatter, '', ...lines].join('\n').trimEnd()}\n`,
    problems,
  };
}

/**
 * Drops the `#hash` of each link to a page that has no such heading, so the
 * build's link check passes; Docusaurus only warns about these.
 */
export function dropMissingAnchors(
  markdown: string,
  slug: string,
  anchors: ReadonlyMap<string, ReadonlySet<string>>,
) {
  const dropped: Array<string> = [];
  const lines = editProse(markdown.split('\n'), (prose) =>
    keepingInlineCode(prose, (masked) =>
      masked.replaceAll(
        /\]\(([^)\s#]+\.md)#([^)\s]+)\)/g,
        (link, path: string, hash: string) => {
          const target = new URL(path, `file:///docs/${slug}.md`);
          const targetSlug = /^\/docs\/(.+)\.md$/.exec(
            decodeURIComponent(target.pathname),
          )?.[1];
          const ids =
            targetSlug === undefined ? undefined : anchors.get(targetSlug);
          if (!ids || ids.has(decodeURIComponent(hash))) {
            return link;
          }
          dropped.push(`${slug}: ${path}#${hash}`);
          return `](${path})`;
        },
      ),
    ),
  );
  return { dropped, markdown: lines.join('\n') };
}

/**
 * An item of a Docusaurus sidebar, as `sidebars.ts` writes it: a doc's id,
 * or a `doc`, a `category` of items, or a kind the copy skips (`link`).
 */
export type SidebarItem =
  | string
  | {
      readonly id?: string | undefined;
      readonly items?: ReadonlyArray<SidebarItem> | undefined;
      readonly label?: string | undefined;
      readonly type: string;
    };

/** Where each doc of the sidebar sits: its section, and its order. */
export interface SidebarEntry {
  readonly id: string;
  readonly label: string | undefined;
  readonly order: number;
  readonly section: string;
}

/**
 * Flattens the sidebar's nested categories into sections, in order: a
 * category's own docs are a section, named after it, and each nested
 * category another one. Below the second level, a section's name has its
 * parent's: "Next.js Integration › App Router".
 */
export function sidebarSections(items: ReadonlyArray<SidebarItem>) {
  const sections: Array<string> = [];
  const entries: Array<SidebarEntry> = [];
  const walk = (
    children: ReadonlyArray<SidebarItem>,
    section: string,
    depth: number,
  ) => {
    for (const item of children) {
      const id = typeof item === 'string' ? item : item.id;
      if (
        id !== undefined &&
        (typeof item === 'string' || item.type === 'doc')
      ) {
        if (!sections.includes(section)) {
          sections.push(section);
        }
        entries.push({
          id,
          label: typeof item === 'string' ? undefined : item.label,
          order: entries.length,
          section,
        });
      } else if (
        typeof item !== 'string' &&
        item.type === 'category' &&
        item.items
      ) {
        const label = item.label ?? '';
        walk(
          item.items,
          depth >= 2 ? `${section} › ${label}` : label,
          depth + 1,
        );
      }
    }
  };
  walk(items, '', 0);
  return { entries, sections };
}
