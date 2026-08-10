/*
 * @Author: zhengrenfu
 * @Date: 2026-07-31 00:00:00
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-31 00:00:00
 * @FilePath: .eslint-plugin-local/index.js
 * @Description: 本地 ESLint 规则入口
 */

import illegalComponentUsing from './rules/illegal-component-using.js'
import illegalModalUsing from './rules/illegal-modal-using.js'
import illegalHeaderAnnotation from './rules/illegal-header-annotation.js'
import illegalAnnotation from './rules/illegal-annotation.js'
import noImageInViews from './rules/no-image-in-views.js'
import noImageInSrc from './rules/no-image-in-src.js'
import useDesignVariables from './rules/use-design-variables.js'
import requiredScriptSetup from './rules/required-script-setup.js'
import noUnusedFiles from './rules/no-unused-files.js'
import noRelativeImports from './rules/no-relative-imports.js'

export default {
  rules: {
    'illegal-component-using': illegalComponentUsing,
    'illegal-modal-using': illegalModalUsing,
    'illegal-header-annotation': illegalHeaderAnnotation,
    'illegal-annotation': illegalAnnotation,
    'no-image-in-views': noImageInViews,
    'no-image-in-src': noImageInSrc,
    'use-design-variables': useDesignVariables,
    'required-script-setup': requiredScriptSetup,
    'no-unused-files': noUnusedFiles,
    'no-relative-imports': noRelativeImports,
  },
}
