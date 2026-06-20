<template>
  <div class="notification-list">
    <div class="notification-header">
      <span v-if="store.unreadCount > 0" class="unread-badge">{{ store.unreadCount }} 条未读</span>
      <div>
        <el-button plain size="small" @click="markAllRead">全部已读</el-button>
      </div>
      <div>
        <el-button plain size="small" @click="clearAll">清空</el-button>
      </div>
    </div>
    <div class="notification-scroll" ref="scrollRef">
      <div v-if="store.notifications.length === 0" class="empty-hint">暂无通知</div>
      <div
        v-for="n in store.notifications"
        :key="n.id"
        class="notification-item"
        :class="{ unread: !n.read }"
        @click="onClick(n)"
      >
        <div class="notify-dot" :style="{ background: getColor(n.type) }"></div>
        <div class="notify-content">
          <div class="notify-title-row">
            <span class="notify-title" :style="{ fontWeight: n.read ? 'normal' : 'bold' }">{{ n.title }}</span>
            <span
              v-if="n.projectName"
              class="notify-meta"
              style="cursor: pointer; text-decoration: underline dotted"
              @click.stop="locate(n.projectName)"
              >{{ n.projectName }}</span
            >
          </div>
          <div class="notify-meta-row">
            <span class="notify-badge" :style="{ color: getColor(n.type), borderColor: getColor(n.type) }">{{
              getLabel(n.type)
            }}</span>
            <span class="notify-time">{{ formatTime(n.timestamp) }}</span>
          </div>
          <div v-if="n.message" class="notify-msg">{{ n.message }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useNotificationStore } from '../stores/notification.store'
import { NOTIFICATION_TYPE_META } from '../types/notification'

const emit = defineEmits<{
  (e: 'locateProject', projectName: string): void
}>()

const store = useNotificationStore()

function getColor(type: string): string {
  return NOTIFICATION_TYPE_META[type as keyof typeof NOTIFICATION_TYPE_META]?.color || 'var(--el-text-color-secondary)'
}

function getLabel(type: string): string {
  return NOTIFICATION_TYPE_META[type as keyof typeof NOTIFICATION_TYPE_META]?.label || type
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function onClick(n: { id: string; projectName: string; read: boolean }) {
  await store.markRead(n.id)
  if (n.projectName) locate(n.projectName)
}

function locate(projectName: string) {
  emit('locateProject', projectName)
}

async function markAllRead() {
  await store.markAllRead()
}

async function clearAll() {
  await store.clearAll()
}
</script>

<style scoped>
.notification-list {
  display: flex;
  flex-direction: column;
  height: 200px;
  background: var(--el-bg-color);
}
.notification-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--el-fill-color-blank);
  border-bottom: 1px solid var(--el-border-color);
  flex-shrink: 0;
}
.unread-badge {
  font-size: 12px;
  color: var(--el-color-primary);
}
.notification-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.empty-hint {
  color: var(--el-text-color-secondary);
  text-align: center;
  padding: 30px;
  font-size: 14px;
}
.notification-item {
  display: flex;
  gap: 10px;
  padding: 10px;
  margin-bottom: 4px;
  border-radius: 4px;
  cursor: pointer;
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color);
}
.notification-item:hover {
  background: var(--el-fill-color-light);
}
.notification-item.unread {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-8);
}
html.theme-light .notification-item.unread {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-7);
}
.notify-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 3px;
}
.notify-content {
  flex: 1;
  min-width: 0;
}
.notify-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.notify-title {
  font-size: 13px;
  color: var(--el-text-color-primary);
}
.notify-meta {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.notify-meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
}
.notify-badge {
  font-size: 11px;
  border: 1px solid;
  border-radius: 2px;
  padding: 0 4px;
}
.notify-time {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.notify-msg {
  font-size: 12px;
  color: var(--el-text-color-regular);
  margin-top: 4px;
  word-break: break-all;
}
</style>
