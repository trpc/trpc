# Match loading internals

This document describes the architecture that loads route matches on the
client, on the server, and across hydration. It is for maintainers of router
core and the framework adapters.

Match loading coordinates several asynchronous flows, but its runtime
coordination state is limited to actual writers and owned resources. Phase names
and invalid transitions belong in TypeScript whenever possible; they do not
justify a second runtime state machine.

All `_`-prefixed fields mentioned here are internal. Their spelling and shape
may change, but the ownership rules in this document must continue to hold.

## Vocabulary and the short version

- A **match** is one route at one concrete set of path params, search-derived
  loader dependencies, and loader/cache identity.
- A **lane** is one location plus its ordered array of matches.
- A **generation** is one concrete match result for a match ID. Several
  generations can share an ID while holding different loader data or ownership;
  a newer one can exist without being the one currently displayed.
- A **loader flight** is one loader invocation together with its promise and
  abort controller. `router._flights` lets later consumers find the newest
  same-ID flight.
- A **lease** is one match's ownership of a flight. Registry membership makes a
  flight discoverable; leases keep it alive.
- **Semantic state** is the accepted lane used for reuse and lifecycle
  decisions. **Presentation state** is the lane currently exposed to rendering
  and selectors.
- A **cutoff** is the end of the match prefix allowed to render or contribute a
  particular output. The first pending or terminal boundary normally sets it,
  even though later matches remain structurally present.
- To **publish** is to replace router state that renderers or users can observe.
  An **identity check** means that publication is allowed only while the exact
  owner or base reference used to produce the result is still current.

The normal client flow is:

```text
match a private lane
  -> build context and run beforeLoad parent-first
  -> run eligible loaders and component readiness work
  -> select one final outcome and derive assets
  -> publish only if the navigation still owns the result
```

An ordinary foreground or preload loader success can gain an independent cache
owner while its lane is still private. This is per-match data reuse, not lane
publication; unresolved loader work remains owned only by its consumers.

Preloads run the same work without publishing a lane. Server loading uses a
request signal instead of a client navigation owner. Hydration reconstructs the
accepted server prefix, then hands any remaining client work to the initial
client load.

## The architectural rule

For each mutable result, there must be one answer to each of these questions:

1. Who may publish it?
2. Who owns the work and cancellation signal that produce it?
3. What proves that the answer is still current after an `await`?

Do not add a flag, counter, copied deadline, or second completion promise merely
to describe an existing fact. Add runtime state only when it removes an
independent writer, resource owner, or invalid transition.

The main authorities are:

| Authority                    | What it owns                                                        |
| ---------------------------- | ------------------------------------------------------------------- |
| `_tx`                        | The client navigation allowed to commit and publish foreground flow |
| `_preflight`                 | The current client plan or asynchronous hydration reconstruction    |
| `_handoff`                   | The temporary right to transfer one reconstructed SSR prefix        |
| `_committed`                 | The accepted current lane and lifecycle/background identity base    |
| `stores.matches`             | The current match presentation exposed to renderers and users       |
| `router._cache`              | Off-screen loader generations preferred during same-ID planning     |
| Active preload entry         | Cancellation, cache clearing, and private redirect-chain ownership  |
| Loader flight registry entry | The latest same-ID loader generation available to new consumers     |
| Match flight lease           | Ownership keeping that loader work alive                            |
| Pending session              | One reveal/minimum-visible deadline and its current owner           |
| React acknowledgement slot   | The one requested publication whose render may settle a transition  |
| Refresh transaction          | Forced rematerialization and an optional hydration handoff          |
| Request signal               | Lifetime of one server request and any accepted SSR stream          |
| Accepted SSR stream response | Cleanup ownership transferred from the handler to the response body |

These authorities are related, but none is a substitute for another. In
particular, presentation is not semantic authority, registry membership is not
resource ownership, and a promise settling is not permission to publish.

## Code map

- `src/router.ts` matches locations, creates match objects, owns public router
  state, history, cache operations, and entry points into loading.
- `src/stores.ts` reconciles route-keyed presentation stores and their ordered
  aggregate.
- `src/load-client.ts` owns client planning, transactions, preloads, loader
  flights, lazy route and component readiness, reduction, pending presentation,
  background reloads, commits, and hydration reconstruction.
- `src/load-server.ts` runs the request-local server lane.
- `src/ssr/createRequestHandler.ts` connects request lifetime, server loading,
  dehydration, redirects, rendering, and cleanup.
- `src/ssr/handlerCallback.ts`, `src/ssr/ssr-server.ts`, and
  `src/ssr/transformStreamWithRouter.ts` transfer stream ownership and
  coordinate serialization, injection, abort, and cleanup.
  `src/ssr/hydrationScripts.ts` owns the request-local hydration script queue
  and framing; `src/ssr/htmlBoundaryScanner.ts` owns the byte matchers.
  See `src/ssr/STREAMING.md` for the transport contract.
- Framework `Transitioner` and `Matches` implementations acknowledge exact
  publications and render only through the selected boundary. Framework
  `RouterClient` and render-to-stream implementations complete hydration and
  connect request abort to their renderer.

## Semantic state and presentation state

The rewrite deliberately separates two views of matches.

### Semantic matches

`_committed` is the accepted current semantic lane. It supplies lifecycle
identity and is the exact base checked before a background publication. Pending
presentation never replaces it as a planning base.

For an individual match ID, matching first consults `router._cache` and then
falls back to `_committed`. A cached loader generation can therefore shadow the
currently displayed same-ID generation for future planning without becoming
current presentation or lifecycle authority.

Semantic matches may own loader-flight leases. They are not mutated by losing
transactions or by pending presentation.

### Presented matches

`stores.matches` is the array visible to router state and framework stores.
Before `pendingMs` expires it can still contain the source presentation. Once
pending presentation is published, it contains the whole destination lane,
including descendants that are still loading. Terminal publication follows the
same membership rule: an error is retained at the throwing match, while
not-found is moved to its selected boundary, but neither removes
structurally matched descendants. The framework renderer derives its cutoff
from the first pending or terminal boundary instead of requiring core to hide
descendants.

The render cutoff also bounds route response headers, SSR manifest assets,
dehydration, and cache exclusion during commit. Framework construction of head
and scripts uses the closely related asset cutoff. It normally stops at the
same boundary, with one selective-SSR hydration exception: a verified
`'data-only'` prefix can carry `_assetEnd`, allowing already-projected assets
from verified descendants to remain active past a pending render boundary until
the client continuation commits. A structural descendant below the relevant
cutoff remains observable in state, but it cannot contribute that output or
evict a newer cache generation merely because it is present in the lane.

Start's static early hints are another deliberate exception. They are
speculative route-tree hints emitted before loading selects a terminal boundary,
and an already-sent 103 response cannot be retracted.

The presentation pool is keyed by route ID, not match ID. `stores.ids` defines
active membership and order, while `stores.getMatchStore` obtains the one stable
mutable atom in `stores.byRoute` for a route. That atom contains the route's
presented match or `undefined`. An active route branch contains a route at most
once, so this shape cannot alias two visible matches. When params, search, or
loader dependencies produce a new semantic match ID for the same route,
reconciliation replaces the value in that route's existing atom. Leaving a
route tombstones that atom with `undefined`; re-entering fills the same atom
again. Route components and `useMatch({ from })` therefore keep one subscription
across match generations and A-to-B-to-A membership changes. `ids` is published
before departure tombstones so framework trees stop reading a leaving route
before its atom is cleared. The pool retains atoms for route IDs encountered
during the router's lifetime; it is not an LRU or a cache of match generations.
Semantic caches and loader flights remain keyed by match ID and must not use the
presentation pool as their authority.

This distinction matters for user code. Once the destination is presented, a
selector can inspect every destination match and observe `isFetching` while the
renderer still shows only the valid prefix. Before that publication, same-ID
matches in the source presentation can expose updated fetching state, but a new
destination-only match is still private.

Pending entries are flight-free snapshots. They may copy loader data and context
for presentation, but they never become a planning base and never own semantic
resources.

### Location state

`stores.location` is the requested location. It can advance before loading
finishes. For foreground client navigation, `stores.resolvedLocation` advances
only after the framework transition acknowledgement settles. Settlement, not a
`true` render result, is what permits navigation completion. Router `status` is
`pending` during that interval and returns to `idle` at completion. A `true`
result separately permits `onRendered` and pending minimum timing. Server
publication and hydration perform their request/initial-load handoffs directly,
as described below.

### Canonical locations and rewrites

Initial client and server canonicalization compares `publicHref`, the
browser-facing URL produced by the rewrite contract. Parsed semantic `href` and
rebuilt `href` are not necessarily symmetric: input and output rewrites run in
opposite directions. The client ignores a trailing-slash-only difference while
the server can redirect to the exact browser-facing canonical URL.

## A lane and its phases

A lane is one location plus an ordered array of work matches. Its phase is
encoded in TypeScript:

```text
matched -> contextualized -> reduced -> projected
```

### Matched

Matching establishes route order, params, validated search results, loader
dependencies, match IDs, initial status, and possible semantic reuse. It does
not run `beforeLoad` or grant publication authority.

A match ID identifies loader/cache compatibility. It is derived from route
identity, interpolated path params, and serialized `loaderDeps`. Other search
values affect loader identity only when the route includes them in `loaderDeps`.

Matching treats `params.parse`, `validateSearch`, and `loaderDeps` as pure
planning functions. For the same input they must return the same value without
navigating or mutating router/application state. A `loaderDeps` result and its
serialization hooks must also be side-effect-free. These callbacks may be
evaluated more than once; supporting reentrancy from them would add runtime
ownership checks to every planning step without representing a supported use.

### Contextualized

Contextualization walks parent to child. For each route it:

1. computes route context from the completed parent context,
2. handles params/search validation,
3. runs the route's `beforeLoad`, when defined, and
4. merges the result before moving to the child.

This serial order guarantees that child route context, child `beforeLoad`, and
child loader context cannot observe a partially completed parent guard.

Route context is synchronous in the public type contract. Its own contribution
is cached on the match as `_ctx`, and match identity includes route identity,
path params, and `loaderDeps`. A same-ID cache hit may therefore reuse that
route-local result, including one produced by a completed preload. The merged
context is still rebuilt parent-first from the current parent's merged context,
the route's `_ctx`, and the current `beforeLoad` result. Reusing `_ctx` must never
reuse an older merged context or `beforeLoad` contribution.

Server requests have fresh matches and execute route context normally.
Hydration executes each accepted route context locally, stores its `_ctx`, and
then merges transported `beforeLoad` output. Every normal client lane,
including every preload, performs its own contextualization and `beforeLoad`
chain.

### Reduced

On the client, eligible loaders and normal component chunks start concurrently.
On the server, loaders reduce before normal render chunks are consumed.
Reduction turns their outcomes into one terminal semantic lane and one cutoff.
No task publishes semantic or presentation state while reduction is in
progress. An eligible successful client loader may independently enter the
off-screen cache at settlement; that admission neither accepts the lane nor
selects its terminal outcome.

### Projected

After semantic reduction, client asset hooks derive `meta`, `links`, styles, and
scripts from the final lane. Server projection additionally derives response
headers. Projection cannot replace the selected loader/before-load result.

Only an owner that remains current after projection may publish.

## Client planning and the single writer

Planning is intentionally separate from transaction installation. Lifecycle
events and route execution callbacks can synchronously reenter the router.
Planning callbacks used for params, search, and loader-key derivation are the
pure functions described above and do not create a second reentrancy boundary.

A planning controller is installed before `onBeforeNavigate`, `onBeforeLoad`,
and matching, invalidating an older synchronous plan. The planner checks its
authority after supported reentrant callbacks and before installing a
transaction. A stale plan exits without installing a transaction or altering
semantic state.

Once planning succeeds, the router installs one `_tx`. The transaction owns:

- the destination and its private matches,
- one lane cancellation controller,
- `done`, the transaction-completion promise used by current transaction
  waiters and by React to retain the Suspense source tree while a published
  pending match is still loading,
- redirect depth for the chain currently being executed, and
- any pending session transferred to it.

`LoadTransaction`, the lane execution options, and the pending session are
labeled TypeScript tuples. They are deliberately not runtime state machines:
the labels make each slot type-safe for maintainers, while the compact runtime
shape avoids repeating property names throughout the client loader. Changing a
slot means updating the tuple declaration and every typed consumer together;
it must not introduce a second owner or completion signal.

Throwing `done` from a pending React match does not stop the transaction's work.
Once the lane has reduced and projected, its successful destination is
published inside the framework transition; that render acknowledgement then
allows `done` to settle. `_commitPromise` is the internal promise backing public
history/navigation completion. Current completion resolves it, and a
superseding transaction can chain it forward, but it is also not permission to
publish. These promises describe different wait relationships; `_tx` remains
the only client writer authority.

Redirect depth transfers only through the exact `_pendingLocation` created by
`followRedirect`. It is not inherited from the previous transaction: a user
navigation that reenters during a redirect starts a fresh chain even though the
redirecting transaction is still alive.

The latest `_tx` remains installed after it settles. Its presence is writer
identity, not a loading flag; public loading state comes from router `status`
and per-match `isFetching`.

Installing a successor removes the predecessor's publication authority. The
predecessor must still settle and release everything it owns; cancellation is a
liveness mechanism, not a license to abandon cleanup.

Commit and cache handoff install the accepted semantic/cache recipients before
releasing replaced resources. Releasing the last flight lease aborts a public
signal and can synchronously reenter user code, so an old generation must never
be released while it still appears to be the accepted owner. The committed lane
is also removed from the transaction's private ownership before publication.

Every asynchronous navigation or presentation publication checks `_tx`
immediately before the write. Background publication additionally checks the
exact committed base array from which it was derived. Per-match cache admission
is not lane publication: it requires the producing lane's controller to remain
live and the cache entry captured during planning to remain the exact current
entry. Navigation lanes use their transaction controller, while preloads use
their independently owned controller. Private preload redirect continuation
uses the active preload entry as its additional authority.

## `beforeLoad`: execution and hydration

`beforeLoad` context is not a cache.

Client `beforeLoad` only installs a cancellable wait for Promise results.
Synchronous context still crosses an `await` before the cancellation check:
a hook can queue a replacement navigation before its loader is planned.
Promise detection assumes ordinary Promise behavior.

A completed client preload never stores reusable `beforeLoad` output. When its
loader data enters the route cache, the merged context is discarded; the
same-ID route-local `_ctx` may remain reusable. A later navigation rebuilds the
merged context from the current parent and `_ctx`, then reruns `beforeLoad`, even
when it reuses completed loader data.

There is one deliberate exception: hydration.

### Client lanes

Every navigation and every preload rematches and runs its own serial
`beforeLoad` chain. This remains true for identical concurrent preloads and for
a navigation that targets a still-running preload. A call made with
`preload: true` is never accepted as the navigation's call with
`preload: false`; that call's context and control or terminal outcome stay
private to its speculative lane. This does not isolate the normalized outcome of
a same-ID loader flight that multiple lanes deliberately share.

`router._preloads` has no semantic adoption role. Its controller entry owns
cancellation, invalidation, and cache clearing and proves that a standalone
preload remained active through normal settlement; successful removal authorizes
private redirect continuation. Its live lane signal is also the final authority
for cache publication, including the microtask window after a loader outcome has
fulfilled. Loader results remain independently reusable: a completed preload may
seed the match cache, and a still-running preload may donate its same-ID loader
flight after the receiving lane has run its own `beforeLoad` and made its reload
decision.

### Hydration

The server-resolved prefix is authoritative for the initial document. Hydration
therefore restores transported `beforeLoad` output for the accepted prefix
without rerunning it on the client. This applies to the server-rendered prefix
in selective SSR; the unresolved client suffix follows normal navigation
rules.

Hydration is not a general `beforeLoad` cache. Its temporary handoff is valid
only for the initial client load of the same document entry and exact committed
owner; rejection, invalidation, or any later load returns to normal serial
execution. The claim also requires the same raw browser href and history-state
object. Finish-time match-ID validation proves that rematching still produced
the accepted prefix; opaque router context and route-tree objects are not
compared. That initial load may transfer the accepted hydration prefix and keep
its transported context while it completes a selective-SSR suffix. A preload
never claims this prefix. Frameworks must start the initial client load before
descendant route code can preload; invoking a preload in the gap after raw
`hydrate()` and before that load is outside the supported handoff protocol.

## Loader data, cache entries, and flights

Loader data is designed to be reusable. It is independent from `beforeLoad`
provenance.

### Completed cache entries

Successful loader-backed matches can be cached by match ID. Staleness,
invalidation, `shouldReload`, stale reload mode, and GC policy decide whether a
lane uses that data or requires a loader generation. A discoverable same-ID
flight may satisfy that requirement, including when `shouldReload` returns
`true`.

Every eligible successful blocking loader task from a foreground navigation,
development refresh, or preload attempts cache admission immediately after loader
settlement. It does not wait for component readiness, whole-lane reduction,
projection, commit, or render acknowledgement. The cache receives a
non-terminal copy with merged context removed and an additional flight lease;
the private lane keeps its own match and lease until it commits or is discarded.
If a navigation is superseded, a settled cached generation therefore survives
the lane's lease release, while an unresolved loader has no cache owner and is
aborted when its last consumer releases it. Navigation-produced entries retain
normal navigation staleness and GC semantics rather than becoming synthetic
preloads.

Background loader candidates remain private until their exact transaction and
committed base authorize background publication. A development refresh may
admit successful loader work while its lane is private, but refresh commit
discards every cache generation instead of preserving stale rematerialization
inputs.

It is valid for cached loader data to have been produced under context from an
older `beforeLoad` generation. Loaders are the cache boundary; guards are not.
Likewise, a shared in-flight invocation may have started with another lane's
older context. Only a newly started loader invocation receives the current
lane's freshly built context.

An invalid successful entry may remain in the cache as stale data and preserve
its generation identity, but it can never satisfy freshness and must reload.
Failed, canceled, loaderless, and expired generations do not become reusable
loader-cache entries.

A private client lane can contain independently successful loader generations
when its eventual terminal outcome comes from `beforeLoad`, validation, another
route, or when a descendant is still loading as the navigation is superseded.
Settlement-time cache admission works even below the eventual render boundary
and does not preserve the private parent chain: merged context and `beforeLoad`
output are cleared. Same-ID `_ctx`, loader identity, and successful loader data
remain reusable by design.

Hydration retry is the transported-work exception because it did not run those
client loader tasks. There, `loaderData` membership together with
`invalid === false` proves a transported successful generation even when
terminal boundary state is attached to the match. Hydration normalizes that copy
before passing it through the same cache identity and lease rules.

The dehydrated payload omits `loaderData` both when no loader result exists and
when the accepted result is `undefined`. This deliberately keeps the HTML
payload smaller at the cost of making those states indistinguishable after
transport. Reconstruction preserves the absence and does not treat an omitted
value as reusable loader success during hydration retry.

The cache may deliberately contain a successful generation with the same match
ID as a committed match. For example, a navigation can finish an ancestor
loader and then be superseded while a descendant is still pending, or a private
lane can produce reusable ancestor data before failing below it while an older
committed generation remains visible. Cache-first matching lets the next lane
use that newer loader generation. Its merged context and `beforeLoad`
contribution have been removed; the merged chain is rebuilt from current parents
and same-ID route-local context before `beforeLoad` reruns.

Commit removes a cache entry when the accepted render prefix contains that ID,
or when a successful match anywhere in the committed lane contains it. A
non-success descendant below the render cutoff is only structural membership;
it must not evict a newer same-ID cache generation.

### Same-ID in-flight work

`router._flights` is the only registry from which a new consumer discovers
same-ID loader work. Every new loader generation registers there, whether it
was started by navigation, preload, or background refresh. A newer generation
replaces the registry entry synchronously. A flight has its own abort
controller; it does not use one consumer transaction's controller as its
lifetime.

Two facts must remain separate:

- registry membership means new consumers may join the flight;
- a match lease means an existing consumer keeps the flight alive.

Registry membership normally owns no lease. A successfully settled generation
may remain discoverable while at least one semantic or cached match owns it. A
non-success outcome removes the exact current flight from the registry as it
settles; existing leases keep that outcome alive only for consumers that already
joined, while later planners start a fresh generation. Releasing the last lease
removes a successful generation only if it is still the current registry entry,
then aborts its controller. Every copied semantic match that retains a flight
must acquire a lease, and every discarded match must release one exactly once.

There is one short exception to normal zero-lease cleanup. When one navigation
replaces another with the same match ID, the predecessor's loader flight can
reach zero leases before the successor finishes `beforeLoad` and decides whether
to reuse it. While the current transaction is visibly running `beforeLoad` for
that same-ID successor, the flight remains discoverable. The same grace period
applies if any other same-ID flight loses its final lease during that phase.
Outside this phase, merely having a current `_tx` is not enough to retain a
zero-lease flight.

Loader planning ends the grace period synchronously. The successor either
acquires the discoverable flight or one sweep removes and aborts it. A lane with
no `beforeLoad` reaches loader planning before contextualization yields; an
asynchronous `beforeLoad` keeps the grace period visible until it settles.
Preloads neither create nor sweep this navigation-only reservation. An explicit
`shouldReload: false` declines the flight, while invalidation removes discovery
for selected IDs before starting the replacement load. No extra flag, counter,
or completion promise represents the grace period.

Releasing a set of matches is deliberately two-phase. First every outgoing
match drops its `_flight` lease and every zero-owner generation not reserved by
the current transaction is removed from the discovery registry. Only after the
entire outgoing set is detached are the collected flight controllers aborted.
Do not interleave one flight abort with detaching later matches in the same
replacement: an abort listener can synchronously reenter, and that load must
observe every logically removed lease and registry entry as already gone.

A successful accepted match may keep its lease after the loader promise has
settled. This keeps the loader's public `AbortSignal` alive for that semantic
generation. The signal aborts when the last active or cached owner is replaced,
unloaded, expired, or discarded; promise settlement alone does not end it.

Loader error normalization, including route `onError`, runs once while the exact
flight still has a match lease. The terminal flight leaves the discovery
registry before normalization, so a navigation reentered by `onError` starts a
fresh generation. Releasing every match before a late rejection makes the
generation semantically discarded; abort-triggered rejection must not call user
error hooks. This is an ownership check, not a separate cancellation flag. A
loader that aborts its own flight controller while its match remains owned can
still fulfill or reject normally.

A planned match holds only the lease for the accepted generation copied from
cache or committed state. After `beforeLoad` and `shouldReload` decide that a
loader will run, it may synchronously acquire the registry's latest different
same-ID generation. It never reacquires its own accepted generation merely to
avoid a requested reload. A blocking reload replaces the accepted lease with
the donor; a background reload keeps accepted data visible and gives the donor
lease to its private candidate. This one lookup covers work started by active
preloads, navigation, and background refresh without scanning those owners.

Active preload flights need no special handoff. Their speculative matches keep
positive leases until the preload settles or is canceled, so another lane can
discover and acquire the flight without adopting the preload lane.

Consumers already joined to one loader flight observe its single normalized
outcome, including error and not-found. Per-lane cancellation can stop only that
consumer's wait. A non-success flight retires from discovery at settlement, so
only lanes planned afterward retry. Redirect remains control flow and is never
cached as loader data.

### Semantic parent chain

`parentMatchPromise` represents the semantic parent generation, not merely the
currently displayed parent.

This distinction is essential for mixed reload modes. If a parent is refreshing
in the background while a child reloads in blocking mode, the child borrows the
fresh parent candidate. The final lane must not combine fresh parent data with
child data derived from the stale visible parent.

The same semantic-parent chain is used by blocking and background loader work.
Task arrays track readiness/outcomes; they are not a second parent authority.

### Components and lazy route options

There is no router-level component-promise cache. The browser module cache and
framework lazy-component machinery already cache loaded JavaScript.

Lazy route loading retains only the authority needed to install lazy route
options, ignore obsolete HMR settlements, and retry failed imports. It is not a
general JavaScript-module cache.

Lazy option installation has one route-owned promise. Success installs options
only while that promise is still the route's owner. Rejection clears the owner
so a later load can retry, and development refresh can clear ownership so an
obsolete import cannot install options afterward.

Normal component readiness is part of route readiness, not merely an asset
prefetch side effect. Client loader and normal component work may run in
parallel, and a blocking match becomes successful only after both are ready.
When a client lane installs a `pendingComponent` from lazy options, that
component wakes pending selection once it is itself ready, without waiting for
the normal component. This does not require retaining a component promise on
the match: the route's lazy-option owner and the framework/module loader provide
the necessary work identity.

Client and server not-found boundary searches settle lazy options on each
candidate route before testing for `notFoundComponent`. A lazy rejection while
locating the boundary does not replace an already selected not-found, but
cancellation or request abort still stops the search. The selected terminal
boundary component is then loaded best effort.

## Outcomes and failure selection

Internal work normalizes returned and thrown values into a small closed set:

```text
success | error | not-found | redirect | canceled/skipped
```

Redirect and cancellation are control flow, not committed match statuses.
Error and not-found are terminal semantic outcomes assigned once during
reduction.

Returned and thrown redirects/not-founds normalize identically. Only an error
invokes route `onError`; if `onError` throws, its value is normalized again and
may itself become an error, not-found, or redirect.
Client and server lanes build a route redirect while its source route still owns
the outcome. Target-construction failures therefore become that route's error,
and a successful client target travels with the redirect so navigation does not
run functional updaters twice.
Client loader flights retain the raw redirect because a flight can be shared.
Each consuming lane materializes that redirect against its own location and
policy before exposing the lane-owned task outcome to settlement and reduction.
Router cancellation and request abort bypass `onError`. Aborting the
`AbortController` exposed to a loader is not by itself proof that the router
discarded the work: a still-owned loader may fulfill or reject afterward, and
that settlement is normalized normally. On the client, zero flight leases prove
that an aborted generation was discarded. On the server, the request signal
proves request cancellation, while the already selected failure/control outcome
proves that an aborted descendant is obsolete. The client calls a discarded
non-result `canceled`, while the server calls it `skipped`; neither is a
publishable terminal state.
The transaction controller exposed to client `context` and `beforeLoad` is
router-owned; route code may observe its signal but must not abort it. A canceled
client lane has therefore already lost writer authority to a successor.
Canceled client lanes release only their private work; the transaction that
superseded them owns presentation and completion.

The client and server use the same settlement order and renderable-ancestor
rules.

### Serial phase

Route context, validation, and `beforeLoad` run parent-first. The first terminal
serial outcome stops descent and wins over later loader or chunk work when the
ancestors needed to render its boundary remain usable.

An error from the serial phase allows loaders strictly above the throwing route
to finish. A serial not-found allows work through its effective ancestor
boundary, but never past the throwing route. A serial redirect or cancellation
starts no loader work.

### Parallel loader phase

Eligible loaders start concurrently. The first loader error or not-found to
settle becomes the provisional failure. The choice follows promise settlement
order, not route order or boundary depth. After settlement, the required render
prefix is checked root-to-leaf. The first failed ancestor without its own accepted
`loaderData` property replaces a deeper failure because that deeper boundary is
not reachable. Locally retained loader data, including an accepted `undefined`,
keeps the ancestor renderable with stale data and preserves settlement
chronology. An `undefined` result reconstructed from SSR is intentionally absent
under the transport policy above.

A redirect is control flow and wins even after an ancestor loader has already
failed. Reduction therefore waits for started descendant loader work to reveal
a redirect, including a descendant already refreshing in the
background. An error or not-found does not cancel already-started descendants
before this selection completes. Once all relevant work has settled, the first
such failure is used only if no redirect won. The client retains the full
structural branch and releases only work that no accepted semantic or background
candidate owns; the server may abort work below the selected boundary.

Loader settlement does not immediately make each error or not-found terminal.
As an internal staging state, a failed attempt is reset to `status: 'success'`
and marked `invalid: true`. This lets already-started descendants settle, allows
a descendant redirect to remain control flow, and gives reduction one place to
choose the terminal failure that will be published. Reduction then installs the
selected error or not-found on its boundary. A failed ancestor without accepted
loader data replaces a deeper failure because that deeper boundary cannot
render. Every non-selected failed attempt stays invalid and must reload rather
than becoming fresh cache data. Semantic `parentMatchPromise` snapshots still
expose each loader's own outcome to its descendants.

No error-over-not-found sort is performed. The selected not-found is moved to
its effective not-found boundary; an untargeted not-found searches eligible
ancestors, while a targeted not-found respects its target.

A global path miss is terminal by `_notFound` even when the selected match
remains successful and has no error attached. An explicit not-found reduced to
root also attaches its error there. Both forms cap rendering and hydration and
produce a 404 response.

For a fuzzy global miss, synchronous matching installs the best boundary visible
from eager route options. Before contextualization, client and server feed that
fallback through the same lazy-aware ancestor search used for explicit
not-found outcomes. This prevents serial hooks below the effective boundary
from running and prevents loader tasks from starting there, while retaining the
complete structural branch. The historical deepest-route-with-children fallback
still applies when no route supplies a not-found component. When `notFoundMode`
is `'root'`, the search is bypassed but the same execution cap applies at root.

### Chunk readiness

Normal route chunks needed before the selected cutoff are awaited. Although the
work may start concurrently, readiness outcomes are consumed root-to-leaf. The
first relevant chunk error replaces a deeper selected serial or loader failure
because that boundary is no longer reachable; a redirect from relevant
readiness remains control flow.

The resolved boundary is retained while that selected failure remains current.
A later lazy retry in the same lane cannot expand the required prefix after its
readiness has already been consumed.
Terminal boundary-component preloading is best effort during normal loading; it
does not start a second failure-selection algorithm.

On the client, lazy/chunk readiness starts independently of loader completion
and notifies pending selection when it settles. A `pendingComponent` installed
by lazy options can therefore become the visible boundary while an eager loader
is still unresolved.

### Projection errors

Client `head` and `scripts`, plus server `head`, `scripts`, and `headers`, are
decorative with respect to route control flow. They run only after semantic
reduction. Rejections are logged and swallowed; they never replace the chosen
loader/before-load outcome or trigger another boundary-selection pass.

The implementation should stay this simple. If a proposed fix requires a new
error candidate list, ranking pass, boundary score, or convergence loop, it is
almost certainly rebuilding the discarded complex architecture.

## Terminal commit and lifecycle

A successful client lane remains private through projection. At commit, one
framework transition publishes semantic matches, cache changes, and route
lifecycle callbacks.

The client order is:

1. publish final matches/cache and run `onLeave`/`onEnter`/`onStay`,
2. emit `onLoad`, then `onBeforeRouteMount`, while the transaction is current,
3. wait for the framework transition acknowledgement to settle,
4. publish `resolvedLocation` and `idle`,
5. emit `onResolved`, and
6. emit `onRendered` only if the acknowledgement was `true` and the same
   transaction is still current.

Each reentrant callback can start another navigation. Checking that the
transaction is still current after each publication boundary suppresses stale
later events. In particular, an `onResolved` navigation suppresses the old
transaction's `onRendered`.

Route lifecycle callbacks are invoked directly and are expected not to throw.
The coordinator does not carry a second error-handling path for callback
failures. All `onLeave` callbacks run before callbacks for retained or newly
entered routes; the relative ordering of `onEnter` and `onStay` is not a public
contract.

Server render results are published request-locally and run the documented
route `onLeave`/`onEnter`/`onStay` callbacks against the previous server
generation after final matches have been installed. Server redirects do not
publish a render lane or run those callbacks.

Terminal outcomes do not change route membership. Client and server state keep
the complete structurally matched branch, lifecycle compares that full branch,
and renderers derive the visible prefix from match status. Projection likewise
stops after the terminal match. SSR transport may serialize only that terminal
prefix because the client can reconstruct hidden structural descendants without
executing them.

## Pending presentation

Pending UI is presentation, not partial semantic commit.

An exact successful match remains successful while `beforeLoad` or a blocking
loader revalidates it only when the same successful, non-not-found prefix is in
both the transaction's committed base and its starting presentation.
`isFetching` exposes that work without replacing its rendered UI. A cache-only
success, a different match ID, or a success hidden below a terminal boundary has
no retained presentation and remains eligible for pending UI. Explicit
force-pending invalidation already changes the committed generation to pending
and therefore overrides retention.

The initial pending offer for a fuzzy not-found lane waits until lazy route
options resolve its boundary. This prevents a provisional ancestor boundary
from replacing the mounted presentation before ownership moves to a lazy child.

The first unresolved boundary is the only pending candidate. Its route or the
router default must provide a pending component, and its effective `pendingMs`
must allow presentation. Core does not skip an ineligible ancestor to expose an
unrelated deeper fallback.

A successful route without a loader still participates in chunk readiness and
projection, but is not changed back to pending merely because a descendant has
blocking work.

When pending is offered:

- `stores.matches` receives a flight-free snapshot of the complete destination
  lane;
- the selected boundary is marked pending;
- descendants remain observable in state; and
- the renderer stops at the boundary.

There is one pending session in `router._pending` and one absolute deadline:

```text
reveal deadline -> exact render acknowledgement -> minimum-visible deadline
```

The session also remembers the pending component identity. An active client
lane loading a lazy route chunk can install a more specific `pendingComponent`
after the default fallback has already rendered. Once that pending component is
ready, core re-offers the same lane so the framework can replace the fallback
without creating another pending session or deadline.

The reveal deadline is anchored to the transaction's lane-level `startedAt`.
Discovering lazy pending options later, advancing to another boundary, or
retrying the offer does not restart `pendingMs`. If the absolute deadline is
already past when a pending component becomes eligible, core publishes it in
the current turn instead of introducing a `setTimeout(0)` race.

`pendingMinMs` starts only after the framework confirms that the pending
publication rendered. A superseded publication that never rendered creates no
minimum-visible obligation.

Core considers actual non-success matches and an exact pending presentation in
route order. An earlier ineligible successor boundary therefore retires the old
clock without replacing the painted fallback, and a later occurrence of that
old boundary in the same transaction cannot resurrect its minimum.

Hydration or a redirect can leave an already visible pending presentation
without a pending session that owns its original acknowledgement. When there is
no competing semantic boundary, core conservatively treats that presentation as
rendered and starts its minimum from the takeover time instead of delaying its
reveal again.

A successor may take over timing only when its selected boundary has the same
match ID. It keeps the existing deadline but republishes a full snapshot from
the successor, so pending UI cannot show stale search, params, or context from
the superseded navigation. Normal route matches preserve position with their
IDs; the deprecated relocatable `notFoundRoute` is not given separate positional
session identity. Changing the selected boundary discards the old session.

## Exact framework acknowledgement

`startTransition` returns a promise whose boolean result has a precise meaning:

- settlement means the framework transition can no longer block navigation
  completion;
- `true` means the exact requested match publication rendered;
- `false` means core must finish without emitting `onRendered` or starting a
  pending minimum based on that publication.

Framework transition wrappers are controlled adapters. Supersession settles an
older acknowledgement as `false`; core does not retain a prior presentation or
install a compensating restoration path for wrapper failure.

React cannot await `React.startTransition` directly. Its adapter keeps one
router-owned acknowledgement tuple, and `Matches` settles that tuple from a
layout effect. A new expected publication first settles the previous receipt as
`false`, then stores the exact offered array before the transition callback
runs. This ordering matters because publication can invoke a route lifecycle
callback that synchronously starts and publishes a successor navigation.
Installing the expectation after the callback would let the superseded
publication replace the successor's receipt.

An already-settled router mounted into React uses the same acknowledgement slot
for its initial `onRendered` event. It therefore emits only after the exact match
tree and its descendant layout effects have committed, rather than from the
earlier history-subscription effect.

While a receipt is pending, the aggregate match subscription selects the exact
offered array instead of reconstructing an equivalent presentation. The layout
effect acknowledges only that reference. A suspended older render can therefore
never satisfy a newer receipt merely because its IDs or statuses look the same.
No generation counter or structural signature is needed.

Solid awaits its transition, and Vue awaits its render tick. For an
already-settled Solid mount, history subscription remains before the route tree
while a post-match notifier emits the initial `onRendered` event after
descendant mount effects.

React assumes one provider and one router. Keeping the tuple on that router lets
the render tree and core share the exact same receipt without component-local
generation state, structural signatures, or router-swap machinery.

Every core write passed to `startTransition` must notify the aggregate matches
store even if much of the lane is structurally reused. Suppressing the write can
strand the acknowledgement promise.

## `isFetching` and background reloads

`isFetching` is public presentation state. It is observable during normal
`beforeLoad`, normal loaders, and background loader refreshes.

For a foreground navigation this means the destination match exposes its phase
once the destination lane is presented. Before pending publication, a
destination-only match remains private; a same-ID source match can be reconciled
to the active phase earlier. Background reloads operate on the already
presented lane and therefore expose their phase immediately.

A background reload keeps successful loader data visible while a private
candidate runs. The full presented lane remains installed and the affected
match reports the active phase. Completion clears fetching state whether the
candidate publishes, fails, or is superseded. A successor may join its loader
flight, but never adopts the private candidate lane.

Background loader and chunk work may begin and settle while the foreground
publication renders. Background reduction, projection, and publication do not
start until the foreground transition acknowledgement settles. A fast refresh
therefore cannot replace the exact generation that the framework still needs to
acknowledge.

When background tasks exist, execution creates their settlement observer
eagerly alongside foreground reduction and retains that promise in the lane
result. `runBackground` consumes the same settlement chronology after the
foreground acknowledgement. Recreating the observer then would process work
that already settled by task attachment or iteration order and could change
which error, not-found, or descendant redirect wins. Retaining this promise
preserves the observed settlement order; it does not grant permission to publish
or define when the lane is complete.

Background work starts from an exact committed base. Before projection it uses a
fully private lane, including clones of untouched matches, so asynchronous asset
hooks cannot mutate committed objects without a store publication.

Final background publication requires both:

```text
router._tx is the owner
router._committed is the exact base
```

If either check fails, the entire staged lane is discarded and all candidate
and clone resources are released. A successful background publication replaces
the semantic/presented lane atomically but does not change location, foreground
status, or foreground navigation lifecycle events.

Foreground completion does not join background publication. After the
foreground acknowledgement, the refresh continues independently and may publish
before or after `resolvedLocation`, `idle`, and `onResolved`. Active work
remains publicly observable through `isFetching`; any later publication still
requires the owner/base identity check.

An error or not-found from background work also stays private through reduction
and projection, then may atomically replace the successful base with the full
matched branch carrying its terminal boundary. Hidden descendants retain route
membership, so background publication does not synthesize leave/enter lifecycle
events. It is not published incrementally.

Background redirects use the same control-flow and ownership rules as foreground
redirects. A losing background lane cannot redirect.

## Invalidation, cache clearing, and development refresh

Invalidation creates a new semantic generation and reloads through the normal
transaction path. It does not turn `stores.matches` into a planning lane.

Filtered invalidation evaluates committed, cached, active-transaction, and
active-preload matches and collects the selected match IDs. Every committed and
cached generation with one of those IDs is made invalid. Cached matches are
already settled successes, so their data owner is marked invalid in place.
Matching active preload owners are retired first, which prevents older
speculative work from clearing that stale mark or publishing fresh cache data;
the lane signal remains the publication fence if its loader outcome already
fulfilled. The loader discovery entry is also detached before the superseding
load. Unselected preload lanes remain active. This ID-wide rule prevents a
cache-first or in-flight same-ID generation from escaping invalidation merely
because a different generation was the one passed to the filter. Route context
retains same-ID cacheability across this replacement and needs no separate
invalidation marker.

Invalidated successful data may remain visible until pending or terminal
publication, depending on reload mode. Error/not-found generations reset through
the same loading protocol rather than becoming cache successes.

Cache clearing first snapshots every selected cache match and active preload so
a throwing public filter changes no authority. It then prunes both authorities
and directly releases every discarded match lease. When the last lease is
discarded, cache clearing removes the discovery entry
instead of preserving the normal zero-owner navigation handoff. Only after all
leases and discovery entries are detached does it abort the collected flight and
preload-lane controllers. A public loader signal can synchronously reenter from
its abort listener; that reentrant load must observe the cleared authorities and
every removed lease as already detached. Unselected concurrent preloads keep
shared flights discoverable, and every later cache admission must still have a
live producing-lane signal and pass the per-match cache-entry identity check
captured during planning. Cache clearing does not cancel the current transaction,
so an active navigation loader that settles afterward may establish a new cache
generation. Invalidation is the API that replaces active semantic generations.

Development refresh is deliberately aggressive about reuse. It removes all
loader flights from discovery, discards active preloads and cache entries, and
rematches with committed/cache reuse disabled so obsolete params, context,
loader data, or projected assets cannot seed the refreshed lane. Selected cache
and preload resources are detached before their controllers are aborted.

Before publication, a failed or superseded refresh leaves the painted
presentation alone because its candidate is still private. Once published, the
refresh is the accepted semantic and presentation generation even while exact
framework acknowledgement is pending. Publication uses the ordinary commit
ownership transfer, releases the replaced generation immediately, consumes any
obsolete hydration handoff, and retains no prior cache or presentation
checkpoint.

A rapid successor refresh rematerializes again, settles the older framework
receipt as `false`, and owns convergence and public completion through the same
`_tx` and `awaitCurrent` chain as ordinary navigation. The older transaction
releases only private background work that did not transfer. No refresh has
authority to restore a predecessor or resolve a successor's commit promise.

## Speculative preloading

A preload uses the same match, contextualize, reduce, and project phases as
navigation, but it never becomes `_tx` and never publishes match presentation.

Its match/cache ownership effects are limited to:

- joinable same-ID loader flights; and
- individual successful preload loader generations entering the loader cache as
  they settle.

A preload can also install durable lazy route options through the separate
route-chunk owner described above. That is route definition readiness, not
authority over a completed match lane or `beforeLoad` result.

Preload lane-local matching, route context, validation, cancellation, and
`beforeLoad` outcomes do not become authority for another preload or a later
navigation. Consumers that join its same-ID loader flight nevertheless share
that flight's normalized outcome. After a normal standalone preload redirect,
the private chain continues only if that lane's controller was still present and
was successfully removed from `_preloads`; replacing an unrelated `_tx` does not
suppress it. The chain remains depth-bounded, never follows `reloadDocument`,
and never publishes presentation or history.

The public `preloadRoute` result describes the speculative lane, not merely its
cacheable subset. An error or not-found therefore resolves with the terminal
match array while any eligible successful loader generations can still enter
the cache. Cancellation or control flow that does not yield a reusable lane can
resolve `undefined`.

Each preload loader task uses the shared settlement-time cache admission rule:
it compares the current cache entry for its match ID with the entry captured when
that task was planned. It cannot overwrite a cache generation installed since
that plan. Admission does not wait for whole-lane success. A distinct successful
generation may coexist with an older committed same-ID generation; this changes
future planning precedence, not current presentation. A duplicate sharing the
already accepted flight is discarded.

`preloadRoute` also works on a server router. It runs the same speculative
protocol with `preload: true`, can return matches and populate that router's
loader cache, and does not replace the request's location, committed lane, or
presentation. Normal request loading still uses the request-local server lane
and calls its hooks with `preload: false`.

## Server loading and request lifetime

Server loading is request-local, so it does not need the client `_tx`
coordinator. It still uses the same semantic phases, context ordering, outcome
normalization, settlement-order failure selection, semantic parent promises,
and projection behavior.

Each server match gets the public controller passed to its callbacks. The
request signal—not the mere fact that a callback aborted that controller—is the
request-liveness authority checked across contextualization, loaders, chunk
readiness, terminal boundary readiness, and projection. A request abort cancels
the whole lane. A loader error or not-found does not abort already-started
descendants before selection, so a later descendant redirect can still win.
After selection, applying the terminal boundary aborts the hidden suffix that
the result no longer owns. Redirect aborts the whole request-local lane.

The request signal also governs the surrounding request pipeline. The generic
handler races manifest lookup, route loading, custom dehydration, and the
handler/render callback. Start applies the same rule to entry and router
resolution, middleware, manifest work, and redirect finalization. An abort can
therefore settle the handler during every awaited phase rather than waiting for
user code that ignores its signal.

A raced promise may still fulfill after abort. If that late value owns an SSR
stream, the race disposes it instead of allowing it to regain response or
cleanup authority. Other user promises may continue executing, but after abort
they cannot publish a response or inject SSR output. If cleanup occurs while
application dehydration is awaited, dehydration returns before starting
serialization; injection and serialization completion also ignore later work.

A server result has one of two forms: render status plus matches, or an HTTP
redirect. Redirects short-circuit framework rendering and preserve their real
status, `Location`, and custom headers.

Projection parity is intentional: server `head`, `scripts`, and `headers` use
the final reduced lane and loader data. As on the client, failures are logged and
swallowed.

### Stream cleanup handoff

Until a response is accepted, the request handler owns router SSR cleanup. A
non-stream response, redirect, or failure leaves cleanup with the handler. An
accepted SSR stream transfers that ownership to the response and is immediately
bound to the request signal, so an abort after handoff still disposes it.

Disposal is idempotent and severs router SSR ownership before best-effort body
cancellation. This order matters because a custom or framework stream may ignore
or indefinitely delay cancellation. Replacing a stream response, resolving a
redirect from it, or stripping a HEAD body disposes the old stream under the
same request signal before accepting the replacement.

Framework renderers connect request abort to their upstream renderer as well as
the router stream transform. Normal completion, downstream cancellation,
request abort, renderer failure, and stream lifetime timeout all converge on the
same cleanup authority; none creates a second response owner.

Once a server lane is accepted for rendering, its match controllers are
registered with that same SSR cleanup authority. They remain live through
dehydration and response streaming so deferred loader work can finish while the
response is active, then abort when the response or stream lifetime ends.

## Selective SSR

SSR policy is the first parent-to-child serial step, before route context,
params/search validation handling, and `beforeLoad`:

- `true` runs server `beforeLoad` and loaders, loads render chunks, projects
  assets, and renders the component.
- `'data-only'` runs server `beforeLoad` and loaders and projects `head`,
  `scripts`, and `headers`, but does not render that route component.
- `false` skips server `beforeLoad`, loaders, and component chunks. The first
  `false` boundary still projects `head`, `scripts`, and `headers` for its server
  shell, then projection stops before descendants that inherit `false`. Route
  context and params/search validation still run, so their errors remain real
  server outcomes.

A parent restriction cannot be relaxed by a child: `false` remains false, and a
`'data-only'` parent caps a child requesting `true` at `'data-only'`.

If a functional `ssr` option throws, the inherited/default policy is established
before calling it. The failure therefore retains the correct boundary
renderability instead of leaving `ssr` undefined. An error or not-found from
the policy still reconstructs route context for its boundary. If route context
also fails, the original policy failure keeps precedence. Redirects remain
control flow and skip route-context reconstruction.

Shell mode resolves and dehydrates the root semantic match while the presented
server lane may include the first client-only pending boundary and its
descendants. This permits server and initial client presentation to agree.

## Hydration handoff

Hydration reconstructs server work; it does not run a competing hydration
loader. While reconstruction is asynchronous, its controller is `_preflight`.
Under the framework-supported startup order, `RouterClient` finishes hydration
before mounting the provider that starts the initial client load, so no client
transaction or descendant preload competes with reconstruction. Core does
not enforce that ordering as a blanket guard. A navigation can supersede hydration
by installing a new `_preflight`; a preload started directly in this gap is
unsupported rather than blocked.

The identity of `_preflight` proves that reconstruction is still current. A
replacement installs itself before aborting the prior controller. The same
controller interrupts asynchronous application hydration and chunk work, and
every asynchronous phase checks that identity before mutating or publishing.

Once hydration has accepted a semantic prefix and is ready to publish it,
`_preflight` is no longer the right authority: no planning operation is in
progress, but the first normal client load may still need to continue that
prefix. Hydration therefore installs `_handoff`, a temporary two-phase transfer,
and detaches its controller from `_preflight`. The handoff is the one owner that
can decide whether the initial load may continue the prefix; it is not a second
completion promise or a general cache.

The client router is fresh when hydration begins. Application `hydrate` hooks
may restore external integration state or update router options, but must not
call router loading or preloading before reconstruction finishes. Core does not
guard those calls; this is part of the supported startup order.

The high-level process is:

1. install serialization adapters and application-dehydrated data,
2. match a fresh candidate lane for the browser location,
3. accept the identity-compatible serialized lane as the ordered prefix
   guaranteed by the document protocol,
4. copy server loader data, `beforeLoad` context, terminal state, and effective
   SSR policy into private candidates, and install each transported effective
   SSR value on its route so a functional server policy is not re-evaluated,
5. start exactly the chunks required by the accepted prefix and any selected
   terminal boundary concurrently, then consume their outcomes in route order
   so the earliest failed position can retire its suffix without waiting for
   irrelevant descendants,
6. rebuild route context parent-first,
7. project client `head` and `scripts` through the same projection
   function used after a normal client load, and
8. publish accepted semantic work and the complete structural presentation.

Hydration relies on the framework transport contract. For normal and selective
SSR, the data was produced for the exact document URL by the same route build,
and its serialized matches form an ordered prefix of the client lane. An SPA
shell uses the same prefix protocol for its root-only payload; the framework is
responsible for serving a shell that applies to the document. Core does not
serialize a second URL identity. Instead, hydration bounds reconstruction to
the local lane and validates every transported position with a compact match ID.

A mismatch ends the accepted prefix and leaves the local suffix for normal
client loading. A longer server lane is accepted only through a local global
not-found boundary that already caps the branch; otherwise no transported
prefix is accepted. A terminal server error, not-found, or global not-found caps
client execution so omitted descendants do not run. The client still creates
those descendants as structurally matched but unexecuted matches. A loaderless
descendant may initially have `status: 'success'`, so status alone does not prove
that hydration ran its context or route hooks. Terminal hydration loads the
chunks required by the selected error/not-found boundary, but not normal
component chunks below it. Neither route context nor projection runs below the
transported boundary.
The transported terminal route remains authoritative even when its effective
SSR policy is `false` or `'data-only'`: route context or validation was still
allowed to fail on the server, so hydration must not turn that outcome into an
unresolved client-only route. Before-load and loader work remain skipped there
according to the server policy.

Every executed context, `head`, and `scripts` hook nevertheless receives the
complete locally matched candidate lane. Hook arguments describe structural
membership; the accepted prefix describes execution authority.

If a required chunk or route-context reconstruction fails, hydration preserves
only the successfully reconstructed committed prefix. The public presentation
still contains the complete locally matched lane, so a
terminal server boundary does not make route membership disappear while its
client reconstruction is retried. Eligible transported loader successes cross
the normal loader-cache boundary with merged context and `beforeLoad`
contribution removed. Because `resolvedLocation` remains unset, normal
initial client loading retries the failed boundary or context and finishes the
unresolved suffix.

For a non-terminal selective-SSR handoff, the semantic committed prefix is the
complete contiguous transported prefix accepted as resolved. The first
`'data-only'` match is the presentation continuation boundary, but it does not
truncate semantic adoption: later transported successful data-only matches are
also committed and keep their server loader and `beforeLoad` results. A `false`,
pending, or otherwise unresolved match is the first semantic continuation
boundary and is not committed. Presentation can still contain the complete
candidate lane and marks its first presentation boundary pending as needed. In
particular, a shorter non-terminal server payload ending in a pending
`ssr: false` match is a valid selective-SSR handoff: hydration accepts the
resolved ancestors, presents the complete local branch, and lets the normal
initial client load execute from that client-only boundary.

For a successfully reconstructed terminal handoff, transport remains
prefix-capped but committed and presented membership use the complete locally
matched branch. Matches below the terminal boundary remain unexecuted and
hidden; they own no transported `beforeLoad` result or loader data. This keeps
public membership and lifecycle stable without increasing the SSR payload or
loading unreachable client chunks. If reconstruction fails, only the accepted
prefix is committed as described above; the complete branch remains
presentation, not semantic reuse authority.

Only the subsequent normal client load may transfer the whole hydration
prefix, and only while the exact committed-prefix owner, raw history-state
object, browser href, and live hydration controller remain current with no
active transaction. Core captures the raw browser href and history-state object
so a reentrant navigation from an initial lifecycle event cannot hand the old
document's work to a successor location. Finish also validates the transported
match IDs against the newly matched lane. Core does not coordinate speculative
work started between raw `hydrate()` and that load; framework adapters own the
supported ordering.

The two-phase transfer proceeds as follows:

1. Before public navigation events or matching, the initial client-load planner
   probes the handoff without consuming it.
2. It installs its own `_preflight`, emits the events, matches a private lane,
   and asks the handoff to finish the transfer.
3. Finish revalidates handoff identity, transaction absence, hydration
   controller liveness, captured location identity, and the exact committed
   owner.
4. On rejection, the handoff clears itself before aborting its controller,
   so abort listeners cannot reenter and claim a rejected handoff.
5. On acceptance, the accepted matches replace the planner's private copies. A
   successfully reconstructed terminal handoff owns the complete local branch,
   even though its SSR payload was prefix-capped, so it has no local suffix to
   remove. For a non-terminal handoff, the remaining suffix stays in the lane
   and transfers to the hydration controller so one signal owns the
   continuation.
6. The handoff remains available across synchronous reentrancy until the
   current load installs `_tx`. That load installs `_tx` before clearing the
   handoff; stale planners may release only their own private work.

This ordering closes the gap between hydration publication and client
transaction installation without making the handoff an independent completion
authority. If reconstruction is superseded before publication, the `_preflight`
identity check aborts its private work. If the published handoff becomes
incompatible, its failed identity check retires the hydration controller
and starts normal client loading from a fresh preflight.

Development refresh rematerializes instead of claiming the prefix. Its
transaction carries the existing handoff only until refreshed matches publish;
that one-way publication consumes the handoff and retires the hydration
controller before lifecycle reentrancy. A refresh superseded before publication
leaves the handoff for its rematerializing successor.

Generic framework `RouterClient` components signal streaming hydration
completion after the hydration attempt settles, including rejection. This
finally-style handoff allows bootstrap globals to be removed once the server
stream has also ended without stranding the stream on a hydration failure.

Each framework owns one module-level hydration promise for the document. The
SSR protocol provides one global bootstrap and one `RouterClient`; additional
client-only routers use `RouterProvider` and do not independently consume that
bootstrap. The promise deduplicates framework rendering/replay only. It replaces
neither `_preflight` reconstruction authority nor `_handoff`
continuation authority.

## Change checklist

The detailed sections above are the source of truth. Use this shorter checklist
to find the failure modes a change needs to test; do not duplicate the full
algorithm here.

### Publication and reentrancy

- Does every asynchronous write recheck its exact owner immediately before the
  write: `_tx`, `_preflight`, `_handoff`, an active-preload controller, or the
  request signal?
- Does a background publication check both its `_tx` and the exact `_committed`
  base from which it was derived?
- If an abort, lifecycle callback, or store publication can synchronously
  reenter, are replacement owners installed and discarded resources detached
  before that callback can run?
- Does framework acknowledgement settlement still gate resolved/idle
  completion, with only an exact rendered publication producing `true` and
  enabling `onRendered` or `pendingMinMs`?

### Matches, loaders, and cache ownership

- Are `_committed` semantic state and `stores.matches` presentation kept
  separate? Are match-ID cache compatibility and route-ID lifecycle identity
  also kept separate?
- Does every normal client lane run its own `beforeLoad` chain? Hydration is
  the only completed-work exception; preloads may share loader data or flights,
  but never their merged context, `beforeLoad` result, or control flow.
- Is flight discovery separate from lease ownership? Does every copied owner
  acquire exactly one lease and every discarded owner release it exactly once?
- Are registry entries and all discarded leases detached before any collected
  controller is aborted?
- Do cache admission, invalidation, and clearing preserve the intended
  generation identity, including the rule that an unexecuted descendant below a
  cutoff cannot evict a newer same-ID cache entry?
- Does each child `parentMatchPromise` follow the fresh semantic parent
  generation rather than the visible stale parent?

### Outcomes and presentation

- Do error/not-found selection, required ancestor readiness, component chunks,
  and descendant redirects still reduce to one final outcome?
- Are redirects materialized while their source route owns target-construction
  errors, with shared flights retaining only the raw redirect and each lane
  building its own target once?
- Does cancellation require both exact signal identity and proof that the signal
  is aborted, and does a canceled lane release every private background
  candidate without changing presentation?
- Does pending or terminal publication retain the complete structural branch
  while rendering and outputs apply their relevant cutoff, including the
  selective-SSR hydration asset-prefix exception?
- Are pending snapshots flight-free, and do reveal/minimum timing remain owned
  by one transferable pending session?
- Do projection failures remain logged and swallowed, and does `isFetching`
  clear on every success, failure, cancellation, and supersession path?

### Server and hydration lifetime

- Can request abort settle every awaited server phase, and can late work no
  longer publish a response or injected output?
- Does exactly one owner perform SSR cleanup, with router ownership released
  before best-effort stream cancellation?
- Does hydration validate transported match IDs, execute only the accepted
  prefix, retain the complete local branch, and preserve any verified
  `'data-only'` asset prefix?
- Does the initial-load handoff revalidate its controller, browser history entry,
  committed owner, and rematched IDs? Do framework adapters still obey the
  no-preload startup gap described above?

If a fix fails one of these checks, consolidate ownership instead of layering a
special case on top.

## Testing changes

Tests must assert public behavior, not the internal tuple shape, phase tag,
private promise, timer, or field name used to implement it.

Useful assertions include:

- rendered pending/error/not-found content and the boundary that rendered it;
- the complete public matches array and `isFetching` transitions;
- loader/before-load call counts, contexts, parent promises, and abort signals;
- navigation completion, lifecycle callbacks, and their surrounding router
  events, without asserting a relative `onEnter`/`onStay` order;
- preload/cache reuse observable through user loader calls;
- HTTP status, headers, redirects, and absence of renderer invocation;
- request-abort settlement, late-stream disposal, and single stream cleanup;
- hydration output, completion on rejection, and absence of client reruns below
  server terminal boundaries;
- absence of stale data/assets after supersession; and
- framework acknowledgement tied to the actual rendered destination.

While `tx.done` suspends a pending React destination, React may retain the previous
source tree in the DOM but hide it. Pending tests should assert visible user
content, not physical absence of the old route's nodes.

When testing a boundary, give root, parent, and child visibly distinct output.
An assertion such as `/Not Found/` or `/Error/` can pass at the wrong boundary
and is not sufficient.

Run focused category tests while changing the loader, then affected core and
framework unit/type suites, selective-SSR E2E tests for server/hydration changes,
and the bundle-size benchmark for any client runtime change.
