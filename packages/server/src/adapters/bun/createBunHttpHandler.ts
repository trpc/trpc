import type {Server} from "bun";
import {fetchRequestHandler} from "../fetch";
import type { AnyRouter, inferRouterContext } from "../../core";
import type { HTTPBaseHandlerOptions } from "../../http";

export type BunHttpHandlerOptions<TRouter extends AnyRouter> = HTTPBaseHandlerOptions<TRouter, Request> & {
    endpoint: string;
    createContext?: (opts: { req: Request }) => inferRouterContext<TRouter> | Promise<inferRouterContext<TRouter>>;
};

export function createBunHttpHandler<TRouter extends AnyRouter>(opts: BunHttpHandlerOptions<TRouter>) {
    return (request: Request, server: Server) => {
        if (
            server.upgrade(request, {data: {req: request}})
        ) {
            return new Response(null, {status: 101});
        }

        return fetchRequestHandler({
            ...opts,
            req: request,
        });
    }
}
