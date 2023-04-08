# Website

This website is built using [Docusaurus 2](https://v2.docusaurus.io/), a modern static website generator.

## Installation

```console
pnpm install
```

## Local Development

```console
pnpm dev
```

This command starts a local development server and open up a browser window. Most changes are reflected live without having to restart the server.

It also starts [open graph](#og-images) image generation on port `3001`.

## Build

```console
pnpm build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

## Deployment

```console
GIT_USER=<Your GitHub username> USE_SSH=true yarn deploy
```

If you are using GitHub pages for hosting, this command is a convenient way to build the website and push to the `gh-pages` branch.

## OG Images

We use `@vercel/og-image` for dynamic open graph image generation. They are deployed on the edge from the [`/og-image`](./og-image) project.

To use the dynamic images, we override the default Docusaurus theme using [`swizzling`](https://www.docusaurus.io/docs/swizzling). You can find these overrides in [src/theme/\*\*](./src/theme).

To play with them locally go the `og-image` folder and run `pnpm dev`.
