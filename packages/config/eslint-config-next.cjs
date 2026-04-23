/* eslint-env node */
/**
 * Next.js 14 App Router 프런트엔드용 ESLint 설정.
 * next/core-web-vitals + next/typescript 를 상속하며, 소비자는 eslint-config-next 를
 * devDependencies 에 포함해야 합니다.
 */
module.exports = {
  extends: [
    require.resolve('./eslint-config-base.cjs'),
    'next/core-web-vitals',
    'next/typescript',
  ],
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  rules: {
    // App Router 서버 컴포넌트는 displayName 불필요
    'react/display-name': 'off',
    // shadcn/ui 컴포넌트가 ref 전달 시 발생하는 경고 방지
    'react/prop-types': 'off',
    // import ordering은 베이스 규칙 사용
  },
};
