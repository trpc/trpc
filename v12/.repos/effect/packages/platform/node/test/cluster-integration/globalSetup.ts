import { MySqlContainer } from "@testcontainers/mysql"
import { PostgreSqlContainer } from "@testcontainers/postgresql"
import type { TestProject } from "vitest/node"

export interface ClusterDatabases {
  readonly mysql: string
  readonly pg: string
}

declare module "vitest" {
  export interface ProvidedContext {
    readonly clusterDatabases: ClusterDatabases
  }
}

const makeMysqlContainer = () =>
  new MySqlContainer("mysql:lts").withHealthCheck({
    test: [
      "CMD-SHELL",
      "MYSQL_PWD=\"$MYSQL_ROOT_PASSWORD\" mysqladmin ping --protocol TCP --host 127.0.0.1 --user root --silent"
    ],
    interval: 250,
    timeout: 1000,
    retries: 1000
  })

export default function setup(project: TestProject) {
  return Promise.all([
    new PostgreSqlContainer("postgres:alpine").start(),
    makeMysqlContainer().start()
  ]).then(([pg, mysql]) => {
    project.provide("clusterDatabases", {
      mysql: mysql.getConnectionUri(),
      pg: pg.getConnectionUri()
    })
    return () => Promise.all([pg.stop(), mysql.stop()]).then(() => undefined)
  })
}
