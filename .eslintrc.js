module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'prettier'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  env: {
    node: true,
    es2022: true,
    jest: true
  },
  rules: {
    // 일반 규칙
    'no-console': 'warn',
    'prefer-const': 'error',
    'no-var': 'error',
    'no-undef': 'off',
    'no-unused-vars': ['error', {
      'argsIgnorePattern': '^_',
      'varsIgnorePattern': '^_',
      'ignoreRestSiblings': true
    }],

    // Prettier 통합
    'prettier/prettier': 'error'
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.js']
};