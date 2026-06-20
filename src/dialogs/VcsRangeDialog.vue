<template>
  <el-dialog
    v-model="visible"
    :title="mode === 'update' ? '范围更新' : '范围检查'"
    width="400"
    :close-on-click-modal="false"
  >
    <el-form label-width="80px">
      <el-form-item label="操作">
        <el-radio-group v-model="mode">
          <el-radio value="update">范围更新</el-radio>
          <el-radio value="check">范围检查</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="起始序号">
        <el-input-number v-model="startIdx" :min="0" :max="maxIdx" />
      </el-form-item>
      <el-form-item label="结束序号">
        <el-input-number v-model="endIdx" :min="0" :max="maxIdx" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button plain size="small" type="primary" @click="execute" :disabled="loading">{{
        mode === 'update' ? '执行更新' : '开始检查'
      }}</el-button>
      <el-button plain size="small" @click="visible = false">取消</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useSuccess, useError, useInfo } from '../composables/useMessage'
import { useProjectStore } from '../stores/project.store'
import { useNotificationStore } from '../stores/notification.store'

const props = defineProps<{ visible: boolean; mode?: 'update' | 'check' }>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>()

const visible = ref(false)
const mode = ref<'update' | 'check'>('update')
const startIdx = ref(0)
const endIdx = ref(0)
const loading = ref(false)
const store = useProjectStore()
const notifyStore = useNotificationStore()

const maxIdx = computed(() => Math.max(0, store.projects.length - 1))

watch(
  () => props.visible,
  (v) => {
    visible.value = v
    if (v) {
      mode.value = props.mode || 'update'
      startIdx.value = 1
      endIdx.value = Math.min(store.projects.length, 10)
    }
  },
)
watch(visible, (v) => {
  emit('update:visible', v)
})

async function execute() {
  if (startIdx.value < 1 || endIdx.value < 1) {
    useError('序号从 1 开始')
    return
  }
  if (startIdx.value > endIdx.value) {
    useError('起始序号不能大于结束序号')
    return
  }
  if (endIdx.value > store.projects.length) {
    useError(`结束序号不能超过项目总数 ${store.projects.length}`)
    return
  }

  loading.value = true
  try {
    if (mode.value === 'update') {
      const result = await window.electronAPI.vcsUpdateRange({ startIdx: startIdx.value, endIdx: endIdx.value })
      useInfo(`批量更新完成：成功 ${result.ok}，冲突 ${result.conflicts}，失败 ${result.errors}`)
    } else {
      const projects = store.projects
        .slice(startIdx.value - 1, endIdx.value)
        .map((p) => ({ name: p.name, path: p.path }))
      const count = await window.electronAPI.vcsCount(projects)
      if (count === 0) {
        useInfo('范围内没有版本控制项目')
        return
      }
      useInfo(`正在检查 ${count} 个项目的状态...`)
      const [remote, local] = await Promise.all([
        window.electronAPI.vcsCheckRemote(projects),
        window.electronAPI.vcsCheckLocal(projects),
      ])
      const total = remote.length + local.length
      if (total > 0) {
        useSuccess(`检查完成，发现 ${total} 项变更`)
      } else {
        useInfo('检查完成，没有发现变更')
      }
      notifyStore.load()
    }
  } catch (e: any) {
    useError(`${mode.value === 'update' ? '更新' : '检查'}失败: ${e.message}`)
  } finally {
    loading.value = false
  }
}
</script>
