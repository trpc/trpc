---
id: Mocking
title: Mocking your server
sidebar_label: Mocking your server
slug: /mocking
---

Mocking tRPC gives you the ability to isolate your frontend components into testing or presentation environments without having to alter how they behave.

By intercepting our tRPC calls at the [Service Worker level](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) and returning responses as the component expects, mocking can help you to:

- Write performant, easy-to-execute tests that don't rely on changing the underlying component in any way
Present components in frontend workshops like Storybook exactly as they would appear and behave in your main app

The examples below use [Vitest](https://vitest.dev/), [React Testing Library](https://github.com/testing-library/react-testing-library), and [Mock Service Worker](https://www.npmjs.com/package/msw-trpc) (MSW), but the concepts apply to any testing framework.

## Creating a MockedTRPCProvider

For tRPC's hooks to work, they require [context](https://trpc.io/docs/context) that describes the URL of the backend and the structure of the API.

- In React, you achieve this by wrapping your component tree with the `trpc.Provider` and `QueryClientProvider` components.
- In Next.js, this step is abstracted in `_app.ts` by using `trpc.withTRPC(MyApp)`.

We still need this context when using our components in an isolated environment, because they still need to be capable of making requests that we will later intercept and pass through the mocked version of our API. For this, we will need to create and use a mocked provider.

### 1. Initialize a new React hook

Create a new file for your `MockedTRPCProvider` and import your `AppRouter` type from where your standard tRPC router is defined. This will ensure that your mocks have the same type signature as your API.

```ts title='mockedTRPCProvider.ts'
import type { AppRouter } from "../path/to/server/trpc";
```

Next, create a set of React hooks from your `AppRouter` type signature with `createTRPCReact`.

```ts title='mockedTRPCProvider.ts'
const mockedTRPC = createTRPCReact<AppRouter>({
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

Now we just need to create a wrapper that exposes the client. This process is similar to [the React setup](https://trpc.io/docs/react#3-add-trpc-providers) however we don't need to utilize the `useState` hook because our tests are not using SSR.

```ts title='mockedTRPCProvider.ts'
// @ts-expect-error tRPC utilizes global fetch
global.fetch = fetch;

const mockedTRPCClient = mockedTRPC.createClient({
  links: [httpBatchLink({ url: "http://localhost:3000/api/trpc" })],
});

const mockedQueryClient = new QueryClient();

export const MockedTRPCProvider = (props: { children: React.ReactNode }) => {
  return (
    <mockedTRPC.Provider
      client={mockedTRPCClient}
      queryClient={mockedQueryClient}
    >
      <QueryClientProvider client={mockedQueryClient}>
        {props.children}
      </QueryClientProvider>
    </mockedTRPC.Provider>
  );
};
```

### 3. (Optional) Export a custom render hook

To use this mocked provider easily with `@testing-library/react`, we can export a custom render hook that wraps our rendered component in our new `MockedTRPCProvider`.

```ts title='mockedTRPCProvider.ts'
export const renderWithProviders = (
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) => {
  return render(ui, {
    wrapper: (props) => <MockedTRPCProvider {...props} />,
    ...options,
  });
};
```

:::note

- If you already have a similar function to render a component with providers in tests, you may choose to import `MockedTRPCProvider` to that function instead, this is a simple example for demonstration purposes.
- If you don't want to use a custom hook like the one illustrated, you may also choose to simply use the return value of the function.

:::

## Using mocks

Now we have `MockedTRPCProvider`, we can start writing and using mocks. The following examples will use [Mock Service Worker](https://mswjs.io/) to intercept our API calls and return a response, as well as [`msw-trpc`](https://www.npmjs.com/package/msw-trpc) to utilize the type signature of your API when defining our [request handlers](https://mswjs.io/docs/getting-started/mocks/rest-api).

To mock data using your router, start by installing both packages into your dev dependencies:

`npm install --save-dev msw msw-trpc`

### 1. Create your MSW handlers

To utilize tRPC's typing superpowers, we can create an `mswTrpc` constant which generates a typed set of handlers for MSW, based on the shape of your `AppRouter`. This enables us to build handlers specific to our tests rapidly and with typesafety.

```ts title='mockedTRPCProvider.ts'
import type { AppRouter } from "path/to/your/router";
import { createTRPCMsw } from "msw-trpc";

// YOUR PROVIDER

export const trpcMsw = createTRPCMsw<AppRouter>();
```

:::info

`msw-trpc` is a new and experimental package. As with any new package, it is worth checking through its (relatively lightweight) [contents](https://github.com/maloguertin/msw-trpc/tree/main/src) before usage.

Alternatively, you can use standard REST handlers through `msw`s `rest` object by manually defining the Request URL and Method corresponding to the tRPC procedure you want to mock.

If you would prefer to use this approach, it is worth familiarizing yourself with the [HTTP RPC Specification](https://trpc.io/docs/rpc).

:::

### 2. Use your handlers and mocks to simulate an API call

Let's say that we recently defined an endpoint in our `cats` router to serve everyone with information about our favorite cat.

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
  if (loading || error) return <p>Data unavaliable</p>;
  return (
    <StyledCatText>{data.bestCat}</StyledCatText>
  )
}
```

</details>

Finally, we want to verify that our component is working as we anticipated, so we write a test.

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
  test("should render the result of our query", async () => {
    renderWithProviders(<BestCat />);
    expect(screen.getByText(/Data unavaliable/i)).toBeVisible();
    await waitFor(() => {
      const worldsBestCat = screen.getByText(/Mozzie/i);
      expect(worldsBestCat).toBeVisible();
    });
  });
});
```

Let's break our test down a little to understand what's going on. We'll start by looking at what our `test` block is doing, and then return to our `server` setup and teardown.

The very first thing we do is make sure that our client (`trpc`) has access to its context (`MockedTRPCProvider`). Happily, we've made this easy to do by utilizing our new `renderWithProviders` function. After that, we are correctly anticipating that when we first render the component, we need to asynchronously wait for the data to load before we can assert on the anticipated response.

The component is now successfully making calls from its client when we run the test, however, we now need to intercept those calls and mock a response. This is where our `server` comes in. Inside of `setupServer`, we can define the requests that our `Cat` component uses so we can intercept them and return a mocked response. Because `trpcMsw` uses the shape of our `AppRouter`, we can use our existing typing to quickly define the request handler we need.

With our server listening, our component's network call is now being intercepted at the lowest possible network level, simulated by MSW, and a response is being sent back in exactly the way our React component expects. Critically, we didn't need to mock or adapt any of the component's standard behaviors to isolate it. We should now receive:

```
PASS component/cats/BestCat.spec.tsx
  BestCat
    should render the result of our query ✓
```

## Further reference

- For information about more complex Mock Service Worker functionality, [visit their documentation](https://mswjs.io/docs/recipes/mocking-error-responses)
- To contribute to `msw-trpc`, visit their [Github repo](https://github.com/maloguertin/msw-trpc)
- To learn more about the benefits of simulating the environment your tests will be used in more closely, check out Kent C. Dodds's [article on the subject](https://kentcdodds.com/blog/stop-mocking-fetch)
- While MSW is an easy way to accomplish this kind of mocking, it is also possible and in many situations desirable (for example, E2E tests) to simulate your entire backend, including the database. For an example of this, check out [@briangwaltney](https://github.com/briangwaltney)'s [testing example repo](https://github.com/briangwaltney/t3-testing-example)

Thanks and credit to [@getinnocuous](https://github.com/getinnocuous) for their [excellent example](https://github.com/trpc/trpc/discussions/3612#discussioncomment-4948917)
