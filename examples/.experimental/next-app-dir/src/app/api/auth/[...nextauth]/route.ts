import { options } from '~/auth';
import NextAuth from 'next-auth';

// export const runtime = 'edge';

const handlers = NextAuth(options);
export { handlers as GET, handlers as POST };
