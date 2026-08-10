/*
 * @Author: zhengrenfu
 * @Date: 2026-07-31 00:00:00
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-31 00:00:00
 * @FilePath: eslint.config.js
 * @Description: ESLint 9 flat config 配置文件
 */

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import pluginPrettier from 'eslint-plugin-prettier/recommended'
import localPlugin from './.eslint-plugin-local/index.js'

export default tseslint.config(
  // 全局忽略
  {
    ignores: ['dist/**', 'dist-electron/**', 'node_modules/**'],
  },

  // 基础 JS 规则
  js.configs.recommended,

  // TypeScript 规则
  ...tseslint.configs.recommended,

  // Vue 规则（flat config 模式）
  ...pluginVue.configs['flat/essential'],

  // Prettier 集成（放在最后，关闭格式化冲突规则）
  pluginPrettier,

  // 本地插件
  {
    plugins: { local: localPlugin },
    rules: {
      'local/illegal-component-using': 'error',
      'local/illegal-modal-using': 'error',
      'local/illegal-header-annotation': 'error',
      'local/illegal-annotation': 'error',
      'local/no-image-in-views': 'error',
      'local/no-image-in-src': 'error',
      'local/use-design-variables': 'error',
      'local/required-script-setup': 'error',
      'local/no-unused-files': 'warn',
      'local/no-relative-imports': 'error',
    },
  },

  // Vue 文件覆盖
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/no-multiple-template-root': 'off',
      'vue/no-v-model-argument': 'off',
      'vue/no-v-for-template-key': 'off',
      'vue/no-unused-vars': 'warn',
      'vue/no-unused-components': 'warn',
      'vue/no-setup-props-destructure': 'off',
      'vue/custom-event-name-casing': 'off',
      'vue/attributes-order': 'off',
      'vue/one-component-per-file': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/attribute-hyphenation': 'off',
      'vue/require-default-prop': 'off',
    },
  },

  // 通用规则
  {
    rules: {
      'no-console': 0,
      'no-use-before-define': 'off',
      'no-unused-vars': ['warn', { vars: 'local', args: 'none' }],
      'no-prototype-builtins': 'off',
      'no-irregular-whitespace': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
)
