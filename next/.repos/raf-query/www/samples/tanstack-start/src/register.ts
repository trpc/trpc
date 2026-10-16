// TanStack Start's Vite plugin writes this into `routeTree.gen.ts`.
import type { getRouter } from "./router.tsx";

declare module "@tanstack/react-start" {
	interface Register {
		router: Awaited<ReturnType<typeof getRouter>>;
		ssr: true;
	}
}
