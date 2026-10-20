# `@trpc12/experimental-tanstack-lit-query`

Re-exports [`@trpc12/tanstack-query`](https://github.com/trpc/trpc/tree/v12/next/packages/tanstack-query) and adds a provider element and `@lit/context` consumers for the client and its helpers, and `createSubscriptionController`.

The whole package is experimental, as its name says: every export might change or go away in any release.

```sh
pnpm add @trpc12/trpc effect @trpc12/experimental-tanstack-lit-query @tanstack/lit-query @lit/context
```

```ts
import { createTrpcContext } from '@trpc12/experimental-tanstack-lit-query';

export const { TrpcProvider, useTrpc } = createTrpcContext<typeof makeClient>();
customElements.define('trpc-provider', TrpcProvider);

class PostView extends LitElement {
  static properties = { postId: {} };
  trpc = useTrpc(this);
  post = createQueryController(this, () =>
    this.trpc.post.byId.queryOptions({ input: { id: this.postId } }),
  );
  render() {
    return html`<h1>${this.post().data?.title}</h1>`;
  }
}
```

## Docs

- [Lit](https://v12.trpc.io/v12/docs/integrations/tanstack-query/lit)
- [TanStack Query](https://v12.trpc.io/v12/docs/integrations/tanstack-query)

Part of the tRPC v12 preview: until 12.0.0, releases follow semver on `0.x`, and each export's `@stability` says how it is planned to ship ([Stability](https://v12.trpc.io/v12/docs/packages#stability)).
