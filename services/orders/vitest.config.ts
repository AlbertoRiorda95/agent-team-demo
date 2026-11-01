import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // the database tests share one database: run the files one after another
    fileParallelism: false,
  },
});
