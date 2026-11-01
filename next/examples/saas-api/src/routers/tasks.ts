import { Effect } from 'effect';
import { z } from 'zod';
import { Store } from '../store.ts';
import { t, tenantProcedure } from '../trpc.ts';
import { projectProcedure } from './projects.ts';

const TaskOutput = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
  createdAt: z.date().transform((d) => d.toISOString()),
});

export const tasksRouter = t.router({
  task: {
    list: projectProcedure.output(z.array(TaskOutput)).query((opts) =>
      Effect.gen(function* () {
        return (yield* Store).tasksOf(opts.input.project.id);
      }),
    ),
    // A second `.input()` after the replaced one: the client sends
    // `{ projectId, title }`, the resolver gets `{ project, title }`.
    add: projectProcedure
      .meta({ role: 'member' })
      .input(z.object({ title: z.string().trim().min(1) }))
      .output(TaskOutput)
      .mutation((opts) =>
        Effect.gen(function* () {
          return (yield* Store).addTask(opts.input.project, opts.input.title);
        }),
      ),
    complete: tenantProcedure
      .meta({ role: 'member' })
      .errors({
        TASK_NOT_FOUND: { status: 404, data: z.object({ taskId: z.string() }) },
      })
      .input(z.object({ taskId: z.string() }))
      .output(TaskOutput)
      .mutation((opts) =>
        Effect.gen(function* () {
          const taskId = opts.input.taskId;
          const task = (yield* Store).completeTask(opts.ctx.tenantId, taskId);
          return (
            task ?? (yield* opts.errors.TASK_NOT_FOUND({ data: { taskId } }))
          );
        }),
      ),
  },
});
