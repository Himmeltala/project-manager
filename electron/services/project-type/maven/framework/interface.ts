/**
 * Java 运行时框架接口
 */
import type { Project } from '@/types/project'

export interface JavaFramework {
  readonly name: string
  detect(path: string): boolean
  getStartCommand(path: string, modulePath?: string): string
  getDeployMethod?(): 'spring-boot' | 'tomcat' | null
}
