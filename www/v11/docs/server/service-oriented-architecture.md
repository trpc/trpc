---
id: service-oriented-architecture
title: Service-Oriented Architecture
sidebar_label: Service-Oriented Architecture
slug: /server/service-oriented-architecture
section: "Backend Usage"
order: 28.5
skill:
  name: service-oriented-architecture
  package: "@trpc/server"
  type: composition
  requires:
    - server-setup
    - client-setup
    - links
  description: Break a tRPC backend into multiple services with custom routing
    links that split on the first path segment (op.path.split('.')) to route to
    different backend service URLs. Define a faux gateway router that merges
    service routers for the AppRouter type without running them in the same
    process. Share procedure and router definitions via a server-lib package
    with a single initTRPC instance. Each service runs its own
    standalone/Express/Fastify server.
---

TODO
