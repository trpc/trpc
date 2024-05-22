import type {IncomingMessage} from "http";
import {
    JSONRPC2,
    parseTRPCMessage,
    TRPCClientOutgoingMessage,
    TRPCReconnectNotification,
    TRPCRequestMessage,
    TRPCResponseMessage
} from "@trpc/server/unstable-core-do-not-import/rpc";
import {
    AnyRouter,
    callProcedure,
    CreateContextCallback,
    getErrorShape,
    getTRPCErrorFromUnknown,
    inferRouterContext,
    type ProcedureType,
    transformTRPCResponse,
    TRPCError
} from "@trpc/server";
import {isObservable, Observable, Unsubscribable} from "@trpc/server/observable";
import {MaybePromise} from "@trpc/server/unstable-core-do-not-import/types";
import {BaseHandlerOptions} from "@trpc/server/unstable-core-do-not-import/http/types";
import {NodeHTTPCreateContextFnOptions} from "@trpc/server/adapters/node-http";

export type CreateContextFnOptions<TRes> = Omit<
    NodeHTTPCreateContextFnOptions<IncomingMessage, TRes>,
    'info'
>;

export type CreateContextFn<TRouter extends AnyRouter> = (
    opts: CreateContextFnOptions<any>
) => MaybePromise<inferRouterContext<TRouter>>;

export type TransportConnection = {
    send: (data: string) => MaybePromise<void>,
    close: () => MaybePromise<void>,
    isOpen: () => boolean,
    subs: Subscriptions
}

export type Subscriptions = {
    get: () => MaybePromise<Map<number | string, Subscription>>
    has: (id: number | string) => MaybePromise<boolean>
    add: (sub: Subscription) => MaybePromise<void>
    clear: () => MaybePromise<void>
}

export type Subscription = {
    id: number | string,
    sub: Unsubscribable,
    subInfo: SubscriptionInfo
}

export type SubscriptionInfo = {
    path: string,
    type: ProcedureType,
}

export type TrpcSubscriptionMap = Map<string, Map<number | string, Subscription>>;

export const getTrpcSubscriptionUtils = async <TRouter extends AnyRouter, TRequest extends IncomingMessage>(
    opts:
        BaseHandlerOptions<TRouter, IncomingMessage> &
        CreateContextCallback<
            inferRouterContext<TRouter>,
            CreateContextFn<TRouter>
        > &
        {
            req: TRequest,
            currentTransport: TransportConnection,
            getAllConnectedTransports: () => MaybePromise<TransportConnection[]>
        }
) => {
    const {createContext, router, req, currentTransport, getAllConnectedTransports} = opts;
    const {transformer} = router._def._config;

    const ctxPromise = createContext?.({req, res: null});
    let ctx: inferRouterContext<TRouter> | undefined = undefined;

    function respond(transport: TransportConnection, untransformedJSON: TRPCResponseMessage) {
        transport.send(
            JSON.stringify(
                transformTRPCResponse(router._def._config, untransformedJSON)
            )
        );
    }

    async function createContextAsync() {
        try {
            ctx = await ctxPromise;
        } catch (cause) {
            const error = getTRPCErrorFromUnknown(cause);
            opts.onError?.({
                error,
                path: undefined,
                type: 'unknown',
                ctx,
                req,
                input: undefined
            });
            //TODO: implement respond with client
            respond(currentTransport, {
                id: null,
                error: getErrorShape({
                    config: router._def._config,
                    error,
                    type: 'unknown',
                    path: undefined,
                    input: undefined,
                    ctx
                })
            });

            // close in next tick
            (global.setImmediate ?? global.setTimeout)(() => {
                close();
            });
        }
    }

    function stopSubscription(
        subscription: Unsubscribable,
        {id, jsonrpc}: JSONRPC2.BaseEnvelope & { id: JSONRPC2.RequestId }
    ) {
        subscription.unsubscribe();

        respond(currentTransport, {
            id,
            jsonrpc,
            result: {
                type: 'stopped'
            }
        });
    }

    function subscribeToObservable(observable: Observable<any, any>, msg: TRPCRequestMessage, transport: TransportConnection) {
        const {id, jsonrpc} = msg;
        const {path, input} = msg.params;
        const type = msg.method;

        return observable.subscribe({
            next(data) {
                respond(transport, {
                    id,
                    jsonrpc,
                    result: {
                        type: 'data',
                        data
                    }
                });
            },
            error(err) {
                const error = getTRPCErrorFromUnknown(err);
                opts.onError?.({error, path, type, ctx, req, input});
                respond(transport, {
                    id,
                    jsonrpc,
                    error: getErrorShape({
                        config: router._def._config,
                        error,
                        type,
                        path,
                        input,
                        ctx
                    })
                });
            },
            complete() {
                respond(transport, {
                    id,
                    jsonrpc,
                    result: {
                        type: 'stopped'
                    }
                });
            }
        });
    }

    function addSubscriptionToTransportState(sub: Unsubscribable, msg: TRPCRequestMessage, transport: TransportConnection) {
        const {id, jsonrpc} = msg;
        const {path} = msg.params;
        const type = msg.method;

        /* istanbul ignore next -- @preserve */
        if (transport.subs.has(id!)) {
            // duplicate request ids for client
            stopSubscription(sub, {id, jsonrpc});
            throw new TRPCError({
                message: `Duplicate id ${id}`,
                code: 'BAD_REQUEST'
            });
        }
        transport.subs.add({id: id!, sub, subInfo: {path, type}});
    }

    async function handleRequest(msg: TRPCClientOutgoingMessage) {
        const {id, jsonrpc} = msg;
        /* istanbul ignore next -- @preserve */
        if (id === null) {
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: '`id` is required'
            });
        }
        if (msg.method === 'subscription.stop') {
            // TODO
            /*const sub = clientSubscriptions.get(id);
            if (sub) {
              stopSubscription(sub, { id, jsonrpc });
            }
            clientSubscriptions.delete(id);*/
            return;
        }
        const {path, input} = msg.params;
        const type = msg.method;
        try {
            await ctxPromise; // asserts context has been set

            const result = await callProcedure({
                procedures: router._def.procedures,
                path,
                getRawInput: async () => input,
                ctx,
                type
            });

            // check subscription to be observeable
            if (type === 'subscription') {
                if (!isObservable(result)) {
                    throw new TRPCError({
                        message: `Subscription ${path} did not return an observable`,
                        code: 'INTERNAL_SERVER_ERROR'
                    });
                }
            } else {
                // send the value as data if the method is not a subscription
                respond(currentTransport, {
                    id,
                    jsonrpc,
                    result: {
                        type: 'data',
                        data: result
                    }
                });
                return;
            }

            const sub = subscribeToObservable(result, msg, currentTransport);

            /* istanbul ignore next -- @preserve */
            if (!currentTransport.isOpen()) {
                // if the client got disconnected whilst initializing the subscription
                // no need to send stopped message if the client is disconnected
                sub.unsubscribe();
                return;
            }

            addSubscriptionToTransportState(sub, msg, currentTransport);

            respond(currentTransport, {
                id,
                jsonrpc,
                result: {
                    type: 'started'
                }
            });
        } catch (cause) /* istanbul ignore next -- @preserve */ {
            // procedure threw an error
            const error = getTRPCErrorFromUnknown(cause);
            opts.onError?.({error, path, type, ctx, req, input});
            respond(currentTransport, {
                id,
                jsonrpc,
                error: getErrorShape({
                    config: router._def._config,
                    error,
                    type,
                    path,
                    input,
                    ctx
                })
            });
        }
    }

    async function withTransportCatch<T>(fn: () => Promise<T>, transport: TransportConnection): Promise<T> {
        try {
            return await fn();
        } catch (cause) {
            const error = new TRPCError({
                code: 'PARSE_ERROR',
                cause
            });

            respond(transport, {
                id: null,
                error: getErrorShape({
                    config: router._def._config,
                    error,
                    type: 'unknown',
                    path: undefined,
                    input: undefined,
                    ctx: undefined
                })
            });
            return Promise.reject(error);
        }
    }

    await createContextAsync();
    return {
        handleMessage: async (message: any) => {
            await withTransportCatch(async () => {
                // eslint-disable-next-line @typescript-eslint/no-base-to-string
                const msgJSON: unknown = JSON.parse(message.toString());
                const msgs: unknown[] = Array.isArray(msgJSON) ? msgJSON : [msgJSON];
                const promises = msgs
                    .map((raw) => parseTRPCMessage(raw, transformer))
                    .map(handleRequest);
                await Promise.all(promises);
            }, currentTransport);
        },
        handleError: (cause: any) => {
            opts.onError?.({
                ctx,
                error: getTRPCErrorFromUnknown(cause),
                input: undefined,
                path: undefined,
                type: 'unknown',
                req
            });
        },
        handleClose: async () => {
            for (const sub of (await currentTransport.subs.get()).values()) {
                sub.sub?.unsubscribe();
            }
            currentTransport.subs.clear();
        },
        reloadSubscriptionOnTransport: async (info: Omit<Subscription, "sub">, transport: TransportConnection) => {
            return await withTransportCatch(async () => {
                // craft a fake message to call the procedure
                const msg: TRPCRequestMessage = {
                    id: info.id,
                    method: info.subInfo.type,
                    params: {
                        input: null,
                        path: info.subInfo.path
                    },
                }
                const result = await callProcedure({
                    procedures: router._def.procedures,
                    path: msg.params.path,
                    getRawInput: async () => null,
                    ctx,
                    type: msg.method
                });
                if (msg.method !== 'subscription' || !isObservable(result)) {
                    throw new TRPCError({
                        message: `Subscription ${msg.params.path} did not return an observable`,
                        code: 'INTERNAL_SERVER_ERROR'
                    });
                }
                return subscribeToObservable(result, msg, transport);
            }, transport);
        },
        broadcastReconnectNotification: async () => {
            const response: TRPCReconnectNotification = {
                id: null,
                method: 'reconnect'
            };
            const data = JSON.stringify(response);
            for (const connection of await getAllConnectedTransports()) {
                if (connection.isOpen()) {
                    connection.send(data);
                }
            }
        }
    };
};