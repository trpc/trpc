- [Deno Deploy](https://deno.com/deploy)
- Vanilla TRPCClient in Deno

Install Deno then run:

```sh
deno run --allow-net=:8000 --allow-env ./src/index.ts
```

Run the client in another terminal:

```sh
deno run --allow-net ./src/client.ts
```

Note: Deno Deploy does [not currently support npm specifiers](https://github.com/denoland/deploy_feedback/issues/314). 

---

Created by [tomlienard](https://github.com/quiibz).
