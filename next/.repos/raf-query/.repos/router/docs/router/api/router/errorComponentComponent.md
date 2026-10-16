---
id: errorComponentComponent
title: ErrorComponent component
---

The `ErrorComponent` component renders an error notice and optional details about the thrown value.

## ErrorComponent props

The `ErrorComponent` component accepts the following props:

### `props.error` prop

- Type: `unknown` in React and Vue; `Error` in Solid
- The caught error. Solid normalizes non-`Error` values, including SSR loader errors, into an `Error` with the original value in `cause`.

### `props.info` prop

- Type: `{ componentStack: string }`
- Optional
- Additional information about where the error was thrown, such as the React component stack trace.

### `props.reset` prop

- Type: `() => void`
- A function to programmatically reset the error state

## ErrorComponent returns

- Displays an error notice, with details when the thrown value has a nonempty `message`. Values without a message still display the error notice.
- The error message can be toggled by clicking the "Show Error" button.
- By default, the error message will be shown in development.
