import { options } from '~/auth';
import NextAuth from 'next-auth';

// Add back once NextAuth v5 is released
// export const runtime = 'edge';

const handlers = NextAuth(options);
export { handlers as GET, handlers as POST };
