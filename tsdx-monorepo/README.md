# TSDX Monorepo Example/Playground

## Usage

This monorepo is setup for a dummy `@thefakeorg/` NPM organization. There are 2 packages by default:

- `@thefakeorg/react` - A placholder React component
- `@thefakeorg/utils` - A utils packages

Unlike other TSDX templates, the developer experience for this template is currently a bit more manual.

Your first order of business will be to search and replace `@thefakeorg` for the npm organization of your own.

After that you can install all the dependencies in the root directory. Since the monorepo uses Lerna and Yarn Workspaces, npm CLI is not supported (only yarn).

```sh
yarn install
```

This will install all dependencies in each project, build them, and symlink them via Lerna

## Development workflow

In one terminal, run tsdx watch in parallel:

```sh
yarn start
```

This builds each package to `<packages>/<package>/dist` and runs the project in watch mode so any edits you save inside `<packages>/<package>/src` cause a rebuild to `<packages>/<package>/dist`. The results will stream to to the terminal.

### Using the example/playground

You can play with local packages in the Parcel-powered example/playground.

```sh
yarn start:app
```

This will start the example/playground on `localhost:1234`. If you have lerna running watch in parallel mode in one terminal, and then you run parcel, your playground will hot reload when you make changes to any imported module whose source is inside of `packages/*/src/*`. Note that to accomplish this, each package's `start` command passes TDSX the `--noClean` flag. This prevents Parcel from exploding between rebuilds because of File Not Found errors.

Important Safety Tip: When adding/altering packages in the playground, use `alias` object in package.json. This will tell Parcel to resolve them to the filesystem instead of trying to install the package from NPM. It also fixes duplicate React errors you may run into.

### Running Cypress

(In a third terminal) you can run Cypress and it will run your integration tests against the playground/example. If you want to keep integration tests and examples seperate you can copy the example folder to another folder called like `app` or whatever. Cypress will look for `localhost:1234` by default. If you change ports, also make sure to update [`.github/integration.yaml`](.github/integration.yml) as well.
