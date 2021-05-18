## TodoMVC


- [TodoMVC](https://todomvc.com/) implemented with tRPC + [Prisma](https://prisma.io)
- Live at [todomvc.trpc.io](https://todomvc.trpc.io)

### Setup

```bash
yarn && yarn dev
```


### Useful commands

```bash
yarn dx # runs prisma studio + next
```


### :info: This example Contains _both_ Postgres _and_ SQLite

- This project contains both Postgres & SQLite in able for us to easily showcase it in both CodeSandbox and deploy on Vercel.
- This is not a recommended approach. If you want to fork this project as a starter
  1. `rm -rf ./prisma/_sqlite`
  2. Update `package.json`:
     - remove all instances of `*:sqlite`
     - replace commands using `*:sqlite` with `*:postgres`


---

Created by [@alexdotjs](https://twitter.com/alexdotjs).
