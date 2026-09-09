/*
 * @Author: runnet
 * @Date: 2026-09-06 16:20:00
 * @LastEditors: runnet
 * @LastEditTime: 2026-09-06 16:20:00
 * @FilePath: illegal-annotation.js
 * @Description: 注释特殊符号检查与自动清理
 */
export default {
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: { description: '注释特殊符号检查' },
    messages: {
      symbol: '注释中禁止使用特殊符号（箭头、线条、emoji 等）："{{ content }}"',
    },
  },

  create(context) {
    const f = context.getFilename() || ''
    if (!f.endsWith('.vue') && !f.endsWith('.js') && !f.endsWith('.ts'))
      return {}

    // 特殊符号：箭头、线条、emoji
    const SYMBOL_RE =
      /[+×←-⇿─-╿■-◿☀-➿]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDEFF]|\uD83E[\uDD00-\uDDFF]/g

    return {
      'Program:exit'(node) {
        const comments = context.getSourceCode().ast.comments || []

        for (const c of comments) {
          const lines = c.type === 'Block' ? c.value.split('\n') : [c.value]
          for (const line of lines) {
            if (!SYMBOL_RE.test(line)) continue
            const content = line
              .replace(/^\s*\*+\s?/, '')
              .substring(0, 40)
            context.report({
              node,
              loc: c.loc,
              messageId: 'symbol',
              data: { content },
              // 整条注释清理全部违规符号，单次修复到位
              fix(fixer) {
                const text = context.getSourceCode().getText(c)
                return fixer.replaceTextRange(c.range, text.replace(SYMBOL_RE, ''))
              },
            })
            break
          }
        }
      },
    }
  },
}
