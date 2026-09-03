/*
 * @Author: zhengrenfu
 * @Date: 2026-09-03
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-09-03
 * @FilePath: \electron\services\version-control\spawn-stream.ts
 * @Description: 子进程流式执行辅助，输出按行实时回调，供 SVN 与 Git 提供者复用
 */
import { execSync, spawn } from 'child_process'
import * as iconv from 'iconv-lite'

/* chcp 代码页探测的超时毫秒数 */
const CHCP_PROBE_TIMEOUT = 1000
/* 简体中文 Windows 控制台的代码页编号 */
const GBK_CODEPAGE = '936'
/* utf-8 解码失败时出现的替换字符 */
const REPLACEMENT_CHAR = '�'

/* 流式执行命令的选项 */
export interface SpawnStreamOptions {
  /* 可执行文件路径或命令名 */
  command: string
  /* 命令参数，按数组原样透传，不经 shell 拼接 */
  args?: string[]
  /* 工作目录，缺省时沿用主进程当前目录 */
  cwd?: string
  /* 超时毫秒数，超时后强制结束子进程 */
  timeout?: number
  /* 输出行回调，stdout 与 stderr 按到达顺序逐行回调，行尾符已拆分 */
  onLine?: (line: string) => void
}

/* 流式执行命令的结果 */
export interface SpawnStreamResult {
  /* 是否正常退出（退出码为 0） */
  ok: boolean
  /* stdout 完整文本，utf-8 解码失败时按 chcp 探测结果回退 */
  stdout: string
  /* stderr 完整文本，解码规则与 stdout 一致 */
  stderr: string
}

/* 输出解码器：单次执行内 chcp 只探测一次，探测成功后在后续分块上按对应编码解码 */
class OutputDecoder {
  private codepage: string | null = null
  private probed = false

  /* 通过 chcp 探测控制台代码页，仅执行一次 */
  private probeCodepage(): void {
    if (this.probed) return
    this.probed = true
    try {
      const cp = execSync('chcp', { encoding: 'utf8', windowsHide: true, timeout: CHCP_PROBE_TIMEOUT })
      // Node Buffer 不支持 gbk，探测到中文代码页后改用 iconv-lite 解码
      this.codepage = cp.includes(GBK_CODEPAGE) ? 'gbk' : 'latin1'
    } catch {
      /* 探测失败时保持 utf-8 解码 */
    }
  }

  /* 解码一段缓冲区：utf-8 解码出现替换字符时按探测结果重新解码 */
  decode(buf: Buffer): string {
    const utf8Text = buf.toString('utf-8')
    if (!utf8Text.includes(REPLACEMENT_CHAR)) return utf8Text
    this.probeCodepage()
    return this.codepage ? iconv.decode(buf, this.codepage) : utf8Text
  }
}

/* 行拆分器：兼容换行符、回车符与回车换行三种行尾，进度帧就地刷新时按回车拆行 */
class LineSplitter {
  private rest = ''

  /* 喂入解码后的文本，把完整行逐个交给回调处理 */
  feed(text: string, emit: (line: string) => void): void {
    this.rest += text
    let start = 0
    let index = 0
    while (index < this.rest.length) {
      const ch = this.rest[index]
      if (ch === '\r' || ch === '\n') {
        emit(this.rest.slice(start, index))
        if (ch === '\r' && this.rest[index + 1] === '\n') index++
        index++
        start = index
      } else {
        index++
      }
    }
    this.rest = this.rest.slice(start)
  }

  /* 结束时把未换行的残行作为最后一行交给回调 */
  flush(emit: (line: string) => void): void {
    if (this.rest) {
      emit(this.rest)
      this.rest = ''
    }
  }
}

/**
 * 以流式方式执行子进程命令，stdout 与 stderr 接管道实时按行回调
 * 同时收集完整输出文本；超时到达后强制结束子进程，与 exec 的超时行为一致
 * @param {SpawnStreamOptions} options 执行选项
 * @returns {Promise<SpawnStreamResult>} 退出状态与完整输出
 */
export function runSpawnStream(options: SpawnStreamOptions): Promise<SpawnStreamResult> {
  const { command, args = [], cwd, timeout, onLine } = options
  return new Promise((resolve) => {
    const decoder = new OutputDecoder()
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    const stdoutSplitter = new LineSplitter()
    const stderrSplitter = new LineSplitter()
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    /* 统一结算：清空残行后按退出码产出结果，保证只 resolve 一次 */
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (onLine) {
        stdoutSplitter.flush(onLine)
        stderrSplitter.flush(onLine)
      }
      const stdoutBuf = Buffer.concat(stdoutChunks)
      const stderrBuf = Buffer.concat(stderrChunks)
      resolve({ ok, stdout: decoder.decode(stdoutBuf), stderr: decoder.decode(stderrBuf) })
    }

    const child = spawn(command, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk)
      if (onLine) stdoutSplitter.feed(decoder.decode(chunk), onLine)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk)
      if (onLine) stderrSplitter.feed(decoder.decode(chunk), onLine)
    })
    child.on('error', () => finish(false))
    child.on('close', (code) => finish(code === 0))

    // 超时后结束子进程，代码为 null 的退出会被判定为失败
    if (timeout) {
      timer = setTimeout(() => {
        if (!settled) child.kill()
      }, timeout)
    }
  })
}
