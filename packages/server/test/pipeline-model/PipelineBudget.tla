---- MODULE PipelineBudget ----
\* The budgets a pipelined batch shares between its calls, in `pipelineCalls`
\* (packages/server/src/unstable-core-do-not-import/http/pipeline/server.ts).
\* Calls fill in their inputs concurrently: each `await` is a point where
\* another call can run. A call for every item holds a place for each run of
\* each list of its frame as the list is ready, and each run fills in its own
\* input. Promise: the batch never goes over `maxRuns` (`runs`) or
\* `maxFillSize` (`filled`), and what it has taken is exactly what its runs
\* hold, so a refused list or run leaks none of either.
EXTENDS Naturals, FiniteSets

CONSTANTS
  N,                \* how many pipelined calls the batch has
  MaxRuns,          \* the lower of `maxBatchSize` and `maxRuns`
  MaxFill,          \* `maxFillSize`
  MaxItems,         \* most items a list has
  TakeWithLastAdd,  \* TRUE: nothing waits between counting what a run fills in and taking it
  ReleaseEarly      \* TRUE: a list or a run that doesn't run gives its places back

Calls == 1..N

\* What a call is: one that runs once and reads `reads` values, or one for
\* every item of a list, or of a list of lists, with this many items in each
\* list. `size` is how much each value, or each run's input, counts
Shapes ==
  {[kind |-> "once", levels |-> 1, lists |-> <<0, 0>>, reads |-> r, size |-> z] :
     r \in 1..2, z \in 1..2}
  \cup {[kind |-> "each", levels |-> 1, lists |-> <<k, 0>>, reads |-> 0, size |-> z] :
     k \in 0..MaxItems, z \in 1..2}
  \cup {[kind |-> "each", levels |-> 2, lists |-> <<k, l>>, reads |-> 0, size |-> z] :
     k \in 0..MaxItems, l \in 0..MaxItems, z \in 1..2}

VARIABLES
  shape,        \* what each call is, from `Shapes`
  pc,           \* "start", "lists", "runs", "fill" or "refused"
  placeholder,  \* whether it still holds the place it held from the start
  next,         \* for "each": the next of its lists to be ready
  pending,      \* for "each": runs that hold a place and haven't filled in yet
  counted,      \* runs that have counted what they fill in and not taken it
  ran,          \* runs that have taken what they fill in
  runs,         \* the batch's `runs`
  filled        \* the batch's `filledSize`

vars == <<shape, pc, placeholder, next, pending, counted, ran, runs, filled>>

\* What one run fills in
Fill(c) ==
  IF shape[c].kind = "each" THEN shape[c].size ELSE shape[c].reads * shape[c].size

Lists(c) == shape[c].levels

\* The places a call holds: what its share of `runs` should be
Held(c) ==
  (IF placeholder[c] THEN 1 ELSE 0) + pending[c] + counted[c] + ran[c]

Init ==
  /\ shape \in [Calls -> Shapes]
  /\ pc = [c \in Calls |-> "start"]
  /\ placeholder = [c \in Calls |-> TRUE]
  /\ next = [c \in Calls |-> 1]
  /\ pending = [c \in Calls |-> 0]
  /\ counted = [c \in Calls |-> 0]
  /\ ran = [c \in Calls |-> 0]
  /\ runs = N            \* every call starts with its own place
  /\ filled = 0

\* Gives back the place it held from the start, if it still does
ReleasePlaceholder(c) ==
  IF placeholder[c]
    THEN /\ placeholder' = [placeholder EXCEPT ![c] = FALSE]
         /\ IF ReleaseEarly THEN runs' = runs - 1 ELSE UNCHANGED runs
    ELSE UNCHANGED <<placeholder, runs>>

\* Refused, its procedure isn't there, or its own input can't be read,
\* before it reads anything
FailBeforeRuns(c) ==
  /\ pc[c] = "start"
  /\ pc' = [pc EXCEPT ![c] = "refused"]
  /\ ReleasePlaceholder(c)
  /\ UNCHANGED <<shape, next, pending, counted,
                 ran, filled>>

\* `perItem`: its frame's first level is ready. A list of lists has no runs
\* at that level, so the call gives back its place then (`release()`)
StartEach(c) ==
  /\ pc[c] = "start" /\ shape[c].kind = "each"
  /\ pc' = [pc EXCEPT ![c] = "lists"]
  /\ IF shape[c].levels = 2
       THEN ReleasePlaceholder(c)
       ELSE UNCHANGED <<placeholder, runs>>
  /\ UNCHANGED <<shape, next, pending, counted,
                 ran, filled>>

\* A list whose items are runs is ready: `holdRuns(placeholder ? 1 : 0, k)`,
\* with nothing waiting in it. Over the limit, the list runs for none of
\* its items, and gives back the place the call held from the start
ListReady(c) ==
  /\ pc[c] = "lists" /\ next[c] <= Lists(c)
  /\ LET k == shape[c].lists[next[c]]
         had == IF placeholder[c] THEN 1 ELSE 0
     IN IF runs - had + k > MaxRuns
          THEN ReleasePlaceholder(c) /\ UNCHANGED pending
          ELSE /\ runs' = runs - had + k
               /\ placeholder' = [placeholder EXCEPT ![c] = FALSE]
               /\ pending' = [pending EXCEPT ![c] = pending[c] + k]
  /\ next' = [next EXCEPT ![c] = next[c] + 1]
  /\ pc' = [pc EXCEPT ![c] = IF next[c] = Lists(c) THEN "runs" ELSE "lists"]
  /\ UNCHANGED <<shape, counted, ran, filled>>

\* The `fill` of a call that runs once starts. Its place is its run
StartOnce(c) ==
  /\ pc[c] = "start" /\ shape[c].kind = "once"
  /\ pc' = [pc EXCEPT ![c] = "fill"]
  /\ placeholder' = [placeholder EXCEPT ![c] = FALSE]
  /\ pending' = [pending EXCEPT ![c] = 1]
  /\ UNCHANGED <<shape, next, counted, ran, runs,
                 filled>>

\* A run's `fill`, after `await` of every value it reads: it counts what it
\* fills in, and takes it with nothing waiting in between. Over the limit,
\* it doesn't run, and gives back its place
FillRun(c) ==
  /\ pending[c] > 0
  /\ pending' = [pending EXCEPT ![c] = pending[c] - 1]
  /\ IF filled + Fill(c) > MaxFill
       THEN /\ IF ReleaseEarly THEN runs' = runs - 1 ELSE UNCHANGED runs
            /\ UNCHANGED <<counted, ran, filled>>
       ELSE IF TakeWithLastAdd
              THEN /\ filled' = filled + Fill(c)
                   /\ ran' = [ran EXCEPT ![c] = ran[c] + 1]
                   /\ UNCHANGED <<counted, runs>>
              ELSE /\ counted' = [counted EXCEPT ![c] = counted[c] + 1]
                   /\ UNCHANGED <<ran, runs, filled>>
  /\ UNCHANGED <<shape, pc, placeholder, next>>

\* Only where something waits between counting and taking
Take(c) ==
  /\ ~TakeWithLastAdd
  /\ counted[c] > 0
  /\ counted' = [counted EXCEPT ![c] = counted[c] - 1]
  /\ ran' = [ran EXCEPT ![c] = ran[c] + 1]
  /\ filled' = filled + Fill(c)
  /\ UNCHANGED <<shape, pc, placeholder, next,
                 pending, runs>>

\* A value can't be read or written: the run it reads failed, or the input
\* has no place for it. The run doesn't run, and gives back its place
FailRun(c) ==
  /\ pending[c] > 0
  /\ pending' = [pending EXCEPT ![c] = pending[c] - 1]
  /\ IF ReleaseEarly THEN runs' = runs - 1 ELSE UNCHANGED runs
  /\ UNCHANGED <<shape, pc, placeholder, next,
                 counted, ran, filled>>

Next == \E c \in Calls :
  \/ FailBeforeRuns(c) \/ StartEach(c) \/ ListReady(c) \/ StartOnce(c)
  \/ FillRun(c) \/ Take(c) \/ FailRun(c)

Spec == Init /\ [][Next]_vars /\ WF_vars(Next)

Sum(f) ==
  LET S[s \in SUBSET Calls] ==
        IF s = {} THEN 0 ELSE LET x == CHOOSE x \in s : TRUE IN f[x] + S[s \ {x}]
  IN S[Calls]

TypeOK ==
  /\ pc \in [Calls -> {"start", "lists", "runs", "fill", "refused"}]
  /\ runs \in Nat /\ filled \in Nat

\* Never over the limits
WithinLimits == runs <= MaxRuns /\ filled <= MaxFill

\* `runs` is exactly the places the calls hold: a refused list or run leaks
\* none
RunsExact == runs = Sum([c \in Calls |-> Held(c)])

\* `filledSize` is exactly what the runs that ran filled in
FilledExact == filled = Sum([c \in Calls |-> ran[c] * Fill(c)])

\* Every call ends with each of its runs done or refused
Settled(c) ==
  /\ pc[c] # "start" /\ pc[c] # "lists"
  /\ pending[c] = 0 /\ counted[c] = 0

AllSettle == <>(\A c \in Calls : Settled(c))
====
