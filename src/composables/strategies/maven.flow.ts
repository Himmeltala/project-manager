/*
 * @Author: zhengrenfu
 * @Date: 2026-08-09
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-10
 * @FilePath: \src\composables\strategies\maven.flow.ts
 * @Description: Maven 项目流程策略
 */

import type { ProjectFlowAdapter } from '@/composables/strategies/types'

export const mavenFlow: ProjectFlowAdapter = {
  type: 'maven',

  label: 'Maven',

  getStartMode: () => 'module-select',

  buildStartCommand: (modulePath: string) => `mvn spring-boot:run -pl ${modulePath}`,

  buildCommands: ['mvn package -DskipTests', 'mvn package', 'mvn clean package', 'mvn install -DskipTests'],

  installCommands: ['mvn install', 'mvn clean install'],

  extraActions: [
    { key: 'java', label: 'Java 版本' },
    { key: 'maven', label: 'Maven 版本' },
    { key: 'tomcat', label: 'Tomcat 版本' },
    { key: 'warName', label: 'WAR 名称' },
  ],

  supportsBuildToolDetection: false,

  getTaskCommandTemplate: (taskName?: string) => `mvn ${taskName || '{script}'}`,

  defaultBuildCommand: 'mvn package -DskipTests',
}
