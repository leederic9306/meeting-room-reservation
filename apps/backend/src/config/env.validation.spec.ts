import { validateEnv } from './env.validation';

const baseEnv: Record<string, string> = {
  DATABASE_URL: 'postgresql://user:pw@localhost:5432/db',
  JWT_ACCESS_SECRET: '0123456789abcdef_access',
  JWT_REFRESH_SECRET: '0123456789abcdef_refresh',
  MAIL_FROM: 'noreply@meetingroom.local',
};

describe('validateEnv', () => {
  it('필수 값만 있으면 기본값을 채워 검증 통과', () => {
    const env = validateEnv({ ...baseEnv });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3001);
    expect(env.EMAIL_CODE_HASH_ENABLED).toBe(false);
    expect(env.BOOKING_TIME_UNIT_MINUTES).toBe(15);
  });

  it('JWT 시크릿이 16자 미만이면 실패', () => {
    expect(() =>
      validateEnv({ ...baseEnv, JWT_ACCESS_SECRET: 'short' }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('DATABASE_URL 누락 시 실패', () => {
    const { DATABASE_URL: _omit, ...rest } = baseEnv;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('EMAIL_CODE_HASH_ENABLED="true" 문자열을 boolean true로 변환', () => {
    const env = validateEnv({ ...baseEnv, EMAIL_CODE_HASH_ENABLED: 'true' });
    expect(env.EMAIL_CODE_HASH_ENABLED).toBe(true);
  });

  it('PORT 숫자 문자열을 number로 변환', () => {
    const env = validateEnv({ ...baseEnv, PORT: '4000' });
    expect(env.PORT).toBe(4000);
  });
});
