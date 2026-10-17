import type { ReactNode } from "react";
import { NavLink, useNavigation } from "react-router";

declare function Spinner(): ReactNode;

// #region pending-ui
function NavigationSpinner() {
	const navigation = useNavigation();
	return navigation.state === "loading" ? <Spinner /> : null;
}

<NavLink to="/posts/hello">
	{({ isPending }) => (isPending ? "Hello (loading…)" : "Hello")}
</NavLink>;
// #endregion pending-ui
