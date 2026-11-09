/**
 * A tenancy extension, written the way a package would publish it. It needs
 * a session token and a tenant slug from the app's ctx, and a `Directory`
 * service from the app's layer to look them up. Every procedure of an app
 * that adds it with `t.concat(tenancy())` then has the caller's user,
 * tenant and role in ctx, the `Principal` service, a `role` meta key and
 * the errors it fails with.
 */
import { Context, Effect, Schema } from 'effect';
import { error, initTrpc, middleware, TrpcError } from '@trpc12/trpc/server';

export const roles = ['viewer', 'member', 'admin'] as const;
export type Role = (typeof roles)[number];

export interface User {
  readonly id: string;
  readonly name: string;
}

export interface Membership {
  readonly tenantId: string;
  readonly role: Role;
}

/** What the app implements for the extension. */
export class Directory extends Context.Service<
  Directory,
  {
    readonly userForSession: (token: string) => Effect.Effect<User | undefined>;
    readonly membership: (
      userId: string,
      tenantSlug: string,
    ) => Effect.Effect<Membership | undefined>;
  }
>()('tenancy/Directory') {}

/** The caller, for Effect code; the extension provides it. */
export class Principal extends Context.Service<
  Principal,
  { readonly user: User; readonly tenantId: string; readonly role: Role }
>()('tenancy/Principal') {}

export class InsufficientRole extends TrpcError.Tagged('INSUFFICIENT_ROLE', {
  status: 403,
  data: Schema.Struct({
    required: Schema.Literals(roles),
    actual: Schema.Literals(roles),
  }),
}) {}

export interface TenancyMeta {
  /** The least role a procedure needs: `viewer` unless set. */
  role?: Role;
}

/** Standalone, so other extensions can start with it and run it once. */
export const withSession = middleware.effect<{
  ctx: { sessionToken: string | null };
}>()((opts) =>
  Effect.gen(function* () {
    const token = opts.ctx.sessionToken;
    const user = token
      ? yield* (yield* Directory).userForSession(token)
      : undefined;
    if (!user) return yield* error({ code: 'UNAUTHORIZED' });
    return yield* opts.next({ ctx: { user } });
  }),
);

const withMembership = middleware.effect<{
  ctx: { user: User; tenantSlug: string | null };
}>()((opts) =>
  Effect.gen(function* () {
    const tenant = opts.ctx.tenantSlug;
    if (!tenant) return yield* error({ code: 'TENANT_REQUIRED' });
    const membership = yield* (yield* Directory).membership(
      opts.ctx.user.id,
      tenant,
    );
    if (!membership) {
      return yield* error({ code: 'FORBIDDEN', data: { tenant } });
    }
    return yield* opts.next({
      ctx: { tenantId: membership.tenantId, role: membership.role },
    });
  }),
);

const rank: Record<Role, number> = { viewer: 0, member: 1, admin: 2 };

const requireRole = middleware<{ ctx: { role: Role }; meta: TenancyMeta }>()((
  opts,
) => {
  const required = opts.meta.role ?? 'viewer';
  return rank[opts.ctx.role] >= rank[required]
    ? opts.next()
    : new InsufficientRole({ required, actual: opts.ctx.role });
});

const r = initTrpc<{
  ctx: { sessionToken: string | null; tenantSlug: string | null };
  meta: TenancyMeta;
}>({ defaultMeta: { role: 'viewer' } });

export const tenancy = () =>
  r.procedure
    .use(withSession)
    .use(withMembership)
    .use(requireRole)
    .provide(Principal, (opts) => ({
      user: opts.ctx.user,
      tenantId: opts.ctx.tenantId,
      role: opts.ctx.role,
    }));
