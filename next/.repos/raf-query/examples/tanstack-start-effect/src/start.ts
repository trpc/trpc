import { createSerializationAdapter } from "@tanstack/react-router";
import { createStart } from "@tanstack/react-start";
import { Schema } from "effect";

import { IssueNotFound } from "~/rpc.ts";

/**
 * Lets `IssueNotFound` cross from the server to the browser as itself. The
 * router's `dehydrate` sends the queries' promises through its serializer,
 * and `Schema.is(IssueNotFound)` must stay true after hydration.
 */
const issueNotFoundAdapter = createSerializationAdapter({
	fromSerializable: (id: number) => new IssueNotFound({ id }),
	key: "IssueNotFound",
	test: Schema.is(IssueNotFound),
	toSerializable: (error) => error.id,
});

export const startInstance = createStart(() => ({
	serializationAdapters: [issueNotFoundAdapter],
}));
