## Ideas

- New version of tRPC
- Spiritual successor to tRPC
- One dependency: Effect.ts
- All logic in tRPC is written in Effect.ts
- We have first-class support for Effect.ts, but it's not required
- Basic procedure builder API stays the same
- We prefer **option bags** over multiple arguments in TypeScript
- We make a generic builder (there's an abandoned PR somewhere with a draft) that is the basis of tRPC as a standalone package. This should also solve the issue of e.g. RSC "callers" where it could be an "opt-in thing"
- Errors can be returned and inferred (again, there's an abandoned PR somewhere with a draft)
- We have some sort of core package in a way that works and doesn't cause the doomed "The inferred type of XX cannot be named without a reference"
- "Links" and their chain can likely be written better in Effect than our custom observables
- APIs should be written in a familiar way, but don't need to be backwards compatible
- Tests should be mainly integration tests - like we do today in e.g. smoke.test.ts. Packages can export things that is only for testing purposes
- `@trpc/react-query` is dead, `@trpc/tanstack-query` stays
- We might want to create a new package that is a `use()`-native version of `@trpc/react-query`
- Links in the client should be possible to inform usage in e.g. `.query()` calls. There is an abandoned somewhere where we had something with a `satisfies ClientOptions` that enabled that sort of inference
- Node compatability etc should be solved with the same way of that Effect does their injection
- You shouldn't need to know Effect to use tRPC, but if you want to use it, you can
- We can be pretty brutal with which functionality we delete, we can consider ways of doing backwards compatibility later by new clients sending their tRPC version in header
- Transformers should be on the API endpoints, not in the `init` function of tRPC
- Website can be omitted for now, we just keep Markdown docs for things
- Public exposed functions should have JSDoc
- We should make it clear which things are "unstable internals" in a better way than what we do today
- Agents should have a docs folder where they can write their own docs, record decisions, etc and search through them whenever we approach something. Old decisions should be challenged if needed.
- Assume we're starting from scratch and that everything should be deleted
- Take no shortcuts to getting the best APIs
- We want to have a design that allows for OpenAPI support like oRPC does (orpc.dev)
- For now, we can publish everything under the `@trpcdev` scope rather than `@trpc` on npm

The only dev deps I can think of that should be:

- Vite family stuff (vitest, oxlint, oxfmt, their monorepo tooling) - generally anything from the Vite team is fine
- TypeScript (latest version)
- pnpm
- Effect (actual dependency)

First steps:

- Create a folder with ideas for the new version of tRPC
- Document API suggestions in bespoke files in a structured manner
- Me (Alex) goes through and picks ideas and make decisions about APIs
- Also document the approach
