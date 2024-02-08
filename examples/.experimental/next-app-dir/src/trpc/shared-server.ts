import { cookies } from "next/headers";
import { auth } from "~/auth";

export async function createContext() {
  return {
    session: await auth(),
    headers: {
      cookie: cookies().toString(),
      'x-trpc-source': 'rsc-invoke',
    },
  };
}