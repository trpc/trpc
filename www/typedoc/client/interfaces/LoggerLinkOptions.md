# Interface: LoggerLinkOptions\<TRouter\>

## Type parameters

• **TRouter** extends `AnyRouter`

## Properties

### colorMode?

> **colorMode**?: `"ansi"` \| `"css"`

Color mode

#### Default

```ts
typeof window === 'undefined' ? 'ansi' : 'css'
```

#### Source

[packages/client/src/links/loggerLink.ts:63](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/loggerLink.ts#L63)

***

### console?

> **console**?: `ConsoleEsque`

Used in the built-in defaultLogger

#### Source

[packages/client/src/links/loggerLink.ts:58](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/loggerLink.ts#L58)

***

### enabled?

> **enabled**?: `EnabledFn`\< `TRouter` \>

#### Source

[packages/client/src/links/loggerLink.ts:54](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/loggerLink.ts#L54)

***

### logger?

> **logger**?: `LoggerLinkFn`\< `TRouter` \>

#### Source

[packages/client/src/links/loggerLink.ts:53](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/loggerLink.ts#L53)

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
