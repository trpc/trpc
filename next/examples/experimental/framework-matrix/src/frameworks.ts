export const frameworks = ['vue', 'solid', 'svelte'] as const;
export type Framework = (typeof frameworks)[number];
