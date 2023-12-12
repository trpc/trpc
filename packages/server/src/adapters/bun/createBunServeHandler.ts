import type {Serve} from "bun";
import {AnyRouter} from "../../core";
import {createBunWSHandler} from "./createBunWSHandler";
import {BunHttpHandlerOptions, createBunHttpHandler} from "./createBunHttpHandler";

type BunServeHandlerOptions<TRouter extends AnyRouter> =
    Omit<BunHttpHandlerOptions<TRouter>, "endpoint">
    & Omit<Serve<never>, "websocket" | "fetch">
    & Partial<Pick<Serve<never>, "fetch">>

export function createBunServeHandler<TRouter extends AnyRouter>({router, batching, createContext, onError, ...serveOptions}: BunServeHandlerOptions<TRouter>) {
    return {
        ...serveOptions,
        fetch: createBunHttpHandler({
            router,
            endpoint: "",
            batching,
            createContext,
            onError,
        }),
        websocket: createBunWSHandler({
            router,
            createContext,
            batching,
            onError,
        }),
    }
}
