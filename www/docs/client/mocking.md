---
id: Mocking
title: Mocking your server
sidebar_label: Mocking your server
slug: /mocking
---

Mocking tRPC gives you the ability to isolate your frontend components into testing or presentation environments without having to alter how they behave.

By intercepting our tRPC calls at the [Service Worker level](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) and returning responses as the component expects, mocking can help you to:

- Write performant, easy to execute tests that don't rely on changing the underlying component in any way
- Present componenets in frontend workshops like Storybook exactly as they would appear and behave in your main app

The examples below use [Jest](https://facebook.github.io/jest/docs/en/tutorial-react.html), (React Testing Library)[https://github.com/testing-library/react-testing-library], and [Mock Service Worker](https://www.npmjs.com/package/msw-trpc) (MSW), but the concepts apply to any testing framework.

## Creating a TRPCMockedProvider

Every test for a React component that uses your `tRPC client` must make it available in React's context.

- In React, you achieve this by wrapping your component tree with the `trpc.Provider` and `QueryClientProvider` components.
- In Next.js, this step is abstracted in `_app.ts` by using `trpc.withTRPC(MyApp)`.

In tests however, this context is not avaliable by default. Instead, you will need to expose this context by creating a `TRPCMockedProvider`.

### 1. Initialize a new React hook

Create a new file for your `MockedProvider` and import your `AppRouter` type from where your standard tRPC router is defined. This will ensure that your eventual mocking is typed to the standard signature of your entire API.

```ts title='trpcMockedProvider.ts'
import type { AppRouter } from "../path/to/server/trpc";
```

Next, create a set of React hooks from your `AppRouter` type signature with `createTRPCReact`, as all the tests and isolated environments we want to render our components in will be in a React environment.

```ts title='trpcMockedProvider.ts'
const mockedtRPC = createTRPCReact<AppRouter>({
  unstable_overrides: {
    useMutation: {
      async onSuccess(opts) {
        await opts.originalFn();
        await opts.queryClient.invalidateQueries();
      },
    },
  },
});
```

### 2. Create your mocked tRPC provider

Now we just need to create a wrapper that exposes the client. This process is similar to [the React setup](/reactjs/introduction.mdx) however we don't need to utilize the `useState` hook because our tests are not using SSR.

```ts title='trpcMockedProvider.ts'
// @ts-expect-error tRPC utilizes global fetch
global.fetch = fetch;

const mockedtRPCClient = mockedtRPC.createClient({
  links: [
    loggerLink({ enabled: () => false }),
    httpBatchLink({ url: "http://localhost:3000/api/trpc" }),
  ],
});

const mockedQueryClient = new QueryClient();

export const TRPCMockedProvider = (props: { children: React.ReactNode }) => {
  return (
    <mockedtRPC.Provider
      client={mockedtRPCClient}
      queryClient={mockedQueryClient}
    >
      <QueryClientProvider client={mockedQueryClient}>
        {props.children}
      </QueryClientProvider>
    </mockedtRPC.Provider>
  );
};
```

### 3. (Optional) Export a custom render hook

To use this mocked provider easily with `@testing-library/react`, we can export a custom render hook that wraps our rendered component in our new `TRPCMockedProvider`.

```ts title='trpcMockedProvider.ts'
export const renderWithProviders = (
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) => {
  return render(ui, {
    wrapper: (props) => <TRPCMockedProvider {...props} />,
    ...options,
  });
};
```

:::note

- If you already have a similar to render a component with providers in tests, you may choose to import `TRPCMockedProvider` to that function instead, this is a simple example for demonstration purposes.
- If you don't want to use a custom hook like the one illustrated, you may also choose to simply use the return value of the function.

:::

## Using mocks

Now we have `TRPCMockedProvider`, we can start writing and using mocks. The following examples will use [Mock Service Worker](https://mswjs.io/) to intercept our API calls and return a response, as well as [`msw-trpc`](https://www.npmjs.com/package/msw-trpc) to utilize the type signature of your API when defining our [request handlers](https://mswjs.io/docs/getting-started/mocks/rest-api).

To mock data using your own router, start by installing both packages into your dev dependendies:

`npm install --save-dev msw msw-trpc`

### 1. Create your MSW handlers

To utilize tRPC's typing superpowers, we can create a `mswTrpc` constant which generates a typed set of handlers for MSW, based on she shape of your `AppRouter`. This enables us to build handlers specific to our individual tests rapdily and with typesafety.

```ts title='trpcMockedProvider.ts'
import type { AppRouter } from "path/to/your/router";
import { createTRPCMsw } from "msw-trpc";

// YOUR PROVIDER

export const trpcMsw = createTRPCMsw<AppRouter>();
```

:::note

If you want to skip this step, it is possible to create standard REST handlers using `msw`s `rest` object and defining them to your network calls.

:::

### 2. Use your handlers and mocks to simulate an API call

Let's say that we recently defined an endpoint in our `cats` router serve everyone with information about our favorite cat.

<details><summary>Backend code</summary>

```ts title='server/routers/cats.ts'
export const catsRouter = router({
  bestCat: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => {
      return {
        bestCat: `Hey ${input.name}! The best cat is Mozzie!`,
      };
    }),
});
```

</details>

In addition, we've also created a simple React component, `BestCat` that displays the return of this query.

<details><summary>Frontend code</summary>

```ts title='component/cats/BestCat.tsx'
export default const BestCat = () => {
  const { loading, error, data } = trpc.cats.bestCat.useQuery({ name: "John" })
  if (loading) return <p>Loading...</p>;
  return (
    <StyledCatText>{data.bestCat}</StyledCatText>
  )
}
```

</details>

Finally, we want to verify that our component is working as we anticipated, so we write a test.

```ts title='component/cats/BestCat.spec.tsx'
describe("BestCat", () => {
  it("should render the result of our query", async () => {
    render(<BestCat />);
    expect(screen.getByText(/Loading/i)).toBeVisible()
    await waitFor(() => {
      const worldsBestCat = screen.getByText(/Mozzie/i);
      expect(worldsBestCat).toBeVisible();
    })
  });
});
```

In this test, we are correctly anticipating that:
- When we first render the component, it displays a loading status before the data loads
- That we need to wait for the data to load before we can assert on the anticipated response

Unfortunately, we get an error, as the component is unable to destructure our `trpc`.

> `Error: Uncaught [TypeError: Cannot destructure property 'client' of 'useContext(...)' as it is null.]`

To solve this, we need to make its provider (`TRPCMockedProvider`) avaliable to the test via `renderWithProviders`.

```ts title='component/cats/BestCat.spec.tsx'
describe("BestCat", () => {
  it("should render the result of our query", async () => {
    renderWithProviders(<BestCat />); /* 👈 */
    // existing test
  });
});
```

The component is now successfully making calls from its client when we run the test, however we now need to intercept those calls and mock a response. This is now easy and quick to do in our Jest [setup and teardown](https://jestjs.io/docs/setup-teardown), and beacuse `trpcMsw` uses the shape of our `AppRouter`, we can use our existing typing to quickly define our request handler.

```ts title='component/cats/BestCat.spec.tsx'
describe("BestCat", () => {
  const server = setupServer(
    trpcMsw.cats.bestCat.query((req, res, ctx) => {
      return res(
        ctx.status(200),
        ctx.data({
          bestCat: `Hey ${req.getinput().name}! The best cat is Mozzie!`,
        })
      );
    })
  );
  beforeAll(() => server.listen());
  afterAll(() => server.close());
  // our existing test
});
```

With this operating, the call is now being intercepted at the lowest possible network level, simulated by MSW, and a response being sent back in exactly the way our React component expects. We should now recieve:

```
PASS component/cats/BestCat.spec.tsx
  BestCat
    should render the result of our query ✓ 
```

## Further reference
- For information about more complex Mock Service Worker functionality, [visit their documentation](https://mswjs.io/docs/recipes/mocking-error-responses)
- To contribute to `msw-trpc`, visit their [Github repo](https://github.com/maloguertin/msw-trpc)
- To learn more about the benefits of simulating the environment your tests will be used in more closely, check out Kent C. Dodds [article on the subject](https://kentcdodds.com/blog/stop-mocking-fetch)
- While MSW is an easy way to accomplish this kind of mocking, it is also possible and in many situations desirable (for example, E2E tests) to simulate your entire backend, including database. For an example of this, check out [@briangwaltney](https://github.com/briangwaltney)'s [testing example repo](https://github.com/briangwaltney/t3-testing-example)

Thanks and credit to [@getinnocuous](https://github.com/getinnocuous) for their [excellent example](https://github.com/trpc/trpc/discussions/3612#discussioncomment-4948917)
