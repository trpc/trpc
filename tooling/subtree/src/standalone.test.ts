import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Path, type Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  expandBraces,
  importSpecifiers,
  isIgnored,
  packageName,
  parseCatalogs,
  resolveExport,
  rewriteFile,
  sourcePaths,
  standalonePackageJson,
  writeStandalone,
} from './standalone.ts';

const catalogs = parseCatalogs(`
packages:
  - 'examples/*'
catalog:
  typescript: ^5.9.2
catalogs:
  www:
    react: 19.3.0
    tailwindcss: 4.3.3
`);

const run = <TValue, TError>(
  effect: Effect.Effect<
    TValue,
    TError,
    FileSystem.FileSystem | Path.Path | Scope.Scope
  >,
) =>
  Effect.runPromise(
    effect.pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

describe('isIgnored', () => {
  it('skips dependencies, build output and test results', () => {
    expect(isIgnored('client/node_modules/react/index.js', '/')).toBe(true);
    expect(isIgnored('.next/cache', '/')).toBe(true);
    expect(isIgnored('test-results/trace.zip', '/')).toBe(true);
    expect(isIgnored('tsconfig.tsbuildinfo', '/')).toBe(true);
    expect(isIgnored('src/pages/index.tsx', '/')).toBe(false);
  });
});

describe('standalonePackageJson', () => {
  it('installs @trpc/* from canary and catalog versions from the catalog', () => {
    const pkg = standalonePackageJson(
      {
        name: 'examples-minimal-react-client',
        dependencies: {
          '@shared/ui': 'workspace:*',
          '@trpc/client': 'npm:@trpc/client',
          '@trpc/server': 'workspace:*',
          react: 'catalog:www',
        },
        devDependencies: { typescript: 'catalog:', vite: '^8.3.0' },
      },
      catalogs,
    );
    expect(pkg).toEqual({
      name: 'examples-minimal-react-client',
      dependencies: {
        '@trpc/client': 'canary',
        '@trpc/server': 'canary',
        react: '19.3.0',
      },
      devDependencies: { typescript: '^5.9.2', vite: '^8.3.0' },
    });
  });

  it('adds the dependencies of the copied files it lacks, sorted', () => {
    const pkg = standalonePackageJson(
      {
        dependencies: { react: '^19.1.0', zod: '^4.0.0' },
        devDependencies: { tailwindcss: '^4.0.0' },
      },
      catalogs,
      new Map([
        ['cn', '0.4.0'],
        ['react', 'catalog:www'],
        ['tailwindcss', 'catalog:www'],
      ]),
    );
    expect(pkg.dependencies).toEqual({
      cn: '0.4.0',
      react: '^19.1.0',
      zod: '^4.0.0',
    });
    expect(pkg.devDependencies).toEqual({ tailwindcss: '^4.0.0' });
  });

  it("fails on what doesn't resolve outside the monorepo", () => {
    expect(() =>
      standalonePackageJson(
        { dependencies: { '@x/y': 'workspace:*' } },
        catalogs,
      ),
    ).toThrow('@x/y@workspace:* only resolves in the monorepo');
    expect(() =>
      standalonePackageJson({ dependencies: { vue: 'catalog:www' } }, catalogs),
    ).toThrow('vue@catalog:www: not in the www catalog');
  });
});

describe('resolveExport', () => {
  const exports = {
    './theme.css': './src/styles/theme.css',
    './components/*': './src/components/*.tsx',
  };

  it('resolves exact and pattern exports', () => {
    expect(resolveExport(exports, './theme.css')).toBe(
      './src/styles/theme.css',
    );
    expect(resolveExport(exports, './components/card')).toBe(
      './src/components/card.tsx',
    );
    expect(resolveExport(exports, './hooks/use-mobile')).toBeUndefined();
  });
});

describe('expandBraces', () => {
  it('expands each group', () => {
    expect(expandBraces('src/components/{alert,card}.tsx')).toEqual([
      'src/components/alert.tsx',
      'src/components/card.tsx',
    ]);
    expect(expandBraces('{a,b}/{c,d}')).toEqual(['a/c', 'a/d', 'b/c', 'b/d']);
    expect(expandBraces('plain.tsx')).toEqual(['plain.tsx']);
  });
});

describe('packageName', () => {
  it('keeps the scope', () => {
    expect(packageName('@base-ui/react/button')).toBe('@base-ui/react');
    expect(packageName('shadcn/tailwind.css')).toBe('shadcn');
    expect(packageName('cn')).toBe('cn');
  });
});

describe('importSpecifiers', () => {
  it('finds static, side-effect and dynamic imports and re-exports', () => {
    const source = [
      "import * as React from 'react';",
      "import { type VariantProps, cva } from 'class-variance-authority';",
      "import './styles.css';",
      "export { cn } from 'cn';",
      "const lazy = import('./lazy');",
    ].join('\n');
    expect(importSpecifiers(source, 'script')).toEqual([
      'react',
      'class-variance-authority',
      './styles.css',
      'cn',
      './lazy',
    ]);
  });

  it('finds CSS imports, but not the ones in comments', () => {
    const css = [
      "/* @import '@shared/ui/theme.css'; */",
      "@import 'tailwindcss';",
      '@import "./theme.css";',
    ].join('\n');
    expect(importSpecifiers(css, 'css')).toEqual([
      'tailwindcss',
      './theme.css',
    ]);
  });
});

describe('rewriteFile', () => {
  it('replaces imports and @sources, keeping quotes and comments', () => {
    const css = [
      "/* @import '@shared/ui/theme.css'; */",
      "@import 'tailwindcss';",
      "@import '@shared/ui/theme.css';",
      "@source '../../../tooling/ui/src/components/{alert,card}.tsx';",
    ].join('\n');
    expect(sourcePaths(css)).toEqual([
      '../../../tooling/ui/src/components/{alert,card}.tsx',
    ]);
    const rewritten = rewriteFile(css, 'css', {
      imports: (specifier) =>
        specifier === '@shared/ui/theme.css'
          ? './shared-ui/styles/theme.css'
          : undefined,
      sources: () => './shared-ui/components/{alert,card}.tsx',
    });
    expect(rewritten).toBe(
      [
        "/* @import '@shared/ui/theme.css'; */",
        "@import 'tailwindcss';",
        "@import './shared-ui/styles/theme.css';",
        "@source './shared-ui/components/{alert,card}.tsx';",
      ].join('\n'),
    );
  });
});

describe('writeStandalone', () => {
  const write = Effect.fn(function* (
    dir: string,
    files: Record<string, string>,
  ) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    for (const [file, contents] of Object.entries(files)) {
      yield* fs.makeDirectory(path.dirname(path.join(dir, file)), {
        recursive: true,
      });
      yield* fs.writeFileString(path.join(dir, file), contents);
    }
  });

  const monorepo = {
    'pnpm-workspace.yaml': [
      'packages:',
      "  - 'examples/*/*'",
      'catalogs:',
      '  www:',
      '    class-variance-authority: 0.7.1',
      '    react: 19.3.0',
      '    tailwindcss: 4.3.3',
      '',
    ].join('\n'),
    'tooling/ui/package.json': JSON.stringify({
      name: '@shared/ui',
      exports: {
        './theme.css': './src/styles/theme.css',
        './components/*': './src/components/*.tsx',
        './lib/*': './src/lib/*.ts',
      },
      dependencies: {
        '@base-ui/react': '1.9.0',
        'class-variance-authority': 'catalog:www',
        cn: '0.4.0',
        recharts: '3.8.0',
        'tw-animate-css': '1.4.0',
      },
      devDependencies: { tailwindcss: 'catalog:www' },
      peerDependencies: { react: '^19.2.0' },
    }),
    'tooling/ui/src/styles/theme.css': [
      '/* @import "@shared/ui/theme.css"; in the app */',
      "@import 'tw-animate-css';",
      '',
    ].join('\n'),
    'tooling/ui/src/components/button.tsx': [
      "import { Button as ButtonPrimitive } from '@base-ui/react/button';",
      "import { cva } from 'class-variance-authority';",
      "import { cn } from '@shared/ui/lib/utils';",
      '',
    ].join('\n'),
    'tooling/ui/src/components/dialog.tsx': [
      "import * as React from 'react';",
      "import { Button } from '@shared/ui/components/button';",
      '',
    ].join('\n'),
    'tooling/ui/src/components/card.tsx': "import { cn } from 'cn';\n",
    'tooling/ui/src/components/chart.tsx': "import 'recharts';\n",
    'tooling/ui/src/lib/utils.ts': "export { cn } from 'cn';\n",
    'examples/app/package.json': JSON.stringify({ name: 'app', private: true }),
    'examples/app/client/package.json': JSON.stringify({
      name: 'app-client',
      dependencies: {
        '@shared/ui': 'workspace:*',
        '@trpc/client': 'workspace:*',
        react: 'catalog:www',
      },
      devDependencies: { tailwindcss: 'catalog:www' },
    }),
    'examples/app/client/src/styles.css': [
      "@import 'tailwindcss';",
      "@import '@shared/ui/theme.css';",
      "@source '../../../../tooling/ui/src/components/{card,dialog}.tsx';",
      '',
    ].join('\n'),
    'examples/app/client/src/App.tsx': [
      "import { Card } from '@shared/ui/components/card';",
      "import { Dialog } from '@shared/ui/components/dialog';",
      "import './styles.css';",
      '',
    ].join('\n'),
    'examples/app/client/node_modules/ignored.js': '',
  };

  it('copies the shared UI files the app uses and points it at them', () =>
    run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        yield* write(root, monorepo);
        const out = path.join(root, 'out');
        yield* writeStandalone({
          example: path.join(root, 'examples/app'),
          out,
          root,
        });

        const read = (file: string) => fs.readFileString(path.join(out, file));
        const files = (yield* fs.readDirectory(out, { recursive: true }))
          .filter((file) => file.includes('.'))
          .sort();
        expect(files).toEqual([
          'client/package.json',
          'client/src/App.tsx',
          'client/src/shared-ui/components/button.tsx',
          'client/src/shared-ui/components/card.tsx',
          'client/src/shared-ui/components/dialog.tsx',
          'client/src/shared-ui/lib/utils.ts',
          'client/src/shared-ui/styles/theme.css',
          'client/src/styles.css',
          'package.json',
        ]);
        expect(JSON.parse(yield* read('client/package.json'))).toEqual({
          name: 'app-client',
          dependencies: {
            '@base-ui/react': '1.9.0',
            '@trpc/client': 'canary',
            'class-variance-authority': '0.7.1',
            cn: '0.4.0',
            react: '19.3.0',
            'tw-animate-css': '1.4.0',
          },
          devDependencies: { tailwindcss: '4.3.3' },
        });
        expect(yield* read('client/src/App.tsx')).toBe(
          [
            "import { Card } from './shared-ui/components/card';",
            "import { Dialog } from './shared-ui/components/dialog';",
            "import './styles.css';",
            '',
          ].join('\n'),
        );
        expect(yield* read('client/src/styles.css')).toBe(
          [
            "@import 'tailwindcss';",
            "@import './shared-ui/styles/theme.css';",
            "@source './shared-ui/components/{card,dialog}.tsx';",
            '',
          ].join('\n'),
        );
        expect(yield* read('client/src/shared-ui/components/dialog.tsx')).toBe(
          [
            "import * as React from 'react';",
            "import { Button } from './button';",
            '',
          ].join('\n'),
        );
        expect(
          yield* read('client/src/shared-ui/components/button.tsx'),
        ).toContain("import { cn } from '../lib/utils';");
      }),
    ));

  it('fails on an @source glob, since it would copy every component', () =>
    run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        yield* write(root, {
          ...monorepo,
          'examples/app/client/src/styles.css':
            "@source '../../../../tooling/ui/src/components/*.tsx';\n",
        });
        const error = yield* writeStandalone({
          example: path.join(root, 'examples/app'),
          out: path.join(root, 'out'),
          root,
        }).pipe(Effect.flip);
        expect(error.message).toContain('must list the @shared/ui files');
      }),
    ));
});
