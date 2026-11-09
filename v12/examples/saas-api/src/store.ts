/**
 * The app's data, in memory, and the layer that serves it to procedures and
 * to the two extensions. A real app would put a database client here.
 */
import { randomUUID } from 'node:crypto';
import { Context, Effect, Layer } from 'effect';
import { AuditLog, type AuditEntry } from './audit.ts';
import { Directory, type Role, type User } from './tenancy.ts';

export type Plan = 'free' | 'pro';
export const projectLimits: Record<Plan, number> = { free: 1, pro: 100 };

export interface Tenant {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly plan: Plan;
}

export interface Project {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly createdAt: Date;
}

export interface Task {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  done: boolean;
  readonly createdAt: Date;
}

interface Member {
  readonly userId: string;
  readonly tenantId: string;
  role: Role;
}

type Account = User & { readonly email: string };

export class SaasDb {
  readonly users = new Map<string, Account>();
  readonly tenants = new Map<string, Tenant>();
  readonly members: Member[] = [];
  readonly sessions = new Map<string, string>();
  readonly projects = new Map<string, Project>();
  readonly tasks = new Map<string, Task>();
  readonly audit: AuditEntry[] = [];
  /** Counts session lookups, so tests can see `withSession` run once. */
  sessionLookups = 0;
  /** Bumped on every write to a tenant's data; part of cache keys. */
  readonly versions = new Map<string, number>();
  private seq = 0;

  /**
   * Two tenants: Acme on the pro plan, Globex on the free plan with its one
   * project. Ada is an admin of both, Bob a member and Cy a viewer of Acme.
   */
  static seeded(): SaasDb {
    const db = new SaasDb();
    const acme = db.addTenant('acme', 'Acme Corp', 'pro');
    const globex = db.addTenant('globex', 'Globex', 'free');
    const ada = db.addUser('ada@acme.test', 'Ada');
    const bob = db.addUser('bob@acme.test', 'Bob');
    const cy = db.addUser('cy@acme.test', 'Cy');
    db.members.push(
      { userId: ada.id, tenantId: acme.id, role: 'admin' },
      { userId: bob.id, tenantId: acme.id, role: 'member' },
      { userId: cy.id, tenantId: acme.id, role: 'viewer' },
      { userId: ada.id, tenantId: globex.id, role: 'admin' },
    );
    db.createProject(acme.id, 'Website');
    db.createProject(globex.id, 'Launch');
    return db;
  }

  private nextId(prefix: string) {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  private touch(tenantId: string) {
    this.versions.set(tenantId, this.version(tenantId) + 1);
  }

  addTenant(slug: string, name: string, plan: Plan): Tenant {
    const tenant: Tenant = { id: this.nextId('ten'), slug, name, plan };
    this.tenants.set(tenant.id, tenant);
    return tenant;
  }

  addUser(email: string, name: string): User {
    const user: Account = { id: this.nextId('usr'), name, email };
    this.users.set(user.id, user);
    return { id: user.id, name };
  }

  tenant(id: string): Tenant {
    const tenant = this.tenants.get(id);
    if (!tenant) throw new Error(`no tenant ${id}`);
    return tenant;
  }

  version(tenantId: string): number {
    return this.versions.get(tenantId) ?? 0;
  }

  login(email: string) {
    const user = [...this.users.values()].find((u) => u.email === email);
    if (!user) return undefined;
    const token = randomUUID();
    this.sessions.set(token, user.id);
    const tenants = this.members
      .filter((m) => m.userId === user.id)
      .map((m) => this.tenant(m.tenantId).slug);
    return { token, user: { id: user.id, name: user.name }, tenants };
  }

  membersOf(tenantId: string) {
    return this.members
      .filter((m) => m.tenantId === tenantId)
      .map((m) => ({ user: this.users.get(m.userId)!.name, role: m.role }));
  }

  setRole(tenantId: string, userId: string, role: Role) {
    const member = this.members.find(
      (m) => m.tenantId === tenantId && m.userId === userId,
    );
    if (member) member.role = role;
    return member;
  }

  projectsOf(tenantId: string): Project[] {
    return [...this.projects.values()].filter((p) => p.tenantId === tenantId);
  }

  project(tenantId: string, id: string): Project | undefined {
    const project = this.projects.get(id);
    return project?.tenantId === tenantId ? project : undefined;
  }

  createProject(tenantId: string, name: string): Project {
    const project: Project = {
      id: this.nextId('prj'),
      tenantId,
      name,
      createdAt: new Date(),
    };
    this.projects.set(project.id, project);
    this.touch(tenantId);
    return project;
  }

  tasksOf(projectId: string): Task[] {
    return [...this.tasks.values()].filter((t) => t.projectId === projectId);
  }

  addTask(project: Project, title: string): Task {
    const task: Task = {
      id: this.nextId('tsk'),
      projectId: project.id,
      title,
      done: false,
      createdAt: new Date(),
    };
    this.tasks.set(task.id, task);
    this.touch(project.tenantId);
    return task;
  }

  completeTask(tenantId: string, taskId: string): Task | undefined {
    const task = this.tasks.get(taskId);
    if (!task || !this.project(tenantId, task.projectId)) return undefined;
    task.done = true;
    this.touch(tenantId);
    return task;
  }
}

export class Store extends Context.Service<Store, SaasDb>()('saas/Store') {}

/** Cached query results, keyed by tenant data version (see `cachedQuery`). */
export class ResponseCache extends Context.Service<
  ResponseCache,
  Map<string, unknown>
>()('saas/ResponseCache') {}

/** Everything the router needs: the store, and what the extensions use. */
export const appLayer = (db: SaasDb) =>
  Layer.mergeAll(
    Layer.succeed(Store, db),
    Layer.sync(ResponseCache, () => new Map()),
    Layer.succeed(Directory, {
      userForSession: (token) =>
        Effect.sync(() => {
          db.sessionLookups += 1;
          const user = db.users.get(db.sessions.get(token) ?? '');
          return user && { id: user.id, name: user.name };
        }),
      membership: (userId, slug) =>
        Effect.sync(() => {
          const tenant = [...db.tenants.values()].find((t) => t.slug === slug);
          const member = db.members.find(
            (m) => m.userId === userId && m.tenantId === tenant?.id,
          );
          return member && { tenantId: member.tenantId, role: member.role };
        }),
    }),
    Layer.succeed(AuditLog, {
      record: (entry) => Effect.sync(() => void db.audit.push(entry)),
    }),
  );
