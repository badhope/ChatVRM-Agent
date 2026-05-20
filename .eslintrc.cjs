module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    'no-console': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-useless-escape': 'warn', // 降低严重程度，避免误报
    'no-misleading-character-class': 'warn',
    'no-control-regex': 'warn',
    '@typescript-eslint/ban-ts-comment': 'warn',
  },
  ignorePatterns: ['dist/', 'node_modules/', 'coverage/', '**/*.js', 'sdk/', 'web/', 'vscode/', '.devflow/', '.skills/', 'scripts/', '**/*.test.ts'],
};
