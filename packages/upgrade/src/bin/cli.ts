/* eslint-disable @typescript-eslint/unbound-method */
import path from 'path';
import { Command as CLICommand, Options, Prompt } from '@effect/cli';
import { Command } from '@effect/platform';
import { NodeContext, NodeRuntime } from '@effect/platform-node';
import {
  Array,
  Console,
  Effect,
  Match,
  Order,
  pipe,
  Predicate,
  Stream,
  String,
} from 'effect';
import type { SourceFile } from 'typescript';
import {
  createProgram,
  findConfigFile,
  parseJsonConfigFileContent,
  readConfigFile,
  sys,
} from 'typescript';
import { version } from '../../package.json';

const assertCleanGitTree = Command.string(Command.make('git', 'status')).pipe(
  Effect.filterOrFail(
    String.includes('nothing to commit'),
    () =>
      'Git tree is not clean, please commit your changes and try again, or run with `--force`',
  ),
);

const installPackage = (packageName: string) => {
  const packageManager = Match.value(
    process.env.npm_config_user_agent ?? 'npm',
  ).pipe(
    Match.when(String.startsWith('pnpm'), () => 'pnpm'),
    Match.when(String.startsWith('yarn'), () => 'yarn'),
    Match.when(String.startsWith('bun'), () => 'bun'),
    Match.orElse(() => 'npm'),
  );
  return Command.streamLines(
    Command.make(packageManager, 'install', packageName),
  ).pipe(Stream.mapEffect(Console.log), Stream.runDrain);
};

const filterIgnored = (files: readonly SourceFile[]) =>
  Effect.gen(function* () {
    const ignores = yield* Command.string(
      Command.make('git', 'check-ignore', '**/*'),
    ).pipe(Effect.map((_) => _.split('\n')));

    yield* Effect.logDebug(
      'All files in program:',
      files.map((_) => _.fileName),
    );
    yield* Effect.logDebug('Ignored files:', ignores);

    // Ignore "common files"
    const filteredSourcePaths = files
      .filter(
        (source) =>
          source.fileName.startsWith(path.resolve()) && // only look ahead of current directory
          !source.fileName.includes('/trpc/packages/') && // relative paths when running codemod locally
          !ignores.includes(source.fileName), // ignored files
      )
      .map((source) => source.fileName);

    yield* Effect.logDebug('Filtered files:', filteredSourcePaths);

    return filteredSourcePaths;
  });

const TSProgram = Effect.succeed(
  findConfigFile(process.cwd(), sys.fileExists),
).pipe(
  Effect.filterOrFail(Predicate.isNotNullable, () => 'No tsconfig found'),
  Effect.tap((_) => Effect.logDebug('Using tsconfig', _)),
  Effect.map((_) => readConfigFile(_, sys.readFile)),
  Effect.map((_) => parseJsonConfigFileContent(_.config, sys, process.cwd())),
  Effect.map((_) =>
    createProgram({
      options: _.options,
      rootNames: _.fileNames,
      configFileParsingDiagnostics: _.errors,
    }),
  ),
);

// FIXME :: hacky
const transformPath = (path: string) =>
  process.env.DEV ? path : path.replace('../', './').replace('.ts', '.cjs');

const force = Options.boolean('force').pipe(
  Options.withAlias('f'),
  Options.withDefault(false),
  Options.withDescription('Skip git status check, use with caution'),
);

/**
 * TODO: Instead of default values these should be detected automatically from the TS program
 */
const trpcFile = Options.text('trpcFile').pipe(
  Options.withAlias('f'),
  Options.withDefault('~/trpc'),
  Options.withDescription('Path to the trpc import file'),
);

const trpcImportName = Options.text('trpcImportName').pipe(
  Options.withAlias('i'),
  Options.withDefault('trpc'),
  Options.withDescription('Name of the trpc import'),
);

const skipTanstackQuery = Options.boolean('skipTanstackQuery').pipe(
  Options.withAlias('q'),
  Options.withDefault(false),
  Options.withDescription('Skip installing @trpc/tanstack-react-query package'),
);

const verbose = Options.boolean('verbose').pipe(
  Options.withAlias('v'),
  Options.withDefault(false),
  Options.withDescription('Enable verbose logging'),
);

const rootComamnd = CLICommand.make(
  'upgrade',
  {
    force,
    trpcFile,
    trpcImportName,
    skipTanstackQuery,
    verbose,
  },
  (args) =>
    Effect.gen(function* () {
      if (args.verbose) {
        yield* Effect.log('Running upgrade with args:', args);
      }
      if (!args.force) {
        yield* assertCleanGitTree;
      }

      const transforms = yield* Effect.map(
        Prompt.multiSelect({
          message: 'Select transforms to run',
          choices: [
            {
              title: 'Migrate Hooks to xxxOptions API',
              value: require.resolve(
                transformPath('../transforms/hooksToOptions.ts'),
              ),
            },
            {
              title: 'Migrate context provider setup',
              value: require.resolve(
                transformPath('../transforms/provider.ts'),
              ),
            },
          ],
        }),
        // Make sure provider transform runs first if it's selected
        Array.sortWith((a) => !a.includes('provider.ts'), Order.boolean),
      );

      const program = yield* TSProgram;
      const sourceFiles = program.getSourceFiles();

      const commitedFiles = yield* filterIgnored(sourceFiles);
      yield* Effect.forEach(transforms, (transform) => {
        return pipe(
          Effect.log('Running transform', transform),
          Effect.flatMap(() =>
            Effect.tryPromise(async () =>
              import('jscodeshift/src/Runner.js').then(({ run }) =>
                run(transform, commitedFiles, args),
              ),
            ),
          ),
          Effect.map((_) => Effect.log('Transform result', _)),
        );
      });

      if (!args.skipTanstackQuery) {
        yield* Effect.log('Installing @trpc/tanstack-react-query');
        yield* installPackage('@trpc/tanstack-react-query');
      }
    }),
);

const cli = CLICommand.run(rootComamnd, {
  name: 'tRPC Upgrade CLI',
  version: `v${version}`,
});

cli(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
