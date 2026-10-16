export async function handler(_request: Request): Promise<Response> {
	// Sample API: a real app routes the request and reads its session cookie.
	return Response.json({ id: 1, title: "" });
}
