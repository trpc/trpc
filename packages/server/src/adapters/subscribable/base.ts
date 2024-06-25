import type {AnyRouter, CreateContextCallback, inferRouterContext, ProcedureType} from '../../@trpc/server';
import {
    callProcedure,
    getErrorShape,
    getTRPCErrorFromUnknown,
    transformTRPCResponse,
    TRPCError
} from '../../@trpc/server';
import type {BaseHandlerOptions} from '../../@trpc/server/http';
// @trpc/server/rpc
import type {
    TRPCClientOutgoingMessage,
    TRPCReconnectNotification,
    TRPCRequestMessage,
    TRPCResponseMessage
} from '../../@trpc/server/rpc';
import {parseTRPCMessage} from '../../@trpc/server/rpc';
import {isObservable} from '../../observable';
// eslint-disable-next-line no-restricted-imports
import {isAsyncIterable, type MaybePromise, run} from '../../unstable-core-do-not-import';
import type {NodeHTTPCreateContextFnOptions} from '../../adapters/node-http';
import {observableToAsyncIterable} from "../../observable/observable";

export type CreateContextFnOptions<TReq, TRes> = Omit<
    NodeHTTPCreateContextFnOptions<TReq, TRes>,
    'info'
>;

export type CreateContextFn<TRouter extends AnyRouter, TReq, TRes> = (
    opts: CreateContextFnOptions<TReq, TRes>
) => MaybePromise<inferRouterContext<TRouter>>;

export type TransportConnection = {
    send: (data: string) => MaybePromise<void>;
    close: () => MaybePromise<void>;
    isOpen: () => boolean;
    subs: Subscriptions;
};

export type Subscriptions = {
    get: () => MaybePromise<Map<number | string, Subscription>>;
    has: (id: number | string) => MaybePromise<boolean>;
    add: (sub: Subscription) => MaybePromise<void>;
    clear: () => MaybePromise<void>;
    delete: (id: number | string) => MaybePromise<void>;
};

export type Subscription = {
    id: number | string;
    sub: AbortController;
    subInfo: SubscriptionInfo;
};

export type SubscriptionInfo = {
    path: string;
    type: ProcedureType;
};

//TODO:
// - break out the utils into separate functions with all needed parameters
// - re-add the wrapper getTrpcSubscriptionUtils that supplies the needed parameters
export const getTrpcSubscriptionUtils = async <
        TRouter extends AnyRouter,
        TReq = null,
        TRes = null,
    >(
        opts: BaseHandlerOptions<TRouter, TReq> &
            CreateContextCallback<
                inferRouterContext<TRouter>,
                CreateContextFn<TRouter, TReq, TRes>
            > & {
            req: TReq;
            res: TRes;
            currentTransport: TransportConnection;
            getAllConnectedTransports: () => MaybePromise<TransportConnection[]>;
        }
    ) => {
        const {
            createContext,
            req,
            res,
            router,
            currentTransport,
            getAllConnectedTransports
        } = opts;
        const {transformer} = router._def._config;

        const ctxPromise = createContext?.({req, res});
        let ctx: inferRouterContext<TRouter> | undefined = undefined;

        async function respond(
            transport: TransportConnection,
            untransformedJSON: TRPCResponseMessage
        ) {
            await transport.send(
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
                await respond(currentTransport, {
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

        function subscribeToAsyncIterable(
            iterable: AsyncIterable<unknown>,
            msg: TRPCRequestMessage,
            transport: TransportConnection
        ) {
            const {id, jsonrpc} = msg;
            const {path, input} = msg.params;
            const type = msg.method;

            const iterator: AsyncIterator<unknown> = iterable[Symbol.asyncIterator]();
            const abortController = new AbortController();

            const abortPromise = new Promise<'abort'>((resolve) => {
                abortController.signal.onabort = () => resolve('abort');
            });

            run(async () => {

                while (true) {
                    const next = await Promise.race([
                        iterator.next().catch(getTRPCErrorFromUnknown),
                        abortPromise
                    ]);

                    if (next === 'abort') {
                        await iterator.return?.();
                        break;
                    }
                    if (next instanceof Error) {
                        const error = getTRPCErrorFromUnknown(next);
                        opts.onError?.({error, path, type, ctx, req, input});
                        await respond(transport, {
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
                        break;
                    }
                    if (next.done) {
                        break;
                    }

                    await respond(transport, {
                        id,
                        jsonrpc,
                        result: {
                            type: 'data',
                            data: next.value
                        }
                    });
                }

                await iterator.return?.();
                await respond(transport, {
                    id,
                    jsonrpc,
                    result: {
                        type: 'stopped'
                    }
                });
                if (id) {
                    await transport.subs.delete(id);
                }
            }).catch(async (cause) => {
                const error = getTRPCErrorFromUnknown(cause);
                opts.onError?.({error, path, type, ctx, req, input});
                await respond(transport, {
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
                abortController.abort();
            });
            return abortController;
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
                (await currentTransport.subs.get())?.get(id)?.sub?.abort();
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

                if (type !== 'subscription') {
                    // send the value as data if the method is not a subscription
                    await respond(currentTransport, {
                        id,
                        jsonrpc,
                        result: {
                            type: 'data',
                            data: result
                        }
                    });
                    return;
                }

                if (!isObservable(result) && !isAsyncIterable(result)) {
                    throw new TRPCError({
                        message: `Subscription ${path} did not return an observable or a AsyncGenerator`,
                        code: 'INTERNAL_SERVER_ERROR'
                    });
                }

                /* istanbul ignore next -- @preserve */
                if (!currentTransport.isOpen()) {
                    // if the client got disconnected whilst initializing the subscription
                    // no need to send stopped message if the client is disconnected
                    return;
                }

                /* istanbul ignore next -- @preserve */
                if (await currentTransport.subs.has(id)) {
                    // duplicate request ids for client
                    throw new TRPCError({
                        message: `Duplicate id ${id}`,
                        code: 'BAD_REQUEST'
                    });
                }

                const iterable = isObservable(result)
                    ? observableToAsyncIterable(result)
                    : result;

                const abortController = subscribeToAsyncIterable(iterable, msg, currentTransport);

                await currentTransport.subs.add({id: id, sub: abortController, subInfo: {path, type}});

                await respond(currentTransport, {
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
                await respond(currentTransport, {
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

        async function withTransportCatch<T>(
            fn: () => Promise<T>,
            transport: TransportConnection
        ): Promise<T> {
            try {
                return await fn();
            } catch (cause) {
                const error = new TRPCError({
                    code: 'PARSE_ERROR',
                    cause
                });

                await respond(transport, {
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
                    sub.sub?.abort();
                }
                await currentTransport.subs.clear();
            },
            reloadSubscriptionOnTransport: async (
                info: Omit<Subscription, 'sub'>,
                transport: TransportConnection
            ) => {
                return await withTransportCatch(async () => {
                    // craft a fake message to call the procedure
                    const msg: TRPCRequestMessage = {
                        id: info.id,
                        method: info.subInfo.type,
                        params: {
                            input: null,
                            path: info.subInfo.path
                        }
                    };
                    const result = await callProcedure({
                        procedures: router._def.procedures,
                        path: msg.params.path,
                        getRawInput: async () => null,
                        ctx,
                        type: msg.method
                    });
                    if (msg.method !== 'subscription' || !isObservable(result) && !isAsyncIterable(result)) {
                        throw new TRPCError({
                            message: `Subscription ${msg.params.path} did not return an observable or a AsyncGenerator`,
                            code: 'INTERNAL_SERVER_ERROR'
                        });
                    }
                    const iterable = isObservable(result) ? observableToAsyncIterable(result) : result;
                    const abortController = subscribeToAsyncIterable(iterable, msg, transport);
                    // refresh abort controller
                    await currentTransport.subs.delete(info.id);
                    await currentTransport.subs.add({id: info.id, sub: abortController, subInfo: info.subInfo});
                    return abortController;
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
                        await connection.send(data);
                    }
                }
            }
        };
    }
;