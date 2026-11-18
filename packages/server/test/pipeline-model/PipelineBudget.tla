---- MODULE PipelineBudget ----
\* The budgets a pipelined batch shares between its calls, in `pipelineCalls`
\* (packages/server/src/unstable-core-do-not-import/http/pipeline/server.ts).
\* Calls fill in their inputs concurrently: each `await` is a point where
\* another call can run. Promise: the batch never goes over `maxBatchSize`
\* (`runs`) or `maxFillSize` (`filled`), and what it has taken is exactly what
\* its admitted calls hold, so a refused call leaks none of either.
EXTENDS Naturals, FiniteSets

CONSTANTS
  N,                \* how many pipelined calls the batch has
  MaxRuns,          \* the lower of `maxBatchSize` and `maxRuns`
  MaxFill,          \* `maxFillSize`
  MaxItems,         \* most items a list has
  TakeWithLastAdd,  \* TRUE: no `await` between a call's last `add` and its `take`
  ReleaseEarly      \* TRUE: a call that fails before `holdRuns` gives its place back

Calls == 1..N

VARIABLES
  kind,    \* "each": runs once per item of a list; "once": one run
  items,   \* how many items its list has (for "each")
  reads,   \* how many values it reads (for "once")
  size,    \* how much each value or run input it fills in counts
  pc,      \* "start", "fill", "ok" or "refused"
  done,    \* how many `add`s it has made
  acc,     \* what its `fillCounter` has counted, not yet taken
  runs,    \* the batch's `runs`
  filled   \* the batch's `filledSize`

vars == <<kind, items, reads, size, pc, done, acc, runs, filled>>

Adds(c) == IF kind[c] = "each" THEN items[c] ELSE reads[c]

\* The runs a call holds: what its place in `runs` should be
Held(c) ==
  CASE pc[c] = "refused" -> 0
    [] kind[c] = "each" /\ pc[c] \in {"fill", "ok"} -> items[c]
    [] OTHER -> 1

Init ==
  /\ kind \in [Calls -> {"each", "once"}]
  /\ items \in [Calls -> 0..MaxItems]
  /\ reads \in [Calls -> 1..2]
  /\ size \in [Calls -> 1..2]
  /\ pc = [c \in Calls |-> "start"]
  /\ done = [c \in Calls |-> 0]
  /\ acc = [c \in Calls |-> 0]
  /\ runs = N            \* every call starts with its own place
  /\ filled = 0

Release(c) == runs' = runs - Held(c)

\* `inputsOfEach`, after `await getRawInput()` and `await dataOf(list)`:
\* `holdRuns(1, items.length)`. With no items, nothing waits before `take`.
StartEach(c) ==
  /\ pc[c] = "start" /\ kind[c] = "each"
  /\ IF runs + items[c] - 1 > MaxRuns
       THEN /\ runs' = runs - 1 /\ pc' = [pc EXCEPT ![c] = "refused"]
       ELSE /\ runs' = runs + items[c] - 1
            /\ pc' = [pc EXCEPT ![c] = IF items[c] = 0 THEN "ok" ELSE "fill"]
  /\ UNCHANGED <<kind, items, reads, size, done, acc, filled>>

\* `await getRawInput()`, or for a call for every item `await dataOf(list)`,
\* rejects before `holdRuns`. The `catch` gives back the place it holds.
FailBeforeRuns(c) ==
  /\ pc[c] = "start"
  /\ pc' = [pc EXCEPT ![c] = "refused"]
  /\ IF ReleaseEarly THEN runs' = runs - 1 ELSE UNCHANGED runs
  /\ UNCHANGED <<kind, items, reads, size, done, acc, filled>>

\* The `fill` of a call that runs once starts.
StartOnce(c) ==
  /\ pc[c] = "start" /\ kind[c] = "once"
  /\ pc' = [pc EXCEPT ![c] = "fill"]
  /\ UNCHANGED <<kind, items, reads, size, done, acc, runs, filled>>

\* `counter.add(...)`, after the `await dataOf(...)` before it. It throws if
\* the batch would go over `maxFillSize`; the call then takes none of it.
Add(c) ==
  /\ pc[c] = "fill" /\ done[c] < Adds(c)
  /\ IF filled + acc[c] + size[c] > MaxFill
       THEN /\ pc' = [pc EXCEPT ![c] = "refused"]
            /\ Release(c)
            /\ UNCHANGED <<done, acc, filled>>
       ELSE /\ done' = [done EXCEPT ![c] = done[c] + 1]
            /\ acc' = [acc EXCEPT ![c] = acc[c] + size[c]]
            /\ IF TakeWithLastAdd /\ done[c] + 1 = Adds(c)
                 \* `counter.take()`, with nothing waiting before it
                 THEN /\ filled' = filled + acc[c] + size[c]
                      /\ pc' = [pc EXCEPT ![c] = "ok"]
                 ELSE UNCHANGED <<filled, pc>>
            /\ UNCHANGED runs
  /\ UNCHANGED <<kind, items, reads, size>>

\* Only where something waits between the last `add` and `take`
Take(c) ==
  /\ ~TakeWithLastAdd
  /\ pc[c] = "fill" /\ done[c] = Adds(c)
  /\ filled' = filled + acc[c]
  /\ pc' = [pc EXCEPT ![c] = "ok"]
  /\ UNCHANGED <<kind, items, reads, size, done, acc, runs>>

\* A value can't be read or written (the call it reads failed, or the input
\* has no place for it): the call is refused, and gives back what it holds.
Fail(c) ==
  /\ pc[c] = "fill"
  /\ pc' = [pc EXCEPT ![c] = "refused"]
  /\ Release(c)
  /\ UNCHANGED <<kind, items, reads, size, done, acc, filled>>

Next == \E c \in Calls :
  StartEach(c) \/ FailBeforeRuns(c) \/ StartOnce(c) \/ Add(c) \/ Take(c) \/ Fail(c)

Spec == Init /\ [][Next]_vars /\ WF_vars(Next)

Sum(f) ==
  LET S[s \in SUBSET Calls] ==
        IF s = {} THEN 0 ELSE LET x == CHOOSE x \in s : TRUE IN f[x] + S[s \ {x}]
  IN S[Calls]

TypeOK ==
  /\ pc \in [Calls -> {"start", "fill", "ok", "refused"}]
  /\ runs \in Nat /\ filled \in Nat

\* Never over the limits
WithinLimits == runs <= MaxRuns /\ filled <= MaxFill

\* `runs` is exactly the places the calls hold: a refused call leaks none
RunsExact == runs = Sum([c \in Calls |-> Held(c)])

\* `filledSize` is exactly what the admitted calls filled in
FilledExact == filled = Sum([c \in Calls |-> IF pc[c] = "ok" THEN acc[c] ELSE 0])

\* Every call ends admitted or refused
AllSettle == <>(\A c \in Calls : pc[c] \in {"ok", "refused"})
====
