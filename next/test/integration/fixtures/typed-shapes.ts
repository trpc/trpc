import { Effect } from 'effect';
import { error, initTrpc, lazy } from '@trpc12/trpc/server';
import { openapi } from '@trpc12/trpc/openapi';

const t = initTrpc().concat(openapi());
const get = (path: `/${string}`) => ({
  route: { method: 'GET' as const, path },
});

class Money {
  readonly cents: number;
  constructor(cents: number) {
    this.cents = cents;
  }
  toJSON(): { amount: string; currency: 'EUR' } {
    return { amount: (this.cents / 100).toFixed(2), currency: 'EUR' };
  }
}

export interface Shapes {
  flag: boolean;
  either: true | false | null;
  anything: unknown;
  loose: any;
  nothing: never;
  pair: [string, number, undefined];
  onClick: () => void;
  greet(name: string): string;
  [Symbol.iterator]?: () => Iterator<number>;
  file: Blob;
  upload: File;
  tags: Set<string>;
  lookup: Map<string, number>;
  failure: Error;
  price: Money;
  counts: Record<string, number>;
  mixed: 'a' | 1 | true;
  maybe?: string | undefined;
  voided: string | void;
  gone: undefined;
  big: bigint;
  holes: Array<undefined>;
  when: `v${number}`;
  upper: Uppercase<string>;
  neither: undefined | void;
  sparse: Record<string, undefined>;
}

const shapes = {} as Shapes;

export const shapesRouter = {
  shapes: t.procedure.meta(get('/shapes')).query((): Shapes => shapes),
  empty: t.procedure.meta(get('/empty')).query((): undefined => undefined),
  callable: t.procedure
    .meta(get('/callable'))
    .query((): (() => number) => () => 1),
  failing: t.procedure.meta(get('/failing')).query(() =>
    Effect.gen(function* () {
      if (shapes.flag) return yield* error({ code: 'TOO_MANY_REQUESTS' });
      if (shapes.anything) return yield* error({ code: 'FORBIDDEN' });
      return 'ok' as const;
    }),
  ),
  coded: t.procedure.meta(get('/coded')).query(() =>
    Effect.gen(function* () {
      const code = shapes.flag ? ('CONFLICT' as const) : ('FORBIDDEN' as const);
      if (shapes.anything) return yield* error({ code });
      if (shapes.loose) return yield* error({ code: 'SOMETHING_ODD' });
      return 1;
    }),
  ),
  later: lazy(async () => ({
    default: {
      inner: t.procedure.meta(get('/later')).query((): number => 1),
    },
  })),
};
