/**
 * Sockets: WebSocket and MessagePort sessions on Effect's Socket, the socket
 * core that runs calls over them, and the upgrade server.
 *
 * @module
 */
export { HandlerDrains, makeSocketDrains } from './drain.ts';
export type { DrainConnection, SocketDrains } from './drain.ts';
export {
  fromWebSocketLike,
  runSocket,
  runWebSocketLike,
  socketFrames,
} from './socket-session.ts';
export type { SocketOutbox, SocketSession } from './socket-session.ts';
export {
  SocketCore,
  connectionReceiver,
  frameMessage,
  parseSocketMessage,
  serveMessagePort,
  serveSocketConnection,
} from './socket.ts';
export type {
  ConnectionReceiver,
  MessagePortLike,
  SocketCoreShape,
  Transport,
  WebSocketLike,
} from './socket.ts';
export {
  UpgradeServer,
  isUpgrade,
  serveAsWebSocket,
  upgradeTo,
} from './upgrade.ts';
export type { ServeSocket } from './upgrade.ts';
