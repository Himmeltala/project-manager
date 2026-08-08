/*
 * @Author: zhengrenfu
 * @Date: 2026-07-31 00:00:00
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-31 00:00:00
 * @FilePath: .eslint-plugin-local/rules/illegal-modal-using.js
 * @Description: 弹窗组件规范检查 -- 命名/内容/useModal 使用
 */

import path from 'path'

const ROOT = process.cwd()

const USEMODAL_IMPORT_PATH = '@/composables/useModal'

export default {
  meta: {
    type: 'problem',
    docs: { description: '弹窗组件规范检查 -- 命名/内容/useModal 使用' },
    messages: {
      namingLocation: '以 Modal.vue 结尾的文件必须放在 modals/ 目录下',
      namingSuffix:
        'modals/ 目录下的 .vue 文件必须以 Modal.vue 结尾（index.vue 除外）',
      contentMissing:
        'Modal 文件 "{{ name }}" 的 <template> 中缺少 <el-dialog>',
      usageDialog:
        '使用了 <el-dialog> 但未搭配 useModal（需 import { useModal } from ' +
        USEMODAL_IMPORT_PATH +
        '）',
      usageModalTag:
        '使用了 <{{ name }}> 组件但未搭配 useModal（需 import { useModal } from ' +
        USEMODAL_IMPORT_PATH +
        '）',
    },
  },

  create(context) {
    const f = context.filename || ''
    const rel = '/' + path.relative(ROOT, f).replace(/\\/g, '/')

    if (!rel.startsWith('/src/')) return {}
    if (rel === '/src/components/index.js') return {}

    const parts = rel.split('/')
    const fileName = parts.pop()
    const parentDir = parts.pop()

    const isVueFile = fileName.endsWith('.vue')
    const isModalFile = fileName.endsWith('Modal.vue')
    const isInModalsDir = rel.includes('/modals/')
    const isModalsDirectChild = parentDir === 'modals'
    const isIndexVue = fileName === 'index.vue'

    // 命名规范
    if (isVueFile && isModalFile && !isInModalsDir) {
      context.report({
        node: context.sourceCode.ast,
        messageId: 'namingLocation',
      })
    }

    if (isVueFile && isModalsDirectChild && !isIndexVue && !isModalFile) {
      context.report({
        node: context.sourceCode.ast,
        messageId: 'namingSuffix',
      })
    }

    if (!isVueFile) return {}

    const ps = context.parserServices
    if (!ps || !ps.defineTemplateBodyVisitor) return {}

    let hasUseModalImport = false
    let hasUseModalCall = false
    let foundDialog = false

    const isConsumerFile = !isModalFile && !isInModalsDir

    return Object.assign(
      {},
      {
        ImportDeclaration(n) {
          if (
            n.source.value &&
            n.source.value.includes('/composables/useModal') &&
            n.specifiers.some(
              (s) =>
                s.type === 'ImportSpecifier' &&
                s.imported &&
                s.imported.name === 'useModal',
            )
          ) {
            hasUseModalImport = true
          }
        },

        CallExpression(n) {
          if (
            n.callee &&
            n.callee.type === 'Identifier' &&
            n.callee.name === 'useModal'
          ) {
            hasUseModalCall = true
          }
        },

        'Program:exit'() {
          if (isModalFile && !foundDialog) {
            context.report({
              node: context.sourceCode.ast,
              messageId: 'contentMissing',
              data: { name: fileName },
            })
          }
        },
      },

      ps.defineTemplateBodyVisitor({
        'VElement[name=el-dialog]'(n) {
          foundDialog = true
          if (isConsumerFile && !hasUseModalImport && !hasUseModalCall) {
            context.report({
              node: n,
              messageId: 'usageDialog',
              data: { tag: 'el-dialog' },
            })
          }
        },

        VElement(n) {
          if (
            isConsumerFile &&
            /^[A-Z]/.test(n.rawName) &&
            n.rawName.endsWith('Modal') &&
            !hasUseModalImport &&
            !hasUseModalCall
          ) {
            context.report({
              node: n,
              messageId: 'usageModalTag',
              data: { name: n.rawName },
            })
          }
        },
      }),
    )
  },
}
