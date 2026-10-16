# Example prefetch starts off (human)

- The preview examples' **Prefetch links** menu has no "Default" choice. Each app passes the library prop explicitly.
- All three start at **Off**, and **Reset** returns there: `prefetch={false}` on `next/link`, `defaultPreload: false` on the TanStack routers (Promise and Effect apps alike).
- Next.js: off, the full route in the viewport, the full route on hover or focus. TanStack: off, intent, viewport, render.
- Lost: a Next.js option that passed `prefetch={null}` (`"auto"`). TanStack starting on intent.
- Files: `examples/nextjs/src/settings.ts`, `examples/nextjs/src/components/settings.tsx`, `examples/tanstack-start/src/settings.ts`, `examples/tanstack-start-effect/src/settings.ts`.
