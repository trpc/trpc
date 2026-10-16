---
id: LinkOptionsType
title: LinkOptions type
---

The `LinkOptions` type extends the [`NavigateOptions`](./NavigateOptionsType.md) type and contains additional options that can be used by TanStack Router when handling actual anchor element attributes.

```tsx
type LinkOptions = NavigateOptions & {
  target?: HTMLAnchorElement['target']
  activeOptions?: ActiveOptions
  preload?: false | 'intent' | 'viewport' | 'render'
  preloadDelay?: number
  disabled?: boolean
}
```

## LinkOptions properties

The `LinkOptions` object accepts/contains the following properties:

### `target`

- Type: `HTMLAnchorElement['target']`
- Optional
- The standard anchor tag target attribute

### `activeOptions`

- Type: `ActiveOptions`
- Optional
- The options that will be used to determine if the link is active

### `preload`

- Type: `false | 'intent' | 'viewport' | 'render'`
- Optional
- If set, the link's preloading strategy will be set to this value.
- See the [Preloading guide](../../guide/preloading.md) for more information.

### `preloadDelay`

- Type: `number`
- Optional
- Delay focus, hover, and viewport preloading by this many milliseconds. Touch intent preloads immediately. If focus or hover ends, or the link leaves the viewport before the delay, the preload will be cancelled.

### `disabled`

- Type: `boolean`
- Optional
- If true, will render the link without the href attribute
