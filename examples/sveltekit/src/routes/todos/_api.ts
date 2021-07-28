/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import type { Request } from '@sveltejs/kit';
import type { Locals } from '$lib/types';

/*
	This module is used by the /todos.json and /todos/[uid].json
	endpoints to make calls to api.svelte.dev, which stores todos
	for each user. The leading underscore indicates that this is
	a private module, _not_ an endpoint — visiting /todos/_api
	will net you a 404 response.

	(The data on the todo app will expire periodically; no
	guarantees are made. Don't use it to organise your life.)
*/

const base = 'https://api.svelte.dev';

export async function api(request: Request<Locals>, resource: string, data?: {}) {
	// user must have a cookie set
	if (!request.locals.userid) {
		return { status: 401 };
	}

	const res = await fetch(`${base}/${resource}`, {
		method: request.method,
		headers: {
			'content-type': 'application/json'
		},
		body: data && JSON.stringify(data)
	});

	// if the request came from a <form> submission, the browser's default
	// behaviour is to show the URL corresponding to the form's "action"
	// attribute. in those cases, we want to redirect them back to the
	// /todos page, rather than showing the response
	if (res.ok && request.method !== 'GET' && request.headers.accept !== 'application/json') {
		return {
			status: 303,
			headers: {
				location: '/todos'
			}
		};
	}

	return {
		status: res.status,
		body: await res.json()
	};
}
