/** 项目配置，对应 config.json 里每个项目 */
export interface Project {
  name: string
  path: string
  projectType: string
  javaHome: string
  mavenHome: string
  tomcatHome: string
  tomcatWarName: string
}

/** 项目源配置，可切换不同项目列表 */
export interface ProjectSource {
  name: string
  configPath: string
  type: string
  isActive?: boolean
  projectCount?: number
  rootDir?: string
}

/** 项目类型的命令配置，按 projectType 区分（npm/maven 等） */
export interface CommandProfile {
  start: string
  build: string
  install: string
  runScript: string
  cleanDirs: string[]
  buildOutputDir: string
  taskListFile: string | null
  taskListKey: string | null
  contextMenuSections: string[]
}

/** 项目任务列表（从 pom.xml / package.json 解析） */
export interface TaskInfo {
  type: string
  tasks: Record<string, string>
  error?: string
  file?: string
  taskListKey?: string | null
}

/** 构建产物信息，用于清理列表 */
export interface BuildArtifact {
  path: string
  display: string
  sizeStr: string
  isDir: boolean
}

/** 依赖目录（node_modules 等） */
export interface DependencyDir {
  name: string
  path: string
}
