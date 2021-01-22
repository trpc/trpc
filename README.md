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

TODO - see examples


### HTTP Methods <-> endpoint type mapping

| HTTP Method | Mapping            | Notes                                                    |
| ----------- | ------------------ | -------------------------------------------------------- |
| `GET`       | `.queries()`       | Args in query string                                     |
| `POST`      | `.mutations()`     | Args in post body                                        |
| `PATCH`     | `.subscriptions()` | Experimental. Uses long-pulling. Should prob not be used |


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

```sh
yarn start:app
```

This will start the example/playground on `localhost:1234`. If you have lerna running watch in parallel mode in one terminal, and then you run parcel, your playground will hot reload when you make changes to any imported module whose source is inside of `packages/*/src/*`. Note that to accomplish this, each package's `start` command passes TDSX the `--noClean` flag. This prevents Parcel from exploding between rebuilds because of File Not Found errors.

Important Safety Tip: When adding/altering packages in the playground, use `alias` object in package.json. This will tell Parcel to resolve them to the filesystem instead of trying to install the package from NPM. It also fixes duplicate React errors you may run into.

### Running Cypress

(todo)

(In a third terminal) you can run Cypress and it will run your integration tests against the playground/example. If you want to keep integration tests and examples seperate you can copy the example folder to another folder called like `app` or whatever. Cypress will look for `localhost:1234` by default. If you change ports, also make sure to update [`.github/integration.yaml`](.github/integration.yml) as well.
