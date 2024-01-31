# Type alias: inferProcedureInput\<TProcedure\>

> **inferProcedureInput**\<`TProcedure`\>: `undefined` extends `inferProcedureParams`\< `TProcedure` \>\[`"_input_in"`\] ? `void` \| `inferProcedureParams`\< `TProcedure` \>\[`"_input_in"`\] : `inferProcedureParams`\< `TProcedure` \>\[`"_input_in"`\]

## Type parameters

• **TProcedure** extends `AnyProcedure`

## Source

[unstable-core-do-not-import/procedure.ts:87](https://github.com/trpc/trpc/blob/caccce64/packages/server/src/unstable-core-do-not-import/procedure.ts#L87)

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
