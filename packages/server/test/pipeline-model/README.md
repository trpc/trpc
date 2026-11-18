# A model of the budgets a pipelined batch shares

`PipelineBudget.tla` is a TLA+ model of how the calls of a pipelined batch take
from `runs` (`maxRuns` and `maxBatchSize`) and `filledSize` (`maxFillSize`) in
`pipelineCalls`, in
[`server.ts`](../../src/unstable-core-do-not-import/http/pipeline/server.ts). The calls fill in their inputs at the same
time, and each `await` is a point where another call can run. The model checks
every order those steps can happen in:

- `WithinLimits`: the batch never goes over either limit.
- `RunsExact` and `FilledExact`: what the batch has taken is exactly what its
  admitted calls hold, so a refused or failed call leaks none of it.
- `AllSettle`: every call ends admitted or refused.

Check it with [everystate](https://github.com/mattzcarey/everystate), a TLA+
model checker that needs no Java:

```sh
npx everystate@0.3.1 PipelineBudget.tla
```

It checks 3 calls with up to 2 items each, every mix of calls for every item
and calls that run once, in about 1.3 million states. Each of the other two
configurations breaks the code in one way, and the checker finds it:

```sh
# Something waits between a call's last `add` and its `take`: two calls
# count against the same room before either takes it, and go over together
npx everystate@0.3.1 -config PipelineBudgetAwaitBeforeTake.cfg PipelineBudget.tla

# A call that fails before `holdRuns` keeps its place, as it once did
npx everystate@0.3.1 -config PipelineBudgetLeak.cfg PipelineBudget.tla
```

It models the steps, not the code: a value's size is 1 or 2, and reading a
value, writing it into an input and failing are each one step. When
`server.ts` changes how a call takes from either budget, change the model too.
