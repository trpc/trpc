/**
 * The kitchen sink's type checker, in a worker named after the demo's
 * sample: TypeScript 6 and the sample's declarations load with the first
 * request, then each request brings the demo's files as edited.
 */
import type { DemoFile } from './modules.ts';
import {
  type Completions,
  createTypeService,
  type QuickInfo,
  type TypeDiagnostic,
  type TypeService,
} from './ts-service.ts';

export type TypeRequest =
  | {
      readonly files: ReadonlyArray<DemoFile>;
      readonly id: number;
      readonly type: 'check';
    }
  | {
      readonly files: ReadonlyArray<DemoFile>;
      readonly id: number;
      readonly name: string;
      readonly position: number;
      readonly type: 'completions' | 'quickInfo';
    };

export interface TypeResults {
  readonly check: Readonly<Record<string, ReadonlyArray<TypeDiagnostic>>>;
  readonly completions: Completions | undefined;
  readonly quickInfo: QuickInfo | undefined;
}

export type TypeResponse =
  | { readonly error: string; readonly id: number }
  | {
      readonly id: number;
      readonly result: TypeResults[keyof TypeResults];
    };

// SAFETY: this module runs only as a dedicated worker, whose global scope
// the site's DOM lib doesn't describe.
const scope = globalThis as unknown as {
  readonly name: string;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<TypeRequest>) => void,
  ): void;
  postMessage(message: TypeResponse): void;
};

let service: Promise<TypeService> | undefined;

function serviceFor(files: ReadonlyArray<DemoFile>) {
  service ??= Promise.all([
    import('typescript6'),
    import('virtual:kitchen-sink-types').then(async (bundles) => {
      const load = bundles.default[scope.name];
      if (!load) {
        throw new Error(`No declarations for the sample ${scope.name}`);
      }
      return (await load()).default;
    }),
  ]).then(([typescript, bundle]) =>
    createTypeService(typescript.default, bundle, files),
  );
  return service;
}

scope.addEventListener('message', (event) => {
  const request = event.data;
  serviceFor(request.files)
    .then((ready) => {
      ready.update(request.files);
      return request.type === 'check'
        ? ready.check()
        : ready[request.type](request.name, request.position);
    })
    .then(
      (result) => scope.postMessage({ id: request.id, result }),
      (cause: unknown) =>
        scope.postMessage({
          error: cause instanceof Error ? cause.message : String(cause),
          id: request.id,
        }),
    );
});
