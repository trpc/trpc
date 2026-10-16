# Status changes

Every issue's status badge is a menu: in each list row and in the issue page's Properties box. Picking a status shows it at once while the write runs, keeps the menu disabled until the write settles, then refreshes the list and its counts.

## Sub-features

- `status-menu` the trigger is `Status: <label>. Change status`; the menu lists `Open`, `In progress`, `Closed`, with a check on the current one.
- `status-optimistic` the badge shows the new status right after the click, with the trigger disabled until the server answers.
- `status-persist` the change survives a reload.
- `status-counts` the list's status counts follow the change.

## How to get to it (user POV)

- On `/issues`, click a row's status badge (the click doesn't open the row).
- On `/issues/<id>`, click the badge next to `Status` under Properties.

## Driving it with control-examples

Preconditions:

- Baseline state. Issue `#3` is Open; `#42`, the first row of `/issues`, is Closed. Seed counts Open 17, Closed 9.

Commands:

- **On the issue page.** `$CE open $U/issues/3; $CE click --role button --name 'Change status'; $CE snapshot | grep menuitem` lists `menuitem "Open"`, `"In progress"`, `"Closed"`. `$CE click --role menuitem --name 'In progress' --exact`, then right away `$CE snapshot | grep 'Change status'`: `button "Status: In progress. Change status" [disabled, …]`.
- **Persisted.** After a second, `$CE open $U/issues/3; $CE snapshot | grep 'Change status'`: `Status: In progress`, not disabled. REST apps also: `curl -s $U/api/issues/3 | grep -o '"status":"[a-z_]*"'`.
- **Put it back.** `$CE click --role button --name 'Change status'; $CE click --role menuitem --name Open --exact`.
- **In a list row.** `$CE open $U/issues; $CE click --role button --name 'Change status' --nth 0; $CE click --role menuitem --name Open --exact`. Right away the first trigger reads `Status: Open. Change status [disabled]`. After the write, `$CE snapshot | grep -E '^link "(Open|Closed) [0-9]+"'` shows `Open 18` and `Closed 8`. `$CE eval location.pathname` is still `/prefetch/issues`: opening the menu doesn't open the row. Put `#42` back to `Closed` the same way; the counts return to 17 and 9.

## Gotchas

- Two clicks: the trigger, then the item. With the keyboard, opening the menu focuses the menu itself; `ArrowDown` moves to `Open`, and further arrows wrap around (`ArrowUp` from `Open` is `Closed`). `Enter` picks the focused item. Read `document.activeElement.innerText` before pressing `Enter`.
- `tanstack-start-effect` has no `/api`; prove persistence by reloading.
- Counts lag the badge by one round trip: they update when the list refetches after the write. Wait for the new count, don't read it right after the click.
