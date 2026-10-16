import { queryOptions } from "@raf-query/react";

declare const input: { region: string };

declare function getRegionShapes(input: {
	readonly region: string;
}): Promise<unknown>;

// #region structural-sharing
queryOptions({
	queryKey: ["geojson", input.region],
	queryFn: () => getRegionShapes(input),
	structuralSharing: false,
});
// #endregion
