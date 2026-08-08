/*
 * @Author: zhengrenfu
 * @Date: 2026-07-20
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-20
 * @FilePath: \electron\services\update.service.ts
 * @Description: 更新检查与下载服务
 */
import { EventEmitter } from 'events'
import { mkdirSync, createWriteStream } from 'fs'
import { join } from 'path'
import { get } from 'https'
import { request as httpGet } from 'http'
import { URL } from 'url'
import { tmpdir } from 'os'
import { execFile } from 'child_process'
import { app } from 'electron'

export class UpdateService extends EventEmitter {
  private updateUrl: string

  constructor(updateUrl: string = '') {
    super()
    this.updateUrl = updateUrl.replace(/\/+$/, '')
  }

  startupCheck(settings: { get: (key: string, defaultVal?: any) => any; set: (key: string, val: any) => void }): void {
    if (!this.updateUrl) return

    const updateType = settings.get('update.type', '每次启动')
    if (updateType === '手动检查') return

    const now = Date.now()
    if (updateType === '每次启动') {
      settings.set('update.last_check', now)
      this.checkUpdateAsync()
      return
    }

    const intervalMinutes = this.getIntervalMinutes(settings)
    if (intervalMinutes === null) return
    const lastCheck = settings.get('update.last_check', 0)
    if (now - lastCheck >= intervalMinutes * 60 * 1000) {
      settings.set('update.last_check', now)
      this.checkUpdateAsync()
    }
  }

  getIntervalMinutes(settings: { get: (key: string, defaultVal?: any) => any }): number | null {
    const updateType = settings.get('update.type', '每次启动')
    if (updateType === '手动检查' || updateType === '每次启动') return null

    const freq = settings.get('update.frequency', '每天')
    const freqMap: Record<string, number> = {
      每天: 1440,
      每三天: 4320,
      每周: 10080,
      每月: 43200,
    }
    if (freq === '自定义') {
      return Math.max(1440, Math.min(43200, settings.get('update.custom_minutes', 1440)))
    }
    return freqMap[freq] || 1440
  }

  async checkUpdate(): Promise<{ url: string; filename: string } | null> {
    if (!this.updateUrl) return null

    const files = await this.fetchFileList()
    if (files && files.length > 0) {
      const setupFile = files.find((f: any) => f.name?.endsWith('.exe') && f.name.includes('Setup'))
      if (setupFile) {
        return { url: `${this.updateUrl}/${encodeURIComponent(setupFile.name)}`, filename: setupFile.name }
      }
      const zipFile = files.find((f: any) => f.name?.endsWith('.zip'))
      if (zipFile) {
        return { url: `${this.updateUrl}/${encodeURIComponent(zipFile.name)}`, filename: zipFile.name }
      }
    }

    const candidates = ['项目管理器-Setup.exe', '项目管理器.zip']
    for (const filename of candidates) {
      const fileUrl = `${this.updateUrl}/${encodeURIComponent(filename)}`
      try {
        const ok = await this.headRequest(fileUrl)
        if (ok) return { url: fileUrl, filename }
      } catch {
        continue
      }
    }
    return null
  }

  checkUpdateAsync(): void {
    this.checkUpdate()
      .then((info) => {
        if (info) {
          this.emit('updateAvailable', info)
        } else {
          this.emit('updateNotFound')
        }
      })
      .catch((err) => {
        this.emit('updateCheckError', err.message)
      })
  }

  async downloadWithReport(
    info: { url: string; filename: string },
    report: (msg: string, pct?: number) => void,
  ): Promise<string> {
    const tmpDir = join(tmpdir(), '项目管理器更新')
    mkdirSync(tmpDir, { recursive: true })
    const destPath = join(tmpDir, info.filename)

    report('正在连接下载服务器...', 0)

    const { total, downloaded } = await this.downloadFile(info.url, destPath, (pct, msg) => {
      report(msg, pct)
    })

    if (total > 0) {
      report(`下载完成: ${(downloaded / 1024 / 1024).toFixed(1)} MB`, 100)
    } else {
      report('下载完成', 100)
    }

    this.emit('updateDownloaded', destPath)
    return destPath
  }

  /**
   * 安装更新包（调用安装程序并退出应用）
   * @param filePath 安装包路径
   */
  installUpdate(filePath: string): void {
    execFile(filePath, [], (err: any) => {
      if (!err) app.quit()
    })
  }

  private fetchFileList(): Promise<any[]> {
    return new Promise((resolve) => {
      const url = `${this.updateUrl}/files`
      const handler = url.startsWith('https') ? get : httpGet
      const req = handler(
        url,
        { method: 'GET', timeout: 5000, headers: { 'User-Agent': 'ProjectManager-UpdateChecker' } },
        (res) => {
          let data = ''
          res.on('data', (chunk) => (data += chunk))
          res.on('end', () => {
            try {
              resolve(JSON.parse(data))
            } catch {
              resolve([])
            }
          })
        },
      )
      req.on('error', () => resolve([]))
      req.on('timeout', () => {
        req.destroy()
        resolve([])
      })
    })
  }

  private headRequest(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const parsed = new URL(url)
      const handler = parsed.protocol === 'https:' ? get : httpGet
      const req = handler(
        url,
        { method: 'HEAD', timeout: 5000, headers: { 'User-Agent': 'ProjectManager-UpdateChecker' } },
        (res) => resolve(res.statusCode === 200),
      )
      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })
    })
  }

  private downloadFile(
    url: string,
    dest: string,
    onProgress: (pct: number, msg: string) => void,
  ): Promise<{ total: number; downloaded: number }> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url)
      const handler = parsed.protocol === 'https:' ? get : httpGet
      const file = createWriteStream(dest)
      let downloaded = 0
      let total = 0
      let lastPct = -1

      handler(url, { timeout: 600000, headers: { 'User-Agent': 'ProjectManager-UpdateDownloader' } }, (res) => {
        total = parseInt(res.headers['content-length'] || '0', 10)
        res.on('data', (chunk: Buffer) => {
          file.write(chunk)
          downloaded += chunk.length
          if (total > 0) {
            const pct = Math.floor((downloaded / total) * 100)
            if (pct - lastPct >= 1) {
              lastPct = pct
              onProgress(
                pct,
                `已下载 ${(downloaded / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(1)} MB`,
              )
            }
          } else {
            onProgress(0, `已下载 ${(downloaded / 1024 / 1024).toFixed(1)} MB`)
          }
        })
        res.on('end', () => {
          file.end()
          resolve({ total, downloaded })
        })
        res.on('error', reject)
      })
        .on('error', reject)
        .on('timeout', () => reject(new Error('下载超时')))
    })
  }
}
