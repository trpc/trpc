# A model of the budgets a pipelined batch shares

`PipelineBudget.tla` is a TLA+ model of how the calls of a pipelined batch take
from `runs` (`maxRuns` and `maxBatchSize`) and `filledSize` (`maxFillSize`) in
`pipelineCalls`, in
[`server.ts`](../../src/unstable-core-do-not-import/http/pipeline/server.ts). A
call that runs once holds one place. A call for every item holds a place from
the start, and a place for each run of each list of its frame as the list is
ready: one list, or the inner lists of a list of lists. Each run then fills in
its own input. The calls and runs fill in their inputs at the same time, and
each `await` is a point where another can run. The model checks every order
those steps can happen in:

- `WithinLimits`: the batch never goes over either limit.
- `RunsExact` and `FilledExact`: what the batch has taken is exactly what its
  runs hold, so a refused list or run, or a call that fails, leaks none of it.
- `AllSettle`: every call ends with each of its runs done or refused.

Check it with [everystate](https://github.com/mattzcarey/everystate), a TLA+
model checker that needs no Java:

```sh
npx everystate@0.3.1 PipelineBudget.tla
```

It checks 3 calls, every mix of calls that run once and calls for every item
of a list or a list of lists of up to 2 items each, in about 17 million states
and 6 minutes. Each of the other two configurations breaks the code in one
way, and the checker finds it:

```sh
# Something waits between counting what a run fills in and taking it: two
# runs count against the same room before either takes it, and go over
npx everystate@0.3.1 -config PipelineBudgetAwaitBeforeTake.cfg PipelineBudget.tla

# A list or a run that doesn't run keeps its places
npx everystate@0.3.1 -config PipelineBudgetLeak.cfg PipelineBudget.tla
```

It models the steps, not the code: a value's size is 1 or 2, and reading the
values of a run, filling in its input and failing are each one step. When
`server.ts` changes how a call or a run takes from either budget, change the
model too.

The model checks every order for a small batch, but not the code itself. The
property tests in
[`pipeline.prop.test.ts`](../../src/unstable-core-do-not-import/http/pipeline/pipeline.prop.test.ts)
check the code: they run `pipelineCalls` on random batches, with fast-check's
scheduler choosing the order each procedure's data arrives in, and check the
same limits. Each of the two bugs above makes them fail, with the smallest
batch that shows it.
