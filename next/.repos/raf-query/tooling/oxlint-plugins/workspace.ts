import { eslintCompatPlugin } from "@oxlint/plugins";

import { inferCallbackParams } from "./infer-callback-params.ts";
import { inlineJsxCallback } from "./inline-jsx-callback.ts";
import { noBannedReactReexport } from "./no-banned-react-reexport.ts";
import { noCustomTestTimeout } from "./no-custom-test-timeout.ts";
import { noManualMemoization } from "./no-manual-memoization.ts";
import { noMock } from "./no-mock.ts";
import { noOverzealousDestructuring } from "./no-overzealous-destructuring.ts";
import { noUseEffect } from "./no-use-effect.ts";
import { noUseMemberAccess } from "./no-use-member-access.ts";

const plugin = eslintCompatPlugin({
	meta: {
		name: "workspace",
	},
	rules: {
		"infer-callback-params": inferCallbackParams,
		"inline-jsx-callback": inlineJsxCallback,
		"no-banned-react-reexport": noBannedReactReexport,
		"no-custom-test-timeout": noCustomTestTimeout,
		"no-manual-memoization": noManualMemoization,
		"no-mock": noMock,
		"no-overzealous-destructuring": noOverzealousDestructuring,
		"no-use-effect": noUseEffect,
		"no-use-member-access": noUseMemberAccess,
	},
});

export default plugin;
