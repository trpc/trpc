# FormData

> ⚠️⚠️⚠️⚠️
> This is an experimental feature.
> ⚠️⚠️⚠️


- [FormData](#formdata)
  - [Setting up](#setting-up)





## Setting up

> For a full example, have a look at [/examples/.experimental/next-formdata](https://github.com/trpc/trpc/tree/main/examples/.experimental/next-formdata)

1. Add support for FormData & JSON content types to your HTTP handler: 
  - https://github.com/trpc/trpc/blob/5d234b6d26173256caa16045cf3ba931399c2629/examples/.experimental/next-formdata/src/pages/api/trpc/%5Btrpc%5D.ts#L6-L7
  - https://github.com/trpc/trpc/blob/5d234b6d26173256caa16045cf3ba931399c2629/examples/.experimental/next-formdata/src/pages/api/trpc/%5Btrpc%5D.ts#L24-L27
2. Make sure you return `req` in your `createContext()`-fn: https://github.com/trpc/trpc/blob/524b0c866b55cfc1ddd0f89885b7a5f26dde288a/examples/.experimental/next-formdata/src/server/trpc.ts#L20
3. Add a middleware where you want to use `FormData` (potentially make a base procedure): 
  - https://github.com/trpc/trpc/blob/524b0c866b55cfc1ddd0f89885b7a5f26dde288a/examples/.experimental/next-formdata/src/server/routers/room.ts#L1C1-L5
4. Create a 