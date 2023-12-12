import type {ServerWebSocket, WebSocketHandler} from "bun";
import {
    JSONRPC2,
    parseTRPCMessage,
    TRPCClientOutgoingMessage,
    TRPCResponseMessage,
} from "../../rpc";
import {
    AnyRouter,
    callProcedure,
    getTRPCErrorFromUnknown,
    inferRouterContext,
    TRPCError,
} from "../..";
import {getErrorShape, transformTRPCResponse} from "../../shared";
import {BaseHandlerOptions} from "../../internals/types";
import {isObservable, Unsubscribable} from "../../observable";

type BunWSAdapterOptions<TRouter extends AnyRouter> = BaseHandlerOptions<
    TRouter,
    Request
> & {
    createContext?: (params: {
        req: Request;
        res: ServerWebSocket<BunWSClientCtx>;
    }) => Promise<unknown>;
};

type BunWSClientCtx = {
    req: Request;
    handleRequest: (msg: TRPCClientOutgoingMessage) => Promise<void>;
    unsubscribe(): void;
};

export function createBunWSHandler<TRouter extends AnyRouter>(
    opts: BunWSAdapterOptions<TRouter>,
): WebSocketHandler<BunWSClientCtx> {
    const {router, createContext} = opts;

    const respond = (
        client: ServerWebSocket<unknown>,
        untransformedJSON: TRPCResponseMessage,
    ) => {
        client.send(
            JSON.stringify(
                transformTRPCResponse(opts.router._def._config, untransformedJSON),
            ),
        );
    };

    return {
        async open(client: ServerWebSocket<BunWSClientCtx>) {
            const {req} = client.data;
            const clientSubscriptions = new Map<string | number, Unsubscribable>();

            const ctxPromise = createContext?.({req, res: client});
            let ctx: inferRouterContext<TRouter> | undefined = undefined;
            await (async () => {
                try {
                    ctx = await ctxPromise;
                } catch (cause) {
                    const error = getTRPCErrorFromUnknown(cause);
                    opts.onError?.({
                        error,
                        path: undefined,
                        type: "unknown",
                        ctx,
                        req,
                        input: undefined,
                    });
                    respond(client, {
                        id: null,
                        error: getErrorShape({
                            config: router._def._config,
                            error,
                            type: "unknown",
                            path: undefined,
                            input: undefined,
                            ctx,
                        }),
                    });

                    // close in next tick
                    (global.setImmediate ?? global.setTimeout)(() => {
                        client.close();
                    });
                }
            })();

            const stopSubscription = (
                subscription: Unsubscribable,
                {id, jsonrpc}: JSONRPC2.BaseEnvelope & { id: JSONRPC2.RequestId },
            ) => {
                subscription.unsubscribe();

                respond(client, {
                    id,
                    jsonrpc,
                    result: {
                        type: "stopped",
                    },
                });
            };

            client.data.handleRequest = async (msg: TRPCClientOutgoingMessage) => {
                const {id, jsonrpc} = msg;
                /* istanbul ignore next -- @preserve */
                if (id === null) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "`id` is required",
                    });
                }
                if (msg.method === "subscription.stop") {
                    const sub = clientSubscriptions.get(id);
                    if (sub) {
                        stopSubscription(sub, {id, jsonrpc});
                    }
                    clientSubscriptions.delete(id);
                    return;
                }
                const {path, input} = msg.params;
                const type = msg.method;
                try {
                    await ctxPromise; // asserts context has been set

                    const result = await callProcedure({
                        procedures: router._def.procedures,
                        path,
                        rawInput: input,
                        ctx,
                        type,
                    });

                    if (type === "subscription") {
                        if (!isObservable(result)) {
                            throw new TRPCError({
                                message: `Subscription ${path} did not return an observable`,
                                code: "INTERNAL_SERVER_ERROR",
                            });
                        }
                    } else {
                        // send the value as data if the method is not a subscription
                        respond(client, {
                            id,
                            jsonrpc,
                            result: {
                                type: "data",
                                data: result,
                            },
                        });
                        return;
                    }

                    const observable = result;
                    const sub = observable.subscribe({
                        next(data) {
                            respond(client, {
                                id,
                                jsonrpc,
                                result: {
                                    type: "data",
                                    data,
                                },
                            });
                        },
                        error(err) {
                            const error = getTRPCErrorFromUnknown(err);
                            opts.onError?.({error, path, type, ctx, req, input});
                            respond(client, {
                                id,
                                jsonrpc,
                                error: getErrorShape({
                                    config: router._def._config,
                                    error,
                                    type,
                                    path,
                                    input,
                                    ctx,
                                }),
                            });
                        },
                        complete() {
                            respond(client, {
                                id,
                                jsonrpc,
                                result: {
                                    type: "stopped",
                                },
                            });
                        },
                    });

                    if (client.readyState !== WebSocket.OPEN) {
                        // if the client got disconnected whilst initializing the subscription
                        // no need to send stopped message if the client is disconnected
                        sub.unsubscribe();
                        return;
                    }

                    if (clientSubscriptions.has(id)) {
                        // duplicate request ids for client
                        stopSubscription(sub, {id, jsonrpc});
                        throw new TRPCError({
                            message: `Duplicate id ${id}`,
                            code: "BAD_REQUEST",
                        });
                    }
                    clientSubscriptions.set(id, sub);

                    respond(client, {
                        id,
                        jsonrpc,
                        result: {
                            type: "started",
                        },
                    });
                } catch (cause) {
                    // procedure threw an error
                    const error = getTRPCErrorFromUnknown(cause);
                    opts.onError?.({error, path, type, ctx, req, input});
                    respond(client, {
                        id,
                        jsonrpc,
                        error: getErrorShape({
                            config: router._def._config,
                            error,
                            type,
                            path,
                            input,
                            ctx,
                        }),
                    });
                }
            };

            client.data.unsubscribe = () => {
                for (const sub of clientSubscriptions.values()) {
                    sub.unsubscribe();
                }
                clientSubscriptions.clear();
            };
        },

        async close(client: ServerWebSocket<BunWSClientCtx>) {
            client.data.unsubscribe?.();
        },

        async message(client: ServerWebSocket<BunWSClientCtx>, message: string | Buffer) {
            try {
                const msgJSON: unknown = JSON.parse(message.toString());
                const msgs: unknown[] = Array.isArray(msgJSON) ? msgJSON : [msgJSON];

                const promises = msgs
                    .map((raw) => parseTRPCMessage(raw, router._def._config.transformer))
                    .map(client.data.handleRequest);

                await Promise.all(promises);
            } catch (cause) {
                const error = new TRPCError({
                    code: "PARSE_ERROR",
                    cause,
                });

                respond(client, {
                    id: null,
                    error: getErrorShape({
                        config: router._def._config,
                        error,
                        type: "unknown",
                        path: undefined,
                        input: undefined,
                        ctx: undefined,
                    }),
                });
            }
        },
    };
}
