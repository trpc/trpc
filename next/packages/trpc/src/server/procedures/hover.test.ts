import { API, TypeFormatFlags } from 'typescript/sync';
import type {
  MutationProcedure,
  QueryProcedure,
  SubscriptionProcedure,
  TrackedEnvelope,
  TrpcError,
} from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import type { appRouter, Db, Post } from './fixtures/hover-router.ts';

const file = new URL('./fixtures/hover-router.ts', import.meta.url).pathname;

/** Each procedure's type as an editor's hover prints it. */
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
    return Object.fromEntries(
      checker
        .getPropertiesOfType(checker.getTypeOfSymbol(router)!)
        .map((prop) => [
          prop.name,
          checker.typeToString(
            checker.getTypeOfSymbol(prop)!,
            undefined,
            TypeFormatFlags.NoTruncation,
          ),
        ]),
    );
  } finally {
    api.close();
  }
};

test('a built procedure carries only what clients and its handler read', () => {
  expect(hovers()).toEqual({
    byId: 'QueryProcedure<{ input: { id: string; }; output: Post; errors: SchemaValidationError<ZodObject<{ id: ZodString; }, $strip>> | TrpcError<"NOT_FOUND", { id: string; }, "NotFound">; ctx: { userId: string | null; }; }>',
    health:
      'QueryProcedure<{ input: undefined; output: "ok"; errors: never; }>',
    fromDb:
      'QueryProcedure<{ input: undefined; output: Post | null; errors: never; ctx: { userId: string | null; }; services: Db; }>',
    validated:
      'QueryProcedure<{ input: undefined; output: { id: string; title: string; }; errors: TrpcError<"GONE", undefined, "GONE">; ctx: { userId: string | null; }; outputValidated: true; declared: "GONE"; }>',
    onPost:
      'SubscriptionProcedure<{ input: undefined; output: TrackedEnvelope<{ id: string; title: string; }>; errors: never; }>',
    publish:
      'MutationProcedure<{ input: { id: string; }; output: { id: string; title: string; }; errors: SchemaValidationError<ZodObject<{ id: ZodString; }, $strip>> | TrpcError<"NOT_FOUND", undefined, "NotFound">; ctx: { userId: string | null; }; outputValidated: true; declared: "NOT_FOUND"; }>',
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
      ctx: { userId: string | null };
      services: Db;
    }>
  >();
  expectTypeOf<Router['validated']>().toEqualTypeOf<
    QueryProcedure<{
      input: undefined;
      output: { id: string; title: string };
      errors: TrpcError<'GONE', undefined, 'GONE'>;
      ctx: { userId: string | null };
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
  expectTypeOf<Router['publish']>().toExtend<
    MutationProcedure<{
      input: { id: string };
      output: { id: string; title: string };
      errors: any;
      ctx: { userId: string | null };
      outputValidated: true;
      declared: 'NOT_FOUND';
    }>
  >();
});
