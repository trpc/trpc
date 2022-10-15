/* eslint-disable */
import * as mock_trpcServer from '../../server/src';
jest.mock('@trpc/server', () => mock_trpcServer);
import * as mock_trpcServer__observable from '../../server/src/observable';
jest.mock('@trpc/server/observable', () => mock_trpcServer__observable);
import * as mock_trpcServer__shared from '../../server/src/shared';
jest.mock('@trpc/server/shared', () => mock_trpcServer__shared);

import * as mock_trpcClient from '../../client/src';
jest.mock('@trpc/client', () => mock_trpcClient);

import * as mock_trpcReact from '../../react-query/src';
jest.mock('@trpc/react-query', () => mock_trpcReact);
import * as mock_trpcReact__ssg from '../../react-query/src/ssg';
jest.mock('@trpc/react-query/ssg', () => mock_trpcReact__ssg);

import * as mock_trpcNext from '../../next/src';
jest.mock('@trpc/next', () => mock_trpcNext);

export { mock_trpcServer as trpcServer, mock_trpcClient as trpcClient, mock_trpcReact as trpcReact, mock_trpcReact__ssg as trpcReact__ssg };
