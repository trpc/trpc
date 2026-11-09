## Runtime type guards

The `Predicate` module contains small, reusable runtime checks.

**NEVER** write your own helper functions like `isRecord` or `isString`, instead
use the helpers from the `Predicate` module.

Predicates can be composed with apis such as `Predicate.and`,
`Predicate.or`, `Predicate.not`, and `Predicate.compose`.
