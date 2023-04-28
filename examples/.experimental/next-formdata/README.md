# Next.js + tRPC + `FormData`

> 🚧🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧  This is experimental 🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧 


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
2. Make sure you return `req` in your `createContext()`-fn: https://github.com/trpc/trpc/blob/524b0c866b55cfc1ddd0f89885b7a5f26dde288a/examples/.experimental/next-formdata/src/server/trpc.ts#L20
3. Add a middleware where you want to use `FormData`: https://github.com/trpc/trpc/blob/1b29a7425ef784c59b2c5e3bc1229713671508d6/examples/.experimental/next-formdata/src/server/routers/room.ts#L11-L21
4. Create a form, see example: https://github.com/trpc/trpc/blob/2023-01-29-formdata/examples/.experimental/next-formdata/src/pages/vanilla.tsx

## Development

### Start project

```bash
npm run dev        # starts next.js
```