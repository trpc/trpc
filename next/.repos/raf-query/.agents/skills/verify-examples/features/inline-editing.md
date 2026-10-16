# Inline editing

The issue's title and description are always-editable fields. Changing one and leaving it (or pressing Enter in the title) saves; Escape puts back the saved text. An empty value isn't saved and shows an error instead.

## Sub-features

- `edit-title` Enter or blur saves the title; the new title shows while the save runs.
- `edit-title-cancel` Escape restores the saved title.
- `edit-title-empty` an empty title shows `Title can't be empty` and isn't saved.
- `edit-body` blur, or Cmd/Ctrl+Enter, saves the description; Escape restores it.
- `edit-body-empty` an empty description shows `Description can't be empty`.

## How to get to it (user POV)

- On `/issues/<id>`, click the title or the description and type.

## Driving it with control-examples

Preconditions:

- Baseline state. Issue `#3`'s title is `Notification email loses input on refresh`; its description is `Steps to reproduce:\n\n1. Open the settings page.\n2. Wait a moment.\n3. Observe the problem.`

Commands:

- **Save a title.** `$CE open $U/issues/3; $CE fill --role textbox --name Title --value 'Edited title'; $CE press Enter`. After a second, `$CE open $U/issues/3; $CE eval 'document.querySelector("input[aria-label=Title]").value'` gives `"Edited title"`.
- **Cancel.** `$CE fill --role textbox --name Title --value 'Not saved'; $CE press Escape; $CE eval 'document.querySelector("input[aria-label=Title]").value'`. `"Edited title"`.
- **Empty title.** `$CE fill --role textbox --name Title --value ''; $CE press Enter; $CE wait --text "Title can't be empty"`. Then `$CE press Escape`.
- **Put the title back.** `$CE fill --role textbox --name Title --value 'Notification email loses input on refresh'; $CE press Enter`.
- **Save a description.** `$CE fill --role textbox --name Description --value 'Edited body'; $CE press Tab`, then reload: `$CE eval 'document.querySelector("textarea[aria-label=Description]").value'` gives `"Edited body"`.
- **Empty description.** `$CE fill --role textbox --name Description --value ''; $CE press Tab; $CE wait --text "Description can't be empty"`.
- **Put the description back.** `$CE fill --role textbox --name Description --value "$(printf 'Steps to reproduce:\n\n1. Open the settings page.\n2. Wait a moment.\n3. Observe the problem.')"; $CE press Tab`, then reload and read both fields.

## Gotchas

- `$CE fill` selects all and types, so the field gets exactly `--value`. `$CE press Tab` is the blur.
- Read saved values after a fresh `$CE open`: the page shows the optimistic value right away, which proves nothing about the server.
- REST apps: `curl -s $U/api/issues/3` shows `title` and `body`. `tanstack-start-effect` has no `/api`; reload instead.
- An edit left behind changes what other recipes assert (titles in [server rendering](server-rendering.md) and [issue detail](issue-detail.md)). Always put both fields back.
