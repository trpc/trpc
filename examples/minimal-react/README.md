# A minimal React tRPC example

Requires node 18 (for global fetch).

## Playing around

```bash
npm i
npm run dev
```

Try editing the ts files to see the type checking in action :)

## Building

```bash
npm run build
npm run start
```

## Setup

> [!NOTE]
>
> This is an npm workspace project that has some additional setup to get path aliases working.
> If you use relative imports, certain configuration will not apply to you.

The `server` uses native [Node.js import subpaths](https://nodejs.org/api/packages.html#subpath-imports) with two conditions:

- `typescript`: This is our own custom condition, as set in [tsconfig.json](./server/tsconfig.json#L15). This will resolve imports to the source TypeScript files, in order to accomplish live types in your IDE. Changing any of the router definition will trigger instant updates and you'll get type errors in your client.
- `default`: Default fallback, which will resolve to the compiled JavaScript files.

For unit testing we use Vitest, which is [configured to also use the `typescript` condition](./server/vitest.config.ts#L5). This means our tests run against the source TypeScript files, requiring no build step to see your reflected changes.
