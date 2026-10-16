# Contributing to TanStack Router

TanStack Router is a community project. Contributions to both TanStack Router and TanStack Start are welcome.

## Setup

1. Clone the repository:

   ```sh
   gh repo clone TanStack/router
   ```

2. Install [Node.js](https://nodejs.org/en/) and [pnpm](https://pnpm.io/installation). This repository requires pnpm `11.x.x` or newer.
3. Install dependencies:

   ```sh
   pnpm install
   ```

   This installs dependencies for the entire monorepo, including examples. Workspace dependencies are linked automatically.

4. Install the Playwright browsers if you will run end-to-end tests:

   ```sh
   pnpm exec playwright install
   ```

5. Create a branch for your changes:

   ```sh
   git checkout -b my-new-branch
   ```

## Before you start

- Search the [open and closed issues](https://github.com/TanStack/router/issues?q=is%3Aissue) before reporting a bug. If it has not already been reported, use the [bug report template](https://github.com/TanStack/router/issues/new?template=bug_report.yml).
- Search the [open and closed pull requests](https://github.com/TanStack/router/pulls?q=is%3Apr) before starting work to avoid duplicating an existing contribution.
- Pull requests that require API changes must first be proposed as an issue and receive maintainer sign-off before implementation begins.

## Pull request guidelines

Every pull request must follow the [TanStack Router pull request template](.github/pull_request_template.md). Complete its description and checklist without removing or bypassing the required sections.

- Keep each pull request focused on one change or topic. Pull requests that combine unrelated changes will be closed with a request to split them into separately reviewable contributions.
- Write a concise description that clearly explains what changed and why. Follow the sections in the pull request template; a long, unstructured description makes a contribution harder to review.
- Every change that affects a published package must include a changeset. Create it with `pnpm changeset`; documentation, CI, examples, and development-only changes do not require one.

## Development

- `pnpm build:all` builds all packages.
- `pnpm build` runs the cached Nx build for affected packages.
- `pnpm dev` builds the packages and starts the development watcher.

To run an example application, move into its directory and start its development server. For example:

```sh
cd examples/react/basic
pnpm dev
```

## Testing and linting

Run the checks relevant to your changes while developing:

- `pnpm test:eslint` checks linting for affected packages.
- `pnpm test:types` checks types for affected packages.
- `pnpm test:unit` runs unit tests for affected packages.
- `pnpm test:build` checks builds for affected packages.
- `pnpm test:e2e` runs end-to-end tests and requires the Playwright browsers.

Before opening a pull request, run at least:

```sh
pnpm test:eslint
pnpm test:types
pnpm test:unit
```

To run the full CI test suite, use `pnpm test:ci`. For faster feedback, use an Nx target for a specific package or pass a test file or test name after `--`. For example:

```sh
pnpm nx run @tanstack/react-router:test:unit -- tests/link.test.tsx
pnpm nx run @tanstack/react-router:test:unit -- tests/link.test.tsx -t "preloading"
```

Add appropriate unit tests for isolated behavior and end-to-end tests for browser or application workflows. Test relevant example applications when the change affects them.

## Documentation

Update the relevant documentation for user-facing changes. Documentation lives in the `docs/` directory, with separate sections for Router and Start. Use relative links within the `docs/` directory, such as `./guide/data-loading`.

The documentation sites are hosted on [tanstack.com](https://tanstack.com), which is a [TanStack Start application](https://github.com/TanStack/tanstack.com). To preview documentation changes locally, clone both repositories as siblings:

> [!NOTE]
> The website fetches the doc pages from GitHub in production, and searches for them at `../router/docs` in development. Your local clone of `TanStack/router` needs to be in the same directory as the local clone of `TanStack/tanstack.com`.

You can follow these steps to set up the docs for local development:

1. Make a new directory called `tanstack`.

```sh
mkdir tanstack
```

2. Enter that directory and clone the [`TanStack/router`](https://github.com/TanStack/router) and [`TanStack/tanstack.com`](https://github.com/TanStack/tanstack.com) repos.

```sh
cd tanstack
git clone git@github.com:TanStack/router.git
# We probably don't need all the branches and commit history
# from the `tanstack.com` repo, so let's just create a shallow
# clone of the latest version of the `main` branch.
# Read more about shallow clones here:
# https://github.blog/2020-12-21-get-up-to-speed-with-partial-clone-and-shallow-clone/#user-content-shallow-clones
git clone git@github.com:TanStack/tanstack.com.git --depth=1 --single-branch --branch=main
```

> [!NOTE]
> Your `tanstack` directory should look like this:
>
> ```text
> tanstack/
>    |
>    +-- router/ (<-- this directory cannot be called anything else!)
>    |
>    +-- tanstack.com/
> ```

3. Enter the `tanstack/tanstack.com` directory, install the dependencies and run the app in dev mode:

```sh
cd tanstack.com
pnpm i
# The app will run on https://localhost:3000 by default
pnpm dev
```

4. Now you can visit http://localhost:3000/router/latest/docs/framework/react/overview in the browser and see the changes you make in `tanstack/router/docs` there.

> [!WARNING]
> You will need to update the `docs/(router or start)config.json` file (in `TanStack/router`) if you add a new documentation page!

## AI-assisted contributions

AI tools can be useful for exploring the codebase, drafting changes, and writing tests. They do not replace the contributor's responsibility for the result.

1. **Keep the contribution in your own voice**. Review and rewrite generated code comments, issue reports, and pull request descriptions so they reflect what you actually mean.
2. **Keep ownership of technical decisions**. Understand every change, verify its behavior with the appropriate tests and documentation, and be ready to explain it during review.
3. **Do not paste LLM output verbatim into the codebase or a contribution**. Treat generated text and code as a draft: check its claims, adapt it to the repository, and remove anything you cannot justify. Issues or pull requests that appear to contain unreviewed LLM output may be closed without further review.
4. **Do not mass-submit unrelated or low-quality AI-generated pull requests**. We treat that behavior as spam and may close the pull requests, block the contributor, and report the GitHub account.

AI-assisted contributions follow the same standards for correctness, testing, documentation, and review as every other contribution.
