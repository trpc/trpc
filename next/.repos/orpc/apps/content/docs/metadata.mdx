---
title: "Metadata"
description: "Attach metadata to oRPC procedures with defineMeta or a custom MetaPlugin so middleware, plugins, and tooling can read it to control behavior."
---

## Quickly Define Meta

In most cases, use `defineMeta` to create a metadata plugin. It takes a unique name and a merge function that defines how metadata is combined across repeated calls, then returns a tuple of `[metaPlugin, getMeta]`:

```ts twoslash
import { os } from '@orpc/server'

declare const store: Map<string, unknown>
// ---cut---
import { defineMeta } from '@orpc/server'

type CacheMeta = boolean

const [cacheMeta, getCacheMeta] = defineMeta( // [!code highlight]
  'cache', // [!code highlight]
  (incoming: CacheMeta, current) => incoming, // [!code highlight]
) // [!code highlight]

const base = os.use(async ({ procedure, next, path }, input, done) => {
  if (getCacheMeta(procedure) !== true) { // [!code highlight]
    return next()
  }

  const key = path.join('/') + JSON.stringify(input)

  if (store.has(key)) {
    return done({ output: store.get(key)! })
  }

  const result = await next()
  store.set(key, result.output)

  return result
})

const cachedProcedure = base
  .meta(cacheMeta(true)) // [!code highlight]
  .handler(async () => {
    return 'Earth'
  })
```

## Manually Define Meta

If `defineMeta` is not flexible enough, define a plugin directly with `MetaPlugin<TInputSchema, TOutputSchema, TErrorMap>`. This gives you full control and lets the plugin infer or restrict procedure types.

```ts twoslash
import { os } from '@orpc/server'
import z from 'zod'
// ---cut---
import type {
  AnySchema,
  ErrorMap,
  InferSchemaInput,
  InferSchemaOutput,
  Meta,
  MetaPlugin,
} from '@orpc/server'

interface ExampleMeta<
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap
> {
  inputExamples?: InferSchemaInput<TInputSchema>[]
  outputExamples?: InferSchemaOutput<TOutputSchema>[]
}

interface ExampleMetaPlugin<
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap
> extends MetaPlugin<TInputSchema, TOutputSchema, TErrorMap> {
  name: 'example'
}

function exampleMeta<
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
>(
  incoming: ExampleMeta<TInputSchema, TOutputSchema, TErrorMap>
): ExampleMetaPlugin<TInputSchema, TOutputSchema, TErrorMap> {
  return {
    name: 'example',
    apply(meta) {
      const current = meta.example as ExampleMeta<TInputSchema, TOutputSchema, TErrorMap> | undefined

      return {
        ...meta,
        example: {
          ...current,
          ...incoming,
        }
      }
    },
  }
}

function getExampleMeta(
  procedureOrLazy: { '~orpc': { meta: Meta } }
): ExampleMeta<any, any, any> | undefined {
  return procedureOrLazy['~orpc'].meta.example as ExampleMeta<any, any, any> | undefined
}

const procedure = os
  .input(z.object({ name: z.string() }))
  .output(z.object({ id: z.string(), name: z.string() }))
  .meta(exampleMeta({
    inputExamples: [{ name: 'Alice' }], // <- typesafe
    outputExamples: [{ id: '1', name: 'Alice' }], // <- typesafe
  }))
  .handler(async ({ input }) => {
    return { id: '1', name: 'Alice' }
  })
```
