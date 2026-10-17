import { queryOptions } from "@raf-query/react";

interface Invoice {
	readonly id: string;
	readonly total: number;
}

declare const flags: { readonly billing: boolean };

declare function listInvoices(orgId: string): Promise<ReadonlyArray<Invoice>>;

// #region disabling-a-query
export function invoicesQuery(input: { orgId: string }) {
	return queryOptions({
		queryKey: ["invoices", input.orgId],
		queryFn: () => listInvoices(input.orgId),
		enabled: flags.billing,
	});
}
// #endregion
