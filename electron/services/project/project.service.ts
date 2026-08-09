/*
 * @Author: zhengrenfu
 * @Date: 2026-07-20
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-08-03
 * @FilePath: \electron\services\project.service.ts
 * @Description: 项目管理器业务逻辑服务
 */
import { existsSync, copyFileSync, rmSync, readdirSync, statSync, mkdirSync } from 'fs'
import { rm, stat, unlink } from 'fs/promises'
import { join, basename, dirname } from 'path'
import { EventEmitter } from 'events'
import { execSync, exec, spawn } from 'child_process'

/** 模块级编码缓存，一旦检测缓存 */
let cachedSystemEncoding: string | null = null

/** 获取系统编码（带缓存） */
function getSystemEncoding(): string {
  if (cachedSystemEncoding) return cachedSystemEncoding
  try {
    const cp = execSync('chcp', { encoding: 'utf8', windowsHide: true, timeout: 1000 })
    cachedSystemEncoding = cp.includes('936') ? 'gbk' : 'latin1'
  } catch {
    cachedSystemEncoding = 'gbk'
  }
  return cachedSystemEncoding
}

// 非阻塞版 exec，不卡 UI。自动检测编码，始终 resolve（不 reject）
function execAsync(cmd: string, opts: any = {}): Promise<{ text: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    exec(cmd, { ...opts, windowsHide: true, encoding: 'buffer' }, (err, stdout: Buffer, stderr: Buffer) => {
      // 编码解码（统一处理，无论 err 与否）
      const decode = (buf: Buffer): string => {
        let t = buf.toString('utf-8')
        if (t.includes('�')) {
          t = buf.toString(getSystemEncoding() as BufferEncoding)
        }
        return t
      }
      // stdout + stderr 合并（SVN 有时输出到 stderr）
      let text = decode(stdout)
      if (!text.trim()) text = decode(stderr)
      // 检查 exitCode：Node 的 err.code 是进程退出码（数字）或错误名（如 'ENOENT'）
      let exitCode = 0
      if (err) {
        const code = (err as any).code
        exitCode = typeof code === 'number' ? code : 1
      }

      // SVN/build 等命令即使非零退出也可能有成功的输出（如 "At revision"）
      if (!text.trim()) {
        text = (err as any)?.message || ''
      }
      resolve({ text, exitCode })
    })
  })
}

// 流式版 exec：spawn 进程，逐行回调，适合构建等需要实时输出的场景
function execAsyncStream(
  cmd: string,
  opts: { cwd?: string; timeout?: number; extraEnv?: Record<string, string> },
  onLine: (line: string) => void,
): Promise<{ text: string; exitCode: number }> {
  return new Promise((resolve) => {
    const env = opts.extraEnv ? { ...process.env, ...opts.extraEnv } : undefined
    const child = spawn(cmd, [], { shell: true, cwd: opts.cwd, env, windowsHide: true })
    let timedOut = false
    const timer = opts.timeout
      ? setTimeout(() => {
          timedOut = true
          child.kill()
        }, opts.timeout)
      : null

    const decodeLine = (buf: Buffer): string => {
      let t = buf.toString('utf-8')
      // 去掉 ANSI 颜色转义码（npm/vite 输出的 \x1b[...m 等）
      t = t.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      if (t.includes('�')) {
        t = buf.toString(getSystemEncoding() as BufferEncoding)
        t = t.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      }
      return t
    }

    const onData = (stream: NodeJS.ReadableStream, textAcc: { value: string }) => {
      let leftover = Buffer.alloc(0)
      stream.on('data', (chunk: Buffer) => {
        leftover = Buffer.concat([leftover, chunk])
        while (true) {
          const nlIdx = leftover.indexOf(10)
          if (nlIdx === -1) break
          const lineBuf = leftover.subarray(0, nlIdx)
          leftover = leftover.subarray(nlIdx + 1)
          // Windows \r\n 去掉多余的 \r
          const trimmed =
            lineBuf.length > 0 && lineBuf[lineBuf.length - 1] === 13 ? lineBuf.subarray(0, lineBuf.length - 1) : lineBuf
          if (trimmed.length === 0) continue
          const line = decodeLine(trimmed)
          textAcc.value += line + '\n'
          onLine(line)
        }
      })
      stream.on('end', () => {
        if (leftover.length > 0) {
          const trimmed = leftover[leftover.length - 1] === 13 ? leftover.subarray(0, leftover.length - 1) : leftover
          const line = decodeLine(trimmed)
          textAcc.value += line
          onLine(line)
        }
      })
    }

    const stdoutAcc = { value: '' }
    const stderrAcc = { value: '' }

    child.stdout && onData(child.stdout, stdoutAcc)
    child.stderr && onData(child.stderr, stderrAcc)

    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      resolve({ text: err.message, exitCode: 1 })
    })

    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      let text = stdoutAcc.value
      if (!text.trim()) text = stderrAcc.value
      if (timedOut) text += '\n[超时] 构建超时被终止'
      resolve({ text, exitCode: code !== null ? code : timedOut ? 124 : 1 })
    })
  })
}
import type { Project, BuildArtifact, DependencyDir, TaskInfo, ContextMenuItem } from '@/types/project'
import type { RunningInfo, MigrationParams } from '@/types/process'
import type { ManagedProcess } from '../runtime/process-manager.service'
import { ProcessManager } from '../runtime/process-manager.service'
import { projectTypeRegistry } from '../project-type/registry'
import type { VcsUpdateResult, VcsRegistryImpl, VcsProvider } from '../version-control/registry'

export class ProjectService extends EventEmitter {
  // #region Init
  private processMgr: ProcessManager
  private vcsRegistry: VcsRegistryImpl
  projects: Project[] = []
  private running: Map<number, ManagedProcess[]> = new Map()
  private allRunning: Map<string, ManagedProcess> = new Map()

  constructor(processMgr: ProcessManager, vcsRegistry: VcsRegistryImpl) {
    super()
    this.processMgr = processMgr
    this.vcsRegistry = vcsRegistry
  }
  // #endregion

  refreshProjects(newProjects: Project[]): void {
    this.projects = [...newProjects]
    // 项目列表变更时清除 VCS 检测缓存
    this.vcsRegistry.clearDetectCache()
    // Preserve running state by path (allRunning 跨源持久化)
    this.running.clear()
    for (let newIdx = 0; newIdx < this.projects.length; newIdx++) {
      const proj = this.projects[newIdx]
      if (this.allRunning.has(proj.path)) {
        this.running.set(newIdx + 1, [this.allRunning.get(proj.path)!])
      }
    }
  }

  resolveTarget(target: string): [number, string, string] | null {
    if (/^\d+$/.test(target)) {
      const idx = parseInt(target, 10)
      if (idx >= 1 && idx <= this.projects.length) {
        const proj = this.projects[idx - 1]
        return [idx, proj.name, proj.path]
      }
      return null
    }

    const targetLower = target.toLowerCase()
    const matches = this.projects
      .map((p, i) => [i + 1, p.name, p.path] as [number, string, string])
      .filter(([, n]) => n.toLowerCase() === targetLower)
    return matches[0] || null
  }

  getProjectByIndex(idx: number): Project | null {
    if (idx >= 1 && idx <= this.projects.length) {
      return this.projects[idx - 1]
    }
    return null
  }

  isRunning(idx: number): boolean {
    return (this.running.get(idx)?.length ?? 0) > 0
  }

  getRunningInfo(): RunningInfo[] {
    return Array.from(this.running.entries()).map(([idx, mp]) => ({
      index: idx,
      name: mp.name,
      path: mp.path,
      port: mp.port,
    }))
  }

  getAllRunningPaths(): Record<string, number | null> {
    const result: Record<string, number | null> = {}
    for (const [path, mp] of this.allRunning) {
      result[path] = mp.port
    }
    return result
  }

  getRunningScriptsByPath(path: string): string[] {
    return this.processMgr.getProjectTasks(path).map((t) => t.command || '')
  }

  /**
   * 获取所有项目运行中的脚本，按项目路径分组（跨源汇总）
   * @returns 路径到脚本命令列表的映射
   */
  getAllRunningScripts(): Record<string, string[]> {
    const result: Record<string, string[]> = {}
    for (const path of Object.keys(this.processMgr.getAllProjectTasks())) {
      result[path] = this.getRunningScriptsByPath(path)
    }
    return result
  }

  getTotalScriptsCount(): number {
    let count = 0
    for (const proj of this.projects) {
      count += this.processMgr.getProjectTasks(proj.path).length
    }
    return count
  }
  // #endregion

  // #region Start / Stop
  async start(idx: number, command?: string, report?: (msg: string, pct?: number) => void): Promise<boolean> {
    const proj = this.getProjectByIndex(idx)
    if (!proj) return false
    console.log('[DEBUG start]', idx, proj.name, command)
    /* allow multi-module re-start with different command */
    if (!existsSync(proj.path)) return false

    return this.startByProject(proj, idx, command, report)
  }

  async startByPath(path: string, command?: string, report?: (msg: string, pct?: number) => void): Promise<boolean> {
    if (this.allRunning.has(path)) return false
    if (!existsSync(path)) return false
    // 在当前源项目列表中找该项目，找不到则用最小项目信息直接启动
    const existingIdx = this.projects.findIndex((p) => p.path === path)
    if (existingIdx >= 0) {
      return this.start(existingIdx + 1, command, report)
    }
    // 不在当前源列表中，创建临时项目对象用路径启动
    const proj: Project = {
      name: basename(path),
      path,
      projectType: '',
      javaHome: '',
      mavenHome: '',
      tomcatHome: '',
      tomcatWarName: '',
    }
    return this.startByProject(proj, 0, command, report)
  }

  async stopByPath(path: string): Promise<boolean> {
    const mp = this.allRunning.get(path)
    if (!mp) return false
    // 找到对应的 idx（可能在当前源或其他源）
    let idx = 0
    for (const [i, m] of this.running) {
      if (m.path === path) {
        idx = i
        break
      }
    }
    if (idx > 0) {
      await this.stop(idx)
    } else {
      // 从 allRunning 直接清理
      this.allRunning.delete(path)
      mp.proc.kill()
    }
    return true
  }

  private async startByProject(
    proj: Project,
    idx: number,
    command?: string,
    report?: (msg: string, pct?: number) => void,
  ): Promise<boolean> {
    const cmd =
      command ||
      (projectTypeRegistry.get(proj.projectType)?.resolveStartCommand(proj.path) ??
        projectTypeRegistry.get('npm')!.resolveStartCommand())

    if (proj.tomcatHome) {
      return this.startWithTomcat(idx, proj, cmd, report)
    }

    const extraEnv = this.makeBuildEnv(proj)
    const mp = this.processMgr.spawnProc(cmd, proj.path, extraEnv)
    mp.name = proj.name
    mp.command = cmd
    console.log('[DEBUG startByProject] mp.name:', mp.name, 'cmd:', cmd)
    if (command) {
      const m = /-pl\s+(\S+)/.exec(command)
      if (m) mp.name = proj.name + " → " + (m[1].split("/").pop() || m[1])
    }

    const existing = this.running.get(idx) || []
    existing.push(mp)
    this.running.set(idx, existing)
    this.processMgr.addProjectTask(proj.path, mp)
    this.allRunning.set(proj.path, mp)

    console.log('[DEBUG output] starting outputThread for:', mp.name, 'pid:', mp.proc.pid, 'stdout:', !!mp.proc.stdout, 'stderr:', !!mp.proc.stderr)
    this.processMgr.startOutputThread(
      mp,
      (line) => {
        this.emit('outputLine', { index: idx, name: mp.name, line })
      },
      (port) => {
        mp.port = port
        this.emit('portDetected', { index: idx, port })
      },
    )

    mp.proc.on('exit', () => {
      const arr = this.running.get(idx)
      if (arr) {
        const filtered = arr.filter((m: any) => m !== mp)
        if (filtered.length === 0) this.running.delete(idx)
        else this.running.set(idx, filtered)
      }
      if (this.allRunning.get(proj.path) === mp) {
        this.allRunning.delete(proj.path)
      }
      this.processMgr.removeProjectTask(proj.path, mp)
      this.emit('projectStopped', { index: idx, name: mp.name })
    })

    this.emit('projectStarted', { index: idx, name: mp.name })
    return true
  }

  private async startWithTomcat(
    idx: number,
    proj: Project,
    buildCmd: string,
    report?: (msg: string, pct?: number) => void,
  ): Promise<boolean> {
    const extraEnv = this.makeBuildEnv(proj)
    const buildMp = this.processMgr.spawnProc(buildCmd, proj.path, extraEnv)
    buildMp.name = `${proj.name} (构建)`

    this.running.set(idx, [buildMp])
    this.allRunning.set(proj.path, buildMp)

    this.processMgr.startOutputThread(
      buildMp,
      (line) => this.emit('outputLine', { index: idx, name: mp.name, line }),
      () => {},
    )

    return new Promise((resolve) => {
      buildMp.proc.on('exit', (code) => {
        this.allRunning.delete(proj.path)

        if (code !== 0) {
          this.emit('projectStopped', { index: idx, name: mp.name })
          resolve(false)
          return
        }

        const artifactProvider = projectTypeRegistry.detect(proj.path)
        const warName = proj.tomcatWarName || artifactProvider.readArtifactName?.(proj.path) || proj.name
        const warFile = join(proj.path, 'target', `${warName}.war`)
        const tomcatWebapps = join(proj.tomcatHome, 'webapps')
        const destWar = join(tomcatWebapps, `${warName}.war`)

        if (!existsSync(warFile)) {
          this.emit('projectStopped', { index: idx, name: mp.name })
          resolve(false)
          return
        }

        try {
          copyFileSync(warFile, destWar)
        } catch {
          this.emit('projectStopped', { index: idx, name: mp.name })
          resolve(false)
          return
        }

        const catalina = join(proj.tomcatHome, 'bin', 'catalina.bat')
        if (!existsSync(catalina)) {
          this.emit('projectStopped', { index: idx, name: mp.name })
          resolve(false)
          return
        }

        const tomcatCmd = `"${catalina}" run`
        const tomcatMp = this.processMgr.spawnProc(tomcatCmd, proj.path, extraEnv)
        tomcatMp.name = proj.name

        this.running.set(idx, [tomcatMp])
        this.allRunning.set(proj.path, tomcatMp)

        this.processMgr.startOutputThread(
          tomcatMp,
          (line) => this.emit('outputLine', { index: idx, name: mp.name, line }),
          (port) => {
            tomcatMp.port = port
            this.emit('portDetected', { index: idx, port })
          },
        )

        tomcatMp.proc.on('exit', () => {
          if (this.allRunning.get(proj.path) === tomcatMp) this.allRunning.delete(proj.path)
          this.emit('projectStopped', { index: idx, name: mp.name })
        })

        this.emit('projectStarted', { index: idx, name: mp.name })
        resolve(true)
      })
    })
  }

  async stop(idx: number): Promise<boolean> {
    const mps = this.running.get(idx)
    if (!mps || mps.length === 0) return false

    const proj = this.getProjectByIndex(idx)
    // 立即从运行列表移除，UI 即时反映停止状态
    this.running.delete(idx)
    for (const mp of mps) {
      const name = mp.name
      const path = proj?.path || mp.path
      const port = mp.port
      if (this.allRunning.get(path) === mp) this.allRunning.delete(path)

      // 停止该项目的脚本任务
      const tasks = this.processMgr.getProjectTasks(path)
      for (const t of tasks) {
        this.processMgr.terminate(t)
      }
      this.processMgr.cleanProjectTasks(path)

      // 后台终止主进程，完成后释放端口并发送事件
      this.processMgr.terminate(mp, () => {
        if (port) {
          this.processMgr.killPort(port)
        }
        this.emit('projectStopped', { index: idx, name })
      })
    }

    return true
  }

  async stopScript(idx: number, command: string): Promise<boolean> {
    const proj = this.getProjectByIndex(idx)
    if (!proj) return false
    console.log('[DEBUG start]', idx, proj.name, command)

    const tasks = this.processMgr.getProjectTasks(proj.path)
    const target = tasks.find((t) => t.command === command)
    if (!target) return false

    this.processMgr.terminate(target)
    this.processMgr.removeProjectTask(proj.path, target)
    return true
  }

  stopAll(): void {
    for (const [idx] of this.running) {
      this.stop(idx)
    }
  }
  // #endregion

  // #region Project Management
  removeProject(idx: number): boolean {
    if (idx < 1 || idx > this.projects.length) return false
    if (this.isRunning(idx)) this.stop(idx)
    this.projects.splice(idx - 1, 1)
    return true
  }

  async deleteProject(idx: number): Promise<boolean> {
    if (idx < 1 || idx > this.projects.length) return false
    const proj = this.projects[idx - 1]
    const { name, path } = proj

    if (this.isRunning(idx)) this.stop(idx)

    try {
      await execAsync(`rmdir /s /q "${path}"`, { timeout: 60000 })
    } catch {
      try {
        rmSync(path, { recursive: true, force: true })
      } catch {
        return false
      }
    }

    this.projects.splice(idx - 1, 1)
    return true
  }

  renameProject(idx: number, newName: string): boolean {
    if (idx < 1 || idx > this.projects.length) return false
    const old = this.projects[idx - 1]
    this.projects[idx - 1] = { ...old, name: newName }
    return true
  }

  // #endregion

  // #region Build
  async buildProject(
    idx: number,
    command?: string,
    zipName?: string,
    report?: (msg: string, pct?: number) => void,
  ): Promise<boolean> {
    const proj = this.getProjectByIndex(idx)
    if (!proj || !existsSync(proj.path)) return false

    const profile =
      projectTypeRegistry.get(proj.projectType)?.getProfile() ?? projectTypeRegistry.get('npm')!.getProfile()
    const cmd = command || profile.build
    const outputDir = join(proj.path, profile.buildOutputDir)
    const extraEnv = this.makeBuildEnv(proj)

    if (report) {
      return this.buildSync(proj, cmd, outputDir, zipName, report, extraEnv)
    }

    // Async build（非阻塞）
    try {
      const { text: stdout } = await execAsync(cmd, { cwd: proj.path, timeout: 600000 })
      if (existsSync(outputDir)) {
        await this.zipDist(proj.name, proj.path, outputDir, zipName)
      }
      return true
    } catch {
      return false
    }
  }

  private async buildSync(
    proj: Project,
    command: string,
    outputDir: string,
    zipName: string | undefined,
    report: (msg: string, pct?: number) => void,
    extraEnv?: Record<string, string>,
  ): Promise<boolean> {
    report('开始构建: ' + proj.name, 5)
    // 流式 spawn，实时输出到面板
    const { text, exitCode } = await execAsyncStream(command, { cwd: proj.path, timeout: 600000, extraEnv }, (line) => {
      this.emit('outputLine', { name: proj.name, line })
    })
    if (exitCode !== 0) {
      throw new Error(text.trim() || '构建失败（进程退出码非零）')
    }
    report('构建成功，正在压缩产物目录...', 60)
    if (!existsSync(outputDir)) throw new Error('未找到产物目录')
    await this.zipDist(proj.name, proj.path, outputDir, zipName)
    report(`构建并压缩完成: ${proj.name}`, 100)
    return true
  }

  private async zipDist(name: string, projectPath: string, distDir: string, customZipName?: string): Promise<void> {
    const d = new Date()
    const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
    const safeName = name.replace(/[ /\\]/g, '_')

    let baseName: string
    if (customZipName) {
      const resolved = customZipName.replace(/[ /\\]/g, '_').replace(/\{\{timestamp\}\}/g, ts)
      baseName = resolved
    } else {
      baseName = `${basename(distDir)}-${safeName}`
    }
    const zipPath = join(projectPath, `${baseName}.zip`)

    // PowerShell 里路径用单引号，避免外层 -Command 双引号冲突
    const psCmd = `Compress-Archive -Path '${distDir}\\*' -DestinationPath '${zipPath}' -Force`
    const { text, exitCode } = await execAsync(`powershell -Command "${psCmd}"`, { timeout: 120000 })
    if (exitCode !== 0) {
      console.warn('压缩失败:', text)
    }
  }

  scanBuildArtifacts(idx: number): BuildArtifact[] {
    const proj = this.getProjectByIndex(idx)
    if (!proj) return []

    const profile =
      projectTypeRegistry.get(proj.projectType)?.getProfile() ?? projectTypeRegistry.get('npm')!.getProfile()
    const outputDir = join(proj.path, profile.buildOutputDir)
    const items: BuildArtifact[] = []

    if (existsSync(outputDir)) {
      items.push({
        path: outputDir,
        display: `${profile.buildOutputDir}/ 目录`,
        sizeStr: this.dirSizeStr(outputDir),
        isDir: true,
      })
    }

    if (existsSync(proj.path)) {
      for (const f of readdirSync(proj.path)) {
        if (f.endsWith('.zip')) {
          const fullPath = join(proj.path, f)
          const sizeMb = statSync(fullPath).size / (1024 * 1024)
          items.push({
            path: fullPath,
            display: f,
            sizeStr: `${sizeMb.toFixed(1)} MB`,
            isDir: false,
          })
        }
      }
    }

    return items
  }

  async cleanArtifacts(idx: number, itemPaths: string[]): Promise<number> {
    let deleted = 0
    for (const fullPath of itemPaths) {
      try {
        const st = await stat(fullPath)
        if (st.isDirectory()) {
          await execAsync(`rmdir /s /q "${fullPath}"`, { windowsHide: true })
        } else {
          await unlink(fullPath)
        }
        deleted++
      } catch {
        // ignore
      }
    }
    return deleted
  }

  getDependencyDirs(idx: number): DependencyDir[] {
    const proj = this.getProjectByIndex(idx)
    if (!proj) return []

    const profile =
      projectTypeRegistry.get(proj.projectType)?.getProfile() ?? projectTypeRegistry.get('npm')!.getProfile()
    const result: DependencyDir[] = []
    for (const dirName of profile.cleanDirs) {
      const full = join(proj.path, dirName)
      if (existsSync(full)) {
        result.push({ name: dirName, path: full })
      }
    }
    return result
  }

  async cleanDependencies(idx: number): Promise<boolean> {
    const proj = this.getProjectByIndex(idx)
    if (!proj) return false
    console.log('[DEBUG start]', idx, proj.name, command)

    const profile =
      projectTypeRegistry.get(proj.projectType)?.getProfile() ?? projectTypeRegistry.get('npm')!.getProfile()
    let allOk = true
    for (const dirName of profile.cleanDirs) {
      const full = join(proj.path, dirName)
      if (!existsSync(full)) continue
      try {
        await execAsync(`rmdir /s /q "${full}"`, { windowsHide: true, timeout: 60000 })
      } catch {
        try {
          await rm(full, { recursive: true, force: true })
        } catch {
          allOk = false
        }
      }
    }
    return allOk
  }
  // #endregion

  // #region Scripts / Tasks
  getTaskList(idx: number): TaskInfo | null {
    const proj = this.getProjectByIndex(idx)
    if (!proj) return null

    const provider = projectTypeRegistry.get(proj.projectType)
    if (provider?.getTaskList) {
      return provider.getTaskList(proj.path)
    }

    return null
  }

  getContextMenuItems(idx: number): ContextMenuItem[] {
    const proj = this.getProjectByIndex(idx)
    if (!proj) return []

    const provider = projectTypeRegistry.get(proj.projectType)
    if (provider?.getContextMenuItems) {
      return provider.getContextMenuItems(proj.path)
    }

    return []
  }

  async runScript(idx: number, command: string): Promise<boolean> {
    const proj = this.getProjectByIndex(idx)
    if (!proj || !existsSync(proj.path)) return false

    const extraEnv = this.makeBuildEnv(proj)
    const mp = this.processMgr.spawnProc(command, proj.path, extraEnv)
    mp.name = proj.name
    if (command) {
      const m = /-pl\s+(\S+)/.exec(command)
      if (m) mp.name = proj.name + " → " + (m[1].split("/").pop() || m[1])
    }
    mp.command = command

    this.processMgr.addProjectTask(proj.path, mp)

    this.processMgr.startOutputThread(
      mp,
      (line) => this.emit('outputLine', { index: idx, name: mp.name, line }),
      () => {},
    )

    return new Promise<boolean>((resolve) => {
      mp.proc.on('exit', (code: number | null) => {
        this.processMgr.removeProjectTask(proj.path, mp)
        resolve(code === 0)
      })
    })
  }

  async runTask(idx: number, command: string): Promise<boolean> {
    const proj = this.getProjectByIndex(idx)
    if (!proj || !existsSync(proj.path)) return false

    const extraEnv = this.makeBuildEnv(proj)
    const mp = this.processMgr.spawnProc(command, proj.path, extraEnv)
    mp.name = proj.name
    if (command) {
      const m = /-pl\s+(\S+)/.exec(command)
      if (m) mp.name = proj.name + " → " + (m[1].split("/").pop() || m[1])
    }

    this.processMgr.startOutputThread(
      mp,
      (line) => this.emit('outputLine', { index: idx, name: mp.name, line }),
      () => {},
    )

    return new Promise<boolean>((resolve) => {
      mp.proc.on('exit', (code: number | null) => {
        resolve(code === 0)
      })
    })
  }
  // #endregion

  // #region VCS
  async vcsUpdate(idx: number): Promise<VcsUpdateResult> {
    const proj = this.getProjectByIndex(idx)
    if (!proj) return { status: 'error', text: '项目不存在' }

    const vcs = this.vcsRegistry.detect(proj.path)
    if (!vcs) return { status: 'error', text: '未检测到版本控制系统' }

    const result = await vcs.update(proj.path)
    if (result.text) {
      this.emit('outputLine', { index: idx, name: proj.name, line: result.text })
    }
    return result
  }

  /**
   * 根据项目路径执行 VCS 更新，用于跨源项目
   */
  async vcsUpdateByPath(projectPath: string, projectName: string): Promise<VcsUpdateResult> {
    const vcs = this.vcsRegistry.detect(projectPath)
    if (!vcs) return { status: 'error', text: '未检测到版本控制系统' }

    const result = await vcs.update(projectPath)
    if (result.text) {
      this.emit('outputLine', { index: 0, name: projectName, line: result.text })
    }
    return result
  }

  async vcsLog(idx: number, limit = 20): Promise<'ok' | 'error'> {
    const proj = this.getProjectByIndex(idx)
    if (!proj) return 'error'

    const vcs = this.vcsRegistry.detect(proj.path)
    if (!vcs) return 'error'

    await vcs.log(proj.path, limit)
    return 'ok'
  }

  /**
   * 根据项目路径查看 VCS 日志，用于跨源项目
   */
  async vcsLogByPath(projectPath: string, limit = 20): Promise<'ok' | 'error'> {
    const vcs = this.vcsRegistry.detect(projectPath)
    if (!vcs) return 'error'

    await vcs.log(projectPath, limit)
    return 'ok'
  }

  async getVcsInfo(idx: number): Promise<{ url?: string; root?: string; relativeUrl?: string } | null> {
    const proj = this.getProjectByIndex(idx)
    if (!proj) return null

    const vcs = this.vcsRegistry.detect(proj.path)
    if (!vcs) return null

    return vcs.getInfo(proj.path)
  }

  async migrateProject(idx: number, params: MigrationParams): Promise<boolean> {
    const proj = this.getProjectByIndex(idx)
    if (!proj) return false
    console.log('[DEBUG start]', idx, proj.name, command)

    const { mode, targetDir, svnUrl } = params

    // 确保目标父目录存在（VCS checkout/clone 需要目标目录不存在）
    try {
      mkdirSync(dirname(targetDir), { recursive: true })
    } catch {
      return false
    }

    // VCS 迁移（svn/git）通过注册表委托给对应提供者
    const vcsProvider = this.vcsRegistry.get(mode)
    if (vcsProvider?.migrate && svnUrl) {
      return vcsProvider.migrate(svnUrl, targetDir)
    }

    if (mode === 'copy') {
      const ignorePatterns = [
        'node_modules',
        '.git',
        'dist',
        'build',
        '.next',
        '.nuxt',
        '.cache',
        '__pycache__',
        '.idea',
        '.vscode',
        '*.zip',
        'target',
      ]
      try {
        const copyRecursive = (src: string, dest: string) => {
          mkdirSync(dest, { recursive: true })
          for (const entry of readdirSync(src, { withFileTypes: true })) {
            if (ignorePatterns.some((p) => entry.name.toLowerCase().includes(p.replace('*', '').toLowerCase())))
              continue
            const srcPath = join(src, entry.name)
            const destPath = join(dest, entry.name)
            if (entry.isDirectory()) {
              copyRecursive(srcPath, destPath)
            } else {
              copyFileSync(srcPath, destPath)
            }
          }
        }

        copyRecursive(proj.path, targetDir)
        return true
      } catch {
        return false
      }
    }

    return false
  }
  // #endregion

  // #region Utilities
  private makeBuildEnv(proj: Project): Record<string, string> | undefined {
    const env: Record<string, string> = {}
    const extraPaths: string[] = []

    if (proj.javaHome) {
      env.JAVA_HOME = proj.javaHome
      extraPaths.push(join(proj.javaHome, 'bin'))
    }
    if (proj.mavenHome) {
      env.MAVEN_HOME = proj.mavenHome
      extraPaths.push(join(proj.mavenHome, 'bin'))
    }
    if (proj.tomcatHome) {
      env.CATALINA_HOME = proj.tomcatHome
      env.JRE_HOME = proj.javaHome || process.env.JAVA_HOME || ''
    }

    if (extraPaths.length > 0) {
      env.PATH = [...extraPaths, process.env.PATH].join(';')
    }

    return Object.keys(env).length > 0 ? env : undefined
  }

  private dirSizeStr(dirPath: string): string {
    let total = 0
    try {
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name)
          if (entry.isFile()) {
            try {
              total += statSync(full).size
            } catch {
              // ignore
            }
          } else if (entry.isDirectory()) {
            walk(full)
          }
        }
      }
      walk(dirPath)
    } catch {
      // ignore
    }
    if (total < 1024 * 1024) return `${(total / 1024).toFixed(0)} KB`
    return `${(total / (1024 * 1024)).toFixed(1)} MB`
  }
  // #endregion
}
