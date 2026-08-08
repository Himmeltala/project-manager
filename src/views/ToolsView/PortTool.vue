<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-22
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-07-22
 * @FilePath: \src\views\ToolsView\PortTool.vue
 * @Description: 端口工具 — 查询端口占用、查看进程列表、终止指定进程
-->
<template>
  <div class="port-tool">
    <div class="tool-body">
      <!-- 查询栏 -->
      <div class="query-row">
        <div>
          <el-input v-model="portText" placeholder="输入端口号" style="width: 200px" @keyup.enter="doQuery" />
        </div>
        <div>
          <el-button type="primary" @click="doQuery" :loading="queryLoading">查询</el-button>
        </div>
        <div>
          <el-button @click="killAllPort" :loading="killAllLoading" :disabled="processes.length === 0">
            终止全部
          </el-button>
        </div>
      </div>

      <!-- 进程列表 -->
      <div class="process-section" v-if="processes.length > 0">
        <div class="section-title">占用端口 {{ portText }} 的进程（{{ processes.length }} 个）</div>
        <el-table :data="processes" size="small" stripe style="width: 100%">
          <el-table-column prop="protocol" label="协议" width="80" />
          <el-table-column prop="localAddress" label="本地地址" min-width="200" />
          <el-table-column prop="pid" label="PID" width="100" sortable />
          <el-table-column prop="state" label="状态" width="120" />
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button type="danger" size="small" link @click="doKillPid(row)">终止</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <el-empty v-else-if="queried" :image-size="80" description="该端口未被占用" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useError, useSuccess, useConfirm } from '../../composables/useMessage'

interface PortProcess {
  pid: number
  protocol: string
  localAddress: string
  state: string
}

const portText = ref('')
const queryLoading = ref(false)
const killAllLoading = ref(false)
const queried = ref(false)
const processes = ref<PortProcess[]>([])

function getPort(): number | null {
  if (!portText.value || !/^\d+$/.test(portText.value)) {
    useError('请输入有效的端口号')
    return null
  }
  const port = parseInt(portText.value)
  if (port < 1 || port > 65535) {
    useError('端口号范围: 1-65535')
    return null
  }
  return port
}

async function doQuery() {
  const port = getPort()
  if (!port) return

  queryLoading.value = true
  try {
    processes.value = await window.electronAPI.invoke('process:listByPort', port)
    queried.value = true
  } catch {
    useError('查询失败')
  } finally {
    queryLoading.value = false
  }
}

async function killAllPort() {
  const port = getPort()
  if (!port) return

  const ok = await useConfirm('确认终止进程', `确认终止占用端口 ${port} 的所有进程？`)
  if (!ok) return

  killAllLoading.value = true
  try {
    const result = await window.electronAPI.invoke('process:killPort', port)
    if (result) {
      useSuccess(`端口 ${port} 进程已终止`)
      processes.value = []
    } else {
      useError(`端口 ${port} 进程终止失败`)
    }
  } catch {
    useError(`端口 ${port} 进程终止失败`)
  } finally {
    killAllLoading.value = false
  }
}

async function doKillPid(proc: PortProcess) {
  const ok = await useConfirm('确认杀进程', `确认终止 PID ${proc.pid}（${proc.protocol} ${proc.localAddress}）？`)
  if (!ok) return

  try {
    const result = await window.electronAPI.invoke('process:killPid', proc.pid)
    if (result) {
      useSuccess(`PID ${proc.pid} 已终止`)
      processes.value = processes.value.filter((p) => p.pid !== proc.pid)
    } else {
      useError(`PID ${proc.pid} 终止失败`)
    }
  } catch {
    useError(`PID ${proc.pid} 终止失败`)
  }
}
</script>

<style scoped>
.port-tool {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.tool-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.query-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.section-title {
  font-size: 14px;
  font-weight: bold;
  color: var(--el-text-color-primary);
  margin-bottom: 8px;
}
.process-section {
  margin-bottom: 8px;
}
</style>
