# The examples' settings are one toolbar in the header (human)

- Human: put the loader verb picker "in the top bar with the other settings", and make the header less crowded.
- **Shape**: kit's `AppHeader` lays out the app's name, a `raf-query · <framework>` pill, `SettingsControls`, and a last line with `LoaderVerbHint`. Each app passes its own router link as `brand` and its cookie-backed `Settings` as `settings`. The settings are four `NativeSelect`s (Loader, Prefetch links, Stale time, Latency), each under a small uppercase label, and Reset as an icon button whose `title` matches its `aria-label`.
- **The verb is a select, not links**: one control style for the whole toolbar. Choosing a verb navigates with the app's router to `withLoaderVerb(location, verb)`: the same path and search under the new verb, or that verb's list outside `/<verb>/…`. Lost: the verb links' prefetch on hover, which nothing relied on.
- Desktop (`lg`): one row, name on the left, selects on the right. Below that the selects go under the name: a 2×2 grid on phones, a row from `sm`.
- Each app's stylesheet has an `@source` for `examples/.shared/kit/src`. Tailwind only scanned the app and the ui package, so a class used only in the kit was never generated.
