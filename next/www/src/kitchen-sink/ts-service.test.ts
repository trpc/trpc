import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import ts from 'typescript6';

import { sampleBundles } from '../../build/kitchen-sink-types.ts';
import type { DemoDefinition } from './define.ts';
import { type DemoId, demos } from './demos.ts';
import files from './files.ts';
import forms from './forms.ts';
import type { DemoFile } from './modules.ts';
import optimistic from './optimistic.ts';
import { packageNames } from './package-names.ts';
import { packages } from './packages.ts';
import realtime from './realtime.ts';
import { createTypeService, type DeclarationBundle } from './ts-service.ts';

const definitions: Record<DemoId, DemoDefinition> = {
  files,
  forms,
  optimistic,
  realtime,
};

// Compiling every package a demo can import takes a couple of seconds a
// sample, so the tests share the samples' bundles.
const bundles = await Effect.runPromise(
  sampleBundles(Object.values(demos).map((demo) => demo.sample)),
);

function bundleOf(id: DemoId): DeclarationBundle {
  return JSON.parse(bundles.get(demos[id].sample)?.json ?? 'null');
}

const bundle = bundleOf('forms');

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

  it('is one module for every sample, whose options and packages are the same', () => {
    expect(
      new Set(Array.from(bundles.values(), (each) => each.module)).size,
    ).toBe(1);
  });
});

describe('createTypeService', () => {
  it.each(Object.keys(demos) as Array<DemoId>)(
    'checks the %s demo without errors',
    (id) => {
      const service = createTypeService(
        ts,
        bundleOf(id),
        definitions[id].files,
      );
      expect(errorFiles(service.check())).toEqual([]);
    },
  );

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
