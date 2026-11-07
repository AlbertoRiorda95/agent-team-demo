import type { ButtonHTMLAttributes } from 'react';

/** A button; `danger` for destructive actions, `busy` while its request runs. */
export function Button({
  variant = 'primary',
  busy = false,
  disabled,
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
  busy?: boolean;
}) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={[`btn-${variant}`, className].filter(Boolean).join(' ')}
    />
  );
}
