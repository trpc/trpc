/* eslint-disable */
import * as mock_trpcClient from '@trpc/client/src';
import * as mock_trpcNext from '@trpc/next/src';
import * as mock_trpcReact from '@trpc/react-query/src';
import * as mock_trpcReact__ssg from '@trpc/react-query/src/ssg';
import * as mock_trpcServer from '@trpc/server/src';
import * as mock_trpcServer__observable from '@trpc/server/src/observable';
import * as mock_trpcServer__shared from '@trpc/server/src/shared';

jest.mock('@trpc/server', () => mock_trpcServer);

jest.mock('@trpc/server/observable', () => mock_trpcServer__observable);

jest.mock('@trpc/server/shared', () => mock_trpcServer__shared);

jest.mock('@trpc/client', () => mock_trpcClient);

jest.mock('@trpc/react-query', () => mock_trpcReact);

jest.mock('@trpc/react-query/ssg', () => mock_trpcReact__ssg);

jest.mock('@trpc/next', () => mock_trpcNext);

export {
  mock_trpcServer as trpcServer,
  mock_trpcClient as trpcClient,
  mock_trpcReact as trpcReact,
  mock_trpcReact__ssg as trpcReact__ssg,
};
