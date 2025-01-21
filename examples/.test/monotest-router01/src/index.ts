import { z } from 'zod'

import { publicProcedure, router } from '@monotest/trpc'

// Recursive nightmare types
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
type DeepNestedType = { [K: string]: DeepNestedType | unknown }
const DeepRecursiveSchema: z.ZodType<DeepNestedType> = z.lazy(() =>
  z.record(z.union([DeepRecursiveSchema, z.unknown()])),
)

const InfiniteTreeSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    value: z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.lazy(() => InfiniteTreeSchema),
    ]),
    left: z.lazy(() => InfiniteTreeSchema).optional(),
    right: z.lazy(() => InfiniteTreeSchema).optional(),
    metadata: z.record(z.lazy(() => InfiniteTreeSchema)),
  }),
)

// Complex type utilities
const createPolymorphicSchema = <T extends z.ZodTypeAny>(baseSchema: T) =>
  z.union([
    baseSchema,
    z.array(baseSchema),
    z.record(baseSchema),
    z.function().args(baseSchema).returns(z.promise(baseSchema)),
  ])

const createNestedDiscriminatedUnion = (depth: number): z.ZodType<any> => {
  if (depth <= 0) return z.string()
  return z.discriminatedUnion('type', [
    z.object({
      type: z.literal('LEAF'),
      value: z.string(),
    }),
    z.object({
      type: z.literal('NODE'),
      children: z.array(
        z.lazy(() => createNestedDiscriminatedUnion(depth - 1)),
      ),
    }),
  ])
}

export const router01 = router({
  foo: publicProcedure.query(() => 'bar' as const),
  quantum: {
    superposition: {
      entangle: publicProcedure
        .input(
          z.intersection(
            DeepRecursiveSchema,
            z.object({
              quantumState: createPolymorphicSchema(
                z.union([InfiniteTreeSchema, DeepRecursiveSchema]),
              ),
              waveFunctionCollapse: z
                .function()
                .args(z.unknown(), z.unknown(), z.unknown())
                .returns(z.promise(DeepRecursiveSchema)),
            }),
          ),
        )
        .mutation(() => `Quantum entanglement achieved`),

      schrodingerQuery: publicProcedure
        .input(createNestedDiscriminatedUnion(10))
        .query(() => `Cat's state observed`),
    },

    multiverse: {
      timelineParadox: {
        resolveParadox: publicProcedure
          .input(
            z.object({
              timeline: z.array(
                z.lazy(() =>
                  z.intersection(
                    InfiniteTreeSchema,
                    z.object({
                      paradoxes: z.record(z.lazy(() => DeepRecursiveSchema)),
                      quantumFluctuations: z.array(
                        createPolymorphicSchema(
                          z.lazy(() => InfiniteTreeSchema),
                        ),
                      ),
                      temporalAnomalies: z.record(
                        z.lazy(() =>
                          z.union([
                            z.string(),
                            z.number(),
                            z.array(z.lazy(() => DeepRecursiveSchema)),
                            z
                              .function()
                              .args(
                                z.lazy(() => InfiniteTreeSchema),
                                z.lazy(() => DeepRecursiveSchema),
                              )
                              .returns(z.promise(z.unknown())),
                          ]),
                        ),
                      ),
                    }),
                  ),
                ),
              ),
              dimensionalRift: z.object({
                severity: z.enum([
                  'CATASTROPHIC',
                  'APOCALYPTIC',
                  'REALITY_ENDING',
                ]),
                containmentProcedures: z.array(
                  z
                    .function()
                    .args(DeepRecursiveSchema)
                    .returns(z.promise(InfiniteTreeSchema)),
                ),
                backupRealities: z.record(
                  z.lazy(() =>
                    createPolymorphicSchema(createNestedDiscriminatedUnion(5)),
                  ),
                ),
              }),
            }),
          )
          .mutation(() => `Timeline paradox contained`),
      },

      infiniteRecursion: {
        recurse: publicProcedure
          .input(
            z.lazy(() =>
              z.object({
                depth: z.number(),
                data: z.lazy(() =>
                  z.intersection(
                    DeepRecursiveSchema,
                    z.object({
                      recursiveField: z.lazy(() =>
                        createPolymorphicSchema(
                          z.lazy(() => InfiniteTreeSchema),
                        ),
                      ),
                    }),
                  ),
                ),
                callback: z
                  .function()
                  .args(
                    z.lazy(() => DeepRecursiveSchema),
                    z.lazy(() => InfiniteTreeSchema),
                  )
                  .returns(
                    z.promise(
                      z.lazy(() =>
                        createPolymorphicSchema(
                          createNestedDiscriminatedUnion(10),
                        ),
                      ),
                    ),
                  ),
              }),
            ),
          )
          .query(({ input }) => `Recursion depth: ${input.depth}`),
      },
    },
  },

  hyperComplex: {
    fractalDimension: {
      computeMandelbrot: publicProcedure
        .input(
          z.object({
            iterations: z.number(),
            dimensions: z.array(
              z.object({
                scale: z.number(),
                rotation: z.tuple([
                  z.number(),
                  z.number(),
                  z.number(),
                  z.number(),
                  z.number(),
                ]),
                transformations: z.array(
                  z
                    .function()
                    .args(
                      z.tuple([z.number(), z.number(), z.number(), z.number()]),
                    )
                    .returns(
                      z.promise(
                        z.array(
                          createPolymorphicSchema(
                            z.lazy(() => DeepRecursiveSchema),
                          ),
                        ),
                      ),
                    ),
                ),
              }),
            ),
            complexMapping: z.record(
              z.lazy(() =>
                z.intersection(
                  InfiniteTreeSchema,
                  createNestedDiscriminatedUnion(7),
                ),
              ),
            ),
          }),
        )
        .query(
          ({ input }) => `Fractal computed at ${input.iterations} iterations`,
        ),
    },
  },
})
