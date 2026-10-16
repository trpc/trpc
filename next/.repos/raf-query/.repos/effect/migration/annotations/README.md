# Migration annotations

Add one YAML file per v3 module. Each file maps stable API ids (without the
snapshot's trailing `#type` or `#value` facet) to migration guidance:

```yaml
effect/Effect#async:
  replacement: Effect.callback
  note: Use the callback constructor.
  example: Effect.callback((resume) => resume(Effect.void))
```

Run `pnpm api-diff --check` to list missing ids and
`pnpm api-diff --write-doc migration/v3-to-v4.md` to regenerate the reference.
