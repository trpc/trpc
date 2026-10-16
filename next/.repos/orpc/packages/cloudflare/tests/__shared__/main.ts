import { experimental_DurableLockObject as DurableLockObject } from '../../src/lock-object'
import { DurablePublisherObject } from '../../src/publisher-object'

export class PublisherDO extends DurablePublisherObject {
}

export class PublisherResume3sDO extends DurablePublisherObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env, {
      resume: {
        enabled: true,
        seconds: 3,
        cleanupIntervalSeconds: 30,
        schemaPrefix: 'prefix:',
      },
    })
  }
}

export class LockDO extends DurableLockObject {
}
