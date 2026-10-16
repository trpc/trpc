# The examples' progress bar reads each router's own pending state (human)

- Human: "a global progress bar that uses the native thing from each library".
- **Shape**: kit's `NavigationProgress` is only the look: a fixed 2 px bar, mounted while pending. It fades in after 150 ms (`@starting-style` via Tailwind's `starting:`) and creeps to 90%. Each app decides when to mount it, in plain sight:
  - TanStack Start (both apps): `useRouterState({ select: (state) => state.status === "pending" })` in `__root.tsx`.
  - React Router: `useNavigation().state !== "idle"` in `root.tsx`.
  - Next.js: no app-wide navigation state exists, so `AppLink` renders a `LinkProgress` child reading `useLinkStatus()`, and the Loader select wraps `router.push` in `useTransition`.
- Set aside: raf-query's own fetching state (it's about queries, not navigations, and background refetches would light it up); a context collecting every Next.js link's status into one bar (more code than the examples need); a finishing "snap to 100%" animation, which needs state to outlive the pending flag.
