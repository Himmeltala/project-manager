<!--
 * @Author: zhengrenfu
 * @Date: 2026-07-14
 * @LastEditors: zhengrenfu
 * @LastEditTime: 2026-09-03
 * @FilePath: \src\views\ProjectView\modals\settings\SettingsModal.vue
 * @Description: 设置对话框
-->
<template>
  <!-- 关闭对话框时销毁其内容，保证嵌套的配置编辑器在每次打开时重新挂载并加载最新数据 -->
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('close')"
    title="设置"
    width="800"
    top="2vh"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <div class="settings-layout">
      <el-menu :default-active="activeCategory" class="settings-menu" @select="onSelectCategory">
        <el-menu-item v-for="cat in categories" :key="cat.key" :index="cat.key">{{ cat.label }}</el-menu-item>
      </el-menu>
      <div class="settings-content">
        <template v-for="cat in categories" :key="cat.key">
          <div v-if="cat.key === activeCategory">
            <div v-for="group in cat.groups" :key="group.label" class="settings-group">
              <h3>{{ group.label }}</h3>
              <div v-for="setting in group.settings" :key="setting.key" class="setting-row" v-show="isVisible(setting)">
                <label>{{ setting.label }}</label>
                <div class="setting-control">
                  <el-switch
                    v-if="setting.type === 'checkbox'"
                    v-model="settingValues[setting.key]"
                    @change="onChange(setting.key, $event)"
                  />
                  <el-input
                    v-else-if="setting.type === 'text'"
                    v-model="settingValues[setting.key]"
                    :placeholder="setting.placeholder"
                    size="small"
                    @blur="onChange(setting.key, settingValues[setting.key])"
                  />
                  <el-input
                    v-else-if="setting.type === 'textarea'"
                    v-model="settingValues[setting.key]"
                    :placeholder="setting.placeholder"
                    type="textarea"
                    :rows="6"
                    size="small"
                    @blur="onChange(setting.key, settingValues[setting.key])"
                  />
                  <el-select
                    v-else-if="setting.type === 'combo'"
                    v-model="settingValues[setting.key]"
                    size="small"
                    @change="onChange(setting.key, $event)"
                  >
                    <el-option v-for="opt in setting.options" :key="opt.value" :label="opt.label" :value="opt.value" />
                  </el-select>
                  <div v-else-if="setting.type === 'spinbox'" class="spinbox-wrap">
                    <el-input-number
                      v-model="settingValues[setting.key]"
                      :min="setting.min"
                      :max="setting.max"
                      :step="setting.step"
                      size="small"
                      @change="onChange(setting.key, $event)"
                    />
                    <span v-if="setting.suffix" class="spinbox-suffix">{{ setting.suffix }}</span>
                  </div>
                  <TerminalEntriesEditorModal
                    v-else-if="setting.type === 'entries' && setting.key !== 'openers'"
                    :setting-key="setting.key"
                  />
                  <ConfigOpenersEditorModal v-else-if="setting.key === 'openers'" :setting-key="setting.key" />
                  <ConfigPriorityEditorModal
                    v-else-if="setting.key === 'buildtool.config_priority'"
                    :setting-key="setting.key"
                  />
                  <div v-if="setting.description" class="setting-desc">{{ setting.description }}</div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { IPC } from '@/ipc/channels'

import { useSuccess } from '@/composables/useMessage'
import TerminalEntriesEditorModal from '@/views/ProjectView/modals/system/TerminalEntriesEditorModal.vue'
import ConfigOpenersEditorModal from '@/views/ProjectView/modals/settings/ConfigOpenersEditorModal.vue'
import ConfigPriorityEditorModal from '@/views/ProjectView/modals/settings/ConfigPriorityEditorModal.vue'

const STORE_KEY = 'settings_active_category'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const activeCategory = ref('interface')
const categories = ref<any[]>([])
const settingValues = ref<Record<string, any>>({})

function isVisible(setting: any): boolean {
  if (!setting.depends_on) return true
  const parentVal = settingValues.value[setting.depends_on]
  const expected = setting.depends_value !== undefined ? setting.depends_value : true
  return parentVal === expected
}

/**
 * 切换菜单选中项并持久化
 */
async function onSelectCategory(key: string) {
  activeCategory.value = key
  await window.electronAPI.invoke(IPC.store.set, STORE_KEY, key)
}

watch(
  () => props.visible,
  async (v) => {
    if (v) {
      await loadSchema()
      // 恢复上一次打开的菜单
      const saved = await window.electronAPI.invoke(IPC.store.get, STORE_KEY)
      if (saved && categories.value.some((c) => c.key === saved)) {
        activeCategory.value = saved
      }
    }
  },
)

async function loadSchema() {
  categories.value = await window.electronAPI.invoke(IPC.settings.getSchema)
  for (const cat of categories.value) {
    for (const group of cat.groups) {
      for (const setting of group.settings) {
        const val = await window.electronAPI.invoke(IPC.settings.get, setting.key)
        settingValues.value[setting.key] = val !== undefined ? val : setting.default
      }
    }
  }
}

async function onChange(key: string, value: any) {
  await window.electronAPI.invoke(IPC.settings.set, key, value)
  if (key.startsWith('scheduled_checks.')) {
    await refreshVcsTimers()
  }
  useSuccess('设置已保存')
}

async function refreshVcsTimers() {
  await window.electronAPI.invoke(IPC.vcs.stopChecks)
  const remoteEnabled = settingValues.value['scheduled_checks.remote_enabled']
  const localEnabled = settingValues.value['scheduled_checks.local_enabled']
  if (remoteEnabled) {
    const interval = settingValues.value['scheduled_checks.remote_interval_minutes'] || 30
    await window.electronAPI.invoke(IPC.vcs.startRemoteCheck, interval)
  }
  if (localEnabled) {
    const interval = settingValues.value['scheduled_checks.local_interval_minutes'] || 15
    await window.electronAPI.invoke(IPC.vcs.startLocalCheck, interval)
  }
}
</script>

<style scoped>
.settings-layout {
  display: flex;
  gap: 20px;
  min-height: 400px;
}
.settings-menu {
  width: 150px;
  border-right: 1px solid var(--el-border-color);
}
.settings-content {
  flex: 1;
}
.settings-group {
  margin-bottom: 20px;
}
.settings-group h3 {
  font-size: 14px;
  color: var(--el-color-primary);
  margin-bottom: 10px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--el-border-color);
}
.setting-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}
.setting-row label {
  width: 120px;
  text-align: right;
  font-size: 13px;
  padding-top: 4px;
  flex-shrink: 0;
}
.setting-control {
  flex: 1;
}
.setting-desc {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.spinbox-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}
.spinbox-suffix {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
</style>
