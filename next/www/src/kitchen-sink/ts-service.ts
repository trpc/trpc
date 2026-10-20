import type ts from 'typescript6';

import type { DemoFile } from './modules.ts';

/** Where a module specifier led when the build compiled the sample. */
export interface Resolution {
  readonly extension: string;
  readonly external: boolean;
  readonly file: string;
  readonly tsExtension: boolean;
}

/**
 * The declarations a demo's code can see, collected at build time from
 * its sample app's program (`build/kitchen-sink-types.ts`): files by a
 * virtual path, and how each of their imports resolved, so the browser
 * needs no `node_modules` layout, symlinks or `package.json`s.
 */
export interface DeclarationBundle {
  readonly files: Readonly<Record<string, string>>;
  /** The sample's parsed `compilerOptions`, its `lib` as file names in `/lib/`. */
  readonly options: ts.CompilerOptions;
  /** Each package a demo can import (`package-names.ts`), resolved from its `src/`. */
  readonly packages: Readonly<Record<string, Resolution>>;
  /** Each bundled file's imports and `/// <reference types>`, by specifier. */
  readonly resolutions: Readonly<
    Record<string, Readonly<Record<string, Resolution | null>>>
  >;
}

/** Where a demo's files are, in the checker's file system. */
export const demoDir = '/src/';

export interface TypeDiagnostic {
  readonly from: number;
  readonly message: string;
  readonly severity: 'error' | 'warning';
  readonly to: number;
}

export interface QuickInfo {
  readonly docs: string;
  readonly from: number;
  readonly text: string;
  readonly to: number;
}

export interface Completions {
  readonly from: number;
  readonly options: ReadonlyArray<{
    readonly boost: number;
    readonly label: string;
    readonly type: string;
  }>;
}

/** A demo's files as TypeScript sees them; edits update it in place. */
export interface TypeService {
  /** Each file's type errors. */
  readonly check: () => Readonly<Record<string, ReadonlyArray<TypeDiagnostic>>>;
  readonly completions: (
    name: string,
    position: number,
  ) => Completions | undefined;
  readonly quickInfo: (name: string, position: number) => QuickInfo | undefined;
  /** Takes the files' current code; unchanged files keep their program. */
  readonly update: (files: ReadonlyArray<DemoFile>) => void;
}

function resolved(resolution: Resolution | null | undefined) {
  return {
    resolvedModule:
      resolution === null || resolution === undefined
        ? undefined
        : {
            extension: resolution.extension,
            isExternalLibraryImport: resolution.external,
            resolvedFileName: resolution.file,
            resolvedUsingTsExtension: resolution.tsExtension,
          },
  };
}

const completionTypes: Readonly<Record<string, string>> = {
  alias: 'variable',
  class: 'class',
  const: 'constant',
  enum: 'enum',
  function: 'function',
  interface: 'interface',
  keyword: 'keyword',
  let: 'variable',
  'local class': 'class',
  'local function': 'function',
  method: 'method',
  module: 'namespace',
  property: 'property',
  type: 'type',
  'type parameter': 'type',
  var: 'variable',
};

/**
 * A language service over `bundle` and a demo's `files`, at
 * `/src/<name>`. A demo file's package import resolves as the build
 * resolved it from the sample, and a relative one (`./schema.ts`) to
 * another demo file; anything else isn't found, as when the demo runs.
 */
export function createTypeService(
  typescript: typeof ts,
  bundle: DeclarationBundle,
  files: ReadonlyArray<DemoFile>,
): TypeService {
  const options = bundle.options;
  const demo = new Map<string, { code: string; version: number }>();
  const path = (name: string) => `${demoDir}${name}`;
  const nameOf = (file: string) =>
    file.startsWith(demoDir) ? file.slice(demoDir.length) : undefined;
  const readFile = (file: string) => {
    const name = nameOf(file);
    return name === undefined ? bundle.files[file] : demo.get(name)?.code;
  };
  const update = (next: ReadonlyArray<DemoFile>) => {
    for (const file of next) {
      const existing = demo.get(file.name);
      if (existing?.code !== file.code) {
        demo.set(file.name, {
          code: file.code,
          version: (existing?.version ?? 0) + 1,
        });
      }
    }
  };
  update(files);

  const fileExists = (file: string) => readFile(file) !== undefined;
  const moduleHost: ts.ModuleResolutionHost = { fileExists, readFile };
  const host: ts.LanguageServiceHost = {
    fileExists,
    readFile,
    getCompilationSettings: () => options,
    getCurrentDirectory: () => demoDir,
    getDefaultLibFileName: (settings) =>
      `/lib/${typescript.getDefaultLibFileName(settings)}`,
    getScriptFileNames: () => Array.from(demo.keys(), path),
    getScriptSnapshot: (file) => {
      const text = readFile(file);
      return text === undefined
        ? undefined
        : typescript.ScriptSnapshot.fromString(text);
    },
    getScriptVersion: (file) => {
      const name = nameOf(file);
      return String(name === undefined ? 0 : (demo.get(name)?.version ?? 0));
    },
    resolveModuleNameLiterals: (literals, containingFile) => {
      if (nameOf(containingFile) === undefined) {
        const table = bundle.resolutions[containingFile] ?? {};
        return literals.map((literal) => resolved(table[literal.text]));
      }
      return literals.map((literal) =>
        literal.text.startsWith('.')
          ? typescript.resolveModuleName(
              literal.text,
              containingFile,
              options,
              moduleHost,
            )
          : resolved(bundle.packages[literal.text]),
      );
    },
    resolveTypeReferenceDirectiveReferences: (references, containingFile) => {
      const table = bundle.resolutions[containingFile] ?? {};
      return references.map((reference) => {
        const resolution =
          table[
            typeof reference === 'string'
              ? reference
              : reference.fileName.toLowerCase()
          ];
        return {
          resolvedTypeReferenceDirective:
            resolution === null || resolution === undefined
              ? undefined
              : {
                  isExternalLibraryImport: resolution.external,
                  primary: false,
                  resolvedFileName: resolution.file,
                },
        };
      });
    },
  };
  const service = typescript.createLanguageService(
    host,
    typescript.createDocumentRegistry(),
  );

  return {
    check: () =>
      Object.fromEntries(
        Array.from(demo.keys(), (name) => [
          name,
          [
            ...service.getSyntacticDiagnostics(path(name)),
            ...service.getSemanticDiagnostics(path(name)),
          ].flatMap((diagnostic): Array<TypeDiagnostic> => {
            const from = diagnostic.start ?? 0;
            const severity =
              diagnostic.category === typescript.DiagnosticCategory.Error
                ? 'error'
                : diagnostic.category === typescript.DiagnosticCategory.Warning
                  ? 'warning'
                  : undefined;
            return severity === undefined
              ? []
              : [
                  {
                    from,
                    message: typescript.flattenDiagnosticMessageText(
                      diagnostic.messageText,
                      '\n',
                    ),
                    severity,
                    to: from + (diagnostic.length ?? 0),
                  },
                ];
          }),
        ]),
      ),
    completions: (name, position) => {
      const found = service.getCompletionsAtPosition(path(name), position, {
        includeCompletionsWithInsertText: true,
      });
      if (!found) {
        return undefined;
      }
      const code = demo.get(name)?.code ?? '';
      let from = position;
      while (from > 0 && /[\w$]/.test(code[from - 1] ?? '')) {
        from -= 1;
      }
      return {
        from,
        options: found.entries.map((entry) => ({
          // TypeScript sorts locals ("11") before globals ("15").
          boost: -Number.parseInt(entry.sortText, 10) || 0,
          label: entry.name,
          type: completionTypes[entry.kind] ?? 'text',
        })),
      };
    },
    quickInfo: (name, position) => {
      const info = service.getQuickInfoAtPosition(path(name), position);
      if (!info) {
        return undefined;
      }
      return {
        docs: [
          typescript.displayPartsToString(info.documentation),
          ...(info.tags ?? []).map(
            (tag) =>
              `@${tag.name} ${typescript.displayPartsToString(tag.text)}`,
          ),
        ]
          .filter((part) => part.trim() !== '')
          .join('\n\n'),
        from: info.textSpan.start,
        text: typescript.displayPartsToString(info.displayParts),
        to: info.textSpan.start + info.textSpan.length,
      };
    },
    update,
  };
}
