import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import { msgpackSerializer } from '../utils/serializer';
import { appRouter } from './routers/_app';

const wss = new WebSocketServer({
  port: 3001,
});

const handler = applyWSSHandler({
  wss,
  router: appRouter,
  experimental_serializer: msgpackSerializer,
});

wss.on('connection', (ws) => {
  console.log(`➕➕ Connection (${wss.clients.size})`);
  
  ws.on('message', (data, isBinary) => {
    console.log('[DEBUG] Message received, isBinary:', isBinary, 'type:', typeof data, 'isBuffer:', Buffer.isBuffer(data));
    if (Buffer.isBuffer(data)) {
      console.log('[DEBUG] First 20 bytes:', data.slice(0, 20).toString('hex'));
    }
  });
  
  ws.once('close', () => {
    console.log(`➖➖ Connection (${wss.clients.size})`);
  });
});

console.log('✅ WebSocket Server listening on ws://localhost:3001');
console.log('📦 Using MessagePack serialization');

process.on('SIGTERM', () => {
  console.log('SIGTERM');
  handler.broadcastReconnectNotification();
  wss.close();
});
