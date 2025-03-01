import {QueryClient} from "@tanstack/react-query";
import type {QueryClient as TQueryClient} from "@tanstack/react-query" with {'resolution-mode': 'require'};
import {createTRPCOptionsProxy} from "@trpc/tanstack-react-query";

const queryClient = (new QueryClient()) as unknown as TQueryClient;

const trpc = createTRPCOptionsProxy({
	client: null as any,
	queryClient,
});
