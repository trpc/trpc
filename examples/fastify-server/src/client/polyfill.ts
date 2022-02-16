import AbortController from 'abort-controller';
import fetch from 'node-fetch';
import { WebSocket } from 'ws';

// polyfill fetch & websocket
export const globalAny = global as any;

globalAny.AbortController = AbortController;
globalAny.WebSocket = WebSocket;
globalAny.fetch = fetch;
