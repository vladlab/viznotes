<template>
  <Teleport to="body">
    <div class="loudness-overlay" @pointerdown.self="$emit('close')">
      <div class="loudness-dialog">
        <div class="loudness-header">
          <h3>Loudness Analysis (BS.1770)</h3>
          <button class="loudness-close" @click="$emit('close')">&times;</button>
        </div>

        <div class="loudness-body">
          <!-- Available channels -->
          <div class="loudness-field">
            <label>Available channels</label>
            <div class="channel-summary">
              <span v-for="ch in allChannels" :key="ch.id" class="channel-tag">
                {{ ch.shortLabel }}
              </span>
            </div>
          </div>

          <div class="loudness-groups">
            <div class="loudness-groups-header">
              <span>Channel groups</span>
              <button class="loudness-add-group" @click="addGroup">+ Add group</button>
            </div>

            <div v-if="groups.length === 0" class="loudness-empty">
              Add a group to define how channels map to speaker positions.
            </div>

            <div v-for="(group, gIdx) in groups" :key="gIdx" class="loudness-group">
              <div class="group-header">
                <input v-model="group.name" class="group-name-input" placeholder="Group name" />
                <select v-model="group.layout" @change="onLayoutChange(group)">
                  <option value="mono">Mono</option>
                  <option value="stereo">Stereo</option>
                  <option value="5.1">5.1</option>
                  <option value="7.1">7.1</option>
                </select>
                <button class="group-remove" @click="groups.splice(gIdx, 1)" title="Remove group">&times;</button>
              </div>
              <div class="channel-map">
                <div v-for="pos in layoutPositions(group.layout)" :key="pos" class="channel-assign">
                  <span class="channel-pos">{{ pos }}</span>
                  <select v-model="group.channels[pos]">
                    <option value="">—</option>
                    <option v-for="ch in allChannels" :key="ch.id" :value="ch.id">
                      {{ ch.shortLabel }}
                    </option>
                  </select>
                </div>
              </div>

              <!-- Result display -->
              <div v-if="results[gIdx]" class="group-result">
                <template v-if="results[gIdx].error">
                  <span class="result-error">⚠ {{ results[gIdx].error }}</span>
                </template>
                <template v-else>
                  <span class="result-value">{{ results[gIdx].input_i }} LUFS</span>
                  <span class="result-value">{{ results[gIdx].input_tp }} dBTP</span>
                  <span class="result-value">LRA {{ results[gIdx].input_lra }} LU</span>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- FFmpeg log -->
        <details v-if="ffmpegLog" class="loudness-log">
          <summary>FFmpeg output</summary>
          <pre class="loudness-log-pre">{{ ffmpegLog }}</pre>
        </details>

        <div class="loudness-footer">
          <template v-if="analyzing">
            <div class="loudness-progress-bar">
              <div class="loudness-progress-fill" :style="{ width: `${progress}%` }" />
            </div>
            <div class="loudness-analyzing-row">
              <span class="loudness-status">{{ status }} — {{ Math.round(progress) }}%</span>
              <button class="loudness-cancel-btn" @click="cancelAnalysis">Cancel</button>
            </div>
          </template>
          <template v-else>
            <span v-if="status" class="loudness-status">{{ status }}</span>
            <div class="loudness-actions">
              <button @click="$emit('close')">Close</button>
              <button class="primary" @click="runAnalysis" :disabled="groups.length === 0">
                Analyze
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import type { Note, LoudnessGroup, LoudnessConfig, LoudnessLayout } from '../types/note'
import { LOUDNESS_LAYOUTS } from '../types/note'
import { replaceAutoSection } from '../utils/autoSections'
import { appStore } from '../stores/app'
import { history } from '../stores/history'

const props = defineProps<{
  note: Note
  audioStreams: any[]
  duration: number // seconds
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const groups = reactive<LoudnessGroup[]>([])
const results = reactive<Record<number, any>>({})
const analyzing = ref(false)
const progress = ref(0)
const status = ref('')
const ffmpegLog = ref('')
let unlistenProgress: (() => void) | null = null

// Speaker position → FFmpeg channel name
const POS_TO_FFMPEG: Record<string, string> = {
  'C': 'FC', 'L': 'FL', 'R': 'FR',
  'LFE': 'LFE', 'Ls': 'BL', 'Rs': 'BR',
  'Lrs': 'SL', 'Rrs': 'SR',
}

// ── Flat channel list across all streams ──

interface ChannelRef {
  id: string
  streamIdx: number
  channelIdx: number
  shortLabel: string
}

const allChannels = computed<ChannelRef[]>(() => {
  const list: ChannelRef[] = []
  for (let si = 0; si < props.audioStreams.length; si++) {
    const s = props.audioStreams[si]
    const chCount = parseInt(s.channels || '0', 10)
    for (let ci = 0; ci < chCount; ci++) {
      list.push({
        id: `${si}:${ci}`,
        streamIdx: si,
        channelIdx: ci,
        shortLabel: chCount === 1 ? `S${si}` : `S${si} Ch${ci + 1}`,
      })
    }
  }
  return list
})

function layoutPositions(layout: LoudnessLayout): string[] {
  return LOUDNESS_LAYOUTS[layout] || []
}

// ── Group management ──

function addGroup() {
  const used = new Set<string>()
  for (const g of groups) {
    for (const v of Object.values(g.channels)) {
      if (v) used.add(v)
    }
  }

  const available = allChannels.value.filter(ch => !used.has(ch.id))
  const remaining = available.length

  let layout: LoudnessLayout
  if (remaining >= 8) layout = '7.1'
  else if (remaining >= 6) layout = '5.1'
  else if (remaining >= 2) layout = 'stereo'
  else layout = 'mono'

  const positions = LOUDNESS_LAYOUTS[layout]
  const channels: Record<string, string> = {}
  positions.forEach((pos, i) => {
    channels[pos] = i < available.length ? available[i].id : ''
  })

  groups.push({
    name: `Group ${groups.length + 1}`,
    layout,
    channels,
  })
}

function onLayoutChange(group: LoudnessGroup) {
  const positions = LOUDNESS_LAYOUTS[group.layout]
  const oldChannels = { ...group.channels }
  const oldValues = Object.values(oldChannels).filter(v => v)
  const newChannels: Record<string, string> = {}
  positions.forEach((pos, i) => {
    newChannels[pos] = oldChannels[pos] ?? (i < oldValues.length ? oldValues[i] : '')
  })
  group.channels = newChannels
}

// ── Build combined filter_complex for all groups ──

interface GroupFilter {
  filterStr: string
  outputLabel: string
}

function buildGroupFilter(group: LoudnessGroup, idx: number): GroupFilter | null {
  const positions = LOUDNESS_LAYOUTS[group.layout]
  const assignments = positions
    .map(pos => ({ pos, ref: group.channels[pos] }))
    .filter(a => a.ref)

  if (assignments.length === 0) return null

  const parsed = assignments.map(a => {
    const [si, ci] = a.ref.split(':').map(Number)
    return { pos: a.pos, streamIdx: si, channelIdx: ci }
  })

  // Collect unique streams
  const streamOrder: number[] = []
  const streamSet = new Set<number>()
  for (const p of parsed) {
    if (!streamSet.has(p.streamIdx)) {
      streamSet.add(p.streamIdx)
      streamOrder.push(p.streamIdx)
    }
  }

  // Channel counts per stream for offset computation
  const streamChannelCounts = streamOrder.map(si =>
    parseInt(props.audioStreams[si]?.channels || '1', 10)
  )

  // Offsets in amerge output
  const streamOffsets = new Map<number, number>()
  let offset = 0
  for (let i = 0; i < streamOrder.length; i++) {
    streamOffsets.set(streamOrder[i], offset)
    offset += streamChannelCounts[i]
  }

  const inputs = streamOrder.map(si => `[0:a:${si}]`).join('')
  const needsMerge = streamOrder.length > 1
  const mergeFilter = needsMerge ? `amerge=inputs=${streamOrder.length},` : ''

  const panParts = parsed.map(p => {
    const mergedIdx = streamOffsets.get(p.streamIdx)! + p.channelIdx
    return `${POS_TO_FFMPEG[p.pos] || p.pos}=c${mergedIdx}`
  })

  const outputLabel = `out${idx}`
  const filterStr = `${inputs}${mergeFilter}pan=${group.layout}|${panParts.join('|')},loudnorm=print_format=json[${outputLabel}]`

  return { filterStr, outputLabel }
}

// ── Run analysis ──

async function cancelAnalysis() {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('cancel_loudnorm')
  } catch {}
  // The running invoke will reject with "Cancelled", handled in runAnalysis catch
}

async function runAnalysis() {
  if (groups.length === 0) return
  analyzing.value = true
  progress.value = 0

  // Clear previous results
  for (const k of Object.keys(results)) delete results[k as any]

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const { listen } = await import('@tauri-apps/api/event')
    const filePath = props.note.link!

    // Listen for progress events
    unlistenProgress = await listen<number>('loudnorm-progress', (event) => {
      progress.value = event.payload
    })

    // Build combined filter_complex
    const filters: GroupFilter[] = []
    const groupErrors: Record<number, string> = {}

    for (let i = 0; i < groups.length; i++) {
      const f = buildGroupFilter(groups[i], i)
      if (f) {
        filters.push(f)
      } else {
        groupErrors[i] = 'No channels assigned'
      }
    }

    if (filters.length === 0) {
      for (const [i, err] of Object.entries(groupErrors)) {
        results[Number(i)] = { error: err }
      }
      return
    }

    const filterComplex = filters.map(f => f.filterStr).join(';')
    const mapArgs = filters.map(f => `[${f.outputLabel}]`)

    ffmpegLog.value = `filter_complex: ${filterComplex}\nmap: ${mapArgs.join(' ')}\n\n`
    status.value = `Analyzing ${filters.length} group${filters.length > 1 ? 's' : ''}…`

    try {
      const jsonStr = await invoke<string>('run_loudnorm', {
        filePath,
        filterComplex,
        mapArgs,
        durationSecs: props.duration || 0,
      })

      const response = JSON.parse(jsonStr)
      const resultArray = response.results || []
      ffmpegLog.value += response.stderr || ''

      if (resultArray.length === 0) {
        for (let i = 0; i < groups.length; i++) {
          if (!groupErrors[i]) {
            results[i] = { error: 'No loudnorm output — check log for details' }
          }
        }
      } else {
        // Map results back — filters are in order, skipping errored groups
        let resultIdx = 0
        for (let i = 0; i < groups.length; i++) {
          if (groupErrors[i]) {
            results[i] = { error: groupErrors[i] }
          } else if (resultIdx < resultArray.length) {
            results[i] = resultArray[resultIdx]
            resultIdx++
          }
        }
      }
    } catch (e) {
      const msg = String(e)
      if (msg.includes('Cancelled')) {
        status.value = 'Cancelled'
        return  // Don't save partial results
      }
      console.error('Loudness analysis failed:', e)
      if (!ffmpegLog.value) ffmpegLog.value = msg
      for (let i = 0; i < groups.length; i++) {
        if (!groupErrors[i]) {
          results[i] = { error: msg }
        }
      }
    }

    // Save config to note
    const before = history.snapshotNote(appStore.notes, props.note.id)!
    const config: LoudnessConfig = {
      streamIndex: 0,
      groups: groups.map(g => ({ ...g, channels: { ...g.channels } })),
    }
    props.note.loudnessConfig = [config]

    // Write results to Analysis section
    const blocks: any[] = []
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]
      const r = results[i]
      if (r?.error) {
        blocks.push({
          type: 'paragraph',
          content: [{ type: 'text', text: `⚠ ${group.name}: ${r.error}` }],
        })
      } else if (r) {
        blocks.push({
          type: 'paragraph',
          content: [{ type: 'text', text: `${group.name} (${group.layout}): ${r.input_i} LUFS | ${r.input_tp} dBTP | LRA ${r.input_lra} LU` }],
        })
      }
    }

    replaceAutoSection(props.note, 'Loudness', blocks)
    appStore.updateNote(props.note)
    appStore.pushNotePropertyAction(props.note.id, before, 'Loudness analysis')

    status.value = 'Done'
  } catch (e) {
    const msg = String(e)
    if (!msg.includes('Cancelled')) {
      status.value = `Error: ${e}`
    }
  } finally {
    analyzing.value = false
    if (unlistenProgress) { unlistenProgress(); unlistenProgress = null }
  }
}

onBeforeUnmount(async () => {
  if (unlistenProgress) { unlistenProgress(); unlistenProgress = null }
  if (analyzing.value) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('cancel_loudnorm')
    } catch {}
  }
})

// ── Load existing config on mount ──

onMounted(() => {
  if (props.note.loudnessConfig?.length) {
    const existing = props.note.loudnessConfig[0]
    if (existing?.groups) {
      groups.splice(0, groups.length, ...existing.groups.map(g => ({
        ...g,
        channels: { ...g.channels },
      })))
    }
  }
})
</script>

<style>
.loudness-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.loudness-dialog {
  background: var(--bg-surface);
  border: 1px solid var(--border-main);
  border-radius: 8px;
  width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.loudness-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.loudness-header h3 { margin: 0; font-size: 0.95em; font-weight: 600; }

.loudness-close {
  background: none; border: none; color: var(--text-muted);
  font-size: 1.4em; cursor: pointer; padding: 0 4px; line-height: 1;
}
.loudness-close:hover { color: var(--text-primary); }

.loudness-body {
  flex: 1; overflow-y: auto; padding: 12px 16px;
  display: flex; flex-direction: column; gap: 12px;
}

.loudness-field label {
  font-size: 0.72em; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--text-faint); display: block; margin-bottom: 4px;
}

.channel-summary { display: flex; flex-wrap: wrap; gap: 3px; }

.channel-tag {
  font-size: 0.72em; padding: 1px 5px; border-radius: 3px;
  background: var(--bg-surface-hover); color: var(--text-secondary);
}

.loudness-groups-header {
  display: flex; align-items: center; justify-content: space-between;
}
.loudness-groups-header span {
  font-size: 0.72em; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--text-faint);
}

.loudness-add-group {
  background: none; border: 1px solid var(--border-input); border-radius: 4px;
  padding: 2px 8px; font-size: 0.78em; color: var(--text-secondary); cursor: pointer;
}
.loudness-add-group:hover { background: var(--bg-surface-hover); }

.loudness-empty { font-size: 0.8em; color: var(--text-faint); padding: 6px 0; }

.loudness-group {
  background: var(--bg-app); border: 1px solid var(--border-subtle);
  border-radius: 6px; padding: 8px 10px; margin-top: 6px;
}

.group-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }

.group-name-input {
  flex: 1; background: var(--bg-input); border: 1px solid var(--border-input);
  border-radius: 3px; padding: 3px 6px; color: var(--text-primary); font-size: 0.82em;
}
.group-header select {
  background: var(--bg-input); border: 1px solid var(--border-input);
  border-radius: 3px; padding: 3px 6px; color: var(--text-primary); font-size: 0.82em; width: 70px;
}
.group-remove {
  background: none; border: none; color: var(--text-muted);
  font-size: 1.1em; cursor: pointer; padding: 0 2px; line-height: 1;
}
.group-remove:hover { color: var(--danger-text); }

.channel-map { display: flex; flex-wrap: wrap; gap: 4px; }

.channel-assign { display: flex; align-items: center; gap: 3px; }

.channel-pos {
  font-size: 0.72em; font-weight: 700; color: var(--text-secondary);
  width: 22px; text-align: right; flex-shrink: 0;
}
.channel-assign select {
  background: var(--bg-input); border: 1px solid var(--border-input);
  border-radius: 3px; padding: 2px 3px; color: var(--text-primary);
  font-size: 0.75em; width: 58px;
}

.group-result {
  display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px;
  padding-top: 5px; border-top: 1px solid var(--border-subtle);
}
.result-value { font-size: 0.8em; font-weight: 600; color: var(--accent-text); }
.result-error { font-size: 0.8em; color: var(--danger-text); }

.loudness-log {
  border-top: 1px solid var(--border-subtle);
  font-size: 0.75em;
}

.loudness-log summary {
  padding: 4px 16px;
  color: var(--text-faint);
  cursor: pointer;
  user-select: none;
}

.loudness-log summary:hover {
  color: var(--text-secondary);
}

.loudness-log-pre {
  margin: 0;
  padding: 4px 16px 8px;
  overflow: auto;
  max-height: 200px;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 0.92em;
  color: var(--text-muted);
  line-height: 1.4;
}

.loudness-footer {
  padding: 8px 16px; border-top: 1px solid var(--border-subtle);
}

.loudness-progress-bar {
  width: 100%; height: 4px; background: var(--border-subtle);
  border-radius: 2px; overflow: hidden; margin-bottom: 8px;
}
.loudness-progress-fill {
  height: 100%; background: var(--accent);
  transition: width 0.3s ease;
}

.loudness-analyzing-row {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}

.loudness-cancel-btn {
  padding: 6px 24px; border-radius: 4px;
  border: 1px solid var(--danger-text, #e03131);
  background: transparent;
  color: var(--danger-text, #e03131);
  font-size: 0.88em; font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}
.loudness-cancel-btn:hover {
  background: color-mix(in srgb, var(--danger-text, #e03131) 15%, transparent);
}

.loudness-status {
  font-size: 0.78em; color: var(--text-faint); flex: 1;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.loudness-actions {
  display: flex; gap: 6px; flex-shrink: 0;
  justify-content: flex-end;
}

.loudness-actions button {
  padding: 5px 14px; border-radius: 4px; border: 1px solid var(--border-input);
  background: var(--bg-input); color: var(--text-primary); font-size: 0.82em; cursor: pointer;
}
.loudness-actions button:hover { background: var(--bg-surface-hover); }
.loudness-actions button.primary {
  background: var(--accent); border-color: var(--accent); color: white;
}
.loudness-actions button.primary:hover { filter: brightness(1.1); }
.loudness-actions button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
