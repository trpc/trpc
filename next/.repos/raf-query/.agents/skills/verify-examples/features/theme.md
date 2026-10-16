# Theme

The apps follow the system's light or dark setting. There's no theme switch in the UI.

## Sub-features

- `theme-system` with the OS in dark mode, `<html>` has the `dark` class and `color-scheme: dark`, so the page and native controls (the settings selects, scrollbars) are dark. In light mode, the `light` class.

## How to get to it (user POV)

- Switch the OS (or the browser's emulated) appearance and load any page.

## Driving it with control-examples

Preconditions:

- Baseline state.

Commands:

- **Dark.** `$CE open $U/issues --color-scheme dark`. The last line is `prefers-color-scheme dark: <html class="dark">, color-scheme dark, body background oklch(0.145 0.006 286)` (Next.js prints the same color in `lab(…)`).
- **Light.** `$CE open $U/issues --color-scheme light`. `<html class="light">, color-scheme light, body background oklch(1 0 0)`.

## Gotchas

- The emulation only lasts for that `$CE open`: the next command runs in a fresh DevTools session, back on the default theme. Read the result from the `open` output, or take a screenshot in a single session.
- The stylesheet follows the system even without a class, so a missing theme provider only shows in `color-scheme` (light native controls on a dark page). Check `color-scheme`, not just the background.
