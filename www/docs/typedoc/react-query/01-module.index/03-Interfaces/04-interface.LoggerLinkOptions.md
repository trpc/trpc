---
sidebar_label: LoggerLinkOptions
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Interface: LoggerLinkOptions`<TRouter>`

## Type parameters

| Parameter                       |
| :------------------------------ |
| `TRouter` _extends_ `AnyRouter` |

## Properties

### colorMode

> `optional` **colorMode**: `"ansi"` \| `"css"`

Color mode

#### Default

```ts
typeof window === 'undefined' ? 'ansi' : 'css'
```

#### Source

packages/client/dist/links/loggerLink.d.ts:41

---

### console

> `optional` **console**: `ConsoleEsque`

Used in the built-in defaultLogger

#### Source

packages/client/dist/links/loggerLink.d.ts:36

---

### enabled

> `optional` **enabled**: `EnabledFn`< `TRouter` \>

#### Source

packages/client/dist/links/loggerLink.d.ts:32

---

### logger

> `optional` **logger**: `LoggerLinkFn`< `TRouter` \>

#### Source

packages/client/dist/links/loggerLink.d.ts:31

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
