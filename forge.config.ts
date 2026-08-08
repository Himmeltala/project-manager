import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'

const config: ForgeConfig = {
  packagerConfig: {
    name: 'ProjectManager',
    executableName: 'project-manager',
    asar: true,
    appCopyright: 'Copyright © 2026',
    extraResource: ['assets'],
  },
  makers: [
    new MakerSquirrel({
      name: 'project-manager',
      authors: 'zhengrenfu',
      description: 'Windows 桌面工具，用于管理多个项目的启动、停止、构建、SVN 更新等操作',
    }),
    new MakerZIP({}, ['win32']),
  ],
}

export default config
