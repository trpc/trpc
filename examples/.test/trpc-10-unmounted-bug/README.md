# Reproduction of tRPC (`v10`) bug

See: <https://github.com/trpc/trpc/issues/2919>

Steps:

1. `npm i`
2. `npm run dev`
3. Go to <http://localhost:3000>
4. Click on "Dynamic Subroute"
5. Error in console:
   ```
   Warning: Can't perform a React state update on an unmounted component. This is a no-op, but it indicates a memory leak in your application. To fix, cancel all subscriptions and asynchronous tasks in a useEffect cleanup function.
   at Home
   ```

You can make small changes in the repo that will make the error go away (changing only **one** of the following is enough!):

- see `pages/_app.tsx`
  - Adding an additional `<Link />`
    or
  - Wrapping the main component (`<Component {...pageProps} />`) in a div

or

- see `pages/user/[userId].tsx`
  - comment out the prefetching (`await ssg.user.byUserId.prefetch({ userId })`)

or

- see `pages/index.tsx`
  - comment out fetching data on the client (`... trpc.user.byUserId.useQuery ...`)
