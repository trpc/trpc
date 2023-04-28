# Next.js + tRPC + `FormData`

> 🚧🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧 This is experimental 🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧

## Setup

```bash
npx create-next-app --example https://github.com/trpc/trpc --example-path examples/.experimental/next-formdata trpc-formdata
cd trpc-formdata
npm i
npm run dev
```

### Adding FormData to your project

1. Add support for FormData & JSON content types to your HTTP handler:

- https://github.com/trpc/trpc/blob/5d234b6d26173256caa16045cf3ba931399c2629/examples/.experimental/next-formdata/src/pages/api/trpc/%5Btrpc%5D.ts#L6-L7
- https://github.com/trpc/trpc/blob/5d234b6d26173256caa16045cf3ba931399c2629/examples/.experimental/next-formdata/src/pages/api/trpc/%5Btrpc%5D.ts#L24-L27

1. Make sure you return `req` in your `createContext()`-fn: https://github.com/trpc/trpc/blob/524b0c866b55cfc1ddd0f89885b7a5f26dde288a/examples/.experimental/next-formdata/src/server/trpc.ts#L20
1. Add a middleware where you want to use `FormData`: https://github.com/trpc/trpc/blob/1b29a7425ef784c59b2c5e3bc1229713671508d6/examples/.experimental/next-formdata/src/server/routers/room.ts#L11-L21
1. Add a `httpFormDataLink`: https://github.com/trpc/trpc/blob/74bb462ca9ba91e8e077f5abf655c792b87f6995/examples/.experimental/next-formdata/src/utils/trpc.ts#L57-L65
1. Create a validation schema using `FormData`: https://github.com/trpc/trpc/blob/d1b3d5b53ff54af5d00ab99052ecf23a84277635/examples/.experimental/next-formdata/src/utils/schemas.ts#L1-L11
1. Write a backend procedure that uses the form data: https://github.com/trpc/trpc/blob/d1b3d5b53ff54af5d00ab99052ecf23a84277635/examples/.experimental/next-formdata/src/server/routers/room.ts#L25-L31
1. Create a form, see examples:
   - [./src/pages/vanilla.tsx](./src/pages/vanilla.tsx)
   - [./src/pages/react-hook-form.tsx](./src/pages/react-hook-form.tsx)
