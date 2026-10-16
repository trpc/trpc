# AI docs

`LLMS.md` is generated from `ai-docs/src`.

## Add content

1. Add or update markdown in `ai-docs/src/**/index.md` for section intro text.
2. Add examples as `.ts` files in the same folder.
3. Run `pnpm ai-docgen` to regenerate `LLMS.md`.

## Source file conventions

- Use numeric filename prefixes to control ordering (`10_`, `20_`, etc). Avoid starting with `0` unless explicity requested to do so.
- Use a top JSDoc block with `@title` and optional description to control rendered title/description.
- `fixtures` directories are ignored and not included in the generated
  documentation. Use them for any supporting code or data needed for examples.

## Example guidelines

Before writing an example, look at the existing examples in `ai-docs/src` to
learn the style and conventions used in this project. Also read the current
`LLMS.md` to understand the content and style of the documentation.

**All code examples should be well commented** explaining the how and why of the
code, not just what the code is doing. The goal is to teach users how to use the
API.

**Code must represent real world usage and best practices.**
Do not include toy examples that are not representative of how the API should be
used in practice.

- **Prefer using the service style** of structuring code, as this represents real
  world usage and best practices.
- Use the `fixtures` directory to illustrate / suggest best practices for
  project structure, file organization, and code organization.

Pull requests with only ai documentation changes **DO NOT** need a changeset.

## Regeneration

- One-shot: `pnpm ai-docgen`
- Watch mode: `pnpm ai-docgen:watch`

`pnpm ai-docgen` regenerates `LLMS.md` files from content in `ai-docs/src`.
