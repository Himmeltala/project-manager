<template>
  <el-dialog v-model="visible" title="关于" width="620" :close-on-click-modal="false">
    <div class="about-content" v-html="html"></div>
    <template #footer>
      <el-button plain size="small" @click="visible = false">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>()

const visible = ref(false)
const html = ref('')

watch(
  () => props.visible,
  (v) => {
    visible.value = v
  },
)
watch(visible, (v) => {
  emit('update:visible', v)
})

// 自己解析 markdown，不用第三方库。按行逐条处理，支持标题/列表/表格/代码块
function renderMd(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  let inCode = false
  let codeBuf: string[] = []
  let listBuf: string[] = []
  let tableBuf: string[] = []

  function esc(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
  function inline(s: string) {
    return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>')
  }

  function flushList() {
    if (listBuf.length) {
      out.push('<ul>' + listBuf.map((l) => '<li>' + inline(l.replace(/^- /, '')) + '</li>').join('') + '</ul>')
      listBuf = []
    }
  }
  function flushTable() {
    if (tableBuf.length) {
      const rows = tableBuf.filter((r) => !/^\|[-:| ]+\|$/.test(r))
      const isHead = rows.length > 0
      out.push(
        '<table>' +
          rows
            .map((r, i) => {
              const cells = r
                .split('|')
                .filter((c) => c.trim())
                .map((c) => inline(c.trim()))
              const tag = i === 0 && isHead ? 'th' : 'td'
              return '<tr>' + cells.map((c) => `<${tag}>${c}</${tag}>`).join('') + '</tr>'
            })
            .join('') +
          '</table>',
      )
      tableBuf = []
    }
  }

  for (const raw of lines) {
    // 代码块
    if (/^```/.test(raw)) {
      if (!inCode) {
        flushList()
        flushTable()
        inCode = true
        codeBuf = []
        continue
      }
      out.push('<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>')
      inCode = false
      continue
    }
    if (inCode) {
      codeBuf.push(raw)
      continue
    }

    // 空行 → 结束当前段落/列表/表格
    if (/^\s*$/.test(raw)) {
      flushList()
      flushTable()
      continue
    }

    // 标题
    const hm = raw.match(/^(#{1,3})\s+(.+)/)
    if (hm) {
      flushList()
      flushTable()
      out.push(`<h${hm[1].length}>${inline(hm[2])}</h${hm[1].length}>`)
      continue
    }

    // 列表项
    if (/^- /.test(raw)) {
      flushTable()
      listBuf.push(raw)
      continue
    }

    // 表格行
    if (/^\|/.test(raw)) {
      flushList()
      tableBuf.push(raw)
      continue
    }

    // 段落
    flushList()
    flushTable()
    out.push('<p>' + inline(raw) + '</p>')
  }
  flushList()
  flushTable()
  // 未关闭的代码块
  if (inCode && codeBuf.length) out.push('<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>')

  return out.join('\n')
}

onMounted(async () => {
  try {
    let text = await window.electronAPI.readMarkdown('assets/about.md')
    if (!text) throw new Error('not found')
    const version = await window.electronAPI.getVersion()
    text = text.replace('{{VERSION}}', version)
    html.value = renderMd(text)
  } catch {
    html.value = '<p>项目管理器 - Windows 桌面工具</p>'
  }
})
</script>

<style scoped>
.about-content {
  max-height: 420px;
  overflow-y: auto;
  line-height: 1.8;
  padding: 4px;
  font-size: 13px;
}
.about-content h1 {
  font-size: 18px;
  margin-bottom: 8px;
}
.about-content h2 {
  font-size: 15px;
  margin: 14px 0 6px;
  border-bottom: 1px solid var(--el-border-color);
  padding-bottom: 4px;
}
.about-content h3 {
  font-size: 14px;
  margin: 10px 0 4px;
}
.about-content p {
  margin: 6px 0;
}
.about-content ul {
  padding-left: 20px;
  margin: 4px 0;
}
.about-content li {
  margin: 2px 0;
}
.about-content table {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
  font-size: 12px;
}
.about-content th,
.about-content td {
  border: 1px solid var(--el-border-color);
  padding: 4px 8px;
  text-align: left;
}
.about-content th {
  background: var(--el-fill-color-light);
  font-weight: 600;
}
.about-content pre {
  background: var(--el-fill-color);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.4;
  white-space: pre-wrap;
}
.about-content code {
  font-family: Consolas, monospace;
  font-size: 12px;
  background: var(--el-fill-color);
  padding: 1px 4px;
  border-radius: 2px;
}
.about-content pre code {
  background: none;
  padding: 0;
}
</style>
