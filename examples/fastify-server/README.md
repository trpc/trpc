# Fastify adapter example

- Fastify server with WebSocket
- Simple tRPC client in node
- Try it live on [CodeSandbox](https://codesandbox.io/s/github/trpc/trpc/tree/main/examples/fastify-server)
- Adapter [documentation](https://trpc.io/docs/fastify)

Browsers don't apply CORS to WebSockets, so the server rejects pages from origins other than `http://localhost:2022`. List the origins you serve pages from in `WS_ALLOWED_ORIGINS`, separated by commas.

If you want to test this example locally, follow the steps below.

### Clone, Install and build main project

```bash
git clone git@github.com:trpc/trpc.git
cd ./trpc
yarn
yarn dev
```

### Install fastify example and run it in dev mode

```bash
cd ./examples/fastify-server
yarn
yarn dev
```

### If you want you can build and start from the fresh build

```bash
yarn build
yarn start
```

---

Created by [skarab42](https://github.com/skarab42)
