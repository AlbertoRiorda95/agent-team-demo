/** `next` is accepted only as a path of this site starting with a single `/`. */
export function safeNext(next: string | null | undefined): string {
  if (!next?.startsWith('/')) return '/';
  if (next.startsWith('//') || next.startsWith('/\\')) return '/';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(next)) return '/';
  return next;
}
