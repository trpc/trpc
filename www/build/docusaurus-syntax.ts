/**
 * The Docusaurus syntax the pages copied from trpc.io keep, as trpc.io's
 * files had it, and what the renderer reads of it: HTML comments go,
 * `twoslash include` blocks are expanded where `// @include:` names them,
 * `:::tip` admonitions become `> [!TIP]` alerts, and a version whose code
 * doesn't compile here shows its Twoslash blocks as the plain code trpc.io
 * showed. Keeping the files as trpc.io had them keeps them recognizably
 * the same files in the repo's history.
 */
import { removeTwoslashNotations } from 'twoslash/fallback';

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

export interface Fence {
  /** Index of the opening line. */
  readonly start: number;
  /** Index of the closing line, or the last line if it's never closed. */
  readonly end: number;
  readonly indent: string;
  readonly info: string;
  readonly marker: string;
}

export const fenceOpen = /^([ \t]*)(`{3,}|~{3,})(.*)$/;

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
export function inFences(lines: ReadonlyArray<string>) {
  const mask = lines.map(() => false);
  for (const fence of fencesOf(lines)) {
    for (let index = fence.start; index <= fence.end; index++) {
      mask[index] = true;
    }
  }
  return mask;
}

/**
 * The HTML comments among `lines`, by their first and last line. A comment
 * is a block of its own up to the line that closes it, so a fence it
 * comments out is no fence.
 */
export function commentsOf(lines: ReadonlyArray<string>) {
  const comments: Array<{ readonly start: number; readonly end: number }> = [];
  let fence: string | undefined;
  let start: number | undefined;
  for (const [index, line] of lines.entries()) {
    if (start !== undefined) {
      if (line.includes('-->')) {
        comments.push({ end: index, start });
        start = undefined;
      }
      continue;
    }
    if (fence !== undefined) {
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
    const open = /^ {0,3}<!--/.exec(line);
    if (open) {
      if (!line.includes('-->', open[0].length)) {
        start = index;
      } else {
        comments.push({ end: index, start: index });
      }
      continue;
    }
    fence = fenceOpen.exec(line)?.[2];
  }
  if (start !== undefined) {
    comments.push({ end: lines.length - 1, start });
  }
  return comments;
}

/** Drops HTML comments, which show nothing, keeping what follows a `-->` on its line. */
export function dropComments(lines: ReadonlyArray<string>) {
  const output = [...lines];
  for (const comment of commentsOf(lines).toReversed()) {
    const last = lines[comment.end] ?? '';
    const end = last.indexOf('-->');
    const rest = end === -1 ? '' : last.slice(end + '-->'.length);
    output.splice(
      comment.start,
      comment.end - comment.start + 1,
      ...(rest.trim() === '' ? [] : [rest]),
    );
  }
  return output;
}

function trimBlankLines(lines: Array<string>) {
  while (lines[0]?.trim() === '') {
    lines.shift();
  }
  while (lines.at(-1)?.trim() === '') {
    lines.pop();
  }
  return lines;
}

/** A Twoslash block with its `// @include:` lines replaced by the `twoslash include` blocks they name. */
export function expandIncludes(
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
  return trimBlankLines(expanded.split('\n')).join('\n');
}

/**
 * A `// ^?` above the last `// ---cut---` queries code that isn't shown,
 * which trpc.io's Twoslash ignored and this site's rejects; it goes.
 */
function withoutHiddenQueries(code: string) {
  const lines = code.split('\n');
  const cut = lines.findLastIndex((line) =>
    /^[ \t]*\/\/ ---cut(?:-before)?---[ \t]*$/.test(line),
  );
  return lines
    .filter((line, index) => index > cut || !/^[ \t]*\/\/\s*\^[?|]/.test(line))
    .join('\n');
}

/** Plain code for a Twoslash block: what trpc.io shows of it. */
export function plainCode(
  code: string,
  includes: ReadonlyMap<string, string>,
  problems: Array<string>,
) {
  const lines = removeTwoslashNotations(
    expandIncludes(code, includes, problems),
  )
    .split('\n')
    .filter((line) => !/^[ \t]*\/\/ @(?:filename|include): /.test(line));
  return trimBlankLines(lines).join('\n');
}

/** A fence's info, its language in lowercase and its title in double quotes. */
function fenceInfo(info: string) {
  return info
    .replace(/^[\w-]+/, (lang) => lang.toLowerCase())
    .replace(/\btitle\s*=\s*'([^']*)'/, 'title="$1"');
}

/** Takes out the `twoslash include <name>` blocks, which only feed `// @include:`. */
function takeIncludes(lines: ReadonlyArray<string>) {
  const includes = new Map<string, string>();
  const drop = new Set<number>();
  for (const fence of fencesOf(lines)) {
    const name = /^twoslash include (\S+)/.exec(fence.info)?.[1];
    if (!name) {
      continue;
    }
    includes.set(name, lines.slice(fence.start + 1, fence.end).join('\n'));
    for (let index = fence.start; index <= fence.end; index++) {
      drop.add(index);
    }
    if (lines[fence.end + 1]?.trim() === '') {
      drop.add(fence.end + 1);
    }
  }
  return {
    includes,
    lines: lines.filter((_line, index) => !drop.has(index)),
  };
}

function convertFences(
  lines: ReadonlyArray<string>,
  includes: ReadonlyMap<string, string>,
  twoslash: boolean,
  problems: Array<string>,
) {
  const output = [...lines];
  for (const fence of fencesOf(lines).toReversed()) {
    const info = fenceInfo(fence.info);
    const opening = (rest: string) =>
      `${fence.indent}${fence.marker}${rest}`.trimEnd();
    if (!/\btwoslash\b/.test(info)) {
      output[fence.start] = opening(info);
      continue;
    }
    const body = lines
      .slice(fence.start + 1, fence.end)
      .map((line) =>
        line.startsWith(fence.indent) ? line.slice(fence.indent.length) : line,
      )
      .join('\n');
    const code = twoslash
      ? withoutHiddenQueries(expandIncludes(body, includes, problems))
      : plainCode(body, includes, problems);
    output.splice(
      fence.start,
      fence.end - fence.start + 1,
      opening(
        twoslash ? info : info.replaceAll(/[ \t]*\btwoslash\b/g, '').trim(),
      ),
      ...code
        .split('\n')
        .map((line) => (line === '' ? '' : `${fence.indent}${line}`)),
      `${fence.indent}${fence.marker}`,
    );
  }
  return output;
}

/**
 * A partial with its `// @include:` lines expanded from its own `twoslash
 * include` blocks, which Docusaurus compiles apart from the page's: inlined,
 * the partial's could otherwise shadow the page's of the same name.
 */
export function withOwnIncludes(markdown: string) {
  const problems: Array<string> = [];
  const taken = takeIncludes(markdown.split('\n'));
  const lines = [...taken.lines];
  for (const fence of fencesOf(taken.lines).toReversed()) {
    if (!/\btwoslash\b/.test(fence.info)) {
      continue;
    }
    const body = taken.lines
      .slice(fence.start + 1, fence.end)
      .map((line) =>
        line.startsWith(fence.indent) ? line.slice(fence.indent.length) : line,
      )
      .join('\n');
    lines.splice(
      fence.start + 1,
      fence.end - fence.start - 1,
      ...expandIncludes(body, taken.includes, problems)
        .split('\n')
        .map((line) => (line === '' ? '' : `${fence.indent}${line}`)),
    );
  }
  return { markdown: lines.join('\n'), problems };
}

/** `:::tip Title` … `:::` becomes `> [!TIP] Title` and the lines quoted. */
function convertAdmonitions(
  lines: ReadonlyArray<string>,
  problems: Array<string>,
) {
  const output: Array<string> = [];
  const mask = inFences(lines);
  let open: { readonly indent: string; readonly name: string } | undefined;
  for (const [index, line] of lines.entries()) {
    const fenced = mask[index];
    const start = fenced
      ? null
      : /^([ \t]*):::(\w+)(?:[ \t]+(.*))?$/.exec(line);
    // `:::tip` in an open tip is a typo for `:::`: Docusaurus nests the rest
    // of the page in it.
    const reopened =
      open !== undefined && start?.[2] === open.name && !start[3]?.trim();
    if (start && !reopened) {
      const admonition = admonitions[start[2] ?? ''];
      if (open || !admonition) {
        problems.push(`\`${line.trim()}\``);
        output.push(line);
        continue;
      }
      const title = start[3]?.trim() || admonition.title;
      open = { indent: start[1] ?? '', name: start[2] ?? '' };
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
    if (reopened || (!fenced && /^[ \t]*:::[ \t]*$/.test(line))) {
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
    problems.push("an admonition isn't closed");
  }
  return output;
}

/**
 * The markdown the renderer reads of a page with Docusaurus syntax, and
 * what it couldn't read. `twoslash` is whether its Twoslash blocks compile,
 * or show as plain code.
 */
export function fromDocusaurus(markdown: string, twoslash: boolean) {
  const problems: Array<string> = [];
  const taken = takeIncludes(dropComments(markdown.split('\n')));
  const lines = convertAdmonitions(
    convertFences(taken.lines, taken.includes, twoslash, problems),
    problems,
  );
  return { markdown: lines.join('\n'), problems };
}
