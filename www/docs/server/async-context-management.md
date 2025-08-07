## Async Context Management

tRPC's `AsyncLocalStorage` integration automatically propagates context through async calls.

### Setup

```ts
import { AsyncLocalStorage } from 'async_hooks';

const t = initTRPC.context<{ user: { id: string } }>().create({
  asyncStorage: new AsyncLocalStorage(), // Enable auto-context
});
```

### Key Features

1. **Access context anywhere**

```ts
const router = t.router({
  getUser: t.procedure.query(() => {
    const ctx = t.asyncStorage.getStore(); // No prop drilling
    return ctx?.user;
  })
});
```

2. **Works with nested calls**

```ts

const router = t.router({
  getUser: t.procedure.query(() => {
    const users = await getUserFromDB();
  })
});

async function getUserFromDB() {
  // Still has access to original context
  const { user } = t.asyncStorage.getStore()!;
  return db.users.find(user.id);
}
```
