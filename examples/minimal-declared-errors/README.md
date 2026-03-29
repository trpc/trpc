# A minimal declared-errors tRPC example

Requires node 18 (for global fetch).

## Playing around

```
npm i
npm run dev
```

Try editing the ts files to see the type checking in action :)

This example keeps just enough code to show the two important cases:

- `examples.registered` throws a declared error after registering it with `.errors([UserNotFoundError])`
- `examples.unregistered` throws the same declared error without registering it, and the error is downgraded to a generic INTERNAL_SERVER_ERROR

On the client:

- the registered case is narrowed with `isTRPCClientError<AppRouter>(error)` and then `error.isDeclaredError('USER_NOT_FOUND')`
- the unregistered case is narrowed with `isTRPCClientError<AppRouter>(error)` and then `error.isFormattedError()`

## Building

```
npm run build
npm run dev
```
