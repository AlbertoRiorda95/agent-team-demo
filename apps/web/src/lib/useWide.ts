import { useEffect, useState } from 'react';

/** True from the `--bp-md` token width up (tables); below it the stacked layouts are shown. */
export function useWide(): boolean {
  const query = () => {
    const bp = getComputedStyle(document.documentElement).getPropertyValue('--bp-md').trim();
    return `(min-width: ${bp || '768px'})`;
  };
  const get = () => (typeof matchMedia === 'function' ? matchMedia(query()).matches : true);
  const [wide, setWide] = useState(get);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(query());
    const on = () => {
      setWide(mq.matches);
    };
    on();
    mq.addEventListener('change', on);
    return () => {
      mq.removeEventListener('change', on);
    };
  }, []);
  return wide;
}
