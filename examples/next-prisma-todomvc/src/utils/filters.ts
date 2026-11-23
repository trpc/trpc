/** The routes `/all`, `/active` and `/completed` */
export const filters = ['all', 'active', 'completed'] as const;
export type Filter = (typeof filters)[number];
