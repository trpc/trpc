import { Console, Effect, type FileSystem, type Path } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import type { PlatformError } from 'effect/PlatformError';
import { upgradeFiles } from './files.ts';

/**
 * `trpcdev-upgrade <paths…> [--write]`: a dry run by default, listing
 * the files it would change and the steps left to do by hand.
 *
 * @example
 * ```ts
 * Command.run(upgradeCommand, { version: '12.0.0' });
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export const upgradeCommand: Command.Command<
  'trpcdev-upgrade',
  { readonly paths: ReadonlyArray<string>; readonly write: boolean },
  {},
  PlatformError,
  FileSystem.FileSystem | Path.Path
> = Command.make(
  'trpcdev-upgrade',
  {
    paths: Argument.String('paths').pipe(
      Argument.variadic({ min: 1 }),
      Argument.withDescription('Files or directories to upgrade'),
    ),
    write: Flag.Boolean('write').pipe(
      Flag.withDefault(false),
      Flag.withDescription('Write the changes (without it, a dry run)'),
    ),
  },
  ({ paths, write }) =>
    Effect.gen(function* () {
      const results = yield* upgradeFiles(paths, { write });
      for (const result of results) {
        if (result.changed) {
          yield* Console.log(
            `${write ? 'upgraded' : 'would upgrade'} ${result.path}`,
          );
        }
        for (const note of result.notes) {
          yield* Console.log(
            `${result.path}:${note.line}:${note.column} ${note.message}`,
          );
        }
      }
      const changed = results.filter((result) => result.changed).length;
      const notes = results.reduce((sum, r) => sum + r.notes.length, 0);
      yield* Console.log(
        `${changed} file(s) ${write ? 'upgraded' : 'to upgrade'}, ${notes} step(s) by hand`,
      );
    }),
).pipe(Command.withDescription('Upgrade a tRPC v11 codebase to trpcdev v12'));
