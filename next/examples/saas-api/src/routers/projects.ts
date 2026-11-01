import { Effect, Schema } from 'effect';
import { HttpServerResponse } from 'effect/http';
import { error, middleware, Response, TrpcError } from '@trpc12/trpc/server';
import { z } from 'zod';
import { projectLimits, Store, type Plan } from '../store.ts';
import { cachedQuery, memberProcedure, t, tenantProcedure } from '../trpc.ts';

export class QuotaExceeded extends TrpcError.Tagged('QUOTA_EXCEEDED', {
  status: 402,
  data: Schema.Struct({
    plan: Schema.Literals(['free', 'pro']),
    limit: Schema.Number,
  }),
}) {}

/** Dates leave the server as ISO strings: the transform runs on output. */
export const ProjectOutput = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.date().transform((d) => d.toISOString()),
});

/** Replaces `{ projectId }` with the tenant's project, or fails with NOT_FOUND. */
const loadProject = middleware.effect<{
  ctx: { tenantId: string };
  input: { projectId: string };
}>()((opts) =>
  Effect.gen(function* () {
    const projectId = opts.input.projectId;
    const project = (yield* Store).project(opts.ctx.tenantId, projectId);
    if (!project)
      return yield* error({ code: 'NOT_FOUND', data: { projectId } });
    return yield* opts.next({ input: { project } });
  }),
);

export const projectProcedure = tenantProcedure
  .input(z.object({ projectId: z.string() }))
  .use(loadProject);

const ProjectStats = z.object({
  tasks: z.number(),
  done: z.number(),
});

export const projectsRouter = t.router({
  project: {
    list: tenantProcedure.output(z.array(ProjectOutput)).query((opts) =>
      Effect.gen(function* () {
        yield* Response.setHeader('cache-control', 'private, max-age=5');
        return (yield* Store).projectsOf(opts.ctx.tenantId);
      }),
    ),
    byId: projectProcedure
      .output(ProjectOutput)
      .query((opts) => opts.input.project),
    create: memberProcedure
      .input(z.object({ name: z.string().trim().min(1).max(60) }))
      .output(ProjectOutput)
      .mutation((opts) =>
        Effect.gen(function* () {
          const db = yield* Store;
          const plan: Plan = db.tenant(opts.ctx.tenantId).plan;
          const limit = projectLimits[plan];
          if (db.projectsOf(opts.ctx.tenantId).length >= limit) {
            return yield* new QuotaExceeded({ plan, limit });
          }
          opts.response.status = 201;
          return db.createProject(opts.ctx.tenantId, opts.input.name);
        }),
      ),
    stats: projectProcedure
      .meta({ cache: true })
      .use(cachedQuery<z.infer<typeof ProjectStats>>())
      .output(ProjectStats)
      .query((opts) =>
        Effect.gen(function* () {
          const tasks = (yield* Store).tasksOf(opts.input.project.id);
          return {
            tasks: tasks.length,
            done: tasks.filter((task) => task.done).length,
          };
        }),
      ),
    /** A download: the procedure's own response, sent as is. */
    exportCsv: projectProcedure.query((opts) =>
      Effect.gen(function* () {
        const project = opts.input.project;
        const rows = (yield* Store)
          .tasksOf(project.id)
          .map(
            (task) => `${task.id},${JSON.stringify(task.title)},${task.done}`,
          );
        return HttpServerResponse.text(['id,title,done', ...rows].join('\n'), {
          contentType: 'text/csv',
          headers: {
            'content-disposition': `attachment; filename="${project.id}.csv"`,
          },
        });
      }),
    ),
  },
});
