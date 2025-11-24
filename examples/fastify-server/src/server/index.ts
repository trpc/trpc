import { serverConfig } from '../config.ts';
import { createServer } from './server.ts';

const server = createServer(serverConfig);

void server.start();
