import { trpc } from "~/config/trpc.js";

const user = await trpc.userById.query("1");

console.log(user);