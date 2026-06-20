<template>
  <el-dialog v-model="visible" title="设置" width="800" :close-on-click-modal="false">
    <div class="settings-layout">
      <el-menu :default-active="activeCategory" class="settings-menu" @select="activeCategory = $event">
        <el-menu-item v-for="cat in categories" :key="cat.key" :index="cat.key">{{ cat.label }}</el-menu-item>
      </el-menu>
      <div class="settings-content">
        <template v-for="cat in categories" :key="cat.key">
          <div v-if="cat.key === activeCategory">
            <div v-for="group in cat.groups" :key="group.label" class="settings-group">
              <h3>{{ group.label }}</h3>
              <div v-for="setting in group.settings" :key="setting.key" class="setting-row">
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
                  <el-select
                    v-else-if="setting.type === 'combo'"
                    v-model="settingValues[setting.key]"
                    size="small"
                    @change="onChange(setting.key, $event)"
                  >
                    <el-option v-for="opt in setting.options" :key="opt.value" :label="opt.label" :value="opt.value" />
                  </el-select>
                  <el-input-number
                    v-else-if="setting.type === 'spinbox'"
                    v-model="settingValues[setting.key]"
                    :min="setting.min"
                    :max="setting.max"
                    :step="setting.step"
                    size="small"
                    @change="onChange(setting.key, $event)"
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
import { ref, watch, onMounted } from 'vue'
import { useSuccess } from '../composables/useMessage'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>()

const visible = ref(false)
const activeCategory = ref('general')
const categories = ref<any[]>([])
const settingValues = ref<Record<string, any>>({})

watch(
  () => props.visible,
  (v) => {
    visible.value = v
  },
)

watch(visible, (v) => {
  emit('update:visible', v)
})

onMounted(async () => {
  categories.value = await window.electronAPI.getSettingsSchema()
  // Load current values
  for (const cat of categories.value) {
    for (const group of cat.groups) {
      for (const setting of group.settings) {
        const val = await window.electronAPI.getSetting(setting.key)
        settingValues.value[setting.key] = val !== undefined ? val : setting.default
      }
    }
  }
})

async function onChange(key: string, value: any) {
  await window.electronAPI.setSetting(key, value)
  // SVN 定时检查设置变更时启停定时器
  if (key.startsWith('scheduled_checks.')) {
    await refreshVcsTimers()
  }
  useSuccess('设置已保存')
}

async function refreshVcsTimers() {
  await window.electronAPI.stopVcsChecks()
  const remoteEnabled = settingValues.value['scheduled_checks.remote_enabled']
  const localEnabled = settingValues.value['scheduled_checks.local_enabled']
  if (remoteEnabled) {
    const interval = settingValues.value['scheduled_checks.remote_interval_minutes'] || 30
    await window.electronAPI.startRemoteCheck(interval)
  }
  if (localEnabled) {
    const interval = settingValues.value['scheduled_checks.local_interval_minutes'] || 15
    await window.electronAPI.startLocalCheck(interval)
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
</style>
