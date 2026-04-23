/* eslint-env node */
module.exports = {
  root: true,
  extends: [require.resolve('@meeting-room/config/eslint-config-nest')],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: './tsconfig.json',
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'coverage/',
    '.eslintrc.cjs',
    'jest.config.ts',
  ],
};
