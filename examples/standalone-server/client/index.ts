import { createTRPCClient } from "@trpc/client";
import type { AppRouter } from "../server";

// polyfill fetch
import fetch from "node-fetch";
// @ts-ignore
global.fetch = fetch;

const client = createTRPCClient<AppRouter>({
  url: "http://localhost:2021",
});

// Type safe
client.query("hello", "bob").then((res) => console.log(res.message));
