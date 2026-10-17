import { useQuery } from "@tanstack/react-query";

declare function NotificationsToggle(props: {
	readonly permission: PermissionState | undefined;
}): React.ReactNode;

// #region tanstack
function NotificationsSetting() {
	const { data } = useQuery({
		queryKey: ["permission", "notifications"],
		queryFn: async () => {
			const status = await navigator.permissions.query({
				name: "notifications",
			});
			return status.state;
		},
		// Only the browser has `navigator.permissions`.
		enabled: typeof window !== "undefined",
	});
	return <NotificationsToggle permission={data} />;
}
// #endregion
