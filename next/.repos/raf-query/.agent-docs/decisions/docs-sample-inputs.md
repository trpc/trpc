# Samples build a query's input at the call (human)

- `const { slug } = args.params;` then `qc.ensure(postQuery, { slug })`, not a shared `input` object: a mistake in it is reported far from where it was built. A parsed input (`IssueListInput.parse(...)`) can be passed whole.
