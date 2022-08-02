import superjson from 'superjson';
import { ContentType } from '.';

export const superjsonContentType: ContentType = {
  key: 'superjson',
  headerValue: 'application/json',
  fromResponse: async (res) => superjson.parse(await res.text()),
  fromString: (str) => superjson.parse(str),
  toBody: (data) => superjson.stringify(data),
  toString: (data) => superjson.stringify(data),
};
