export default [
  {
    files: ['src/**/*.js', 'scripts/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: 'readonly', document: 'readonly', console: 'readonly', localStorage: 'readonly',
        sessionStorage: 'readonly', fetch: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
        React: 'readonly', ReactDOM: 'readonly', supabase: 'readonly', crypto: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
        CustomEvent: 'readonly', Event: 'readonly', AbortController: 'readonly', FormData: 'readonly',
        Intl: 'readonly', Date: 'readonly', Math: 'readonly', JSON: 'readonly', Object: 'readonly',
        Array: 'readonly', String: 'readonly', Number: 'readonly', Boolean: 'readonly', Map: 'readonly', Set: 'readonly'
      }
    },
    rules: {
      'no-unreachable': 'error',
      'no-constant-binary-expression': 'error',
      'valid-typeof': 'error',
      'no-dupe-keys': 'error'
    }
  }
];
