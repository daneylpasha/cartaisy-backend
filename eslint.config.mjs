import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';

/**
 * ESLint 9 flat config.
 *
 * This is a port of the previous `.eslintrc.js`, not a new rule set. The rule
 * intent it encodes was deliberate and is preserved exactly: TypeScript
 * strictness rules stay off, general hygiene rules stay as errors or warnings.
 * `tsconfig.json` makes the same choice at the compiler level (`strict: false`,
 * `noImplicitAny: false`, `strictNullChecks: false`), so loosening lint to match
 * was a project-wide decision rather than an oversight. Raising the strictness
 * level is a separate call, not something this migration makes quietly.
 *
 * Two things were broken in the old config, which is why it almost certainly
 * never enforced anything:
 *
 *   1. `extends: ['eslint:recommended', '@typescript-eslint/recommended']` was
 *      missing the `plugin:` prefix on the second entry. In flat config this
 *      stops being a string extend at all — the plugin's own flat config array
 *      is spread in directly below.
 *
 *   2. `parserOptions.project: './tsconfig.json'` turned on type-aware linting,
 *      but that tsconfig sets `"include": ["src/**\/*"]` and excludes
 *      `**\/*.test.ts`. Every file under `tests/` is therefore outside the
 *      program, and type-aware linting errors out on files it cannot find
 *      there. `project` is dropped here: every type-aware rule in this config
 *      is off, so it bought nothing, and dropping it makes linting fast and
 *      lets it cover `tests/` as well as `src/`.
 *
 * `globals` is deliberately not imported. It is not a direct dependency of
 * ESLint, so relying on it resolving through hoisting would be fragile — and it
 * is unnecessary, because the plugin's `eslint-recommended` layer turns off
 * `no-undef` for TypeScript files, where the compiler already covers it.
 */
const eslintConfig = [
  {
    ignores: [
      // Ported from the old `ignorePatterns`.
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '**/*.js',
      '**/*.d.ts',
      // The one deliberate addition. tsoa rewrites this on every
      // `npm run generate:routes`, so linting it would mean a suppression
      // baseline that churns whenever the spec changes, for output nobody
      // edits by hand. The dashboard ignores its generated Orval client for
      // the same reason.
      'src/generated/**',
      // ESLint's default traversal picks up `.cjs`, which `**/*.js` above does
      // not cover, and the plugin's base config carries no `files` restriction
      // so the TypeScript parser is applied to everything it visits. That means
      // the vendored 2.2 MB `.yarn/releases/yarn-3.5.1.cjs` gets fully parsed on
      // every run. No rule currently applies to `.cjs`, so it produces no
      // violations and never entered the suppression baseline — but it does
      // dominate the runtime, and it would start failing the moment any rule
      // did apply to `.cjs`.
      '.yarn/**',
    ],
  },

  // `eslint:recommended`, scoped to TypeScript — the old config ignored `*.js`,
  // so TypeScript was all it ever linted.
  { ...js.configs.recommended, files: ['**/*.ts'] },

  // Replaces the broken `@typescript-eslint/recommended` string extend. This
  // array is base + eslint-recommended + recommended, and already sets the
  // parser, so no manual parser wiring is needed.
  ...tsPlugin.configs['flat/recommended'],

  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': ['warn', {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
      }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',

      // General ESLint rules
      'no-console': 'warn',
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-template': 'error',
      'no-duplicate-imports': 'error',
    },
  },
];

export default eslintConfig;
