/**
 * 菜单动态值共享工具
 */

// 主目录路径末段作为显示名，空路径显示系统默认
export function homePathValue(home: string): string {
  return home ? home.split('\\').pop() || '系统默认' : '系统默认'
}
