---
name: Open Graph Image Generation
slug: og-image-generation
description: Compute and generate dynamic social card images with React components.
framework: Next.js
useCase: Edge Functions
css: Tailwind
deployUrl: https://vercel.com/new/clone?repository-url=https://github.com/vercel/examples/tree/main/edge-functions/vercel-og-nextjs&project-name=vercel-og-nextjs&repository-name=vercel-og-nextjs
demoUrl: https://og-image.trpc.io/api/static
relatedTemplates: 
  - nextjs-boilerplate
  - aws-s3-image-upload-nextjs
  - platforms-starter-kit
  - blog-starter-kit
---

# Vercel OG + Next.js

🚧🚧

This example shows how to use [Vercel OG](https://vercel.com/docs/concepts/functions/edge-functions/og-image-generation) with Next.js.

## Demo

- [Static Text](https://og-image.trpc.io/api/static)
- [Vercel Card](https://og-image.trpc.io/api/vercel)
- [Dynamic Text from URL Query](https://og-image.trpc.io/api/param)
- [Embed SVG Image](https://og-image.trpc.io/api/image-svg)
- [Dynamic PNG Image Based on URL Queries](https://og-image.trpc.io/api/dynamic-image?username=vercel)
- [Custom Font](https://og-image.trpc.io/api/custom-font)
- [Emoji](https://og-image.trpc.io/api/emoji)
- [Languages](https://og-image.trpc.io/api/language)
- [Encrypted Token](https://og-image.trpc.io/encrypted/a)
- [Tailwind](https://og-image.trpc.io/api/tailwind)

## How to Use

You can choose from one of the following two methods to use this repository:

### One-Click Deploy

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=vercel-examples):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/examples/tree/main/edge-functions/vercel-og-nextjs&project-name=vercel-og-nextjs&repository-name=vercel-og-nextjs)

### Clone and Deploy

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example https://github.com/vercel/examples/tree/main/edge-functions/vercel-og-nextjs
# or
yarn create next-app --example https://github.com/vercel/examples/tree/main/edge-functions/vercel-og-nextjs
```

Next, run Next.js in development mode:

```bash
npm install
npm run dev

# or

yarn
yarn dev
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=edge-middleware-eap) ([Documentation](https://nextjs.org/docs/deployment)).
