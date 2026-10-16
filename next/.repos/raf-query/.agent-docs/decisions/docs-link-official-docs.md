# Docs link third-party APIs to their official documentation (human)

Human: "when we're describing third party stuff, don't shy off linking official documentation".

- **The first mention on a page of another library's API, option or concept links its official docs**: reactrouter.com, nextjs.org, react.dev, tanstack.com, vite.dev, nodejs.org, MDN, the TC39 proposal. Deep-link the exact API or heading, not the site root. Later mentions on the same page stay plain.
- Check each URL and anchor before committing (`curl -sL` and grep the page for `id="<anchor>"`): docs sites move pages (tanstack.com redirects `framework/react/guide/*` to `guide/*`; TanStack Query's `QueryClient` reference is under `framework/react/reference/classes/QueryClient`).
- The rule is in `AGENTS.md` under Documentation. First applied to `react-router.md`, `starting-queries.md`, `react-server-components.md` and the three Effect pages (Effect 4 docs live under `effect.website/docs/v4/`: guides there, APIs under `docs/v4/api/effect/<Module>#<export>`); other pages get links as they're edited.
