import http from 'http';
import { parse } from 'url';
import next from 'next';
import ws from 'ws';
import { applyWSSHandler } from '@trpc/server/ws';
import { appRouter } from './routers/app';
import { createContext } from './trpc';
import { TRPCReconnectNotification } from '@trpc/server/rpc';
const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    const proto = req.headers['x-forwarded-proto'];
    if (proto && proto === 'http') {
      // redirect to ssl
      res.writeHead(303, {
        location: `https://` + req.headers.host + (req.headers.url ?? ''),
      });
      res.end();
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });
  const wss = new ws.Server({ server });
  const handler = applyWSSHandler({ wss, router: appRouter, createContext });

  process.on('SIGTERM', () => {
    console.log('SIGTERM');
    handler.broadcastReconnectNotification();
  });

  const msg: TRPCReconnectNotification = {
    id: null,
    method: 'reconnect',
  };
  const msgJson = JSON.stringify(msg);
  // heroku has 55s connection timeout
  // notifying clients to reconnect after 54s
  wss.on('connection', (client) => {
    const timer = setTimeout(() => {
      if (client.readyState === ws.OPEN) {
        client.send(msgJson);
      }
    }, 54e3);
    client.once('close', () => {
      clearTimeout(timer);
    });
  });

  server.listen(port);

  // tslint:disable-next-line:no-console
  console.log(
    `> Server listening at http://localhost:${port} as ${
      dev ? 'development' : process.env.NODE_ENV
    }`,
  );
});
