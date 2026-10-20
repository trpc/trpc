/** The chat's rooms, for the server's input and the app's links. */
export const rooms = ['general', 'random'] as const;

export type Room = (typeof rooms)[number];
