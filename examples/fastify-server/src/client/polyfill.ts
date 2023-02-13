import fetch from 'node-fetch';
import { WebSocket } from 'ws';

// polyfill fetch & websocket
export const globalAny = global as any;

globalAny.WebSocket = WebSocket;
globalAny.fetch = fetch;
