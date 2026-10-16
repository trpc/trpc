"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/** Wraps the app so vanilla shadcn `Toaster` (sonner) can read the theme. */
export function ThemeProvider({
	children,
	...props
}: ComponentProps<typeof NextThemesProvider>) {
	return (
		<NextThemesProvider
			attribute="class"
			defaultTheme="system"
			disableTransitionOnChange
			enableSystem
			{...props}
		>
			{children}
		</NextThemesProvider>
	);
}
