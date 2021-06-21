import { parse } from 'url';
import next from 'next';
import { createServer } from 'http';

const port = parseInt(process.env.PORT || '3000', 10);

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev: true });

app.prepare().then(() => {
  createServer();
});
