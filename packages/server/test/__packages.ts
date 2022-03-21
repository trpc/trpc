/* eslint-disable */
import * as trpcClient from '../../client/src';
import * as trpcReact from '../../react/src';
import * as trpcReact__ssg from '../../react/src/ssg';
import * as trpcServer from '../../server/src';

jest.mock('@trpc/server', () => trpcServer);

jest.mock('@trpc/client', () => trpcClient);

jest.mock('@trpc/react', () => trpcReact);

jest.mock('@trpc/react/ssg', () => trpcReact__ssg);

export { trpcServer, trpcClient, trpcReact, trpcReact__ssg };
