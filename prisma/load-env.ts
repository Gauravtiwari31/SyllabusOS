// Loaded first by tsx scripts: .env.local (local Docker DB) wins over .env, matching
// Next.js and prisma.config.ts. Must be the first import so it runs before lib/db.
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
