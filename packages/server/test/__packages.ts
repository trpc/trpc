/* eslint-disable */
import * as trpcServer from '../../server/src';
jest.mock('@trpc/server', () => trpcServer);
import * as trpcClient from '../../client/src';
jest.mock('@trpc/client', () => trpcClient);

import * as trpcClient__links__httpLink from '../../client/src/links/httpLink';
jest.mock('@trpc/client/links/httpLink', () => trpcClient__links__httpLink);
import * as trpcClient__links__httpBatchLink from '../../client/src/links/httpBatchLink';
jest.mock('@trpc/client/links/httpBatchLink', () => trpcClient__links__httpBatchLink);
import * as trpcClient__links__loggerLink from '../../client/src/links/loggerLink';
jest.mock('@trpc/client/links/loggerLink', () => trpcClient__links__loggerLink);
import * as trpcClient__links__wsLink from '../../client/src/links/wsLink';
jest.mock('@trpc/client/links/wsLink', () => trpcClient__links__wsLink);

import * as trpcReact from '../../react/src';
jest.mock('@trpc/react', () => trpcReact);
import * as trpcReact__ssg from '../../react/src/ssg';
jest.mock('@trpc/react/ssg', () => trpcReact__ssg);

export { trpcServer, trpcClient, trpcReact, trpcReact__ssg };