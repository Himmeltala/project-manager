/**
 * Maven 构建命令
 */
export function getBuildCommands(): string[] {
  return ['mvn package -DskipTests', 'mvn package', 'mvn clean package', 'mvn install -DskipTests']
}
