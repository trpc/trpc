import { createContext } from './context';
import { appRouter } from './routers/_app';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import http from 'http';
import next from 'next';
import { parse } from 'url';
import { WebSocketServer } from 'ws';

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
console.log({ dev });
const app = next({ dev });
const handle = app.getRequestHandler();

void app
  .prepare()
  .then(() => {
    const server = http.createServer((req, res) => {
      console.log('hello req', req.url);
      // const proto = req.headers['x-forwarded-proto'];
      // if (proto && proto === 'http') {
      //   // redirect to ssl
      //   res.writeHead(303, {
      //     location: `https://` + req.headers.host + (req.headers.url ?? ''),
      //   });
      //   res.end();
      //   return;
      // }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const parsedUrl = parse(req.url!, true);
      void handle(req, res, parsedUrl).catch((err) => {
        console.log('errrr', err);
      });
    });
    const wss = new WebSocketServer({ server });
    const handler = applyWSSHandler({ wss, router: appRouter, createContext });

    process.on('SIGTERM', () => {
      console.log('SIGTERM');
      handler.broadcastReconnectNotification();
    });
    server.listen(port);

    console.log(
      `> Server listening at http://localhost:${port} as ${
        dev ? 'development' : process.env.NODE_ENV
      }`,
    );
  })
  .catch((err) => {
    console.log({ err });
    process.exit(1);
  });
