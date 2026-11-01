import { transform } from 'sucrase';

/** A file of a demo, by its name in the editor: `server.ts`. */
export interface DemoFile {
  readonly code: string;
  readonly name: string;
}

/** The packages a demo can import, each loaded on first use. */
export type Packages = Readonly<Record<string, () => Promise<object>>>;

/** A demo's file that doesn't compile, or failed while it ran. */
export class DemoModuleError extends Error {
  readonly file: string | undefined;
  readonly line: number | undefined;

  constructor(opts: {
    readonly cause?: unknown;
    readonly file?: string | undefined;
    readonly line?: number | undefined;
    readonly message: string;
  }) {
    super(opts.message, { cause: opts.cause });
    this.name = 'DemoModuleError';
    this.file = opts.file;
    this.line = opts.line;
  }
}

type Exports = Record<string, unknown>;

const requireCall = /\brequire\((['"])([^'"]+)\1\)/g;

/** A file's name from an import in another: `./schema.ts` from anywhere. */
function localName(specifier: string) {
  return specifier.startsWith('./') ? specifier.slice(2) : undefined;
}

function compile(file: DemoFile) {
  try {
    return transform(file.code, {
      filePath: file.name,
      jsxRuntime: 'automatic',
      production: true,
      transforms: ['typescript', 'jsx', 'imports'],
    }).code;
  } catch (cause) {
    // Sucrase's syntax errors end with `(line:column)`.
    const at = /\((\d+):\d+\)$/.exec(String(cause));
    throw new DemoModuleError({
      cause,
      file: file.name,
      line: at ? Number(at[1]) : undefined,
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

/**
 * Compiles a demo's files the way a bundler would, and returns a function
 * that runs one and returns its exports: each file's TypeScript and JSX
 * become CommonJS, imports between the files resolve by name
 * (`./schema.ts`), and other imports are `packages`, loaded first. The code
 * runs in this page, so it shares React and the router with the site. A
 * file runs once per call, so every call starts the modules over, a
 * server's in-memory database too.
 */
export async function loadModules(opts: {
  readonly files: ReadonlyArray<DemoFile>;
  readonly packages: Packages;
}): Promise<(name: string) => Exports> {
  const byName = new Map(opts.files.map((file) => [file.name, file]));
  const compiled = new Map(
    opts.files.map((file) => [file.name, compile(file)]),
  );
  const packages = new Map<string, () => Promise<object>>();
  for (const [name, code] of compiled) {
    for (const match of code.matchAll(requireCall)) {
      const specifier = match[2] ?? '';
      const local = localName(specifier);
      const load = opts.packages[specifier];
      if (local !== undefined ? byName.has(local) : load !== undefined) {
        if (load) {
          packages.set(specifier, load);
        }
        continue;
      }
      throw new DemoModuleError({
        file: name,
        message:
          local === undefined
            ? `${name} imports ${specifier}, which the kitchen sink doesn't have. It has ${Object.keys(opts.packages).join(', ')}.`
            : `${name} imports ${specifier}, which isn't one of the demo's files.`,
      });
    }
  }
  const loaded = new Map(
    await Promise.all(
      Array.from(
        packages,
        async ([specifier, load]) => [specifier, await load()] as const,
      ),
    ),
  );
  const modules = new Map<string, { exports: Exports }>();
  const load = (name: string): Exports => {
    const existing = modules.get(name);
    if (existing) {
      return existing.exports;
    }
    const module: { exports: Exports } = { exports: {} };
    modules.set(name, module);
    const require = (specifier: string) => {
      const local = localName(specifier);
      if (local !== undefined) {
        return load(local);
      }
      // A namespace has no `__esModule`, which Sucrase's interop reads to
      // tell its `default` export from a CommonJS `module.exports`.
      return { __esModule: true, ...loaded.get(specifier) };
    };
    try {
      // SAFETY: the demo's own code, as the reader edited it in their browser.
      new Function(
        'exports',
        'require',
        'module',
        `${compiled.get(name)}\n//# sourceURL=kitchen-sink/${name}`,
      )(module.exports, require, module);
    } catch (cause) {
      if (cause instanceof DemoModuleError) {
        throw cause;
      }
      throw new DemoModuleError({
        cause,
        file: name,
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
    return module.exports;
  };
  return (name) => {
    if (!byName.has(name)) {
      throw new DemoModuleError({ message: `The demo has no ${name}` });
    }
    return load(name);
  };
}
