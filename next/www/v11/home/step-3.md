```ts
const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000',
    }),
  ],
});

const res = await trpc.greeting.query({ name: 'John' });
```
