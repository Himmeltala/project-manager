/*
 * @Author: runnet
 * @Date: 2026-09-08 10:30:00
 * @LastEditors: runnet
 * @LastEditTime: 2026-09-08 10:30:00
 * @FilePath: no-console-debug.js
 * @Description: 禁止 console 调试输出，语句独占一行时 --fix 自动移除
 */
// 语句处于语句序列中才可安全移除（if/for 等单语句分支不可删）
const REMOVABLE_PARENTS = new Set(['Program', 'BlockStatement', 'SwitchCase', 'StaticBlock'])

export default {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: {
      description: '禁止使用 console.log/warn 等调试输出，--fix 自动移除整条语句',
    },
    messages: {
      forbidden: '禁止使用 console.{{ method }} 调试输出，请删除该语句',
    },
  },

  create(context) {
    const sourceCode = context.getSourceCode()
    const text = sourceCode.text

    /**
     * 语句独占整行时返回整行删除区间，否则返回 null
     * @param {object} statement 表达式语句节点
     * @returns {object|null} 删除区间或 null
     */
    function getWholeLineRange(statement) {
      const lineStart = sourceCode.getIndexFromLoc({
        line: statement.loc.start.line,
        column: 0,
      })
      // 行首非空白说明同行有其他代码，只删语句本身易留残迹
      const head = text.slice(lineStart, statement.range[0])
      if (!/^[ \t]*$/.test(head)) return null

      let end = statement.range[1]
      // 语句自带分号一并移除
      if (text[end] === ';') end += 1
      // 行尾仅空白与换行才连换行删，有注释等内容时留原行
      const tail = text.slice(end)
      const newline = tail.match(/^[ \t]*(?:\r\n|\r|\n)/)
      return { start: lineStart, end: newline ? end + newline[0].length : end }
    }

    return {
      CallExpression(node) {
        const callee = node.callee
        if (callee.type !== 'MemberExpression') return
        const { object, property } = callee
        if (object.type !== 'Identifier' || object.name !== 'console') return
        if (property.type !== 'Identifier') return

        const statement = node.parent
        const removable =
          statement.type === 'ExpressionStatement' &&
          statement.expression === node &&
          REMOVABLE_PARENTS.has(statement.parent.type)
        // 非整行独占或不可移除场景不提供修复，仅告警
        const range = removable ? getWholeLineRange(statement) : null

        context.report({
          node,
          messageId: 'forbidden',
          data: { method: property.name },
          fix: range ? fixer => fixer.removeRange([range.start, range.end]) : undefined,
        })
      },
    }
  },
}
