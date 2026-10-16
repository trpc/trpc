# Comments

Under each issue, comments come four at a time, newest first, and load more as you scroll. Posting adds the comment at once as a pending row (`Posting…`), then it becomes a normal row when the server has it. Comments are always by Ada Lovelace, the signed-in user.

## Sub-features

- `comments-count` the heading reads `<n> comment` / `<n> comments`, pending posts included.
- `comments-paging` the first four arrive with the page; the rest load as `Load more` nears the viewport.
- `comments-post` `Add a comment` plus `Comment` posts; the button reads `Posting…` and the row is `aria-busy` until the write settles; the field clears.
- `comments-required` an empty comment isn't sent.

## How to get to it (user POV)

- Open any issue and scroll to the comments under the description.

## Driving it with control-examples

Preconditions:

- Baseline state. Issue `#41` has 7 comments. Post on `#39` (1 comment on a fresh server); no other recipe asserts on it.

Commands:

- **First page in the HTML.** `curl -s $U/issues/41 | sed 's/<!-- -->//g' | grep -o 'Load more' | wc -l`. `1`: the server sent four and a `Load more` button.
- **All of them in the browser.** `$CE open $U/issues/41; $CE snapshot | grep -E 'heading ".* comments"'` gives `heading "7 comments"`, and no `button "Load more"` once the rest have loaded.
- **Post.** `$CE open $U/issues/39; $CE select --name Latency --value 3000; $CE fill --role textbox --name 'Add a comment' --value 'Recipe comment'; $CE click --role button --name Comment --exact`. Right away, `$CE snapshot | grep -E 'comments?"|Posting'` shows the count up by one and `button "Posting…" [disabled]`, and `$CE eval '!!document.querySelector("li[aria-busy=true]")'` is `true`.
- **Settled.** `$CE wait --gone 'Posting…' --timeout 15000`; the busy row is gone (`false`) and the field is empty. Click `Reset`, then `$CE open $U/issues/39; $CE text | grep -c 'Recipe comment'`: `1`, from the server.
- **Empty.** `$CE click --role button --name Comment --exact; $CE eval 'document.querySelector("textarea[placeholder=\"Add a comment\"]").validity.valueMissing'`. `true`, and nothing reads `Posting…`.

## Gotchas

- At the helper's 1280×900 window the comments list ends near the viewport, so every page loads right away and `Load more` is gone by the time `$CE open` returns. The `curl` check is the one that sees paging.
- Comments can't be deleted. Each post stays until the server restarts, so assert relative counts.
- The textbox's accessible name is its placeholder, `Add a comment`.
