/**
 * Lints the code blocks in `docs/` with `rules`, since oxlint skips Markdown.
 * Each `ts`, `tsx`, `js` or `jsx` fence (and each `// @filename:` file of a
 * twoslash fence) is written to a temp file, padded with blank lines so
 * oxlint reports the Markdown file's lines. A block that doesn't parse fails
 * too: no rule could check it.
 *
 *   pnpm lint:docs                     every page in docs/
 *   pnpm lint:docs docs/server/effect.md   just these pages
 */
import { fileURLToPath } from 'node:url';
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Console, Data, Effect, FileSystem, Path, Stream } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** The `vite.config.ts` rules that hold for examples too. */
const rules = {
  'trpc/no-overzealous-destructuring': 'error',
};

type Extension = 'ts' | 'tsx' | 'js' | 'jsx';

export interface CodeBlock {
  /** 1-based line of the block's first line of code in the Markdown file. */
  readonly line: number;
  readonly extension: Extension;
  readonly code: string;
}

const fenceLine = /^[ \t]*(`{3,}|~{3,})[ \t]*([^\s`]*)/;
const languages: Record<string, Extension> = {
  ts: 'ts',
  typescript: 'ts',
  tsx: 'tsx',
  js: 'js',
  javascript: 'js',
  jsx: 'jsx',
};
const filenameMarker = /^[ \t]*\/\/ @filename:[ \t]*\S+?\.(tsx?|jsx?)\b/;

interface OpenBlock {
  readonly fence: string;
  /** Undefined in a fence of another language. */
  readonly extension: Extension | undefined;
  readonly line: number;
  readonly lines: ReadonlyArray<string>;
}

/**
 * The code blocks in `markdown`, one per twoslash `// @filename:` file. Lines
 * keep their indentation, so columns match the Markdown file too.
 */
export const codeBlocks = (markdown: string): ReadonlyArray<CodeBlock> => {
  const blocks: Array<CodeBlock> = [];
  const keep = (block: OpenBlock) => {
    if (block.extension && block.lines.some((text) => text.trim())) {
      blocks.push({
        line: block.line,
        extension: block.extension,
        code: block.lines.join('\n'),
      });
    }
  };
  let open: OpenBlock | undefined;
  for (const [index, text] of markdown.split('\n').entries()) {
    const fence = fenceLine.exec(text);
    if (!open) {
      if (fence) {
        open = {
          fence: fence[1]!,
          extension: languages[fence[2]!],
          line: index + 2,
          lines: [],
        };
      }
      continue;
    }
    if (
      fence &&
      !fence[2] &&
      fence[1]![0] === open.fence[0] &&
      fence[1]!.length >= open.fence.length &&
      !text.slice(fence[0].length).trim()
    ) {
      keep(open);
      open = undefined;
      continue;
    }
    const file = open.extension ? filenameMarker.exec(text) : null;
    if (file) {
      keep(open);
      open = {
        ...open,
        extension: languages[file[1]!],
        line: index + 1,
        lines: [],
      };
    }
    open = { ...open, lines: [...open.lines, text] };
  }
  return blocks;
};

/** `docs/x.md.3.ts`, the temp file of a block, back to `docs/x.md`. */
export const markdownPaths = (output: string): string =>
  output.replaceAll(/(\S+?\.md)\.\d+\.(?:tsx?|jsx?)\b/g, '$1');

class DocsLintFailed extends Data.TaggedError('DocsLintFailed')<{
  readonly message: string;
}> {}

const root = fileURLToPath(new URL('../../', import.meta.url));
const oxlint = fileURLToPath(
  new URL('node_modules/.bin/oxlint', import.meta.url),
);
const plugin = fileURLToPath(import.meta.resolve('@tooling/oxlint-plugin'));

const markdownFiles = (paths: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (paths.length > 0) {
      return yield* Effect.forEach(paths, (file) => {
        const relative = path.relative(root, path.resolve(file));
        return relative.startsWith('..')
          ? new DocsLintFailed({ message: `${file} is outside next/` })
          : Effect.succeed(relative);
      });
    }
    const docs = yield* fs.readDirectory(path.join(root, 'docs'), {
      recursive: true,
    });
    return docs
      .filter((file) => file.endsWith('.md'))
      .map((file) => path.join('docs', file))
      .sort();
  });

export interface DocsLintResult {
  /** oxlint's report, with the Markdown files' paths. */
  readonly output: string;
  readonly exitCode: number;
}

/** Lints the code blocks of `paths` (every page in `docs/` when empty). */
export const lintDocs = (
  paths: ReadonlyArray<string>,
): Effect.Effect<
  DocsLintResult,
  DocsLintFailed | PlatformError,
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'docs-lint-' });
      for (const file of yield* markdownFiles(paths)) {
        const markdown = yield* fs.readFileString(path.join(root, file));
        yield* fs.makeDirectory(path.join(dir, path.dirname(file)), {
          recursive: true,
        });
        for (const [index, block] of codeBlocks(markdown).entries()) {
          yield* fs.writeFileString(
            path.join(dir, `${file}.${index + 1}.${block.extension}`),
            `${'\n'.repeat(block.line - 1)}${block.code}\n`,
          );
        }
      }
      yield* fs.writeFileString(
        path.join(dir, '.oxlintrc.json'),
        JSON.stringify({
          plugins: [],
          categories: { correctness: 'off' },
          jsPlugins: [plugin],
          rules,
        }),
      );
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make(oxlint, ['-c', '.oxlintrc.json', '.'], {
          cwd: dir,
          stderr: 'inherit',
        }),
      );
      const [output, exitCode] = yield* Effect.all(
        [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
        { concurrency: 2 },
      );
      return { output: markdownPaths(output).trimEnd(), exitCode };
    }),
  );

const main = (paths: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const result = yield* lintDocs(paths);
    if (result.output) yield* Console.log(result.output);
    if (result.exitCode !== 0) {
      return yield* new DocsLintFailed({
        message: `oxlint exited with ${result.exitCode} on the code blocks in docs/`,
      });
    }
  });

if (import.meta.main) {
  main(process.argv.slice(2)).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
