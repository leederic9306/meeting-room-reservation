/* eslint-env node */
/**
 * 모노레포용 lint-staged 설정.
 *
 * - ESLint는 각 워크스페이스에 설치된 버전/플러그인을 사용해야 하므로
 *   `pnpm --filter <pkg> exec eslint`로 디스패치한다.
 * - Prettier는 루트에 단일 설치되어 있으므로 루트에서 일괄 실행한다.
 * - lint-staged가 전달하는 절대경로를 워크스페이스 상대경로로 변환해
 *   ESLint가 해당 워크스페이스의 .eslintrc 를 정확히 해석하도록 한다.
 */
const path = require('node:path');

const ESLINT_EXT = /\.(ts|tsx|js|jsx|cjs|mjs)$/i;
const PRETTIER_EXT = /\.(ts|tsx|js|jsx|cjs|mjs|json|md|mdx|yml|yaml|css|scss|html)$/i;

const WORKSPACES = [
  { prefix: 'apps/backend/', filter: '@meeting-room/backend' },
  { prefix: 'apps/frontend/', filter: '@meeting-room/frontend' },
  { prefix: 'packages/shared-types/', filter: '@meeting-room/shared-types' },
  { prefix: 'packages/config/', filter: '@meeting-room/config' },
];

const toPosixRelative = (absPath) =>
  path.relative(process.cwd(), absPath).split(path.sep).join('/');

const quote = (s) => `"${s}"`;

module.exports = (absoluteFiles) => {
  const files = absoluteFiles.map(toPosixRelative);
  const tasks = [];

  for (const { prefix, filter } of WORKSPACES) {
    const wsFiles = files
      .filter((f) => f.startsWith(prefix) && ESLINT_EXT.test(f))
      .map((f) => f.slice(prefix.length));
    if (wsFiles.length === 0) continue;
    tasks.push(
      `corepack pnpm --filter ${filter} exec eslint --fix ${wsFiles.map(quote).join(' ')}`,
    );
  }

  const prettierFiles = files.filter((f) => PRETTIER_EXT.test(f));
  if (prettierFiles.length > 0) {
    tasks.push(`prettier --write --ignore-unknown ${prettierFiles.map(quote).join(' ')}`);
  }

  return tasks;
};
