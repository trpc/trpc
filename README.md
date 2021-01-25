<div align="center">
  <h1 align="center">tRPC</h1>
  <p>a toolkit for building end-to-end TypeScript data layers</p>
</div>

<br/>
<br/>

# Motivation

> This library is undergoing rapid development and should be considered experimental. 🤙

tRPC is a framework for building strongly typed RPC APIs with TypeScript. Alternatively, you can think of it as a way to avoid APIs altogether.

## Usage

> :construction:  Under construction, for now see [`./examples`](./examples)


### Data transformers

You are able to serialize the output data (in order to be able to transparently use e.g. standard `Date`s). The transformers need to be added both to the server and the client.

Data transformers currently live on the edges - in client-specific implementation & in the API response adapters. See a reference of how superjson is attached to ..

- `createNextApiHandler()` in [`./examples/next-ssg-chat/[...trpc.ts]`](./examples/next-ssg-chat/pages/api/trpc/%5B...trpc%5D.ts), and
- `createReactQueryHooks` in [`./examples/next-ssg-chat/pages/_app.tsx`](./examples/next-ssg-chat/pages/_app.tsx)

## Internals

### HTTP Methods <-> endpoint type mapping

| HTTP Method | Mapping            | Notes                                                                             |
| ----------- | ------------------ | --------------------------------------------------------------------------------- |
| `GET`       | `.queries()`       | Args in query string                                                              |
| `POST`      | `.mutations()`     | Args in post body                                                                 |
| `PATCH`     | `.subscriptions()` | Experimental API using long-pulling. Implementation details are likely to change. |


# Development

```sh
yarn install
```

This will install all dependencies in each project, build them, and symlink them via Lerna

## Development workflow

```bash
git clone git@github.com:KATT/trpc.git
cd trpc
yarn
```

In one terminal, run tsdx watch in parallel:

```sh
yarn dev
```

This builds each package to `<packages>/<package>/dist` and runs the project in watch mode so any edits you save inside `<packages>/<package>/src` cause a rebuild to `<packages>/<package>/dist`. The results will stream to to the terminal.

### Using the examples/playground

You can play with local examples:

- `yarn playground` - runs `examples/playground`
- `cd examples next-ssg-chat && yarn dev`


### Running Cypress

(todo)

(In a third terminal) you can run Cypress and it will run your integration tests against the playground/example. If you want to keep integration tests and examples seperate you can copy the example folder to another folder called like `app` or whatever. Cypress will look for `localhost:1234` by default. If you change ports, also make sure to update [`.github/integration.yaml`](.github/integration.yml) as well.
