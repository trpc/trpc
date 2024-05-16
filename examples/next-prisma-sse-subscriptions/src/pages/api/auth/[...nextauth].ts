import NextAuth from 'next-auth';
import { authOptions } from '~/server/authOptions';

export default NextAuth(authOptions);
