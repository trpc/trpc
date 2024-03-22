import { authConfig } from '~/lib/auth.config';
import NextAuth from 'next-auth';

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    // Omit API routes and static files
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
