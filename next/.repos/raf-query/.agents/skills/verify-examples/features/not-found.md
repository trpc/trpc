# Not found

URLs that don't match a page, ids that aren't issue ids, and issues that don't exist all show `Nothing here.` inside the normal header and settings bar.

## Sub-features

- `nf-route` an unknown path such as `/nope` answers 404 with `Nothing here.`
- `nf-bad-id` `/issues/abc` and `/issues/0` answer 404 with `Nothing here.`
- `nf-missing` a well-formed id with no issue (`/issues/43`, past the last one) streams the page, then shows `Nothing here.` once the issue query comes back empty.

## How to get to it (user POV)

- Type or follow a bad URL.
- On `#42`, click `Next issue`.

## Driving it with control-examples

Preconditions:

- Baseline state (42 issues).

Commands:

- **Unknown path.** `curl -s -o /dev/null -w '%{http_code}\n' $U/nope` is `404`. `$CE open $U/nope; $CE text | grep -E '^(Issues|Nothing here\.)$'` prints both: the header is there.
- **Bad id.** Same for `$U/issues/abc` and `$U/issues/0`, following redirects (`curl -sL`): `404`, `Nothing here.`
- **Missing issue.** `$CE open $U/issues/43 --wait 1500; $CE text | grep 'Nothing here.'`. Also from the UI: `$CE open $U/issues/42; $CE click --role link --name 'Next issue' --exact; $CE wait --text 'Nothing here.'`.

## Gotchas

- For a missing issue the status code isn't 404 in every app: the page has started streaming before the issue query answers. `curl` gets `200` from `tanstack-start`, `tanstack-start-effect` and `nextjs`, and `500` from `react-router` (its server waits for the whole page for bots such as `curl`, and the empty issue fails that render). Assert on what's shown.
- In dev, a missing issue logs React's "The above error occurred in the <IssueBody> component" in `tanstack-start`, `tanstack-start-effect` and `react-router`: that's the not-found being thrown and caught.
- `nextjs` dev logs a `Failed to execute 'measure' on 'Performance'` exception and a script-tag warning on `/issues/abc`. It comes from Next.js's dev tooling, also on a clean checkout.
