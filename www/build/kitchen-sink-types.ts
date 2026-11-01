/**
 * The declarations the kitchen sink's type checker needs in the browser
 * (`src/kitchen-sink/ts-worker.ts`): the TypeScript libs and every package
 * a demo can import, as the sample app's own program sees them.
 */
import { Data, Effect } from 'effect';
import ts from 'typescript6';
import type { Plugin } from 'vite';

import { demos } from '../src/kitchen-sink/demos.ts';
import { packageNames } from '../src/kitchen-sink/package-names.ts';
import type {
  DeclarationBundle,
  Resolution,
} from '../src/kitchen-sink/ts-service.ts';
import { samplesDir } from './paths.ts';

export class DeclarationBundleError extends Data.TaggedError(
  'DeclarationBundleError',
)<{ readonly message: string }> {}

const workspaceDir = new URL('../../', import.meta.url).pathname;
const storeFile = /\/node_modules\/\.pnpm\/([^/]+)\/node_modules\/(.+)$/;

/**
 * Short paths for the browser, unique per file: `/lib/lib.dom.d.ts`,
 * `/node_modules/zod/v4/index.d.ts` (or under `.pnpm/<id>/` when two
 * versions of a package meet), `/packages/trpc/src/client/index.ts`.
 */
function virtualPaths(program: ts.Program) {
  const byReal = new Map<string, string>();
  const taken = new Set<string>();
  return (real: string) => {
    const existing = byReal.get(real);
    if (existing !== undefined) {
      return existing;
    }
    const sourceFile = program.getSourceFile(real);
    const store = storeFile.exec(real);
    let virtual =
      sourceFile && program.isSourceFileDefaultLibrary(sourceFile)
        ? `/lib/${real.slice(real.lastIndexOf('/') + 1)}`
        : store
          ? `/node_modules/${store[2]}`
          : real.startsWith(workspaceDir)
            ? `/${real.slice(workspaceDir.length)}`
            : real;
    if (taken.has(virtual) && store) {
      virtual = `/node_modules/.pnpm/${store[1]}/node_modules/${store[2]}`;
    }
    byReal.set(real, virtual);
    taken.add(virtual);
    return virtual;
  };
}

function resolution(
  resolved: ts.ResolvedModuleFull | undefined,
  virtual: (real: string) => string,
): Resolution | null {
  return resolved === undefined
    ? null
    : {
        extension: resolved.extension,
        external: resolved.isExternalLibraryImport ?? false,
        file: virtual(resolved.resolvedFileName),
        tsExtension: resolved.resolvedUsingTsExtension ?? false,
      };
}

/**
 * Compiles `packages` from the sample in `sampleDir` with its tsconfig,
 * and keeps every file the program loads, with how each import resolved.
 * Third-party declarations lose their comments, which are most of
 * Effect's and the DOM lib's size; the workspace's keep their docs for
 * hovers.
 */
export const declarationBundle = Effect.fn('declarationBundle')(
  function* (opts: {
    readonly packages: ReadonlyArray<string>;
    readonly sampleDir: string;
  }) {
    const configFile = `${opts.sampleDir}/tsconfig.json`;
    const config = ts.getParsedCommandLineOfConfigFile(configFile, undefined, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: () => {},
    });
    if (!config || config.errors.length > 0) {
      return yield* new DeclarationBundleError({
        message: `${configFile} doesn't parse`,
      });
    }
    const options = config.options;
    const entry = `${opts.sampleDir}/src/__kitchen-sink-packages__.ts`;
    const entryCode = opts.packages
      .map(
        (name, index) => `import type * as _${String(index)} from '${name}';`,
      )
      .join('\n');

    const host = ts.createCompilerHost(options);
    const cache = ts.createModuleResolutionCache(
      host.getCurrentDirectory(),
      (file) => file,
      options,
    );
    const modules = new Map<
      string,
      Map<string, ts.ResolvedModuleFull | undefined>
    >();
    const record = (
      containing: string,
      name: string,
      resolved: ts.ResolvedModuleFull | undefined,
    ) => {
      const table = modules.get(containing) ?? new Map();
      table.set(name, resolved);
      modules.set(containing, table);
    };
    const getSourceFile = host.getSourceFile.bind(host);
    const fileExists = host.fileExists.bind(host);
    host.getSourceFile = (file, ...rest) =>
      file === entry
        ? ts.createSourceFile(file, entryCode, ts.ScriptTarget.Latest)
        : getSourceFile(file, ...rest);
    host.fileExists = (file) => file === entry || fileExists(file);
    host.resolveModuleNameLiterals = (
      literals,
      containing,
      redirected,
      settings,
      sourceFile,
    ) =>
      literals.map((literal) => {
        const found = ts.resolveModuleName(
          literal.text,
          containing,
          settings,
          host,
          cache,
          redirected,
          ts.getModeForUsageLocation(sourceFile, literal, settings),
        );
        record(containing, literal.text, found.resolvedModule);
        return found;
      });
    host.resolveTypeReferenceDirectiveReferences = (
      references,
      containing,
      redirected,
      settings,
      sourceFile,
    ) =>
      references.map((reference) => {
        const name =
          typeof reference === 'string'
            ? reference
            : reference.fileName.toLowerCase();
        const found = ts.resolveTypeReferenceDirective(
          name,
          containing,
          settings,
          host,
          redirected,
          undefined,
          typeof reference === 'string'
            ? sourceFile?.impliedNodeFormat
            : (reference.resolutionMode ?? sourceFile?.impliedNodeFormat),
        );
        const directive = found.resolvedTypeReferenceDirective;
        record(
          containing,
          name,
          directive?.resolvedFileName === undefined
            ? undefined
            : {
                extension: ts.Extension.Dts,
                isExternalLibraryImport:
                  directive.isExternalLibraryImport ?? false,
                resolvedFileName: directive.resolvedFileName,
              },
        );
        return found;
      });

    const program = ts.createProgram({ host, options, rootNames: [entry] });
    const entryFile = program.getSourceFile(entry);
    const problems = [
      ...program.getOptionsDiagnostics(),
      ...program.getGlobalDiagnostics(),
      ...(entryFile ? program.getSemanticDiagnostics(entryFile) : []),
    ];
    if (problems.length > 0) {
      return yield* new DeclarationBundleError({
        message: `The kitchen sink's packages don't type-check from ${opts.sampleDir}: ${problems.map((problem) => ts.flattenDiagnosticMessageText(problem.messageText, ' ')).join('; ')}`,
      });
    }

    const virtual = virtualPaths(program);
    const printer = ts.createPrinter({ removeComments: true });
    const files: Record<string, string> = {};
    for (const sourceFile of program.getSourceFiles()) {
      if (sourceFile.fileName === entry) {
        continue;
      }
      files[virtual(sourceFile.fileName)] =
        program.isSourceFileDefaultLibrary(sourceFile) ||
        sourceFile.fileName.includes('/node_modules/')
          ? printer.printFile(sourceFile)
          : sourceFile.text;
    }
    const resolutions: Record<string, Record<string, Resolution | null>> = {};
    for (const [containing, table] of modules) {
      if (containing === entry) {
        continue;
      }
      resolutions[virtual(containing)] = Object.fromEntries(
        Array.from(table, ([name, resolved]) => [
          name,
          resolution(resolved, virtual),
        ]),
      );
    }
    const packages: Record<string, Resolution> = {};
    for (const [name, resolved] of modules.get(entry) ?? []) {
      const found = resolution(resolved, virtual);
      if (found) {
        packages[name] = found;
      }
    }
    const { configFilePath: _, pathsBasePath: __, ...portable } = options;
    return {
      files,
      options: portable,
      packages,
      resolutions,
    } satisfies DeclarationBundle;
  },
);

/** A sample's bundle as JSON, and the sample whose module serves it. */
export interface SampleBundle {
  readonly json: string;
  readonly module: string;
}

/**
 * Each sample's bundle. Samples whose bundles are equal (the same
 * compiler options and package versions) share the first one's module,
 * so a reader who opens a second demo fetches no declarations again.
 */
export const sampleBundles = Effect.fn('sampleBundles')(function* (
  samples: ReadonlyArray<string>,
) {
  const modules = new Map<string, string>();
  const bundles = new Map<string, SampleBundle>();
  for (const sample of samples) {
    const json = JSON.stringify(
      yield* declarationBundle({
        packages: packageNames,
        sampleDir: `${samplesDir}/${sample}`,
      }),
    );
    const module = modules.get(json) ?? sample;
    modules.set(json, module);
    bundles.set(sample, { json, module });
  }
  return bundles;
});

const moduleId = 'virtual:kitchen-sink-types';

/**
 * `virtual:kitchen-sink-types` maps each demo's sample to a loader of its
 * declaration bundle, a module that the type worker fetches when an
 * editor is first focused.
 */
export function kitchenSinkTypes(): Plugin {
  const samples = [...new Set(Object.values(demos).map((demo) => demo.sample))];
  let bundles: Promise<ReadonlyMap<string, SampleBundle>> | undefined;
  const load = () => {
    bundles ??= Effect.runPromise(sampleBundles(samples));
    return bundles;
  };
  return {
    async load(id) {
      if (id === `\0${moduleId}`) {
        const loaded = await load();
        return `export default {\n${samples.map((sample) => `  ${JSON.stringify(sample)}: () => import(${JSON.stringify(`${moduleId}/${loaded.get(sample)?.module ?? sample}`)}),`).join('\n')}\n};`;
      }
      if (!id.startsWith(`\0${moduleId}/`)) {
        return undefined;
      }
      const bundle = (await load()).get(id.slice(`\0${moduleId}/`.length));
      return (
        bundle && `export default JSON.parse(${JSON.stringify(bundle.json)});`
      );
    },
    name: 'kitchen-sink-types',
    resolveId(id) {
      return id === moduleId || id.startsWith(`${moduleId}/`)
        ? `\0${id}`
        : undefined;
    },
  };
}
