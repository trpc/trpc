# React Router is the homepage's third framework mode (human asked)

- Human: "Aren't we missing react router on the homepage BTW?" once `@raf-query/react/react-router` shipped.
- `?mode=react-router`, pill label **React Router**, after Next.js. `parseFrameworkMode` and `frameworkModeScript` accept any value in `frameworkModes`, so a fourth mode only needs the list, labels, CSS rules and samples.
- **Samples** mirror TanStack Start's homepage file: `www/samples/react-router/app/routes/blog.$slug.tsx` (`#hero`, `#loader`, `#component`), both queries `prefetch`ed, `<Post>` and a collapsed `<PostComments>` under Suspense, all inside `HydrationBoundary`. `posts.$slug.tsx` keeps fetch + prefetch for the React Router guide. Factories are `app/queries.ts#home`.
- The loader step links to the React Router guide, not Starting queries: per-request clients and `dehydrate(qc)` in loader data are what's different, and that page explains them.
