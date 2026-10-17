import { describe, expectTypeOf, test } from 'vite-plus/test';
import { auditPlugin, type AuditDb, tracedPlugin } from './audit-plugin.ts';
import { initTrpc, type inferInput, schema } from './core.ts';

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

describe('a plugin from another package', () => {
  test('adds its ctx once its requirements are met', () => {
    authed.concat(auditPlugin).query(({ ctx }) => {
      expectTypeOf(ctx.auditedBy).toEqualTypeOf<string>();
      expectTypeOf(ctx.user).toEqualTypeOf<User>();
      expectTypeOf(ctx.db).toEqualTypeOf<Db>();
      return null;
    });
  });

  test('requirements are checked against the current ctx, not the root', () => {
    // the root has `user: User | null`; `authed` narrowed it to `User`
    // @ts-expect-error: concat: the plugin needs ctx this procedure does not have ("user")
    t.procedure.concat(auditPlugin);
    authed.concat(auditPlugin);
  });

  test('a missing ctx key is named', () => {
    const noDb = initTrpc<{ ctx: { user: User }; meta: { audit?: boolean } }>();
    // @ts-expect-error: concat: the plugin needs ctx this procedure does not have ("db")
    noDb.procedure.concat(auditPlugin);
  });

  test('meta requirements are checked too', () => {
    const wrongMeta = initTrpc<{
      ctx: { db: Db; user: User };
      meta: { audit?: 'yes' | 'no' };
    }>();
    // @ts-expect-error: concat: the plugin needs meta this procedure does not declare ("audit")
    wrongMeta.procedure.concat(auditPlugin);

    // an app without the optional key is fine: the plugin only reads it
    const noMeta = initTrpc<{ ctx: { db: Db; user: User } }>();
    noMeta.procedure.concat(auditPlugin);
  });

  test('plugin inputs merge with the procedure inputs (05 C-A)', () => {
    const procedure = authed
      .input(schema<{ postId: string }>())
      .concat(tracedPlugin)
      .query(({ ctx, input }) => {
        expectTypeOf(ctx.requestId).toEqualTypeOf<string>();
        expectTypeOf(input).toEqualTypeOf<{
          postId: string;
          requestId: string;
        }>();
        return null;
      });
    expectTypeOf<inferInput<typeof procedure>>().toEqualTypeOf<{
      postId: string;
      requestId: string;
    }>();
  });

  test('plugins compose, and later middleware sees their ctx', () => {
    authed
      .concat(auditPlugin)
      .concat(tracedPlugin)
      .use(async ({ ctx, next }) => {
        expectTypeOf(ctx.auditedBy).toEqualTypeOf<string>();
        expectTypeOf(ctx.requestId).toEqualTypeOf<string>();
        return next();
      })
      .query(() => null);
  });

  test("the plugin's ctx overrides keys of the same name", () => {
    const shadow = initTrpc().procedure.use(async ({ next }) =>
      next({ ctx: { user: { id: 'system' } } }),
    );
    authed.concat(shadow).query(({ ctx }) => {
      expectTypeOf(ctx.user).toEqualTypeOf<{ id: string }>();
      return null;
    });
  });
});
