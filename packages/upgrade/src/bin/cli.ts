/* eslint-disable @typescript-eslint/unbound-method */
import path from 'path';
import { Command as CLICommand, Prompt } from '@effect/cli';
import { Command, FileSystem } from '@effect/platform';
import { NodeContext, NodeRuntime } from '@effect/platform-node';
import {
  Console,
  Effect,
  Match,
  pipe,
  Predicate,
  Stream,
  String,
} from 'effect';
import ignore from 'ignore';
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
    (status) => status.includes('nothing to commit'),
    () =>
      'Git tree is not clean, please commit your changes before running the migrator',
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
    const fs = yield* FileSystem.FileSystem;
    const ignores = yield* fs
      .readFileString(path.join(process.cwd(), '.gitignore'))
      .pipe(
        Effect.map((content) => content.split('\n')),
        Effect.map((patterns) => ignore().add(patterns)),
      );

    // Ignore "common files"
    const relativeFilePaths = files
      .filter(
        (source) =>
          !source.fileName.includes('node_modules') &&
          !source.fileName.includes('packages/'),
      )
      .map((file) => path.relative(process.cwd(), file.fileName));

    // As well as gitignored?
    return ignores.filter(relativeFilePaths);
  });

const Program = Effect.succeed(
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

const transformPath = (path: string) =>
  process.env.DEV ? path : path.replace('../', './').replace('.ts', '.mjs');

const prompts = CLICommand.prompt(
  'transforms',
  Prompt.multiSelect({
    message: 'Select transforms to run',
    choices: [
      {
        title: 'Migrate Hooks to xxxOptions API',
        value: import.meta.resolve(
          transformPath('../transforms/hooks-to-options.ts'),
          import.meta.filename,
        ),
      },
      {
        title: 'Migrate context provider setup',
        value: import.meta.resolve(
          transformPath('../transforms/provider.ts'),
          import.meta.filename,
        ),
      },
    ],
  }),
  (_) =>
    Effect.gen(function* () {
      yield* assertCleanGitTree;
      const program = yield* Program;
      const sourceFiles = program.getSourceFiles();

      // Make sure provider transform runs first if it's selected
      _.sort((a, b) =>
        a.includes('provider.ts') ? -1 : b.includes('provider.ts') ? 1 : 0,
      );

      /**
       * TODO: Detect these automatically
       */
      const appRouterImportFile = '~/server/routers/_app';
      const appRouterImportName = 'AppRouter';
      const trpcFile = '~/lib/trpc';
      const trpcImportName = 'trpc';

      const commitedFiles = yield* filterIgnored(sourceFiles);
      yield* Effect.forEach(_, (transform) => {
        return pipe(
          Effect.log('Running transform', transform),
          Effect.flatMap(() =>
            Effect.tryPromise(async () =>
              import('jscodeshift/src/Runner.js').then(({ run }) =>
                run(transform.replace('file://', ''), commitedFiles, {
                  appRouterImportFile,
                  appRouterImportName,
                  trpcFile,
                  trpcImportName,
                }),
              ),
            ),
          ),
          Effect.map((res) => Effect.log('Transform result', res)),
        );
      });

      yield* Effect.log('Installing @trpc/tanstack-react-query');
      yield* installPackage('@trpc/tanstack-react-query');

      // TODO: Format project
    }),
);

const cli = CLICommand.run(prompts, {
  name: 'tRPC Upgrade CLI',
  version: `v${version}`,
});

cli(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
