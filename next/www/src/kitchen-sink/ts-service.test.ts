import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import ts from 'typescript6';

import { declarationBundle } from '../../build/kitchen-sink-types.ts';
import { samplesDir } from '../../build/paths.ts';
import forms from './forms.ts';
import type { DemoFile } from './modules.ts';
import { packageNames } from './package-names.ts';
import { packages } from './packages.ts';
import { createTypeService } from './ts-service.ts';

// Compiling every package a demo can import takes a couple of seconds, so
// the tests share one bundle.
const bundle = await Effect.runPromise(
  declarationBundle({
    packages: packageNames,
    sampleDir: `${samplesDir}/kitchen-sink-forms`,
  }),
);

function edited(name: string, edit: (code: string) => string) {
  return forms.files.map((file) =>
    file.name === name ? { ...file, code: edit(file.code) } : file,
  );
}

function errorFiles(checked: Readonly<Record<string, ReadonlyArray<unknown>>>) {
  return Object.entries(checked)
    .filter(([, diagnostics]) => diagnostics.length > 0)
    .map(([name]) => name)
    .toSorted();
}

function codeOf(files: ReadonlyArray<DemoFile>, name: string) {
  return files.find((file) => file.name === name)?.code ?? '';
}

describe('the declaration bundle', () => {
  it('has a declaration for each package the kitchen sink loads', () => {
    expect(packageNames.toSorted()).toEqual(Object.keys(packages).toSorted());
    expect(Object.keys(bundle.packages).toSorted()).toEqual(
      packageNames.toSorted(),
    );
  });

  it("drops third-party declarations' comments and keeps the workspace's", () => {
    const paths = Object.keys(bundle.files);
    const effect = paths.filter((path) =>
      path.startsWith('/node_modules/effect/'),
    );
    const trpc = paths.filter((path) => path.startsWith('/packages/trpc/src/'));
    expect(effect.length).toBeGreaterThan(0);
    expect(trpc.length).toBeGreaterThan(0);
    expect(effect.some((path) => bundle.files[path]?.includes('/**'))).toBe(
      false,
    );
    expect(trpc.some((path) => bundle.files[path]?.includes('/**'))).toBe(true);
    expect(paths).toContain('/lib/lib.dom.d.ts');
  });
});

describe('createTypeService', () => {
  it('checks the forms demo without errors', () => {
    const service = createTypeService(ts, bundle, forms.files);
    expect(errorFiles(service.check())).toEqual([]);
  });

  it("turns the client's files red when the schema renames a field", () => {
    const service = createTypeService(ts, bundle, forms.files);
    service.update(
      edited('schema.ts', (code) =>
        code.replace('    name: z', '    fullName: z'),
      ),
    );
    expect(errorFiles(service.check())).toEqual([
      'edit-profile.tsx',
      'routes.tsx',
      'server.ts',
    ]);
    service.update(forms.files);
    expect(errorFiles(service.check())).toEqual([]);
  });

  it("doesn't find a package the kitchen sink doesn't have", () => {
    const service = createTypeService(ts, bundle, [
      { code: "import leftPad from 'left-pad';\nleftPad;", name: 'a.ts' },
    ]);
    expect(service.check()['a.ts']?.map((each) => each.message)).toEqual([
      "Cannot find module 'left-pad' or its corresponding type declarations.",
    ]);
  });

  it("shows a procedure's type on hover, and completes the router's paths", () => {
    const service = createTypeService(ts, bundle, forms.files);
    const routes = codeOf(forms.files, 'routes.tsx');
    const procedure = routes.indexOf('profile.get') + 'profile.'.length;
    expect(service.quickInfo('routes.tsx', procedure)?.text).toContain('get');
    const after = routes.indexOf('trpc.profile') + 'trpc.'.length;
    expect(
      service
        .completions('routes.tsx', after)
        ?.options.map((option) => option.label),
    ).toContain('profile');
  });
});
