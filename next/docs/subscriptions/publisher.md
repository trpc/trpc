---
title: Publisher
description: Typed publish/subscribe as an Effect service, with a channel per audience and resumable events.
section: Subscriptions
order: 2
---

`Publisher` is typed publish/subscribe as an Effect service. Declare a key with its channels, then provide a layer:

```ts
import { Publisher } from '@trpc12/trpc/server';

class Posts extends Publisher.Service<
  Posts,
  { created: Post; deleted: { id: string } }
>()('Posts') {}

const router = {
  create: t.procedure.input(PostInput).mutation((opts) =>
    Effect.gen(function* () {
      const post = yield* savePost(opts.input);
      yield* Posts.publish('created', post);
      return post;
    }),
  ),
  onCreated: t.procedure.subscription((opts) =>
    Posts.subscribe('created', { lastEventId: opts.lastEventId }),
  ),
};

createFetchHandler({ router, layer: Posts.memory({ buffer: 100 }) });
```

`subscribe()` yields `tracked()` events with the publisher's ids, so reconnects resume. `Posts.memory({ buffer })` serves one process on a `PubSub` and keeps `buffer` events per channel for resumes. For several processes, provide another layer with the same shape (`publish`, `subscribe`), built on the clients Effect already ships ([Backends](./backends.md)).

## A channel per audience

To reach some subscribers only (a room, a user's inbox), give each audience its own channel. A template literal key types every one of them; take the subscriber's channel from `ctx` on the server, never from client input:

```ts
class Notes extends Publisher.Service<
  Notes,
  { [inbox: `inbox:${string}`]: { text: string } }
>()('Notes') {}

const router = {
  notify: t.procedure
    .input(Schema.Struct({ to: Schema.String, text: Schema.String }))
    .mutation((opts) =>
      Notes.publish(`inbox:${opts.input.to}`, { text: opts.input.text }),
    ),
  inbox: t.procedure.subscription((opts) =>
    Notes.subscribe(`inbox:${opts.ctx.user.id}`, {
      lastEventId: opts.lastEventId,
    }),
  ),
};
```

The backend filters by channel, so a process only receives its subscribers' channels (Redis subscribes per channel). To reach several audiences, publish to each channel.
