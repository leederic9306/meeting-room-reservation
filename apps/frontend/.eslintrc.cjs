/* eslint-env node */
module.exports = {
  root: true,
  extends: [require.resolve('@meeting-room/config/eslint-config-next')],
  ignorePatterns: ['.next/', 'node_modules/', 'dist/', 'coverage/'],
};
