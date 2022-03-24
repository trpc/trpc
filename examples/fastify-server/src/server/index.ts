import { createServer } from './server';
import { serverConfig } from '../config';

const server = createServer(serverConfig);

server.start();
