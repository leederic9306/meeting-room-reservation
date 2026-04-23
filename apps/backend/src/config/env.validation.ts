import { z } from 'zod';

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true' || v === '1'));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET은 최소 16자 이상이어야 합니다'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET은 최소 16자 이상이어야 합니다'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('14d'),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  MAIL_HOST: z.string().default('localhost'),
  MAIL_PORT: z.coerce.number().int().positive().default(1025),
  MAIL_USER: z.string().optional(),
  MAIL_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().email(),
  MAIL_FROM_NAME: z.string().default('회의실 예약 시스템'),

  EMAIL_CODE_HASH_ENABLED: boolFromString.default(false),
  EMAIL_CODE_LENGTH: z.coerce.number().int().min(4).max(10).default(6),
  EMAIL_CODE_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  EMAIL_CODE_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  EMAIL_CODE_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().nonnegative().default(60),

  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(30),
  PASSWORD_RESET_TTL_HOURS: z.coerce.number().int().positive().default(1),
  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).default(8),

  ARGON2_MEMORY_COST: z.coerce.number().int().positive().default(19456),
  ARGON2_TIME_COST: z.coerce.number().int().positive().default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().positive().default(1),

  BOOKING_MAX_DURATION_MINUTES: z.coerce.number().int().positive().default(240),
  BOOKING_TIME_UNIT_MINUTES: z.coerce.number().int().positive().default(15),
  RECURRENCE_MAX_RANGE_DAYS: z.coerce.number().int().positive().default(365),
  ROOM_MAX_COUNT: z.coerce.number().int().positive().default(10),
  CALENDAR_MAX_RANGE_DAYS: z.coerce.number().int().positive().default(31),

  RATE_LIMIT_GLOBAL_PER_MINUTE: z.coerce.number().int().positive().default(500),
  RATE_LIMIT_LOGIN_PER_MINUTE: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_SIGNUP_PER_MINUTE: z.coerce.number().int().positive().default(5),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('\n');
    throw new Error(`환경변수 검증 실패:\n${issues}`);
  }
  return result.data;
}
