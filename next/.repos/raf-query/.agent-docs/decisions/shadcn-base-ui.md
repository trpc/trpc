# shadcn on Base UI, vanilla package (human asked)

- `examples/.shared/ui` (`@examples/ui`) is **vanilla shadcn/ui** on **Base UI** (`style: base-nova`, `iconLibrary: lucide`), not Radix. Do not hand-edit registry components, hooks, or utils there.
- To bump shadcn / add components: run `pnpm dlx shadcn@latest add …` (or `add --all`) in `examples/.shared/ui`. Reinstall instead of patching.
- Brand colors stay in `src/styles/globals.css` (violet primary, violet-tinted neutrals, `light-dark()` + system/`dark`/`light` classes). That CSS is the one allowed local layer on top of the CLI theme tokens (chart/sidebar included).
- App-specific pieces that are not shadcn live in `examples/.shared/kit` (`@examples/kit`): logo, load-more, mock-db toast, `ThemeProvider` for sonner’s `next-themes`, and the issue tracker's shared markup ([examples-kit-presentational.md](./examples-kit-presentational.md)).
- Lost: Radix primitives and `asChild` in apps (links use `buttonVariants`; triggers use Base UI `render`).
