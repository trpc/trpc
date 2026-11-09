# Checked transformation sources

This suite reconstructs the motivating shape from PR #8597: decode an Array of
1,000 rows, each containing eleven pattern-checked string fields and one `n`
field. The sibling fields match `/^[a-z][a-z0-9]{1,15}$/`, and the checked numeric
source matches `/^[0-9]{1,6}$/`. Rows contain `value0` through `value999` and
numeric strings `1` through `1000`. Schemas, inputs and parsers are prepared
outside the measured callback. Each operation decodes all 1,000 rows.

- `digits` validates the checked string without transforming it.
- `checked-source` converts the checked numeric string to a number.
- `unchecked-source` converts a plain string to a number.
- `two-passes` first validates all fields, then decodes the validated output
  with a transformations-only Struct.
- `checked-template-target` and `unchecked-template-target` convert the `n`
  field to a TemplateLiteral string prefixed with `x-`. They measure valid
  input through the parser fallback required to preserve template diagnostics.

Every worker validates the complete output before and after measuring. The
comparison harness copies the same fixtures into both revisions and alternates
base/head order in fresh Node processes.

```sh
pnpm runtimeperf-compare schema-checked-sources --base main --head HEAD \
  --rounds 16 --time 500 --warmup-time 150
```

These fixtures use repository sources. The PR's original figures used packed
packages on Node 26.10, so compare relative changes rather than absolute times.
