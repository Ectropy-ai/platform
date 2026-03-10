import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .optional()
    .default('development'),
  PORT: z.coerce.number().optional().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().optional(),
});

const env = EnvSchema.parse(process.env);

export type Env = z.infer<typeof EnvSchema>;
export { EnvSchema };
export default env;
