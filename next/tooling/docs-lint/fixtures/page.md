---
title: A page with examples
---

Destructured fields read once:

```ts
t.procedure.query(({ input }) => find(input.id));
```

Read three times, so destructuring pays off:

```ts
t.procedure.query(({ input }) => [input.a, input.b, input.c]);
```

- In a list:

  ```tsx
  function Title({ title }) {
    return <h1>{title}</h1>;
  }
  ```

A Markdown block isn't checked:

````md
```ts
t.procedure.query(({ input }) => input);
```
````

Nor is a block in another language:

```sh
const { a } = b
```

Each twoslash file is its own module:

```ts twoslash
// @filename: server.ts
const { a } = b;
// @filename: client.ts
const { a } = c;
console.log(a, a, a);
```

A placeholder that doesn't parse:

```ts
.mutation(…);
```
