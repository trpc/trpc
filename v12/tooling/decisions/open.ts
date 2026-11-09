/**
 * Reads `.agent-docs/open/*.md`, the questions waiting for a human, in the
 * format `.agent-docs/open/README.md` describes. The docs site renders them
 * (`www/build/decisions-content.ts`), and `open.test.ts` checks every file.
 */
import { fileURLToPath } from 'node:url';
import { Data, Effect, FileSystem, Path, Schema } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { parse as parseYaml } from 'yaml';

export const openDir: string = fileURLToPath(
  new URL('../../.agent-docs/open/', import.meta.url),
);

/** What an open question is about, for the site's filters. */
export const areas = [
  'server',
  'client',
  'errors',
  'effect',
  'streaming',
  'live',
  'tanstack',
  'openapi',
  'mcp',
  'platforms',
  'bundle',
  'stability',
  'docs-site',
  'tooling',
] as const;

export type Area = (typeof areas)[number];

/** Spikes, PRs and previews first: the site shows them as buttons. */
export const linkKinds = [
  'spike',
  'pr',
  'preview',
  'docs',
  'decision',
  'proposal',
  'note',
  'code',
  'issue',
] as const;

export type LinkKind = (typeof linkKinds)[number];

export const isButtonLink = (kind: LinkKind): boolean =>
  kind === 'spike' || kind === 'pr' || kind === 'preview';

const Frontmatter = Schema.Struct({
  area: Schema.Literals(areas),
  links: Schema.Array(
    Schema.Struct({
      kind: Schema.Literals(linkKinds),
      label: Schema.String,
      url: Schema.String,
    }),
  ),
  questions: Schema.optional(
    Schema.Array(Schema.String.check(Schema.isPattern(/^Q\d+\.\d+$/))),
  ),
  recommended: Schema.String.check(Schema.isPattern(/^[A-Z]$/)),
  summary: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(160),
    Schema.isPattern(/^[^\n]+$/),
  ),
  title: Schema.String.check(Schema.isPattern(/\?$/)),
});

export type OpenLink = (typeof Frontmatter.Type)['links'][number];

export interface OpenOption {
  /** `A`, `B`, … */
  readonly id: string;
  readonly title: string;
  /** The option's markdown, under its `###` heading. */
  readonly body: string;
}

export interface OpenQuestion {
  readonly file: string;
  /** The file name without `.md`. */
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly area: Area;
  readonly recommended: string;
  readonly questions: ReadonlyArray<string>;
  readonly links: ReadonlyArray<OpenLink>;
  /** Each section's markdown, without its `##` heading. */
  readonly why: string;
  readonly options: ReadonlyArray<OpenOption>;
  readonly recommendation: string;
  readonly blocked: string;
  readonly details: string | undefined;
}

export class InvalidOpenQuestion extends Data.TaggedError(
  'InvalidOpenQuestion',
)<{
  readonly file: string;
  readonly message: string;
}> {}

const sectionTitles = [
  'Why it matters',
  'Options',
  'Recommendation',
  'Blocked until answered',
  'Details',
] as const;

const required = sectionTitles.slice(0, 4);

/**
 * Splits markdown at headings of one level (`## `), skipping fenced code,
 * so a `## ` line inside a code block stays in its section.
 */
export function splitHeadings(
  markdown: string,
  level: number,
): { readonly lead: string; readonly parts: ReadonlyArray<[string, string]> } {
  const heading = `${'#'.repeat(level)} `;
  const parts: Array<[string, Array<string>]> = [];
  const lead: Array<string> = [];
  let fence: string | undefined;
  for (const line of markdown.split('\n')) {
    const trimmed = line.trim();
    const marker = /^(`{3,}|~{3,})/.exec(trimmed)?.[1];
    if (fence === undefined && marker !== undefined) {
      fence = marker;
    } else if (
      fence !== undefined &&
      marker !== undefined &&
      marker[0] === fence[0] &&
      marker.length >= fence.length &&
      trimmed === marker
    ) {
      fence = undefined;
    } else if (fence === undefined && line.startsWith(heading)) {
      parts.push([line.slice(heading.length).trim(), []]);
      continue;
    }
    (parts.at(-1)?.[1] ?? lead).push(line);
  }
  return {
    lead: lead.join('\n').trim(),
    parts: parts.map(([title, lines]) => [title, lines.join('\n').trim()]),
  };
}

const fenced = /^\s*(`{3,}|~{3,})/m;

/** Parses one file, failing with every problem it finds. */
export const parseOpenQuestion = (
  file: string,
  text: string,
): Effect.Effect<OpenQuestion, InvalidOpenQuestion> =>
  Effect.gen(function* () {
    const problems: Array<string> = [];
    const fail = (message: string) =>
      new InvalidOpenQuestion({ file, message: `${file}: ${message}` });
    if (!/^[a-z0-9]+(-[a-z0-9]+)*\.md$/.test(file)) {
      problems.push('the file name must be kebab-case');
    }
    const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
    if (!match) {
      return yield* fail('starts with a `---` frontmatter block');
    }
    const frontmatter = yield* Effect.try({
      catch: (cause) => cause,
      try: () => parseYaml(match[1]!),
    }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Frontmatter)),
      Effect.mapError((cause) =>
        fail(
          `invalid frontmatter: ${cause instanceof Error ? cause.message : String(cause)}`,
        ),
      ),
    );
    const body = text.slice(match[0].length);
    const sections = splitHeadings(body, 2);
    const parts = sections.parts;
    const heading = /^# (.+)$/m.exec(sections.lead)?.[1]?.trim();
    if (heading !== frontmatter.title) {
      problems.push(
        `the "# " heading must be the frontmatter's title, "${frontmatter.title}"; got "${heading ?? ''}"`,
      );
    }
    const titles = parts.map(([title]) => title);
    const expected = titles.includes('Details') ? sectionTitles : required;
    if (titles.join('|') !== expected.join('|')) {
      problems.push(
        `the "## " sections must be ${required.map((t) => `"${t}"`).join(', ')}, then an optional "Details", in that order; got ${titles.map((t) => `"${t}"`).join(', ')}`,
      );
    }
    const section = (title: (typeof sectionTitles)[number]) =>
      parts.find(([t]) => t === title)?.[1];
    for (const title of required) {
      if (section(title) === '') problems.push(`"## ${title}" is empty`);
    }
    const options = splitHeadings(section('Options') ?? '', 3).parts.map(
      ([title, optionBody], index): OpenOption => {
        const id = String.fromCharCode(65 + index);
        const optionMatch = /^([A-Z])\) (.+)$/.exec(title);
        if (optionMatch?.[1] !== id) {
          problems.push(
            `option ${index + 1} must be titled "### ${id}) <title>", got "### ${title}"`,
          );
        }
        if (!fenced.test(optionBody)) {
          problems.push(
            `option ${id} has no code block: show what a user writes under it`,
          );
        }
        if (!/^- ✅/m.test(optionBody) || !/^- ❌/m.test(optionBody)) {
          problems.push(`option ${id} needs a "- ✅" and a "- ❌" bullet`);
        }
        return { body: optionBody, id, title: optionMatch?.[2] ?? title };
      },
    );
    if (options.length < 2) {
      problems.push('"## Options" needs at least two "### " options');
    }
    if (!options.some((option) => option.id === frontmatter.recommended)) {
      problems.push(`recommended: ${frontmatter.recommended} names no option`);
    }
    const isButton = frontmatter.links.map((link) => isButtonLink(link.kind));
    if (
      isButton.some(
        (button, index) => button && !isButton[index - 1] && index > 0,
      )
    ) {
      problems.push('links: list spikes, PRs and previews first');
    }
    if (problems.length > 0) {
      return yield* fail(problems.join('\n  '));
    }
    const question: OpenQuestion = {
      area: frontmatter.area,
      blocked: section('Blocked until answered')!,
      details: section('Details'),
      file,
      links: frontmatter.links,
      options,
      questions: frontmatter.questions ?? [],
      recommendation: section('Recommendation')!,
      recommended: frontmatter.recommended,
      slug: file.slice(0, -'.md'.length),
      summary: frontmatter.summary,
      title: frontmatter.title,
      why: section('Why it matters')!,
    };
    return question;
  });

export const readOpenQuestions = (
  dir: string = openDir,
): Effect.Effect<
  ReadonlyArray<OpenQuestion>,
  PlatformError | InvalidOpenQuestion,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const files = (yield* fs.readDirectory(dir))
      .filter((f) => f.endsWith('.md') && f !== 'README.md')
      .sort();
    return yield* Effect.forEach(files, (file) =>
      Effect.flatMap(fs.readFileString(path.join(dir, file)), (text) =>
        parseOpenQuestion(file, text),
      ),
    );
  });
