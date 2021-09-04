import { Dict } from '@trpc/server';
import { URLSearchParams } from 'url';

export type HTTPHeaders = Dict<string | string[]>;

export interface HTTPResponse {
  status: number;
  headers?: HTTPHeaders;
  body?: string;
}

export interface HTTPRequest {
  method: string;
  query: URLSearchParams;
  headers: HTTPHeaders;
  body: unknown;
}
