/**
 * Finds package names and code in the docs' prose that aren't in backticks:
 * `@scope/pkg` imports, calls (`t.concat()`), camelCase and snake_case
 * identifiers, member access (`ctx.user`), file names and `node:` modules.
 * It reads the frontmatter's `title`, `label` and `description` and the
 * Markdown outside code blocks, code spans, URLs and HTML tags.
 *
 * The patterns are ones English prose doesn't make, so PascalCase names
 * (`TRPCError`, `WebSocket`) and lowercase words that are also identifiers
 * (`meta`, `input`) are left to the writer.
 */

export interface BareCode {
  /** 1-based. */
  readonly line: number;
  /** 1-based. */
  readonly column: number;
  readonly text: string;
  readonly kind: keyof typeof kinds;
}

/** What each kind is, for the message. */
export const kinds = {
  package: 'a package or import path',
  call: 'a call',
  identifier: 'an identifier',
  member: 'a member access',
  file: 'a file name',
  type: 'a type',
};

/** Words shaped like code that are names, units or jargon. */
const names = new Set([
  'danSON',
  'devDependency',
  'eBay',
  'Effect.ts',
  'iOS',
  'iPadOS',
  'iPhone',
  'kB',
  'macOS',
  'oRPC',
  'peerDep',
  'tRPC',
  'vCPU',
  'vCPUs',
  'vNext',
]);

/** Last segments that make `a.b` a domain or a product (`trpc.io`, `Next.js`). */
const notMembers = new Set([
  'app',
  'com',
  'dev',
  'io',
  'js',
  'net',
  'org',
  'sh',
]);

// Before a token: not part of a longer word, path or code span.
const start = String.raw`(?<![\w$@./\-:\x60])`;
// After a token: not more of it, but a sentence's full stop is fine.
const end = String.raw`(?![\w$@/\-(\x60]|\.[\w$])`;
const ident = String.raw`[A-Za-z_$][\w$]*`;

const patterns: ReadonlyArray<
  readonly [BareCode['kind'], RegExp, ((text: string) => boolean)?]
> = [
  [
    'package',
    new RegExp(
      String.raw`${start}@[a-z0-9][\w.-]*\/[\w-]+(?:[./][\w-]+)*(?:@[\w.^~-]*\w)?${end}`,
      'g',
    ),
  ],
  [
    'package',
    new RegExp(String.raw`${start}node:[a-z_]+(?:\/[a-z_]+)*${end}`, 'g'),
  ],
  [
    'call',
    new RegExp(
      String.raw`${start}\.?${ident}(?:\.${ident})*\(\)(?![\w$\x60])`,
      'g',
    ),
  ],
  // With arguments only when the callee can't be a word: `procedure(s)` is prose.
  [
    'call',
    new RegExp(
      String.raw`${start}\.?${ident}(?:\.${ident})*\([\w$.,' ]+\)(?![\w$\x60])`,
      'g',
    ),
    (text) => /^\.|^[^(]*(?:\.|[a-z][A-Z])/.test(text),
  ],
  [
    'type',
    new RegExp(
      String.raw`${start}[A-Z][\w$]*<[\w$.,| ]*[\w$]>(?![\w$\x60])`,
      'g',
    ),
  ],
  [
    'file',
    new RegExp(
      String.raw`${start}(?:\.{1,2}\/)?[\w-][\w.-]*(?:\/[\w.-]+)*\.(?:ts|tsx|mts|cts|json|jsonc|ya?ml|toml|mjs|cjs)${end}`,
      'g',
    ),
  ],
  [
    'member',
    new RegExp(String.raw`${start}${ident}(?:\.${ident})+${end}`, 'g'),
    (text) => {
      const segments = text.split('.');
      const last = segments.at(-1) ?? '';
      if (notMembers.has(last) || segments.every((s) => s.length === 1)) {
        return false;
      }
      return segments
        .slice(1)
        .some((segment) => /^[a-z_$][\w$]{2,}$|[a-z][A-Z]/.test(segment));
    },
  ],
  [
    'identifier',
    new RegExp(String.raw`${start}[a-z][a-z0-9]*[A-Z][\w$]*${end}`, 'g'),
  ],
  // `_emphasis_` ends in an underscore too, so only the prefixes may.
  [
    'identifier',
    new RegExp(
      String.raw`${start}(?:[A-Za-z][A-Za-z0-9]*_[\w$]*[A-Za-z0-9$]|experimental_|unstable_)${end}`,
      'g',
    ),
  ],
  ['identifier', new RegExp(String.raw`${start}ctx${end}`, 'g')],
];

/** `text` with `pattern`'s matches blanked out, keeping offsets and newlines. */
const blank = (text: string, pattern: RegExp) =>
  text.replaceAll(pattern, (match) => match.replaceAll(/[^\n]/g, ' '));

const fenceLine = /^[ \t]*(`{3,}|~{3,})/;

/** Frontmatter keys whose values are prose. */
const proseKeys = /^(?:title|label|description):/;

/**
 * `markdown` with everything that isn't prose blanked out: other frontmatter
 * keys, fenced blocks, code spans, URLs, HTML and link destinations.
 */
export const prose = (markdown: string) => {
  const lines = markdown.split('\n');
  let frontmatter = lines[0] === '---';
  let fence: string | undefined;
  const none = (line: string) => ' '.repeat(line.length);
  const kept = lines.map((line, index) => {
    if (frontmatter) {
      if (index > 0 && line === '---') {
        frontmatter = false;
        return none(line);
      }
      const key = proseKeys.exec(line);
      return key ? `${none(key[0])}${line.slice(key[0].length)}` : none(line);
    }
    const opener = fenceLine.exec(line)?.[1];
    if (fence !== undefined) {
      if (
        opener !== undefined &&
        opener[0] === fence[0] &&
        opener.length >= fence.length
      ) {
        fence = undefined;
      }
      return none(line);
    }
    if (opener !== undefined) {
      fence = opener;
      return none(line);
    }
    return line;
  });
  let text = kept.join('\n');
  // A code span ends at a run of as many backticks, within one paragraph.
  text = blank(text, /(`+)(?:(?!\n[ \t]*\n)[\s\S])*?(?<!`)\1(?!`)/g);
  text = blank(text, /<!--[\s\S]*?-->/g);
  text = blank(text, /\]\([^)\s]*(?:\s+"[^"]*")?\)/g);
  text = blank(text, /^[ \t]*\[[^\]]+\]:.*$/gm);
  text = blank(text, /<https?:[^>]*>|https?:\/\/[^\s)>\]]+/g);
  text = blank(text, /(?<![\w$])<\/?[a-zA-Z][^>\n]*>/g);
  return text;
};

/** Every bare package name and piece of code in `markdown`'s prose, in order. */
export const bareCode = (markdown: string): ReadonlyArray<BareCode> => {
  const text = prose(markdown);
  const found = patterns.flatMap(([kind, pattern, keep]) =>
    [...text.matchAll(pattern)]
      .filter((match) => !names.has(match[0]) && (!keep || keep(match[0])))
      .map((match) => ({ index: match.index, kind, text: match[0] })),
  );
  // Where matches overlap, the first and longest one wins.
  const sorted = [...found].sort(
    (a, b) => a.index - b.index || b.text.length - a.text.length,
  );
  const kept: Array<(typeof found)[number]> = [];
  for (const match of sorted) {
    const previous = kept.at(-1);
    if (!previous || match.index >= previous.index + previous.text.length) {
      kept.push(match);
    }
  }
  const lineStarts = [0];
  for (const match of markdown.matchAll(/\n/g)) {
    lineStarts.push(match.index + 1);
  }
  let line = 0;
  return kept.map((match) => {
    while ((lineStarts[line + 1] ?? Infinity) <= match.index) {
      line++;
    }
    return {
      column: match.index - (lineStarts[line] ?? 0) + 1,
      kind: match.kind,
      line: line + 1,
      text: match.text,
    };
  });
};

/** Quotes a frontmatter value that YAML would misread once it has backticks. */
const quoteYaml = (line: string) => {
  const key = /^(\w+):[ \t]+/.exec(line);
  if (!key) {
    return line;
  }
  const value = line.slice(key[0].length);
  if (/^['"]/.test(value) || !/^`|: | #/.test(value)) {
    return line;
  }
  return `${key[0]}'${value.replaceAll("'", "''")}'`;
};

/** `markdown` with each of `bareCode`'s finds in backticks. */
export const fixBareCode = (markdown: string) => {
  const lines = markdown.split('\n');
  // From the end, so each fix leaves the columns before it where they were.
  for (const found of [...bareCode(markdown)].reverse()) {
    const text = lines[found.line - 1] ?? '';
    const at = found.column - 1;
    lines[found.line - 1] =
      `${text.slice(0, at)}\`${found.text}\`${text.slice(at + found.text.length)}`;
  }
  const end = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  for (let index = 1; index < end; index++) {
    lines[index] = quoteYaml(lines[index] ?? '');
  }
  return lines.join('\n');
};
