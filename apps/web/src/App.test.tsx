import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { App } from './App';

test('shows the API ok state when /health answers 200', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }))),
  );
  render(<App />);
  expect(await screen.findByText('Orders — API ok')).toBeTruthy();
});

test('shows the error state with Retry when /health fails', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('down'))),
  );
  render(<App />);
  expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy();
});
