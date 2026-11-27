import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: "postgresql://postgres.lewfrrzbhwpsuuhtdow:admin777758043@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres",
  },
});
