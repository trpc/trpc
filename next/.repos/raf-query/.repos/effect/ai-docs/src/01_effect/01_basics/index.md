## Writing `Effect` code

Prefer `Effect.gen` for inline Effect code. For reusable functions, prefer
`Effect.fn("name")` when tracing is useful and `Effect.fnUntraced` when it is not,
particularly in library implementations and hot paths. Avoid functions that only
wrap and return `Effect.gen`. Attach additional behaviour with combinators; this
style is more readable and easier to maintain than using combinators alone.
