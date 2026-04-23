/* eslint-env node */
/**
 * NestJS 백엔드용 ESLint 설정 — 베이스 규칙을 상속하고 DI / 테스트 환경에 맞춰 완화.
 */
module.exports = {
  extends: [require.resolve('./eslint-config-base.cjs')],
  env: {
    node: true,
    jest: true,
    es2022: true,
  },
  rules: {
    // NestJS 의존성 주입에서 빈 constructor 허용
    '@typescript-eslint/no-empty-function': ['warn', { allow: ['constructors'] }],
    // static-only provider/util class 허용
    '@typescript-eslint/no-extraneous-class': 'off',
    // DTO/Entity에서 생성자 없이 필드만 있는 경우 허용
    '@typescript-eslint/no-inferrable-types': 'off',
  },
  overrides: [
    {
      files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/unbound-method': 'off',
      },
    },
  ],
};
