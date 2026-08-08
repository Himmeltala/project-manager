/**
 * 前端框架检测接口
 */
export interface FrameworkDetector {
  readonly name: string
  detect(path: string): boolean
  getDevScript(): string
  getConfigFiles(): string[]
}
