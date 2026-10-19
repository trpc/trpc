import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import { msgpackEncoder } from '../utils/encoder';
import { appRouter } from './routers/_app';

const wss = new WebSocketServer({
  port: 3001,
});

const handler = applyWSSHandler({
  wss,
  router: appRouter,
  experimental_encoder: msgpackEncoder,
});

wss.on('connection', (ws) => {
  console.log(`➕➕ Connection (${wss.clients.size})`);
  ws.once('close', () => {
    console.log(`➖➖ Connection (${wss.clients.size})`);
  });
});

console.log('✅ WebSocket Server listening on ws://localhost:3001');
console.log('📦 Using MessagePack encoding');

process.on('SIGTERM', () => {
  console.log('SIGTERM');
  handler.broadcastReconnectNotification();
  wss.close();
});
