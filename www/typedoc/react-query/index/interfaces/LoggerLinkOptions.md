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

packages/client/dist/links/loggerLink.d.ts:41

***

### console?

> **console**?: `ConsoleEsque`

Used in the built-in defaultLogger

#### Source

packages/client/dist/links/loggerLink.d.ts:36

***

### enabled?

> **enabled**?: `EnabledFn`\< `TRouter` \>

#### Source

packages/client/dist/links/loggerLink.d.ts:32

***

### logger?

> **logger**?: `LoggerLinkFn`\< `TRouter` \>

#### Source

packages/client/dist/links/loggerLink.d.ts:31

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
