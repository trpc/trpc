---
title: Files, uploaded and downloaded
label: Files
description: An avatar `File` inside a typed input, sent as multipart and checked for size and type on the server, and a `File` output that comes back as the response body.
section: Kitchen sink
order: 3
experiment: kitchen-sink
---

The demo uploads an avatar. The image is a `File` inside the profile's input, next to the name, and the procedure checks its size and type. The avatar comes back from another procedure as a `File` too, whose bytes are the response's body, and the page shows it in an `<img>`. Both ways, the `File` is typed end to end, with no `FormData` or upload endpoint of your own ([Files](../server/files.md)).

```demo
files
```

Things to try:

- Press **Draw one** and save. Open the `profile.update` request: it's `multipart/form-data`, its `input` part holds the name and a reference to the file, and the next part is the PNG's bytes. Then open `profile.avatar`: the response is the PNG itself.
- Press **Too big** and save: the procedure's input rejects the 1 MB image, and its `BAD_REQUEST` puts the message on the avatar's field.
- Press **Not an image**, clear the name, and save: both fields get their issue.
- Pick an image of your own. One over 200 kB fails the same way.

## A `File` in the input

The avatar's schema is `z.instanceof(File)` with two refinements, inside the input's object. The handler rebuilds the `File` from the multipart body before the input is checked, so the schema sees the real file:

```sample title="server.ts"
kitchen-sink-files/src/server.ts#router
```

Files in an input need danSON, on the handler and on the link: plain JSON can't carry them ([Transformers](../server/transformers.md)). With it, `httpLink` sends a call whose input holds a `File` alone, outside any batch, as `multipart/form-data`.

## Sending it

The form puts the `File` in the input as it is: one picked with `<input type="file">`, or drawn on a canvas. When the procedure's checks fail, `matchError()`'s `BAD_REQUEST` gets their issues, and each issue's `path` is typed from the input, so `path[0]` is `'name'` or `'avatar'`:

```sample title="profile.tsx"
kitchen-sink-files/src/profile.tsx#save
```

## A `File` as the output

`profile.avatar` returns the stored `File`. When a `File` or `Blob` is a call's whole output, `httpLink` gets it as the response's body, with its `content-type` and a `content-disposition` naming the file, and resolves to a `File`. The page shows it through an object URL:

```sample title="profile.tsx"
kitchen-sink-files/src/profile.tsx#avatar
```

The requests panel describes a binary body by its name, type and size, and shows its first bytes; a text one, such as the starting SVG avatar, shows as text.
