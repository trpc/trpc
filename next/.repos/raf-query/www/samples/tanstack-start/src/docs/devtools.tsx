import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@raf-query/react";
import { QueryDevtools } from "@raf-query/react/devtools";

/// <reference types="vite/client" />

declare const props: { children: ReactNode };

declare const queryClient: QueryClient;

// #region intro
function App() {
	return (
		<QueryClientProvider client={queryClient}>
			{props.children}
			{import.meta.env.DEV ? <QueryDevtools /> : null}
		</QueryClientProvider>
	);
}
// #endregion
