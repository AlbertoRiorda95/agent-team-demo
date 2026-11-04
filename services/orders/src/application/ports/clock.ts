/** Port: the current time. Tests pass a controllable one. */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();
