import { createTRPCReact } from '@trpc/react-query';
import type { AnyTRPCRouter } from '@trpc/server';

test('createTRPCReact<AnyTRPCRouter>() does not collide with itself', () => {
  const trpc = createTRPCReact<AnyTRPCRouter>();

  // `AnyTRPCRouter` is `Router<any, any>`, whose `keyof` resolves to the bare
  // `string` index signature. `ProtectedIntersection` must not treat that as
  // colliding with every built-in method (`useContext`, `useUtils`, `Provider`,
  // `createClient`, `useQueries`, `useSuspenseQueries`, ...) simultaneously.
  // If it does, `trpc` collapses to a union of `IntersectionError<...>` string
  // literals and none of its built-in methods are accessible below - this
  // block fails to compile on the bug.
  expectTypeOf<typeof trpc.useContext>().toBeFunction();
  expectTypeOf<typeof trpc.useUtils>().toBeFunction();
  expectTypeOf(trpc.Provider).not.toBeAny();
  expectTypeOf(trpc.createClient).toBeFunction();
  expectTypeOf(trpc.useQueries).toBeFunction();
  expectTypeOf(trpc.useSuspenseQueries).toBeFunction();
});
