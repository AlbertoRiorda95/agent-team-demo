// drizzle-kit configuration: `npm run db:generate` writes a migration in
// migrations/ from the schema. Migrations are applied by `npm run db:migrate`
// (src/adapters/persistence/migrate.ts), which reads DATABASE_URL.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/adapters/persistence/schema.ts',
  out: './migrations',
});
