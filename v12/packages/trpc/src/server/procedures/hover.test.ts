import { API, TypeFormatFlags } from 'typescript/sync';
import type {
  inferRouterContext,
  MutationProcedure,
  QueryProcedure,
  SubscriptionProcedure,
  TrackedEnvelope,
  TrpcError,
} from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import type { appRouter, Db, Post } from './fixtures/hover-router.ts';

const file = new URL('./fixtures/hover-router.ts', import.meta.url).pathname;

/** The router's type and each procedure's, as an editor's hover prints them. */
const hovers = (): Record<string, string> => {
  const api = new API({ cwd: new URL('../../..', import.meta.url).pathname });
  try {
    const project = api
      .createSnapshot({ openFiles: [file] })
      .getDefaultProjectForFile(file)!;
    const checker = project.checker;
    const source = project.program.getSourceFile(file)!;
    const router = checker
      .getExportsOfModule(checker.getSymbolAtLocation(source)!)
      .find((symbol) => symbol.name === 'appRouter')!;
    const print = (type: Parameters<typeof checker.typeToString>[0]) =>
      checker.typeToString(type, undefined, TypeFormatFlags.NoTruncation);
    const type = checker.getTypeOfSymbol(router)!;
    return {
      router: print(type).replace(/^\{.*\} & /, '{ … } & '),
      ...Object.fromEntries(
        checker
          .getPropertiesOfType(type)
          .filter((prop) => !prop.name.startsWith('__@'))
          .map((prop) => [prop.name, print(checker.getTypeOfSymbol(prop)!)]),
      ),
    };
  } finally {
    api.close();
  }
};

test('a built procedure carries only what clients and its handler read; its router, the root ctx', () => {
  expect(hovers()).toEqual({
    router: '{ … } & RouterCtx<{ userId: string | null; }>',
    byId: 'QueryProcedure<{ input: { id: string; }; output: Post; errors: SchemaValidationError<ZodObject<{ id: ZodString; }, $strip>> | TrpcError<"NOT_FOUND", { id: string; }, "NotFound">; }>',
    health:
      'QueryProcedure<{ input: undefined; output: "ok"; errors: never; }>',
    fromDb:
      'QueryProcedure<{ input: undefined; output: Post | null; errors: never; services: Db; }>',
    validated:
      'QueryProcedure<{ input: undefined; output: { id: string; title: string; }; errors: TrpcError<"GONE", undefined, "GONE">; outputValidated: true; declared: "GONE"; }>',
    onPost:
      'SubscriptionProcedure<{ input: undefined; output: TrackedEnvelope<{ id: string; title: string; }>; errors: never; }>',
    publish:
      'MutationProcedure<{ input: { id: string; }; output: { id: string; title: string; }; errors: SchemaValidationError<ZodObject<{ id: ZodString; }, $strip>> | TrpcError<"NOT_FOUND", undefined, "NotFound">; outputValidated: true; declared: "NOT_FOUND"; }>',
    tenant:
      'QueryProcedure<{ input: undefined; output: string; errors: never; ctx: { tenant: string; }; }>',
  });
});

test('the procedure types have exactly those fields', () => {
  type Router = typeof appRouter;
  expectTypeOf<Router['health']>().toEqualTypeOf<
    QueryProcedure<{ input: undefined; output: 'ok'; errors: never }>
  >();
  expectTypeOf<Router['fromDb']>().toEqualTypeOf<
    QueryProcedure<{
      input: undefined;
      output: Post | null;
      errors: never;
      services: Db;
    }>
  >();
  expectTypeOf<Router['validated']>().toEqualTypeOf<
    QueryProcedure<{
      input: undefined;
      output: { id: string; title: string };
      errors: TrpcError<'GONE', undefined, 'GONE'>;
      outputValidated: true;
      declared: 'GONE';
    }>
  >();
  expectTypeOf<Router['onPost']>().toEqualTypeOf<
    SubscriptionProcedure<{
      input: undefined;
      output: TrackedEnvelope<Post>;
      errors: never;
    }>
  >();
  expectTypeOf<Router['tenant']>().toEqualTypeOf<
    QueryProcedure<{
      input: undefined;
      output: string;
      errors: never;
      ctx: { tenant: string };
    }>
  >();
  expectTypeOf<inferRouterContext<Router>>().toEqualTypeOf<{
    userId: string | null;
    tenant: string;
  }>();
  expectTypeOf<Router['publish']>().toExtend<
    MutationProcedure<{
      input: { id: string };
      output: { id: string; title: string };
      errors: any;
      outputValidated: true;
      declared: 'NOT_FOUND';
    }>
  >();
});
