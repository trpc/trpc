import { MiddlewareFunction } from '../core';

export type Next = Parameters<MiddlewareFunction<any, any>>[0]['next'];
