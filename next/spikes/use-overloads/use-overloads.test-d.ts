import { describe, expectTypeOf, test } from 'vite-plus/test';
import { auditPlugin, tracedPlugin, type AuditDb } from './audit-plugin.ts';
import { initTrpc, schema, type inferInput } from './core.ts';

interface User {
  id: string;
  name: string;
}
interface Db extends AuditDb {
  posts: { list(): Promise<string[]> };
}

const t = initTrpc<{
  ctx: { db: Db; user: User | null };
  meta: { audit?: boolean; scope?: string };
}>();
const authed = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) throw new Error('UNAUTHORIZED');
  return next({ ctx: { user: ctx.user } });
});

describe('one .use() for middleware and plugins', () => {
  test('an inline middleware is still contextually typed', () => {
    t.procedure.use(async ({ ctx, meta, next }) => {
      expectTypeOf(ctx.user).toEqualTypeOf<User | null>();
      expectTypeOf(meta.scope).toEqualTypeOf<string | undefined>();
      return next();
    });
  });

  test('a plugin adds its ctx once its requirements are met', () => {
    authed.use(auditPlugin).query(({ ctx }) => {
      expectTypeOf(ctx.auditedBy).toEqualTypeOf<string>();
      expectTypeOf(ctx.user).toEqualTypeOf<User>();
      return null;
    });
  });

  test('a plugin missing ctx is still an error', () => {
    // @ts-expect-error: No overload matches this call (the last overload's TypeError names "user")
    t.procedure.use(auditPlugin);
  });

  test('plugin inputs merge, and middleware after a plugin sees its ctx', () => {
    const procedure = authed
      .input(schema<{ postId: string }>())
      .use(tracedPlugin)
      .use(async ({ ctx, input, next }) => {
        expectTypeOf(ctx.requestId).toEqualTypeOf<string>();
        expectTypeOf(input).toEqualTypeOf<{
          postId: string;
          requestId: string;
        }>();
        return next();
      })
      .query(() => null);
    expectTypeOf<inferInput<typeof procedure>>().toEqualTypeOf<{
      postId: string;
      requestId: string;
    }>();
  });
});

describe('t.use() for extensions', () => {
  const openapi = initTrpc<{
    meta: { route?: { path?: `/${string}` } };
  }>().procedure;

  test("an extension's meta keys and ctx join the root", () => {
    const app = initTrpc<{ ctx: { db: Db; user: User } }>()
      .use(openapi)
      .use(auditPlugin);
    app.procedure
      .meta({ route: { path: '/x' }, audit: true })
      .query(({ ctx }) => {
        expectTypeOf(ctx.auditedBy).toEqualTypeOf<string>();
        return null;
      });
  });

  test('root middleware is the same overload', () => {
    const app = initTrpc<{ ctx: { user: User | null } }>().use(
      async ({ ctx, next }) => next({ ctx: { signedIn: ctx.user !== null } }),
    );
    app.procedure.query(({ ctx }) => {
      expectTypeOf(ctx.signedIn).toEqualTypeOf<boolean>();
      return null;
    });
  });

  test('an extension needing ctx the root lacks is an error', () => {
    // @ts-expect-error: No overload matches this call
    initTrpc<{ ctx: { user: User } }>().use(auditPlugin);
  });
});
