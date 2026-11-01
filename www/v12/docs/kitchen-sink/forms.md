---
title: Forms with react-hook-form
label: Forms
description: One zod schema checks a react-hook-form form in the browser and the procedure's input on the server, transforms what the form holds into what the procedure gets, and `matchError()` puts each server error on its field.
section: Kitchen sink
order: 1
experiment: kitchen-sink
---

The demo edits a profile. Its form is checked twice by one schema, in the browser before it's sent and by the procedure when it arrives, and whatever the server still rejects lands on the field it's about. The schema also transforms what's typed into what's stored, so the form and the procedure see different types. Its pages load their data in the route's loader, so they render with it.

```demo
forms
```

Things to try:

- Save a one-letter username. The browser's check stops it before a request is sent.
- Save `admin` as the username. The browser asks the server whether someone has it, and puts the answer on the field before the profile is sent.
- Turn off **Check in the browser too** and save `admin` again. The request goes out, the procedure's own check finds it taken, and its `BAD_REQUEST` puts the same message on the same field.
- Type the topics as `TRPC, effect,,`. The profile page shows them as `trpc` and `effect`: the server stored the schema's output.
- Press **Fail next request**, then save: the call fails with `NETWORK_ERROR`, shown above the button.
- Edit the code: change a message in `schema.ts`, or the usernames other people have in `server.ts`, and save the form again.

## One schema

The schema lives in a file both sides import. Whether someone has a username is something only the database knows, so `profileSchema()` takes the lookup: its `.refine()` is the same check on both sides, and only the lookup behind it differs. The username's regex aborts on a mismatch, so a malformed username isn't looked up:

```sample title="schema.ts"
kitchen-sink-forms/src/schema.ts#schema
```

`.trim()`, `.toLowerCase()` and the topics' `.transform()` make the schema's output differ from its input. The form holds the input, what's typed into its fields, and the procedure gets the output, what the server stores:

```sample title="types.ts"
kitchen-sink-forms/docs/types.ts#types
```

The procedure takes the schema with the database's lookup as its `.input()`, so a request the browser didn't check is checked anyway, and a taken username is one of its input's issues. `profile.isTaken` is the lookup the browser asks:

```sample title="server.ts"
kitchen-sink-forms/src/server.ts#router
```

## Server errors on their fields

`standardSchemaResolver` runs the schema in the browser, with the lookup asking `profile.isTaken` through the query cache, so a username it checked once isn't asked about again. Its `raw: true` makes a valid form submit the values it holds, the schema's input, which is what `mutate()` takes; without it, the form would submit the output, with `topics` an array, which `mutate()` doesn't take. On submit, the form calls the procedure with `safe()`, and `matchError()` takes a handler for each way the call can fail, all required and each typed from the server ([Handling every error](../client/errors.md#handling-every-error)):

```sample title="edit-profile.tsx"
kitchen-sink-forms/src/edit-profile.tsx#form
```

- `BAD_REQUEST` is the input's: its `data.issues` are the schema's issues, the taken username's included, and each issue's `path` is typed from the input, so `issue.path[0]` is a field name `setError()` takes without a cast ([Input issues](../server/procedures.md#input-issues)).
- `NETWORK_ERROR` and `BAD_RESPONSE` are `httpLink`'s: every call through it can fail with them.
- `unexpected` takes the rest, such as a crash on the server.

Returning an `error()` from the resolver makes this `matchError()` a type error until it handles the new code ([Errors](../server/errors.md)). The taken username doesn't need one: as the schema's issue, it's on its field already.

## Loading in the loader

A route's loader starts the page's queries before it renders, and its component reads them. The demo has a small helper for that: `prefetch()` starts a query without waiting, `ensure()` waits for it (or takes it from the cache), and `useLoaderQuery()` reads what the loader started, with no second list of query options:

```sample title="loader-query.ts"
kitchen-sink-forms/src/loader-query.ts#loader-query
```

The profile page waits for the profile, and lets the list of recent changes arrive while it shows. With the network on **Slow**, the page appears with the profile and a placeholder where the changes come in:

```sample title="routes.tsx"
kitchen-sink-forms/src/routes.tsx#profile-route
```

The edit page's loader waits for the profile too, so the form's default values are there when it first renders. Its topics are stored as an array, so the form joins them back into the text its field shows. After a save, the form puts the saved profile in the cache with `setQueryData()`, invalidates the changes, and navigates to the profile page, which shows the new profile without a request and refetches the changes.
