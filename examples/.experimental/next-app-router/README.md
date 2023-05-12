> 🚧🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧 This is experimental and is subject to change 🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧

## Overview

Create a tRPC client that you can use **the same way**, no matter if you are in a server components

Examples: 

- [./src/app/ClientGreeting.tsx](./src/app/ClientGreeting.tsx)
- [./src/app/ServerGreeting.tsx](./src/app/ServerGreeting.tsx)


### ℹ️ Current limitations

- No cache invalidation
- No refetching of data


### Setup

#### 1. Create a local tRPC package with different entrypoints for `"use client"` & `"use server"`. 

Files of note:

- [`./package.json`](./package.json)
- [`./src/trpc`](./src/trpc)


