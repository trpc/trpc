# Plugins from standalone packages via `.concat()` (06 (e), Q3.5)

- **Date:** 2026-10-10
- **Question:** With `initTRPC<{ … }>()` ([root-init-option-bag](../decisions/root-init-option-bag.md)) and the `t` object kept ([keep-t-object](../decisions/keep-t-object.md)), can a standalone package publish a plugin that declares requirements (ctx, meta) and adds things (ctx, inputs), as v11's `.concat()` allows?
- **Feeds:** [06 — Context and middleware](../proposals/06-context-and-middleware.md) (e), [03](../proposals/03-builder-and-init.md) Q3.5, [01](../proposals/01-packages-and-type-portability.md) portability rules.
- **Code:** [`next/spikes/concat-plugins/`](../../spikes/concat-plugins/).
  - `core.ts` is a `declare`-only builder with one mapped option bag (03 G-A, still open) and `.use`, `.input`, `.meta`, `.concat`, `.query`.
  - `audit-plugin.ts` is what a package would publish: it uses its own `t`.
  - `concat-plugins.test-d.ts` (7 type tests) runs in `pnpm test`.
- **Versions:** TypeScript 7.0.2.

## v11's model, kept

The plugin's own root is its requirement. Its middleware and inputs are what it contributes:

```ts
// @acme/trpc-audit
const t = initTRPC<{
  ctx: { db: AuditDb; user: { id: string } };
  meta: { audit?: boolean };
}>();
export const auditPlugin = t.procedure.use(async ({ ctx, meta, next }) => {
  if (meta.audit) await ctx.db.audit.write({ path: '', actor: ctx.user.id });
  return next({ ctx: { auditedBy: ctx.user.id } });
});

// app
export const audited = authed.concat(auditPlugin); // ctx: … & { auditedBy: string }
```

v11's `concat` checks `Overwrite<TContext, TContextOverrides> extends $Context` and `TMeta extends $Meta`, then merges the plugin's ctx overrides, inputs, outputs and error shapes. Its errors are a bare `'Context mismatch'` / `'Meta mismatch'`.

## Results

All of it types, and every failure is pinned with `@ts-expect-error`.

- **Requirements are checked against the current ctx, not the root.** The app's root has `user: User | null`. `t.procedure.concat(auditPlugin)` is rejected, while `authed.concat(auditPlugin)`, after a middleware narrows `user`, is accepted.
- **Errors name the key.** That's better than v11:

  ```text
  … is missing the following properties from type
  'TypeError<"concat: the plugin needs ctx this procedure does not have", "db">'
  ```

  The same holds for `"user"` (wrong type) and for meta (`'TypeError<"concat: the plugin needs meta this procedure does not declare", "audit">'` when the app declares `audit?: 'yes' | 'no'`). An app that doesn't declare the plugin's optional meta key at all is accepted, because the plugin only reads it.

- **Contributions flow on.** The plugin's ctx is visible to the resolver and to later middleware, plugins compose (`.concat(a).concat(b)`), a plugin's input merges with the procedure's under 05 C-A, and a plugin's ctx overrides same-named keys, as with `next({ ctx })`.
- **The published `.d.ts` is readable.** With a mapped bag, the plugin's type lists its requirements and contributions by name:

  ```ts
  export declare const auditPlugin: import('@trpc12/trpc/server').ProcedureBuilder<{
    ctx: { db: AuditDb; user: { id: string } }; // requirements
    ctxAdded: { auditedBy: string }; // contributions
    meta: { audit?: boolean };
    inputIn: typeof import('@trpc12/trpc/server').unset;
    inputOut: typeof import('@trpc12/trpc/server').unset;
  }>;
  ```

## Outputs (decided after the spike)

The spike's builder had no `.output()`. v11's `concat` throws "Duplicate key output" at runtime when both builders have one. Human, 2026-10-19 (v11 issue #5787): "C". The real builder takes the plugin's output, and a second output is a type error: `.output()` after a plugin that set one, or `.concat()` of a plugin with an output onto a builder that has one. Inputs keep merging. Details and what merging outputs later would need: [builder-and-procedures](../decisions/builder-and-procedures.md).

## Constraints for the real builder

- **Every type a builder can contain must be exported.** The first run failed declaration emit with TS2527 ("references an inaccessible 'unique symbol' type"), because the "no input yet" sentinel was a private `unique symbol`. A plugin package can't publish a builder whose type it can't name. This belongs in 01's portability rules, and the portability fixture should include a plugin package.
- **Plugins must take `@trpc12/trpc` as a peer dependency** (01 already says so for integrations). Sentinels and brands are `unique symbol`s, so two copies of `@trpc12/trpc` make the app's and the plugin's builders incompatible.

## Not covered

- Runtime order: the plugin's middleware and inputs are appended at the `.concat()` position. This is v11's behaviour, and needs no spike.
- Declared errors (07) and Effect services (02) in a plugin: both are more bag slots, merged the same way, once those proposals are decided.
- Single-middleware plugins: those can use standalone `middleware<{ ctx }>()` (Q6.3) instead. `.concat()` is for plugins that bundle several steps, inputs or meta.
