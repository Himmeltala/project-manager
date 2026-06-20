import { existsSync } from 'fs'
import { join, basename, dirname } from 'path'
import { EventEmitter } from 'events'
import { execSync, exec, spawn } from 'child_process'

// 非阻塞版 exec，不卡 UI。自动检测编码，始终 resolve（不 reject）
function execAsync(cmd: string, opts: any = {}): Promise<{ text: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    exec(cmd, { ...opts, windowsHide: true, encoding: 'buffer' }, (err, stdout: Buffer, stderr: Buffer) => {
      // 编码解码（统一处理，无论 err 与否）
      const decode = (buf: Buffer): string => {
        let t = buf.toString('utf-8')
        if (t.includes('�')) {
          try {
            const cp = require('child_process').execSync('chcp', { encoding: 'utf8', windowsHide: true, timeout: 1000 })
            t = buf.toString((cp.includes('936') ? 'gbk' : 'latin1') as BufferEncoding)
          } catch {
            /* keep utf-8 */
          }
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
        try {
          const cp = execSync('chcp', { encoding: 'utf8', windowsHide: true, timeout: 1000 })
          t = buf.toString((cp.includes('936') ? 'gbk' : 'latin1') as BufferEncoding)
          t = t.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
        } catch {
          /* keep utf-8 */
        }
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
import type { Project } from '../../src/types/project'
import type { BuildArtifact, DependencyDir, TaskInfo } from '../../src/types/project'
import type { RunningInfo, ScriptTask, MigrationParams } from '../../src/types/process'
import type { ManagedProcess } from './process-manager.service'
import { ProcessManager } from './process-manager.service'
import { ProjectRepository } from './project.service'
import { getProfile, resolveStartCommand, readPomFinalName } from './project-type.service'
import { projectTypeRegistry } from './project-type/index'
import { vcsRegistry } from './vcs/index'

export class ProjectManagerService extends EventEmitter {
  private processMgr: ProcessManager
  projects: Project[] = []
  private running: Map<number, ManagedProcess> = new Map()
  private allRunning: Map<string, ManagedProcess> = new Map()

  constructor(processMgr: ProcessManager) {
    super()
    this.processMgr = processMgr
  }

  refreshProjects(newProjects: Project[]): void {
    this.projects = [...newProjects]
    // Preserve running state by path
    const oldRunning = new Map(this.running)
    this.running.clear()
    for (let newIdx = 0; newIdx < this.projects.length; newIdx++) {
      const proj = this.projects[newIdx]
      if (this.allRunning.has(proj.path)) {
        this.running.set(newIdx + 1, this.allRunning.get(proj.path)!)
      } else if (oldRunning.has(newIdx + 1)) {
        const mp = oldRunning.get(newIdx + 1)!
        this.running.set(newIdx + 1, mp)
        this.allRunning.set(proj.path, mp)
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
    return this.running.has(idx)
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

  getRunningScripts(idx: number): ScriptTask[] {
    const proj = this.getProjectByIndex(idx)
    if (!proj) return []
    const tasks = this.processMgr.getProjectTasks(proj.path)
    return tasks.map((t) => ({ command: t.command || '' }))
  }

  getRunningScriptsByPath(path: string): string[] {
    return this.processMgr.getProjectTasks(path).map((t) => t.command || '')
  }

  getTotalScriptsCount(): number {
    let count = 0
    for (const proj of this.projects) {
      count += this.processMgr.getProjectTasks(proj.path).length
    }
    return count
  }

  async start(idx: number, command?: string, report?: (msg: string, pct?: number) => void): Promise<boolean> {
    const proj = this.getProjectByIndex(idx)
    if (!proj) return false
    if (this.running.has(idx)) return false
    if (!existsSync(proj.path)) return false

    const cmd = command || resolveStartCommand(proj.projectType, proj.path)

    if (proj.tomcatHome && proj.projectType === 'maven') {
      return this.startWithTomcat(idx, proj, cmd, report)
    }

    const extraEnv = this.makeBuildEnv(proj)
    const mp = this.processMgr.spawnProc(cmd, proj.path, extraEnv)
    mp.name = proj.name

    this.running.set(idx, mp)
    this.allRunning.set(proj.path, mp)

    this.processMgr.startOutputThread(
      mp,
      (line) => {
        this.emit('outputLine', { index: idx, name: proj.name, line })
      },
      (port) => {
        mp.port = port
        this.emit('portDetected', { index: idx, port })
      },
    )

    mp.proc.on('exit', () => {
      if (this.running.get(idx) === mp) {
        this.running.delete(idx)
      }
      if (this.allRunning.get(proj.path) === mp) {
        this.allRunning.delete(proj.path)
      }
      this.emit('projectStopped', { index: idx, name: proj.name })
    })

    this.emit('projectStarted', { index: idx, name: proj.name })
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

    this.running.set(idx, buildMp)
    this.allRunning.set(proj.path, buildMp)

    this.processMgr.startOutputThread(
      buildMp,
      (line) => this.emit('outputLine', { index: idx, name: proj.name, line }),
      () => {},
    )

    return new Promise((resolve) => {
      buildMp.proc.on('exit', (code) => {
        this.running.delete(idx)
        this.allRunning.delete(proj.path)

        if (code !== 0) {
          this.emit('projectStopped', { index: idx, name: proj.name })
          resolve(false)
          return
        }

        const warName = proj.tomcatWarName || readPomFinalName(proj.path) || proj.name
        const warFile = join(proj.path, 'target', `${warName}.war`)
        const tomcatWebapps = join(proj.tomcatHome, 'webapps')
        const destWar = join(tomcatWebapps, `${warName}.war`)

        if (!existsSync(warFile)) {
          this.emit('projectStopped', { index: idx, name: proj.name })
          resolve(false)
          return
        }

        try {
          const fs = require('fs')
          fs.copyFileSync(warFile, destWar)
        } catch {
          this.emit('projectStopped', { index: idx, name: proj.name })
          resolve(false)
          return
        }

        const catalina = join(proj.tomcatHome, 'bin', 'catalina.bat')
        if (!existsSync(catalina)) {
          this.emit('projectStopped', { index: idx, name: proj.name })
          resolve(false)
          return
        }

        const tomcatCmd = `"${catalina}" run`
        const tomcatMp = this.processMgr.spawnProc(tomcatCmd, proj.path, extraEnv)
        tomcatMp.name = proj.name

        this.running.set(idx, tomcatMp)
        this.allRunning.set(proj.path, tomcatMp)

        this.processMgr.startOutputThread(
          tomcatMp,
          (line) => this.emit('outputLine', { index: idx, name: proj.name, line }),
          (port) => {
            tomcatMp.port = port
            this.emit('portDetected', { index: idx, port })
          },
        )

        tomcatMp.proc.on('exit', () => {
          if (this.running.get(idx) === tomcatMp) this.running.delete(idx)
          if (this.allRunning.get(proj.path) === tomcatMp) this.allRunning.delete(proj.path)
          this.emit('projectStopped', { index: idx, name: proj.name })
        })

        this.emit('projectStarted', { index: idx, name: proj.name })
        resolve(true)
      })
    })
  }

  async stop(idx: number): Promise<boolean> {
    const mp = this.running.get(idx)
    if (!mp) return false

    const proj = this.getProjectByIndex(idx)
    const name = mp.name
    const path = proj?.path || mp.path
    const port = mp.port

    // 立即从运行列表移除，UI 即时反映停止状态
    this.running.delete(idx)
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

    return true
  }

  async stopScript(idx: number, command: string): Promise<boolean> {
    const proj = this.getProjectByIndex(idx)
    if (!proj) return false

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
        const fs = require('fs')
        fs.rmSync(path, { recursive: true, force: true })
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

  openFolder(path: string): void {
    const { exec } = require('child_process')
    exec(`explorer "${path}"`)
  }

  async buildProject(
    idx: number,
    command?: string,
    zipName?: string,
    report?: (msg: string, pct?: number) => void,
  ): Promise<boolean> {
    const proj = this.getProjectByIndex(idx)
    if (!proj || !existsSync(proj.path)) return false

    const profile = getProfile(proj.projectType)
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
    if (exitCode !== 0 && !text.trim()) {
      throw new Error('构建失败')
    }
    report('构建成功，正在压缩产物目录...', 60)
    if (!existsSync(outputDir)) throw new Error('未找到产物目录')
    await this.zipDist(proj.name, proj.path, outputDir, zipName)
    report(`构建并压缩完成: ${proj.name}`, 100)
    return true
  }

  private async zipDist(name: string, projectPath: string, distDir: string, customZipName?: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 14)
    const safeName = customZipName ? customZipName.replace(/[ /\\]/g, '_') : name.replace(/[ /\\]/g, '_')

    const baseName = customZipName ? safeName : `${basename(distDir)}-${safeName}`
    const zipPath = join(projectPath, `${baseName}-${timestamp}.zip`)

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

    const profile = getProfile(proj.projectType)
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
      const fs = require('fs')
      for (const f of fs.readdirSync(proj.path)) {
        if (f.endsWith('.zip')) {
          const fullPath = join(proj.path, f)
          const sizeMb = fs.statSync(fullPath).size / (1024 * 1024)
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

  cleanArtifacts(idx: number, itemPaths: string[]): number {
    const fs = require('fs')
    let deleted = 0
    for (const fullPath of itemPaths) {
      try {
        if (fs.statSync(fullPath).isDirectory()) {
          execSync(`rmdir /s /q "${fullPath}"`, { windowsHide: true })
        } else {
          fs.unlinkSync(fullPath)
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

    const profile = getProfile(proj.projectType)
    const result: DependencyDir[] = []
    for (const dirName of profile.cleanDirs) {
      const full = join(proj.path, dirName)
      if (existsSync(full)) {
        result.push({ name: dirName, path: full })
      }
    }
    return result
  }

  cleanDependencies(idx: number): boolean {
    const proj = this.getProjectByIndex(idx)
    if (!proj) return false

    const profile = getProfile(proj.projectType)
    let allOk = true
    for (const dirName of profile.cleanDirs) {
      const full = join(proj.path, dirName)
      if (!existsSync(full)) continue
      try {
        execSync(`rmdir /s /q "${full}"`, { windowsHide: true, timeout: 60000 })
      } catch {
        try {
          const fs = require('fs')
          fs.rmSync(full, { recursive: true, force: true })
        } catch {
          allOk = false
        }
      }
    }
    return allOk
  }

  getTaskList(idx: number): TaskInfo | null {
    const proj = this.getProjectByIndex(idx)
    if (!proj) return null

    const provider = projectTypeRegistry.get(proj.projectType)
    if (provider?.getTaskList) {
      return provider.getTaskList(proj.path)
    }

    return null
  }

  async runScript(idx: number, command: string): Promise<boolean> {
    const proj = this.getProjectByIndex(idx)
    if (!proj || !existsSync(proj.path)) return false

    const extraEnv = this.makeBuildEnv(proj)
    const mp = this.processMgr.spawnProc(command, proj.path, extraEnv)
    mp.name = proj.name
    mp.command = command

    this.processMgr.addProjectTask(proj.path, mp)

    this.processMgr.startOutputThread(
      mp,
      (line) => this.emit('outputLine', { index: idx, name: proj.name, line }),
      () => {},
    )

    mp.proc.on('exit', () => {
      this.processMgr.removeProjectTask(proj.path, mp)
    })

    return true
  }

  async runTask(idx: number, command: string): Promise<boolean> {
    const proj = this.getProjectByIndex(idx)
    if (!proj || !existsSync(proj.path)) return false

    const extraEnv = this.makeBuildEnv(proj)
    const mp = this.processMgr.spawnProc(command, proj.path, extraEnv)
    mp.name = proj.name

    this.processMgr.startOutputThread(
      mp,
      (line) => this.emit('outputLine', { index: idx, name: proj.name, line }),
      () => {},
    )

    return true
  }

  async vcsUpdate(idx: number): Promise<'ok' | 'conflict' | 'error'> {
    const proj = this.getProjectByIndex(idx)
    if (!proj) return 'error'

    const vcs = vcsRegistry.detect(proj.path)
    if (!vcs) return 'error'

    const result = await vcs.update(proj.path)
    if (result.text) {
      this.emit('outputLine', { index: idx, name: proj.name, line: result.text })
    }
    return result.status
  }

  async vcsUpdateRange(startIdx: number, endIdx: number): Promise<{ ok: number; conflicts: number; errors: number }> {
    let ok = 0
    let conflicts = 0
    let errors = 0
    for (let i = startIdx; i <= endIdx; i++) {
      const result = await this.vcsUpdate(i + 1)
      if (result === 'ok') ok++
      else if (result === 'conflict') conflicts++
      else errors++
    }
    return { ok, conflicts, errors }
  }

  async vcsLog(idx: number, limit = 20): Promise<'ok' | 'error'> {
    const proj = this.getProjectByIndex(idx)
    if (!proj) return 'error'

    const vcs = vcsRegistry.detect(proj.path)
    if (!vcs) return 'error'

    await vcs.log(proj.path, limit)
    return 'ok'
  }

  async getVcsInfo(idx: number): Promise<{ url?: string; root?: string; relativeUrl?: string } | null> {
    const proj = this.getProjectByIndex(idx)
    if (!proj) return null

    const vcs = vcsRegistry.detect(proj.path)
    if (!vcs) return null

    return vcs.getInfo(proj.path)
  }

  async migrateProject(idx: number, params: MigrationParams): Promise<boolean> {
    const proj = this.getProjectByIndex(idx)
    if (!proj) return false

    const { mode, targetDir, svnUrl } = params

    if (mode === 'svn') {
      if (!svnUrl) return false
      try {
        const fs = require('fs')
        fs.mkdirSync(dirname(targetDir), { recursive: true })
        await execAsync(`svn checkout "${svnUrl}" "${targetDir}"`, { encoding: 'gbk', timeout: 300000 })
        return true
      } catch {
        return false
      }
    }

    if (mode === 'git') {
      if (!svnUrl) return false
      try {
        const fs = require('fs')
        fs.mkdirSync(dirname(targetDir), { recursive: true })
        await execAsync(`git clone "${svnUrl}" "${targetDir}"`, { timeout: 300000 })
        return true
      } catch {
        return false
      }
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
        const fs = require('fs')
        const path = require('path')

        const copyRecursive = (src: string, dest: string) => {
          fs.mkdirSync(dest, { recursive: true })
          for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
            if (ignorePatterns.some((p) => entry.name.toLowerCase().includes(p.replace('*', '').toLowerCase())))
              continue
            const srcPath = join(src, entry.name)
            const destPath = join(dest, entry.name)
            if (entry.isDirectory()) {
              copyRecursive(srcPath, destPath)
            } else {
              fs.copyFileSync(srcPath, destPath)
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
      const fs = require('fs')
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name)
          if (entry.isFile()) {
            try {
              total += fs.statSync(full).size
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
}
