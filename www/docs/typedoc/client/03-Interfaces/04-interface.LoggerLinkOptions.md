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
typeof window === 'undefined' ? 'ansi' : 'css';
```

#### Source

[packages/client/src/links/loggerLink.ts:63](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/loggerLink.ts#L63)

---

### console

> `optional` **console**: `ConsoleEsque`

Used in the built-in defaultLogger

#### Source

[packages/client/src/links/loggerLink.ts:58](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/loggerLink.ts#L58)

---

### enabled

> `optional` **enabled**: `EnabledFn`< `TRouter` \>

#### Source

[packages/client/src/links/loggerLink.ts:54](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/loggerLink.ts#L54)

---

### logger

> `optional` **logger**: `LoggerLinkFn`< `TRouter` \>

#### Source

[packages/client/src/links/loggerLink.ts:53](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/loggerLink.ts#L53)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
