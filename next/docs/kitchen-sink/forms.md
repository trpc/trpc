---
title: Forms with react-hook-form
label: Forms
description: One zod schema checks a react-hook-form form in the browser and the procedure's input on the server, and `matchError()` puts each server error on its field.
section: Kitchen sink
order: 1
experiment: kitchen-sink
---

The demo edits a profile. Its form is checked twice by one schema, in the browser before it's sent and by the procedure when it arrives, and whatever the server still rejects lands on the field it's about. Its pages load their data in the route's loader, so they render with it.

```demo
forms
```

Things to try:

- Save a one-letter username. The browser's check stops it before a request is sent.
- Turn off **Check in the browser too** and save it again. The request goes out, and the server's `BAD_REQUEST` puts the same message on the same field.
- Save `admin` as the username. Only the server knows it's taken, and its `CONFLICT` lands on the username field.
- Press **Fail next request**, then save: the call fails with `NETWORK_ERROR`, shown above the button.
- Edit the code: change a message in `schema.ts`, or the taken usernames in `server.ts`, and save the form again.

## One schema

The schema lives in a file both sides import. The form holds the schema's input type, before `.trim()` runs:

```sample title="schema.ts"
kitchen-sink-forms/src/schema.ts#schema
```

The procedure takes the same schema as its `.input()`, so a request the browser didn't check is checked anyway. A taken username is something only the server can know: the resolver returns it as an `error()` with the field it's about in `data`, which puts it in the client's error type ([Errors](../server/errors.md)):

```sample title="server.ts"
kitchen-sink-forms/src/server.ts#router
```

## Server errors on their fields

`standardSchemaResolver` runs the schema in the browser. On submit, the form calls the procedure with `safe()`, and `matchError()` takes a handler for each way the call can fail, all required and each typed from the server ([Handling every error](../client/errors.md#handling-every-error)):

```sample title="edit-profile.tsx"
kitchen-sink-forms/src/edit-profile.tsx#form
```

- `BAD_REQUEST` is the input's: its `data.issues` are the schema's issues, and each issue's `path` is typed from the input, so `issue.path[0]` is a field name `setError()` takes without a cast ([Input issues](../server/procedures.md#input-issues)).
- `CONFLICT` is the resolver's own, with `data.field` typed as `'username'`.
- `NETWORK_ERROR` and `BAD_RESPONSE` are `httpLink`'s: every call through it can fail with them.
- `unexpected` takes the rest, such as a crash on the server.

Adding an `error()` to the resolver makes this `matchError()` a type error until it handles the new code, and removing one makes its handler left over a type error.

## Loading in the loader

A route's loader starts the page's queries before it renders, and its component reads them. The demo has a small helper for that: `prefetch()` starts a query without waiting, `ensure()` waits for it (or takes it from the cache), and `useLoaderQuery()` reads what the loader started, with no second list of query options:

```sample title="loader-query.ts"
kitchen-sink-forms/src/loader-query.ts#loader-query
```

The profile page waits for the profile, and lets the list of recent changes arrive while it shows. With the network on **Slow**, the page appears with the profile and a placeholder where the changes come in:

```sample title="routes.tsx"
kitchen-sink-forms/src/routes.tsx#profile-route
```

The edit page's loader waits for the profile too, so the form's default values are there when it first renders. After a save, the form puts the saved profile in the cache with `setQueryData()`, invalidates the changes, and navigates to the profile page, which shows the new profile without a request and refetches the changes.
