import "dotenv/config";

export const config = {
  port: parseInt(process.env.API_PORT ?? "3001", 10),
  database: {
    host: process.env.DB_HOST ?? "localhost",
    port: parseInt(process.env.DB_PORT ?? "5432", 10),
    database: process.env.DB_NAME ?? "argus",
    user: process.env.DB_USER ?? "argus",
    password: process.env.DB_PASSWORD ?? "argus_dev",
  },
} as const;
