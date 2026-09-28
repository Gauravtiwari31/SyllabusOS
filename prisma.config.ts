import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Same precedence as Next.js: .env.local (local overrides, e.g. the Docker DB) wins over .env.
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

// Prisma CLI config. Migrations use the direct (non-pooled) connection;
// the app itself connects through lib/db.ts with the pg driver adapter.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
