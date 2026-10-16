import { eslintCompatPlugin } from "@oxlint/plugins";

import { noInstanceofRule } from "./rules/no-instanceof.ts";
import { requireUseEffectArgumentsRule } from "./rules/require-use-effect-arguments.ts";

/** Vendored from https://github.com/nkzw-tech/eslint-plugin — see README.md for sync steps. */
const nkzwPlugin = eslintCompatPlugin({
	meta: { name: "nkzw" },
	rules: {
		"no-instanceof": noInstanceofRule,
		"require-use-effect-arguments": requireUseEffectArgumentsRule,
	},
});

export default nkzwPlugin;
