/*
 * @Author: zhengrenfu
 * @Date: 2026-07-20
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-20
 * @FilePath: \electron\services\process-manager.service.ts
 * @Description: 子进程管理服务
 */
import { spawn, execSync, execFileSync, exec, type ChildProcess } from 'child_process'
import { basename } from 'path'
import { EventEmitter } from 'events'
import * as iconv from 'iconv-lite'

export interface PortProcessInfo {
  pid: number
  protocol: string
  localAddress: string
  state: string
}

/** 系统保留端口，不允许杀 */
const HARD_PROTECTED_PORTS = new Set([135, 445, 3389])

export class ProcessManager extends EventEmitter {
  // #region Init
  private projectTasks = new Map<string, ManagedProcess[]>()
  private readonly protectedPorts: Set<number>
  /** 系统编码缓存，启动时检测一次即可 */
  private static systemEncoding: string | null = null

  constructor(protectedPorts: Set<number> = new Set()) {
    super()
    this.protectedPorts = new Set([...HARD_PROTECTED_PORTS, ...protectedPorts])
  }

  /** 获取系统编码（带缓存） */
  private static getSystemEncoding(): string {
    if (ProcessManager.systemEncoding) return ProcessManager.systemEncoding
    try {
      const chcpOut = execSync('chcp', { encoding: 'utf8', windowsHide: true, timeout: 2000 })
      ProcessManager.systemEncoding = chcpOut.includes('936') ? 'gbk' : 'utf-8'
    } catch {
      ProcessManager.systemEncoding = 'gbk'
    }
    return ProcessManager.systemEncoding
  }
  // #endregion

  spawnProc(command: string, cwd: string, extraEnv?: Record<string, string>): ManagedProcess {
    const env = extraEnv ? { ...process.env, ...extraEnv } : undefined
    const proc = spawn(command, [], { shell: true, cwd, env, windowsHide: true })
    const mp: ManagedProcess = {
      proc,
      name: basename(cwd),
      path: cwd,
      port: null,
      pid: proc.pid || 0,
    }
    return mp
  }

  startOutputThread(mp: ManagedProcess, onLine: (line: string) => void, onPort: (port: number) => void): void {
    console.log('[DEBUG outputThread] START pid:', mp.proc.pid, 'name:', mp.name)
    const systemEncoding = ProcessManager.getSystemEncoding()

    // 逐行读取
    const readStream = (stream: NodeJS.ReadableStream | null) => {
      if (!stream) return
      let leftover = Buffer.alloc(0)

      stream.on('data', (chunk: Buffer) => {
        console.log('[DEBUG outputThread] data chunk len:', chunk.length, 'pid:', mp.proc.pid)
        leftover = Buffer.concat([leftover, chunk])
        while (true) {
          const nlIndex = leftover.indexOf(10) // \n
          if (nlIndex === -1) break
          const lineBytes = leftover.subarray(0, nlIndex)
          // 处理 \r\n 中的 \r
          const trimmed =
            lineBytes.length > 0 && lineBytes[lineBytes.length - 1] === 13
              ? lineBytes.subarray(0, lineBytes.length - 1)
              : lineBytes
          leftover = leftover.subarray(nlIndex + 1)

          if (trimmed.length === 0) continue

          // 解码：直接用系统检测到的编码（chcp 936→GBK, 65001→UTF-8）
          const line = iconv.decode(trimmed, systemEncoding)

          // 去掉 ANSI 转义序列
          const cleanLine = line
            .replace(/\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
            .replace(/\r$/, '')

          // 过滤 cmd.exe "Terminate batch job" 乱码
          if (/terminate batch job/i.test(cleanLine)) continue

          onLine(cleanLine)

          if (mp.port === null) {
            const port = this.detectPort(cleanLine)
            if (port) {
              mp.port = port
              onPort(port)
            }
          }
        }
      })

      stream.on('end', () => {
        // 处理最后一行
        if (leftover.length > 0) {
          const tail = iconv.decode(leftover, systemEncoding)
          const clean = tail.replace(/\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
          if (clean && !/terminate batch job/i.test(clean)) onLine(clean)
        }
      })
    }

    readStream(mp.proc.stdout)
    readStream(mp.proc.stderr)
  }
  // #endregion

  // #region Process Lifecycle
  terminate(mp: ManagedProcess, onDone?: () => void): void {
    const proc = mp.proc
    if (proc.exitCode !== null) {
      onDone?.()
      return
    }
    const pid = mp.pid

    // 在后台线程逐步终止进程，不阻塞主线程
    setImmediate(() => {
      // Step 1: Ctrl+C 优雅关闭 — 先发 WM_CLOSE (taskkill 不加 /F)
      exec(`taskkill /PID ${pid}`, { timeout: 3000, windowsHide: true }, () => {
        // Step 2: 等一会看进程是否已退出
        const checkExit = (tries = 0) => {
          if (proc.exitCode !== null) {
            onDone?.()
            return
          }
          if (tries >= 8) {
            // Step 3: 超时，强杀进程树
            exec(`taskkill /F /T /PID ${pid}`, { timeout: 3000, windowsHide: true }, () => {
              try {
                proc.kill('SIGKILL')
              } catch {}
              onDone?.()
            })
            return
          }
          setTimeout(() => checkExit(tries + 1), 250)
        }
        checkExit()
      })
    })
  }

  killPort(port: number): boolean {
    if (port <= 0 || port > 65535) return false
    if (this.protectedPorts.has(port)) return false

    const processes = this.listByPort(port)
    if (processes.length === 0) return false

    let killedAny = false
    const seen = new Set<number>()
    for (const p of processes) {
      if (seen.has(p.pid)) continue
      seen.add(p.pid)
      try {
        execSync(`taskkill /PID ${p.pid} /F`, { timeout: 5000, stdio: 'pipe' })
        killedAny = true
      } catch {
        // 进程可能已结束或无权限，不影响继续杀其他进程
      }
    }
    return killedAny
  }
  // #endregion

  // #region Query
  /**
   * 查询端口占用的进程列表
   */
  listByPort(port: number): PortProcessInfo[] {
    if (port <= 0 || port > 65535) return []

    let raw = ''
    try {
      raw = execFileSync('netstat', ['-ano'], { encoding: 'utf8', timeout: 15000 })
    } catch {
      return []
    }

    const portStr = `:${port}`
    const list: PortProcessInfo[] = []
    const seen = new Set<number>()
    for (const line of raw.split('\n')) {
      const tokens = line.trim().split(/\s+/)
      // TCP: 5+ 列 (Proto Local Foreign State PID), UDP: 4 列 (无 State)
      if (tokens.length < 4) continue
      const localAddr = tokens[1]
      if (!localAddr.endsWith(portStr)) continue
      const pid = parseInt(tokens[tokens.length - 1], 10)
      if (isNaN(pid) || seen.has(pid)) continue
      seen.add(pid)
      list.push({
        pid,
        protocol: tokens[0],
        localAddress: localAddr,
        state: tokens.length >= 5 ? tokens[3] : '-',
      })
    }
    return list
  }

  /**
   * 按 PID 终止进程
   */
  killPid(pid: number): boolean {
    if (pid <= 0) return false
    try {
      execSync(`taskkill /PID ${pid} /F`, { timeout: 5000 })
      return true
    } catch {
      return false
    }
  }

  private detectPort(line: string): number | null {
    const patterns = [
      /(?:localhost|127\.0\.0\.1|0\.0\.0\.0)[:\s]+(\d{4,5})/i,
      /port(?:\(s\))?\s*[:=]?\s*(\d{4,5})/i,
      /nio\d*-(\d{4,5})\b/,
      /:{2,}(\d{4,5})/,
    ]
    for (const re of patterns) {
      const m = re.exec(line)
      if (m) {
        const port = parseInt(m[1], 10)
        if (port >= 1024 && port <= 65535) return port
      }
    }
    return null
  }
  // #endregion

  // #region Running State
  cleanProjectTasks(path: string): void {
    this.projectTasks.delete(path)
  }

  addProjectTask(path: string, mp: ManagedProcess): void {
    const tasks = this.projectTasks.get(path) || []
    tasks.push(mp)
    this.projectTasks.set(path, tasks)
  }

  removeProjectTask(path: string, mp: ManagedProcess): void {
    const tasks = this.projectTasks.get(path) || []
    const filtered = tasks.filter((t) => t !== mp)
    if (filtered.length === 0) {
      this.projectTasks.delete(path)
    } else {
      this.projectTasks.set(path, filtered)
    }
  }

  getProjectTasks(path: string): ManagedProcess[] {
    return this.projectTasks.get(path) || []
  }

  /**
   * 获取全部项目的运行脚本，按项目路径分组
   * @returns 路径到脚本进程列表的映射
   */
  getAllProjectTasks(): Record<string, ManagedProcess[]> {
    const result: Record<string, ManagedProcess[]> = {}
    for (const [path, tasks] of this.projectTasks) {
      if (tasks.length > 0) result[path] = tasks
    }
    return result
  }
  // #endregion
}

export interface ManagedProcess {
  proc: ChildProcess
  name: string
  path: string
  port: number | null
  pid: number
  command?: string
  thread?: NodeJS.Timeout
}
