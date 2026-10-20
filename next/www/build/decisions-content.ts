import { NodeServices } from '@effect/platform-node';
import { type Decision as Record, parseDecision } from '@tooling/decisions';
import {
  type OpenLink,
  type OpenOption,
  type OpenQuestion as Question,
  parseOpenQuestion,
} from '@tooling/decisions/open';
import { Effect, FileSystem, Path } from 'effect';
import type { Plugin } from 'vite';

import type {
  Decision,
  DecisionMeta,
  OpenQuestion,
  OpenQuestionMeta,
  QuestionStatus,
} from '../src/content/decision-types.ts';
import { ContentError, messageOf } from './content-error.ts';
import { releaseTwoslashers } from './markdown.ts';
import { closeRenderPool, makePageRenderer } from './page-renderer.ts';
import type { TwoslashCacheOptions } from './twoslash-cache.ts';

export interface DecisionsOptions {
  /** Where the pages are served: `/v12/decisions`. */
  readonly basePath: string;
  /** `.agent-docs`, as an absolute path. */
  readonly dir: string;
  /** `.agent-docs`'s path in the repo: `next/.agent-docs`. */
  readonly dirInRepo: string;
  /** The module that lists them: `virtual:decisions-manifest`. */
  readonly manifestId: string;
  /** Where the repo's files are browsable: `https://github.com/trpc/trpc/blob/v12`. */
  readonly repoUrl: string;
  /** The sample apps' dir. */
  readonly samplesDir: string;
  /** The sample app the code blocks compile in: `decisions`, whose `open/` has each question's stubs. */
  readonly inlineApp: string;
  /** Keeps compiled code blocks on disk, so the next build reuses them. */
  readonly twoslashCache?: TwoslashCacheOptions | undefined;
}

interface Manifest {
  readonly decisions: ReadonlyArray<DecisionMeta>;
  readonly questions: ReadonlyArray<OpenQuestionMeta>;
}

type LinkOptions = Pick<DecisionsOptions, 'basePath' | 'dirInRepo' | 'repoUrl'>;

const escapeRegExp = (text: string) =>
  text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Where a link in `.agent-docs/<folder>/<file>` points on the site: an open
 * question or a decision at its page, any other file of the repo on GitHub.
 * Absolute URLs and anchors stay as written.
 */
export function decisionHref(
  options: LinkOptions,
  fromFile: string,
  url: string,
) {
  if (
    /^[a-z][a-z\d+.-]*:/i.test(url) ||
    url.startsWith('#') ||
    url.startsWith('/')
  ) {
    return url;
  }
  const target = new URL(url, `file:///${options.dirInRepo}/${fromFile}`);
  const path = decodeURIComponent(target.pathname.slice(1));
  const page = new RegExp(
    `^${escapeRegExp(options.dirInRepo)}/(open|decisions)/([\\w-]+)\\.md$`,
  ).exec(path);
  if (page?.[2] !== undefined && page[2] !== 'README') {
    return `${options.basePath}${page[1] === 'open' ? '/open' : ''}/${page[2]}${target.hash}`;
  }
  return `${options.repoUrl}/${path}${target.hash}`;
}

/**
 * Points the inline links (`[text](url)`) of `markdown` where
 * `decisionHref` says, leaving code blocks and code spans as written.
 */
export function rewriteLinks(
  options: LinkOptions,
  fromFile: string,
  markdown: string,
) {
  let fence: string | undefined;
  return markdown
    .split('\n')
    .map((line) => {
      const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
      if (fence === undefined && marker !== undefined) {
        fence = marker;
        return line;
      }
      if (fence !== undefined) {
        if (
          marker !== undefined &&
          marker[0] === fence[0] &&
          marker.length >= fence.length &&
          line.trim() === marker
        ) {
          fence = undefined;
        }
        return line;
      }
      return line.replaceAll(
        /(`+)[^`][\s\S]*?\1|\]\(([^)\s]+)/g,
        (match, code: string | undefined, url: string | undefined) =>
          code === undefined && url !== undefined
            ? `](${decisionHref(options, fromFile, url)}`
            : match,
      );
    })
    .join('\n');
}

/** Splits an option's `- ✅` and `- ❌` bullets, with their continuation lines, from the rest. */
export function splitProsCons(body: string) {
  const rest: Array<string> = [];
  const pros: Array<string> = [];
  const cons: Array<string> = [];
  let current: Array<string> = rest;
  for (const line of body.split('\n')) {
    const bullet = /^- (✅|❌)\s*(.*)$/.exec(line);
    if (bullet) {
      current = bullet[1] === '✅' ? pros : cons;
      current.push(`- ${bullet[2] ?? ''}`);
    } else if (current !== rest && /^\s+\S/.test(line)) {
      current.push(line);
    } else {
      current = rest;
      rest.push(line);
    }
  }
  return {
    cons: cons.join('\n'),
    pros: pros.join('\n'),
    rest: rest.join('\n').trim(),
  };
}

function statusOf(links: ReadonlyArray<OpenLink>): QuestionStatus {
  if (links.some((link) => link.kind === 'pr')) {
    return 'pr';
  }
  return links.some((link) => link.kind === 'spike') ? 'spike' : 'open';
}

/** Markdown to plain text, for an excerpt. */
const plainText = (markdown: string) =>
  markdown
    .replaceAll(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replaceAll(/[*_`]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();

const excerptLength = 220;

const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  Effect.runPromise(Effect.provide(effect, NodeServices.layer));

const failWith = (file: string) =>
  Effect.mapError(
    (cause: unknown) =>
      new ContentError({ cause, message: `${file}: ${messageOf(cause)}` }),
  );

/**
 * The pages of `.agent-docs/open/*.md` and `.agent-docs/decisions/*.md`,
 * and their list, with their code blocks compiled in the `inlineApp`
 * sample app.
 */
export function decisionPages(options: DecisionsOptions) {
  const openDir = `${options.dir}/open/`;
  const decisionsDir = `${options.dir}/decisions/`;
  const renderer = makePageRenderer(options.twoslashCache);

  const render = Effect.fn('renderDecisionMarkdown')(function* (
    file: string,
    markdown: string,
  ) {
    const result = yield* renderer.render(
      rewriteLinks(options, file, markdown),
      {
        basePath: options.basePath,
        contentPath: options.dirInRepo,
        inlineApp: options.inlineApp,
        samplesDir: options.samplesDir,
        slug: file.slice(0, -'.md'.length),
        sourceUrl: options.repoUrl,
      },
    );
    return result.html;
  });

  const readOpen = Effect.fn('readOpen')(function* (file: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const text = yield* fs.readFileString(path.join(openDir, file));
    return yield* parseOpenQuestion(file, text);
  });

  const openMeta = (question: Question): OpenQuestionMeta => ({
    area: question.area,
    questions: question.questions,
    recommended: question.recommended,
    slug: question.slug,
    status: statusOf(question.links),
    summary: question.summary,
    title: question.title,
  });

  const decisionMeta = (decision: Record): DecisionMeta => {
    const first = /^- (.+(?:\n {2}.+)*)/m.exec(decision.text)?.[1] ?? '';
    const excerpt = plainText(first);
    const dates = decision.text.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? [];
    return {
      date: dates.toSorted().at(-1),
      excerpt:
        excerpt.length > excerptLength
          ? `${excerpt.slice(0, excerptLength - 1).trimEnd()}…`
          : excerpt,
      open: decision.open.length,
      questions: decision.questions,
      slug: decision.file.slice(0, -'.md'.length),
      tentative: decision.tentative.length > 0,
      title: decision.title,
      who: decision.who,
    };
  };

  const manifest = Effect.fn('decisionsManifest')(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const openFiles = (yield* fs.readDirectory(openDir))
      .filter((file) => file.endsWith('.md') && file !== 'README.md')
      .sort();
    const questions = yield* Effect.forEach(openFiles, readOpen);
    const decisionFiles = (yield* fs.readDirectory(decisionsDir))
      .filter((file) => file.endsWith('.md'))
      .sort();
    const decisions = yield* Effect.forEach(decisionFiles, (file) =>
      Effect.flatMap(fs.readFileString(path.join(decisionsDir, file)), (text) =>
        parseDecision(file, text),
      ),
    );
    const result: Manifest = {
      decisions: decisions
        .map(decisionMeta)
        .toSorted(
          (a, b) =>
            (b.date ?? '').localeCompare(a.date ?? '') ||
            a.title.localeCompare(b.title),
        ),
      questions: questions.map(openMeta),
    };
    return result;
  });

  const renderOpen = Effect.fn('renderOpen')(function* (
    file: string,
    text: string,
  ) {
    const question = yield* parseOpenQuestion(file, text);
    const at = `open/${file}`;
    const option = Effect.fn('renderOption')(function* (opt: OpenOption) {
      const parts = splitProsCons(opt.body);
      return {
        cons: yield* render(at, parts.cons),
        html: yield* render(at, parts.rest),
        id: opt.id,
        pros: yield* render(at, parts.pros),
        title: opt.title,
      };
    });
    const page: OpenQuestion = {
      ...openMeta(question),
      blocked: yield* render(at, question.blocked),
      details:
        question.details === undefined
          ? undefined
          : yield* render(at, question.details),
      links: question.links.map((link) => ({
        href: decisionHref(options, at, link.url),
        kind: link.kind,
        label: link.label,
      })),
      options: yield* Effect.forEach(question.options, option),
      recommendation: yield* render(at, question.recommendation),
      source: `${options.repoUrl}/${options.dirInRepo}/${at}`,
      why: yield* render(at, question.why),
    };
    return page;
  });

  const renderDecision = Effect.fn('renderDecision')(function* (
    file: string,
    text: string,
  ) {
    const decision = yield* parseDecision(file, text);
    const at = `decisions/${file}`;
    const page: Decision = {
      ...decisionMeta(decision),
      html: yield* render(at, text.slice(text.indexOf('\n') + 1)),
      source: `${options.repoUrl}/${options.dirInRepo}/${at}`,
    };
    return page;
  });

  /** The page of `file`, an open question or a decision, or `undefined` for any other file. */
  const renderFile = (
    file: string,
    text: string,
  ):
    | Effect.Effect<
        OpenQuestion | Decision,
        ContentError,
        FileSystem.FileSystem | Path.Path
      >
    | undefined => {
    const name = file.slice(file.lastIndexOf('/') + 1);
    if (file.startsWith(openDir) && name !== 'README.md') {
      return renderOpen(name, text).pipe(failWith(file));
    }
    if (file.startsWith(decisionsDir)) {
      return renderDecision(name, text).pipe(failWith(file));
    }
    return undefined;
  };

  return {
    configResolved: renderer.configResolved,
    decisionsDir,
    manifest: () => manifest().pipe(failWith(options.dir)),
    openDir,
    renderFile,
    stats: renderer.stats,
  };
}

/**
 * Renders `.agent-docs/open/*.md` and `.agent-docs/decisions/*.md` at build
 * time, as `blog-content.ts` does the posts: each file imports as a module
 * of pre-highlighted HTML, and the manifest module (`virtual:decisions-manifest`)
 * lists the open questions and the decisions. `tooling/decisions` parses
 * both, so a file the site can't render fails its tests too.
 */
export function decisionsContent(options: DecisionsOptions): Plugin {
  const resolvedManifestId = `\0${options.manifestId}`;
  const pages = decisionPages(options);
  const appDir = `${options.samplesDir}/${options.inlineApp}/`;
  /** Each file's page, shared by the client and SSR builds, so its blocks compile once. */
  const rendered = new Map<string, Promise<OpenQuestion | Decision>>();
  let loaded: Promise<Manifest> | undefined;

  return {
    buildEnd: closeRenderPool,
    configResolved: pages.configResolved,
    generateBundle() {
      if (this.environment.name === 'client' && pages.stats) {
        this.environment.logger.info(
          `twoslash (decisions): ${pages.stats.hits} code blocks from the cache, ${pages.stats.misses} compiled`,
        );
      }
    },
    hotUpdate(context) {
      if (context.file.startsWith(appDir)) {
        // The twoslashers keep the stubs they read; every page may import one.
        releaseTwoslashers();
        const graph = this.environment.moduleGraph;
        const stale = [...graph.idToModuleMap].flatMap(([id, module]) =>
          id.startsWith(pages.openDir) || id.startsWith(pages.decisionsDir)
            ? [module]
            : [],
        );
        for (const module of stale) {
          graph.invalidateModule(module);
        }
        return stale.length > 0 ? [...context.modules, ...stale] : undefined;
      }
      if (!context.file.startsWith(options.dir)) {
        return undefined;
      }
      loaded = undefined;
      const module =
        this.environment.moduleGraph.getModuleById(resolvedManifestId);
      if (!module) {
        return undefined;
      }
      this.environment.moduleGraph.invalidateModule(module);
      return [...context.modules, module];
    },
    async load(id) {
      if (id !== resolvedManifestId) {
        return undefined;
      }
      loaded ??= run(pages.manifest());
      const listed = await loaded;
      return [
        `export const openQuestions = ${JSON.stringify(listed.questions)};`,
        `export const decisionRecords = ${JSON.stringify(listed.decisions)};`,
      ].join('\n');
    },
    name: `trpc-docs:decisions:${options.manifestId}`,
    resolveId(id) {
      return id === options.manifestId ? resolvedManifestId : undefined;
    },
    sharedDuringBuild: true,
    async transform(code, id) {
      const file = id.split('?')[0] ?? id;
      if (!file.endsWith('.md')) {
        return undefined;
      }
      if (this.environment.mode === 'dev') {
        rendered.delete(file);
      }
      let page = rendered.get(file);
      if (!page) {
        const render = pages.renderFile(file, code);
        if (!render) {
          return undefined;
        }
        page = run(render);
        rendered.set(file, page);
      }
      return {
        code: `export default ${JSON.stringify(await page)};`,
        map: null,
      };
    },
  };
}
