import { z } from 'zod';
declare const r1: z.ZodObject<
  {
    limit: z.ZodNumber;
  },
  z.core.$strip
>;
declare const r2: z.ZodObject<
  {
    limit: z.ZodNumber;
  },
  z.core.$strip
>;
type I1 = NonNullable<(typeof r1)['~standard']['types']>['input'];
type I2 = NonNullable<(typeof r2)['~standard']['types']>['input'];
export declare const x: [I1, I2];
declare const u: z.ZodObject<
  {
    limit: z.ZodNumber;
  },
  z.core.$strip
>;
export declare const y: typeof u;
export {};
