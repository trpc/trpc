import type {IncomingMessage} from 'http';
import type ws from 'ws';
import type {AnyRouter, CreateContextCallback, inferRouterContext,} from '../../@trpc/server';
import type {BaseHandlerOptions} from '../../@trpc/server/http';
// @trpc/server/rpc
import type {TRPCReconnectNotification,} from '../../@trpc/server/rpc';
// eslint-disable-next-line no-restricted-imports
import type {MaybePromise} from '../../unstable-core-do-not-import';
import type {NodeHTTPCreateContextFnOptions} from '../node-http';
import {getTrpcSubscriptionUtils} from "../../adapters/subscribable/base";

/**
 * Importing ws causes a build error
 * @link https://github.com/trpc/trpc/pull/5279
 */
const WEBSOCKET_OPEN = 1; /* ws.WebSocket.OPEN */

/**
 * @public
 */
export type CreateWSSContextFnOptions = Omit<
    NodeHTTPCreateContextFnOptions<IncomingMessage, ws.WebSocket>,
    'info'
>;

/**
 * @public
 */
export type CreateWSSContextFn<TRouter extends AnyRouter> = (
    opts: CreateWSSContextFnOptions,
) => MaybePromise<inferRouterContext<TRouter>>;

export type WSConnectionHandlerOptions<TRouter extends AnyRouter> =
    BaseHandlerOptions<TRouter, IncomingMessage> &
    CreateContextCallback<
        inferRouterContext<TRouter>,
        CreateWSSContextFn<TRouter>
    >;

/**
 * Web socket server handler
 */
export type WSSHandlerOptions<TRouter extends AnyRouter> =
    WSConnectionHandlerOptions<TRouter> & {
    wss: ws.WebSocketServer;
    prefix?: string;
    keepAlive?: {
        /**
         * Enable heartbeat messages
         * @default false
         */
        enabled: boolean;
        /**
         * Heartbeat interval in milliseconds
         * @default 30000
         */
        pingMs?: number;
        /**
         * Terminate the WebSocket if no pong is received after this many milliseconds
         * @default 5000
         */
        pongWaitMs?: number;
    };
};

export function getWSConnectionHandler<TRouter extends AnyRouter>(
    opts: WSConnectionHandlerOptions<TRouter>,
) {
    return async (client: ws.WebSocket, req: IncomingMessage) => {
        const clientSubscriptions = new Map<number | string, AbortController>();
        const utils = await getTrpcSubscriptionUtils<TRouter, IncomingMessage, ws.WebSocket>({
            ...opts,
            req,
            res: null,
            currentTransport: {
                send: (data) => {
                    client.send(data);
                },
                close: () => {
                    client.close();
                },
                isOpen: () => {
                    return client.readyState === WEBSOCKET_OPEN;
                },
                subs: {
                    get: () => clientSubscriptions,
                    add: (sub) => {
                        clientSubscriptions.set(sub.id, sub);
                    },
                    has: (id) => clientSubscriptions.has(id),
                    clear: () => clientSubscriptions.clear(),
                },
            },
            getAllConnectedTransports: () => []
        })

        client.on('message', async (message) => {
            await utils.handleMessage(message);
        });

        // WebSocket errors should be handled, as otherwise unhandled exceptions will crash Node.js.
        // This line was introduced after the following error brought down production systems:
        // "RangeError: Invalid WebSocket frame: RSV2 and RSV3 must be clear"
        // Here is the relevant discussion: https://github.com/websockets/ws/issues/1354#issuecomment-774616962
        client.on('error', (cause) => {
            utils.handleError(cause)
        });

        client.once('close', async () => {
            await utils.handleClose()
        });
    };
}

/**
 * Handle WebSocket keep-alive messages
 */
function handleKeepAlive(
    client: ws.WebSocket,
    pingMs = 30000,
    pongWaitMs = 5000,
) {
    let heartbeatTimeout: NodeJS.Timeout | undefined;
    const heartbeatInterval = setInterval(() => {
        if (client.readyState !== WEBSOCKET_OPEN) {
            return;
        }
        // First we send a ping message and wait for a pong
        client.ping();
        // We set a timeout to close the connection if the pong is not received
        heartbeatTimeout = setTimeout(() => {
            client.terminate();
            clearInterval(heartbeatInterval);
        }, pongWaitMs);
    }, pingMs).unref();
    // When we receive a pong message, we clear the timeout
    client.on('pong', () => {
        heartbeatTimeout && clearTimeout(heartbeatTimeout);
    });
    // If the connection is closed, we clear the interval
    client.on('close', () => {
        clearInterval(heartbeatInterval);
    });
}

export function applyWSSHandler<TRouter extends AnyRouter>(
    opts: WSSHandlerOptions<TRouter>,
) {
    const {wss, prefix, keepAlive} = opts;

    const onConnection = getWSConnectionHandler(opts);
    wss.on('connection', async (client, req) => {
        if (prefix && !req.url?.startsWith(prefix)) {
            return;
        }

        await onConnection(client, req);
        if (keepAlive?.enabled) {
            const {pingMs, pongWaitMs} = keepAlive;
            handleKeepAlive(client, pingMs, pongWaitMs);
        }
    });

    return {
        broadcastReconnectNotification: () => {
            const response: TRPCReconnectNotification = {
                id: null,
                method: 'reconnect',
            };
            const data = JSON.stringify(response);
            for (const client of wss.clients) {
                if (client.readyState === WEBSOCKET_OPEN) {
                    client.send(data);
                }
            }
        },
    };
}
