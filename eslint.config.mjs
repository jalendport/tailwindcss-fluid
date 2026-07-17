import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: [
			'**/dist/**',
			'**/node_modules/**',
			'playground/**/*.js',
			'playground/**/*.d.ts',
			// Throwaway browser/LSP verification scripts (node + injected browser globals).
			'playground/scripts/**',
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'@typescript-eslint/consistent-type-imports': 'error',
			// Tailwind's PluginAPI methods are context-free; destructuring them
			// (the idiomatic plugin style) is safe.
			'@typescript-eslint/unbound-method': 'off',
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
				},
			],
		},
	},
	{
		files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
		extends: [tseslint.configs.disableTypeChecked],
	},
);
