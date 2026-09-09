/*
 * @Author: runnet
 * @Date: 2026-09-06 16:20:00
 * @LastEditors: runnet
 * @LastEditTime: 2026-09-06 16:20:00
 * @FilePath: required-script-setup.js
 * @Description: 强制 .vue 文件使用 script setup 语法
 */
export default {
  meta: {
    type: 'problem',
    docs: { description: '强制 .vue 文件使用 <script setup> 语法（Vue 3 Composition API）' },
    messages: {
      requireSetup: '必须使用 <script setup> 语法，Vue 3 项目统一采用 Composition API setup 语法糖',
    },
  },

  create(context) {
    const filename = context.getFilename()
    if (!filename.endsWith('.vue')) return {}

    // 通过 vue-eslint-parser 的 DocumentFragment 检查 <script setup>
    const fragment = context.sourceCode.parserServices?.getDocumentFragment?.()
    if (fragment) {
      const scriptNodes = fragment.children.filter(
        child => child.type === 'VElement' && child.name === 'script'
      )
      if (scriptNodes.length === 0) return {}

      const hasSetup = scriptNodes.some(node =>
        node.startTag.attributes.some(
          attr => attr.key && attr.key.name === 'setup'
        )
      )
      if (hasSetup) return {}

      return {
        Program(node) {
          context.report({
            node,
            loc: scriptNodes[0].startTag.loc,
            messageId: 'requireSetup',
          })
        },
      }
    }

    // 降级：通过源码正则检查
    const sourceCode = context.getSourceCode()
    const text = sourceCode.getText()
    const scriptTagRE = /<script\b([^>]*?)>/gi
    let match
    let hasAnyScript = false
    let hasScriptSetup = false

    while ((match = scriptTagRE.exec(text)) !== null) {
      hasAnyScript = true
      if (/\bsetup\b/.test(match[1])) {
        hasScriptSetup = true
        break
      }
    }

    if (hasAnyScript && !hasScriptSetup) {
      return {
        Program(node) {
          context.report({
            node,
            loc: node.loc,
            messageId: 'requireSetup',
          })
        },
      }
    }

    return {}
  },
}
