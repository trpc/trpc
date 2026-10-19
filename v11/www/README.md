# Website

This website is built using [Docusaurus 2](https://v2.docusaurus.io/), a modern static website generator.

## Installation

```console
pnpm install
```

## Local Development

```console
TYPEDOC=0 pnpm dev
```

This command starts a local development server and open up a browser window. Most changes are reflected live without having to restart the server.

It also starts [open graph](#og-images) image generation on port `3001` which you can completely ignore if it's not working.

> [!NOTE]
>
> Starting the `dev` server is notoriously slow for now, but once you have the site running, hot reloading should be very fast.

## OG Images

We use `@vercel/og-image` for dynamic open graph image generation. They are deployed on the edge from the [`/og-image`](./og-image) project.

To use the dynamic images, we override the default Docusaurus theme using [`swizzling`](https://www.docusaurus.io/docs/swizzling). You can find these overrides in [src/theme/\*\*](./src/theme).

To play with them locally go the `og-image` folder and run `pnpm dev`.

## Company logos

We store a list of company logos in the `www/static/logos/*` folder to show on the landing page. To add future logos, simply add the png/svg to the folder. Be sure to normalize your logos, and consider running them though an optimizer tool like [SVGOMG](https://jakearchibald.github.io/svgomg/). Finally, ensure that they have a set width and height.
