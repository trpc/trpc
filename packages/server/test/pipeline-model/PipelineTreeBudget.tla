---- MODULE PipelineTreeBudget ----
\* The budgets the follow-ups of a query tree share, in `pipelineTree`
\* (packages/server/src/unstable-core-do-not-import/http/pipeline/server.ts).
\* A node starts once the call it is under has finished, and calls finish in
\* any order. Promise: the batch never goes over `maxRuns` (`runs`) or
\* `maxFillSize` (`filled`), and what it has taken is exactly what its
\* admitted nodes hold, so a refused node takes none of either.
EXTENDS Naturals, FiniteSets

CONSTANTS
  N,          \* how many nodes the tree has
  Calls,      \* how many top-level calls the batch has
  MaxRuns,    \* the lower of `maxRuns` and `maxBatchSize`
  MaxFill,    \* `maxFillSize`
  Atomic      \* TRUE: `runNode` checks and takes in one step, as it does

Nodes == 1..N

VARIABLES
  parent,   \* the node it is under, or 0 for a top-level call
  places,   \* how many places it runs at: the items of the lists above it
  size,     \* what each of its runs fills in
  status,   \* "waiting", "checked", "running", "done", "failed" or "refused"
  runs,     \* the batch's `runs`
  filled    \* the batch's `filledSize`

vars == <<parent, places, size, status, runs, filled>>

Admitted(n) == status[n] \in {"checked", "running", "done", "failed"}

\* The call a node is under has finished with data to read
ParentDone(n) == IF parent[n] = 0 THEN TRUE ELSE status[parent[n]] = "done"

\* The call a node is under won't run, or failed: the node never runs
ParentGone(n) == IF parent[n] = 0 THEN FALSE ELSE status[parent[n]] \in {"failed", "refused"}

Fits(n) ==
  /\ runs + places[n] <= MaxRuns
  /\ filled + places[n] * size[n] <= MaxFill

Init ==
  /\ parent \in [Nodes -> 0..(N - 1)]
  /\ \A n \in Nodes : parent[n] < n   \* a node is under an earlier one
  /\ places \in [Nodes -> 1..2]
  /\ size \in [Nodes -> 1..2]
  /\ status = [n \in Nodes |-> "waiting"]
  /\ runs = Calls
  /\ filled = 0

\* `runNode`: its inputs are made and counted, then its runs and fill taken,
\* with nothing waiting in between. Or refused, taking none.
Check(n) ==
  /\ status[n] = "waiting" /\ ParentDone(n)
  /\ IF Fits(n)
       THEN IF Atomic
              THEN /\ status' = [status EXCEPT ![n] = "running"]
                   /\ runs' = runs + places[n]
                   /\ filled' = filled + places[n] * size[n]
              ELSE /\ status' = [status EXCEPT ![n] = "checked"]
                   /\ UNCHANGED <<runs, filled>>
       ELSE /\ status' = [status EXCEPT ![n] = "refused"]
            /\ UNCHANGED <<runs, filled>>
  /\ UNCHANGED <<parent, places, size>>

\* Only where something waits between the check and the take
Take(n) ==
  /\ ~Atomic /\ status[n] = "checked"
  /\ status' = [status EXCEPT ![n] = "running"]
  /\ runs' = runs + places[n]
  /\ filled' = filled + places[n] * size[n]
  /\ UNCHANGED <<parent, places, size>>

\* Its procedure runs: it has data for the nodes under it, or fails
Finish(n) ==
  /\ status[n] = "running"
  /\ \E end \in {"done", "failed"} : status' = [status EXCEPT ![n] = end]
  /\ UNCHANGED <<parent, places, size, runs, filled>>

\* `failed`: the nodes under a call that failed or was refused don't run
Skip(n) ==
  /\ status[n] = "waiting" /\ ParentGone(n)
  /\ status' = [status EXCEPT ![n] = "refused"]
  /\ UNCHANGED <<parent, places, size, runs, filled>>

Next == \E n \in Nodes : Check(n) \/ Take(n) \/ Finish(n) \/ Skip(n)

Spec == Init /\ [][Next]_vars /\ WF_vars(Next)

Sum(f) ==
  LET S[s \in SUBSET Nodes] ==
        IF s = {} THEN 0 ELSE LET x == CHOOSE x \in s : TRUE IN f[x] + S[s \ {x}]
  IN S[Nodes]

TypeOK ==
  /\ status \in [Nodes -> {"waiting", "checked", "running", "done", "failed", "refused"}]
  /\ runs \in Nat /\ filled \in Nat

\* Never over the limits
WithinLimits == runs <= MaxRuns /\ filled <= MaxFill

\* What the batch took is what its admitted nodes hold
RunsExact == runs = Calls + Sum([n \in Nodes |-> IF Admitted(n) /\ status[n] /= "checked" THEN places[n] ELSE 0])
FilledExact == filled = Sum([n \in Nodes |-> IF Admitted(n) /\ status[n] /= "checked" THEN places[n] * size[n] ELSE 0])

\* Every node ends with an outcome
AllSettle == <>(\A n \in Nodes : status[n] \in {"done", "failed", "refused"})
====
