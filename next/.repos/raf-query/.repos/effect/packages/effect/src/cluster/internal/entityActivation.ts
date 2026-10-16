import * as Context from "../../Context.ts"
import type * as Scope from "../../Scope.ts"

/** The entity lifetime, shared by all handler rebuilds within an activation. @internal */
export class CurrentActivationScope extends Context.Service<CurrentActivationScope, Scope.Scope>()(
  "effect/cluster/internal/CurrentActivationScope"
) {}
