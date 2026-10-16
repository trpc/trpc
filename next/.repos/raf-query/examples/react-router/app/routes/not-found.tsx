import { data } from "react-router";

import { NotFound } from "~/components/not-found.tsx";

export function loader() {
	return data(null, { status: 404 });
}

export default NotFound;
