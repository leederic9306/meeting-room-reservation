/* eslint-env node */
module.exports = {
  root: true,
  extends: [require.resolve('@meeting-room/config/eslint-config-base')],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: './tsconfig.json',
  },
  ignorePatterns: ['dist/', 'node_modules/', '.eslintrc.cjs', 'tsup.config.ts'],
};
