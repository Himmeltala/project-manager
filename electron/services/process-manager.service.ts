import { spawn, execSync, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

export class ProcessManager extends EventEmitter {
  private running = new Map<number, ManagedProcess>()
  private allRunning = new Map<string, ManagedProcess>()
  private projectTasks = new Map<string, ManagedProcess[]>()
  private readonly protectedPorts: Set<number>
  private static readonly HARD_PROTECTED_PORTS = new Set([135, 445, 3389])

  constructor(protectedPorts: Set<number> = new Set()) {
    super()
    this.protectedPorts = new Set([...ProcessManager.HARD_PROTECTED_PORTS, ...protectedPorts])
  }

  spawnProc(command: string, cwd: string, extraEnv?: Record<string, string>): ManagedProcess {
    const env = extraEnv ? { ...process.env, ...extraEnv } : undefined
    const proc = spawn(command, [], { shell: true, cwd, env, windowsHide: true })
    const mp: ManagedProcess = {
      proc,
      name: require('path').basename(cwd),
      path: cwd,
      port: null,
      pid: proc.pid || 0,
    }
    return mp
  }

  startOutputThread(mp: ManagedProcess, onLine: (line: string) => void, onPort: (port: number) => void): void {
    // 首行探测后锁定编码，避免每行重复探测
    let detectedEncoding: string | null = null
    let systemEncoding = 'gbk'
    try {
      const chcpOut = require('child_process').execSync('chcp', { encoding: 'utf8', windowsHide: true, timeout: 2000 })
      systemEncoding = chcpOut.includes('936') ? 'gbk' : 'utf-8'
    } catch {
      /* 默认 gbk */
    }

    // 逐行读取
    const readStream = (stream: NodeJS.ReadableStream | null) => {
      if (!stream) return
      let leftover = Buffer.alloc(0)

      stream.on('data', (chunk: Buffer) => {
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

          // 解码：首行 UTF-8 试探，含替换字符则改用系统编码
          let line: string
          if (detectedEncoding !== null) {
            line = trimmed.toString(detectedEncoding as BufferEncoding)
          } else {
            line = trimmed.toString('utf-8')
            if (line.includes('�')) {
              line = trimmed.toString(systemEncoding as BufferEncoding)
              detectedEncoding = systemEncoding
            } else {
              detectedEncoding = 'utf-8'
            }
          }

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
          const tail = detectedEncoding
            ? leftover.toString(detectedEncoding as BufferEncoding)
            : leftover.toString('utf-8')
          const clean = tail.replace(/\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
          if (clean && !/terminate batch job/i.test(clean)) onLine(clean)
        }
      })
    }

    readStream(mp.proc.stdout)
    readStream(mp.proc.stderr)
  }

  terminate(mp: ManagedProcess, onDone?: () => void): void {
    const proc = mp.proc
    if (proc.exitCode !== null) {
      onDone?.()
      return
    }
    const pid = mp.pid
    const exec = require('child_process').exec

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

    try {
      const result = execSync(`netstat -ano | findstr :${port}`, {
        encoding: 'gbk',
        timeout: 15000,
      })
      const pids = new Set<string>()
      for (const line of result.split('\n')) {
        const tokens = line.trim().split(/\s+/)
        if (tokens.length >= 5 && tokens[1].includes(`:${port}`)) {
          pids.add(tokens[tokens.length - 1])
        }
      }
      for (const pid of pids) {
        execSync(`taskkill /PID ${pid} /F`, { timeout: 5000 })
      }
      return pids.size > 0
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

  getRunning(): Map<number, ManagedProcess> {
    return this.running
  }

  getAllRunning(): Map<string, ManagedProcess> {
    return this.allRunning
  }

  setRunning(idx: number, mp: ManagedProcess): void {
    this.running.set(idx, mp)
    this.allRunning.set(mp.path, mp)
  }

  deleteRunning(idx: number): void {
    const mp = this.running.get(idx)
    if (mp) {
      this.running.delete(idx)
      if (this.allRunning.get(mp.path) === mp) {
        this.allRunning.delete(mp.path)
      }
    }
  }

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
}

export interface ManagedProcess {
  proc: ChildProcess
  name: string
  path: string
  port: number | null
  pid: number
  thread?: NodeJS.Timeout
}
