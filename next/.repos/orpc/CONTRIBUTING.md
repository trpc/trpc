# Contributing to oRPC

Thank you for your interest in contributing to oRPC! We welcome all kinds of contributions: bug reports, feature requests, documentation improvements, and code enhancements.

If you need help or have questions, please join us on [Discord](https://discord.gg/TXEbwRBvQn).

> [!TIP]
> [Mini-oRPC](https://github.com/middleapi/mini-orpc) is a simplified implementation of oRPC that includes essential features to help you understand the core concepts. It's designed to be straightforward and easy to follow, making it an ideal starting point for learning about oRPC.

## Setup

This repository uses:

- **Node.js** v22+ (use [`pnpm env`](https://pnpm.io/cli/env) for quick setup)
- **pnpm** and **pnpm workspaces** for dependency management
- **Vitest** for testing
- **ESLint** with [@antfu/eslint-config](https://github.com/antfu/eslint-config) for linting and formatting

## Workflow

1. **Fork**: Fork the repository.
2. **Clone**: Clone your fork.
3. **Install**: Install dependencies.
   ```bash
   pnpm install
   ```
4. **Branch**: Create a new branch:
   ```bash
   git checkout -b feature/your-feature
   ```
5. **Code**: Make your changes.
6. **Test**: Manually verify in a playground, e.g.:
   ```bash
   cd playgrounds/next
   pnpm dev
   ```
7. **Tests**: Add or update tests:
   - Unit tests: add `.test-d.ts`, `.test.ts`, `.test.tsx` files next to code.
   - E2E tests: place in `/tests` under the relevant package.
8. **Commit & Push**:
   - Commit should follow the [Conventional Commits Cheatsheet](https://gist.github.com/Zekfad/f51cb06ac76e2457f11c80ed705c95a3) but not required because we usually use `Squash and Merge`.
9. **Pull Request**: Open a PR against `main` (or corresponding version branch).
   - our PR title should follow the [Conventional Commits Cheatsheet](https://gist.github.com/Zekfad/f51cb06ac76e2457f11c80ed705c95a3). Scope rules:
     - Use the package name (e.g. `feat(server): ...`), or `rpc`/`openapi` for changes tied to a protocol rather than a single package, such as its serializers, handlers, links, or dedicated plugins.
     - Use `content` only for the docs site itself (styles, Blume config, ...), and only with the `chore` type — never `feat`/`fix`/`perf`/`docs`, since these changes do not affect library users. Documentation about a package or protocol uses that package/protocol scope instead (e.g. `docs(openapi): ...`).
     - Omit the scope when the change is too broad for a single one.
   - In the description, summarize your changes and reference any related issue, e.g., `Fixes #123`.

## JSDoc & Documentation Links

Every public API mentioned in the documentation (`apps/content/docs`) must carry a JSDoc comment with a backlink to the official website. This is enforced in CI:

```bash
pnpm docs:validate # runs scripts/verify-docs-jsdoc.ts (accepts [--filter server,client] [--strict] [--list] via node) and `blume validate --strict`
```

JSDoc blocks follow this template:

```ts
/**
 * <Summary: 1-3 short sentences. Verb-first for functions, noun phrase for types/classes.>
 *
 * @remarks
 * **Warning**: <footguns, breaking behavior>
 * **Note**: <non-obvious behavior, limits>
 *
 * @param name - <only extra info beyond the type>
 * @returns <only extra info beyond the type>
 *
 * @see {@link https://orpc.dev/docs/... | Page Title}
 */
```

- `@remarks` is optional (max 1-3 bold lines) and uses `**Warning**:`/`**Note**:` — not `@warning`/`@info` tags.
- `@param`/`@returns` only when they add information beyond the type signature.
- No `@example` blocks — examples live on the linked docs page.
- `@see` is always the last tag. The URL must map to an existing `apps/content/docs/<path>.mdx` page (plus optional `#anchor` matching a real heading). The title after `|` is the page's title (its frontmatter `title`), or `Page Title - Heading` when the link targets an anchor.
- Every `https://orpc.dev/...` link anywhere in package sources (inline markdown links included) is validated against the content pages in `apps/content`.
