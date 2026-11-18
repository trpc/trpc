# A model of the budgets a query tree shares

`PipelineTreeBudget.tla` is a TLA+ model of how the follow-ups of a query tree
take from `runs` (`maxRuns` and `maxBatchSize`) and `filledSize`
(`maxFillSize`) in `pipelineTree`, in
[`server.ts`](../../src/unstable-core-do-not-import/http/pipeline/server.ts).
A node starts once the call it is under has finished, and calls finish in any
order. The model checks every order those steps can happen in, for every tree
of 4 nodes that run at 1 or 2 places each:

- `WithinLimits`: the batch never goes over either limit.
- `RunsExact` and `FilledExact`: what the batch has taken is exactly what its
  admitted nodes hold, so a refused node takes none of it.
- `AllSettle`: every node ends with an outcome.

Check it with [everystate](https://github.com/mattzcarey/everystate), a TLA+
model checker that needs no Java:

```sh
npx everystate@0.3.1 PipelineTreeBudget.tla
```

`runNode` checks a node against both budgets and takes from them with nothing
waiting in between. The other configuration splits that into two steps, as an
`await` between them would, and the checker finds two nodes that each fit,
check before either takes, and go over together:

```sh
npx everystate@0.3.1 -config PipelineTreeBudgetSplit.cfg PipelineTreeBudget.tla
```

It models the steps, not the code: a run's size is 1 or 2, and a procedure
running is one step that ends in data or an error. When `server.ts` changes
how a node takes from either budget, change the model too.
