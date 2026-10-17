# Object literals kept in a variable are typed or passed inline, enforced by lint (human)

- Human, 2026-10-17: "For complex objects I don't like declaring them unless they're point of truth, they should just be passed or have a variable declared with the explicit type or with satisfies", with `const x = {something: y}; fn(x)` as the example. Then "Do B": an untyped object literal that is passed on once is inlined, and one used more than once gets `: T` or `satisfies T`.
- (agent) Reading: everywhere, tests and examples included; only `spikes/**` is off. The human can reply if B was meant for package source only.
- Enforced by the `trpc/typed-objects` rule in the repo's oxlint JS plugin. It flags a `const x = { … }` with no annotation, `satisfies` or `as`, when `x` is passed on whole: to a call, into another literal, returned or assigned.
- Points of truth are exempt: an exported object, one read by `typeof`, or one whose properties are written. So are uses where a fresh literal wouldn't be checked either:
  - reading a property, or comparing;
  - arguments to `expect(…)` and its matchers, `JSON.stringify` and `Object.entries`/`keys`/`values`, directly or inside a literal;
  - a literal that is only spreads.
- (agent) The rule can't see types: Oxlint gives JS plugins no type information. A generic or `unknown` parameter doesn't check excess properties, but the rule can't tell one apart from a typed parameter, so it flags those too.
- (agent) Routers and contracts used more than once take `satisfies AnyRouter` / `satisfies AnyContractRouter`, which keeps their literal type.
- Human, 2026-10-17: "Check how raf query doss their custom lint rules BTW and use thay format". The plugin follows `.repos/raf-query/tooling/oxlint-plugins/`:
  - rules are `defineRule` with `schema: []` and `messages` reported by `messageId`;
  - the plugin is `eslintCompatPlugin`;
  - each rule has a `RuleTester` test (from `oxlint/plugins-dev`) beside it.
  - The folder, the `index.ts` entry and the `trpc` name stay, per [`npm-names.md`](./npm-names.md).
- Why: TypeScript only checks excess properties on a fresh literal. One kept in a variable also widens its literals and loses contextual typing for callbacks.
- Lost: named intermediate objects that were only passed once.
- Open: raf-query's rule tests also lint every Markdown fence (`markdown-fences.ts`); ours don't yet.
- Lives in: `tooling/oxlint-plugin/` (`typed-objects.ts` and the `*.test.ts` beside each rule), `vite.config.ts` (`trpc/typed-objects`, off under `spikes/**`).
