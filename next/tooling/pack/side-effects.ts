import { Data, Effect } from 'effect';
import { rolldown, type OutputChunk, type RolldownOptions } from 'rolldown';

export class BundleFailed extends Data.TaggedError('BundleFailed')<{
  readonly file: string;
  readonly cause: unknown;
}> {}

const ENTRY = '\0unused-import';

/**
 * How a bundle that imports `file` and uses none of it is built.
 *
 * - `module`: bundles `file` alone, its imports external and free of
 *   effects, and ignores `sideEffects` flags, so what's left is what the
 *   module does when it loads. Reading a member of an import
 *   (`Equal.symbol`) counts as pure, as minifiers assume.
 * - `package`: bundles `file` and its relative imports, honouring each
 *   `package.json`'s `sideEffects`, as an app's bundler does.
 */
export type UnusedImportMode = 'module' | 'package';

const options = (file: string, mode: UnusedImportMode): RolldownOptions => ({
  input: ENTRY,
  plugins: [
    {
      name: 'unused-import',
      resolveId: (id) => (id === ENTRY ? id : null),
      load: (id) => (id === ENTRY ? `import ${JSON.stringify(file)};` : null),
    },
  ],
  external:
    mode === 'module'
      ? (id, importer) => id !== ENTRY && importer !== ENTRY
      : (id) => id !== ENTRY && !id.startsWith('.') && !id.startsWith('/'),
  treeshake:
    mode === 'module'
      ? {
          moduleSideEffects: (_id, external) => !external,
          propertyReadSideEffects: false,
        }
      : true,
  logLevel: 'silent',
});

/**
 * The code left in a bundle that imports `file` and uses none of it, with
 * dead code removed (`dce-only`: what any minifier drops) and region comments
 * stripped. Empty when importing `file` costs nothing.
 */
export const unusedImportOutput = (
  file: string,
  mode: UnusedImportMode,
): Effect.Effect<string, BundleFailed> =>
  Effect.acquireUseRelease(
    Effect.tryPromise({
      try: () => rolldown(options(file, mode)),
      catch: (cause) => new BundleFailed({ file, cause }),
    }),
    (build) =>
      Effect.tryPromise({
        try: () => build.generate({ format: 'esm', minify: 'dce-only' }),
        catch: (cause) => new BundleFailed({ file, cause }),
      }),
    (build) => Effect.promise(() => build.close()),
  ).pipe(
    Effect.map((result) =>
      result.output
        .filter((output): output is OutputChunk => output.type === 'chunk')
        .map((chunk) => chunk.code)
        .join('')
        .replace(/^\/\/#(?:end)?region\b.*$/gm, '')
        .trim(),
    ),
  );
