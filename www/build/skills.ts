/**
 * Writes the agent skills the packages ship for TanStack Intent
 * (https://trpc.io/docs/skills) from the v11 docs. A page whose frontmatter
 * has a `skill` becomes `packages/<dir>/skills/<name>/SKILL.md`: the page,
 * then the pages or sections it `include`s, with the pages it lists as
 * `references` beside it in `references/`. The skills aren't committed:
 * each package's `prepack` writes its own, so every tarball has them fresh.
 *
 * `node build/skills.ts` writes every package's; `--package <dir>` only the
 * package in `<dir>`.
 */
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Console, Effect, FileSystem, Path, Schema } from 'effect';
import GithubSlugger from 'github-slugger';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { stripCollapseMarkers } from './collapse.ts';
import { ContentError, messageOf } from './content-error.ts';
import { fencesOf, fromDocusaurus, inFences } from './docusaurus-syntax.ts';
import { samplesDir } from './paths.ts';
import { expandSnippets } from './snippets.ts';

const here = (relative: string) => new URL(relative, import.meta.url).pathname;

const repoRoot = here('../../');
const docsDir = here('../v11/docs');
const siteUrl = 'https://trpc.io';
const sourceUrl = 'https://github.com/trpc/trpc/blob/main';

/** A page's `skill` frontmatter. */
export const SkillFrontmatter = Schema.Struct({
  /** The skill's name, kebab-case: `intent load <package>#<name>` loads it. */
  name: Schema.String,
  /** The package that ships it, which needs the `tanstack-intent` keyword. */
  package: Schema.String,
  /** When an agent should load it: what it covers, in the words of the task. */
  description: Schema.String,
  /** `core` for one feature, `composition` for one spanning several, `framework` for a framework integration, `lifecycle` for an upgrade. */
  type: Schema.Literals(['core', 'composition', 'framework', 'lifecycle']),
  /** Skills to load first, by name. */
  requires: Schema.optional(Schema.Array(Schema.String)),
  /** Pages, or `page#heading` sections, appended to the skill: `client/headers`. */
  include: Schema.optional(Schema.Array(Schema.String)),
  /** Pages written beside the skill in `references/`, which it links. */
  references: Schema.optional(Schema.Array(Schema.String)),
});

interface Page {
  readonly file: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly body: string;
  readonly skill: typeof SkillFrontmatter.Type | undefined;
}

const PageFrontmatter = Schema.Struct({
  title: Schema.String,
  description: Schema.optional(Schema.String),
  skill: Schema.optional(SkillFrontmatter),
});

const fail = (message: string) => Effect.fail(new ContentError({ message }));

const readPages = Effect.fn('readPages')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const names = yield* fs.glob('**/*.md', { root: docsDir });
  const pages = new Map<string, Page>();
  for (const name of names.toSorted()) {
    if (path.basename(name) === 'README.md') continue;
    const file = path.join(docsDir, name);
    const raw = yield* fs.readFileString(file);
    const match = /^---\n([\s\S]*?)\n---\n/.exec(raw);
    if (!match?.[1]) return yield* fail(`${file}: missing frontmatter`);
    const frontmatter = yield* Effect.try(() => parseYaml(match[1] ?? '')).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(PageFrontmatter)),
      Effect.mapError(
        (cause) =>
          new ContentError({
            cause,
            message: `${file}: invalid frontmatter: ${messageOf(cause)}`,
          }),
      ),
    );
    const slug = name.split(path.sep).join('/').replace(/\.md$/, '');
    pages.set(slug, {
      body: raw.slice(match[0].length),
      description: frontmatter.description ?? '',
      file,
      skill: frontmatter.skill,
      slug,
      title: frontmatter.title,
    });
  }
  return pages;
});

/** A link in a page, absolute: pages at trpc.io, other files on GitHub. */
function absoluteUrl(path: Path.Path, page: Page, url: string) {
  if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('#')) return url;
  if (url.startsWith('/')) return `${siteUrl}${url}`;
  const [pathname = '', hash] = url.split('#');
  const target = path.resolve(path.dirname(page.file), pathname);
  const fromDocs = path.relative(docsDir, target);
  const anchor = hash ? `#${hash}` : '';
  if (!fromDocs.startsWith('..') && fromDocs.endsWith('.md')) {
    const slug = fromDocs.replace(/\.md$/, '');
    return `${siteUrl}/docs${slug === 'introduction' ? '' : `/${slug}`}${anchor}`;
  }
  return `${sourceUrl}/${path.relative(repoRoot, target)}${anchor}`;
}

/**
 * A page's markdown as an agent reads it: samples expanded, Twoslash blocks
 * as the code the site shows (marked `no-check`: the docs' Twoslash check
 * compiles them with their hidden setup), admonitions as alerts, installs
 * as npm commands, and links absolute.
 */
const pageMarkdown = Effect.fn('pageMarkdown')(function* (page: Page) {
  const path = yield* Path.Path;
  const expanded = yield* expandSnippets(page.body, {
    file: page.file,
    samplesDir,
  });
  const marked = expanded.markdown.replaceAll(
    /^([ \t]*```\w+[^\n]*)\btwoslash\b/gm,
    '$1no-check twoslash',
  );
  const read = fromDocusaurus(marked, false);
  if (read.problems.length > 0) {
    return yield* fail(`${page.file}: ${read.problems.join('; ')}`);
  }
  const lines = stripCollapseMarkers(read.markdown).split('\n');
  for (const fence of fencesOf(lines).toReversed()) {
    if (fence.info !== 'package-install') continue;
    const words = lines
      .slice(fence.start + 1, fence.end)
      .join(' ')
      .trim()
      .split(/\s+/);
    const command =
      words[0] === '-D'
        ? `npm install -D ${words.slice(1).join(' ')}`
        : `npm install ${words.join(' ')}`;
    lines.splice(
      fence.start,
      fence.end - fence.start + 1,
      `${fence.indent}${fence.marker}bash`,
      `${fence.indent}${command}`,
      `${fence.indent}${fence.marker}`,
    );
  }
  const fenced = inFences(lines);
  return lines
    .map((line, index) =>
      fenced[index]
        ? line
        : line.replaceAll(
            /(\]\(|href=")([^)\s"]+)/g,
            (_all, open: string, url: string) =>
              `${open}${absoluteUrl(path, page, url)}`,
          ),
    )
    .join('\n')
    .trim();
});

/** Each heading outside code blocks one level deeper, `levels` times. */
function demote(markdown: string, levels: number) {
  const lines = markdown.split('\n');
  const fenced = inFences(lines);
  return lines
    .map((line, index) =>
      !fenced[index] && /^#{1,6} /.test(line)
        ? `${'#'.repeat(levels)}${line}`
        : line,
    )
    .join('\n');
}

/** The section under the heading with id `anchor`: its heading and the lines up to the next of its level or higher. */
function section(markdown: string, anchor: string) {
  const lines = markdown.split('\n');
  const fenced = inFences(lines);
  const slugger = new GithubSlugger();
  let start = -1;
  let level = 0;
  for (const [index, line] of lines.entries()) {
    const heading = fenced[index] ? null : /^(#{1,6}) (.*)$/.exec(line);
    if (!heading?.[1]) continue;
    if (start >= 0 && heading[1].length <= level) {
      return lines.slice(start, index).join('\n').trim();
    }
    if (start < 0 && slugger.slug(heading[2] ?? '') === anchor) {
      start = index;
      level = heading[1].length;
    }
  }
  return start >= 0 ? lines.slice(start).join('\n').trim() : undefined;
}

/** `client/links/httpLink` as a reference's file name. */
const referenceName = (slug: string) => `${slug.replaceAll('/', '-')}.md`;

const pageUrl = (slug: string) =>
  `${siteUrl}/docs${slug === 'introduction' ? '' : `/${slug}`}`;

interface SkillFiles {
  readonly name: string;
  /** Path in the skill's dir, and contents. */
  readonly files: ReadonlyMap<string, string>;
}

interface SkillPage {
  readonly page: Page;
  readonly skill: typeof SkillFrontmatter.Type;
}

const renderSkill = Effect.fn('renderSkill')(function* (
  { page, skill }: SkillPage,
  pages: ReadonlyMap<string, Page>,
  skills: ReadonlyMap<string, SkillPage>,
  version: string,
) {
  const path = yield* Path.Path;
  const lookup = (slug: string) => {
    const found = pages.get(slug);
    return found
      ? Effect.succeed(found)
      : fail(`${page.file}: skill ${skill.name} names ${slug}, which isn't a page`);
  };
  const sources = [page.file];
  const body = [yield* pageMarkdown(page)];
  for (const entry of skill.include ?? []) {
    const [slug = '', anchor] = entry.split('#');
    const included = yield* lookup(slug);
    sources.push(included.file);
    const markdown = yield* pageMarkdown(included);
    if (anchor === undefined) {
      body.push(
        `## ${included.title}`,
        `From ${pageUrl(slug)}`,
        demote(markdown, 1),
      );
      continue;
    }
    const part = section(markdown, anchor);
    if (part === undefined) {
      return yield* fail(
        `${page.file}: skill ${skill.name} includes ${entry}, which has no such heading`,
      );
    }
    const depth = /^(#+)/.exec(part)?.[1]?.length ?? 2;
    body.push(
      depth < 2 ? demote(part, 2 - depth) : part.replace(/^#+/, '##'),
      `From ${pageUrl(slug)}#${anchor}`,
    );
  }
  const files = new Map<string, string>();
  const references: Array<string> = [];
  for (const slug of skill.references ?? []) {
    const referenced = yield* lookup(slug);
    sources.push(referenced.file);
    const name = `references/${referenceName(slug)}`;
    files.set(
      name,
      [
        `# ${referenced.title}`,
        '',
        ...(referenced.description ? [`> ${referenced.description}`, ''] : []),
        `From ${pageUrl(slug)}`,
        '',
        yield* pageMarkdown(referenced),
        '',
      ].join('\n'),
    );
    references.push(
      `- [${referenced.title}](${name})${referenced.description ? `: ${referenced.description}` : ''}`,
    );
  }
  const related = (skill.requires ?? []).flatMap((name) => {
    const required = skills.get(name);
    return required
      ? [
          `- \`${name}\` (${pageUrl(required.page.slug)}): \`npx @tanstack/intent@latest load ${required.skill.package}#${name}\``,
        ]
      : [];
  });
  const frontmatter = stringifyYaml(
    {
      name: skill.name,
      description: skill.description.trim().replaceAll(/\s+/g, ' '),
      ...(skill.requires?.length ? { requires: skill.requires } : {}),
      sources: sources.map((file) => path.relative(repoRoot, file)),
      metadata: { type: skill.type, library: 'trpc', library_version: version },
    },
    { lineWidth: 0 },
  );
  files.set(
    'SKILL.md',
    [
      `---\n${frontmatter}---`,
      '',
      `<!-- Generated from ${path.relative(repoRoot, page.file)} by www/build/skills.ts. Edit the docs instead. -->`,
      '',
      `# ${page.title}`,
      '',
      ...(page.description ? [`> ${page.description}`, ''] : []),
      `From ${pageUrl(page.slug)}`,
      '',
      body.join('\n\n'),
      ...(references.length
        ? ['', '## References', '', ...references]
        : []),
      ...(related.length ? ['', '## Related skills', '', ...related] : []),
      '',
    ].join('\n'),
  );
  return { files, name: skill.name } satisfies SkillFiles;
});

/** Each publishable package's dir, by name. */
const packageDirs = Effect.fn('packageDirs')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const packagesDir = path.join(repoRoot, 'packages');
  const dirs = new Map<
    string,
    { readonly dir: string; readonly version: string; readonly intent: boolean }
  >();
  for (const name of yield* fs.readDirectory(packagesDir)) {
    const file = path.join(packagesDir, name, 'package.json');
    if (!(yield* fs.exists(file))) continue;
    const json = JSON.parse(yield* fs.readFileString(file)) as {
      name: string;
      version: string;
      keywords?: ReadonlyArray<string>;
    };
    dirs.set(json.name, {
      dir: path.join(packagesDir, name),
      intent: json.keywords?.includes('tanstack-intent') ?? false,
      version: json.version,
    });
  }
  return dirs;
});

/** Writes the skills of the package in `only`, or of every package. */
export const writeSkills = Effect.fn('writeSkills')(function* (only?: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const pages = yield* readPages();
  const packages = yield* packageDirs();
  const byName = new Map<string, SkillPage>();
  const skills = [...pages.values()].flatMap((page) =>
    page.skill ? [{ page, skill: page.skill }] : [],
  );
  for (const { page, skill } of skills) {
    if (byName.has(skill.name)) {
      return yield* fail(`${page.file}: another page has skill ${skill.name}`);
    }
    byName.set(skill.name, { page, skill });
    const owner = packages.get(skill.package);
    if (!owner) {
      return yield* fail(`${page.file}: no package ${skill.package}`);
    }
    if (!owner.intent) {
      return yield* fail(
        `${page.file}: ${skill.package} ships skill ${skill.name}, so it needs "tanstack-intent" in its package.json "keywords"`,
      );
    }
  }
  for (const { page, skill } of skills) {
    for (const required of skill.requires ?? []) {
      if (!byName.has(required)) {
        return yield* fail(
          `${page.file}: skill ${skill.name} requires ${required}, which no page defines`,
        );
      }
    }
  }
  const onlyDir = only === undefined ? undefined : path.resolve(only);
  let written = 0;
  for (const [name, owner] of packages) {
    if (!owner.intent || (onlyDir !== undefined && owner.dir !== onlyDir)) {
      continue;
    }
    const out = path.join(owner.dir, 'skills');
    yield* fs.remove(out, { force: true, recursive: true });
    const own = skills.filter(({ skill }) => skill.package === name);
    if (own.length === 0) {
      return yield* fail(
        `${name} has the "tanstack-intent" keyword but no docs page has a skill for it`,
      );
    }
    for (const entry of own) {
      const rendered = yield* renderSkill(entry, pages, byName, owner.version);
      for (const [file, contents] of rendered.files) {
        const target = path.join(out, rendered.name, file);
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        yield* fs.writeFileString(target, contents);
      }
      written++;
    }
  }
  if (onlyDir !== undefined && written === 0) {
    const owns = [...packages.values()].some((owner) => owner.dir === onlyDir);
    if (!owns) return yield* fail(`no package in ${only}`);
  }
  return written;
});

if (import.meta.main) {
  const flag = process.argv.indexOf('--package');
  const only = flag === -1 ? undefined : process.argv[flag + 1];
  NodeRuntime.runMain(
    writeSkills(only).pipe(
      Effect.flatMap((count) => Console.log(`Wrote ${count} skills`)),
      Effect.provide(NodeServices.layer),
    ),
  );
}
