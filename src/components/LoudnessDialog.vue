<template>
  <Teleport to="body">
    <div class="loudness-overlay" @pointerdown.self="$emit('close')">
      <div class="loudness-dialog">
        <div class="loudness-header">
          <h3>Loudness Analysis (BS.1770)</h3>
          <button class="loudness-close" @click="$emit('close')">&times;</button>
        </div>

        <div class="loudness-body">
          <!-- Stream selector -->
          <div class="loudness-field">
            <label>Audio stream</label>
            <select v-model="selectedStreamIdx">
              <option v-for="(s, idx) in audioStreams" :key="idx" :value="idx">
                {{ idx }}: {{ s.codec_name }} {{ describeLayout(s) }} ({{ s.channels }}ch)
              </option>
            </select>
          </div>

          <div v-if="selectedStream" class="loudness-groups">
            <div class="loudness-groups-header">
              <span>Channel groups</span>
              <button class="loudness-add-group" @click="addGroup">+ Add group</button>
            </div>

            <div v-if="groups.length === 0" class="loudness-empty">
              No groups defined. Add a group to map channels to a speaker layout.
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
                  <label>{{ pos }}</label>
                  <select v-model="group.channels[pos]">
                    <option :value="-1">—</option>
                    <option v-for="ch in channelCount" :key="ch - 1" :value="ch - 1">
                      Ch {{ ch }}
                    </option>
                  </select>
                </div>
              </div>

              <!-- Result display -->
              <div v-if="results[gIdx]" class="group-result">
                <span class="result-value">{{ results[gIdx].input_i }} LUFS</span>
                <span class="result-value">{{ results[gIdx].input_tp }} dBTP</span>
                <span class="result-value">LRA {{ results[gIdx].input_lra }} LU</span>
              </div>
            </div>
          </div>
        </div>

        <div class="loudness-footer">
          <span v-if="status" class="loudness-status">{{ status }}</span>
          <div class="loudness-actions">
            <button @click="$emit('close')">Cancel</button>
            <button class="primary" @click="runAnalysis" :disabled="analyzing || groups.length === 0">
              {{ analyzing ? 'Analyzing…' : 'Analyze' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import type { Note, LoudnessGroup, LoudnessConfig, LoudnessLayout } from '../types/note'
import { LOUDNESS_LAYOUTS } from '../types/note'
import { replaceAutoSection } from '../utils/autoSections'
import { appStore } from '../stores/app'
import { history } from '../stores/history'

const props = defineProps<{
  note: Note
  audioStreams: any[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const selectedStreamIdx = ref(0)
const groups = reactive<LoudnessGroup[]>([])
const results = reactive<Record<number, any>>({})
const analyzing = ref(false)
const status = ref('')

const selectedStream = computed(() => props.audioStreams[selectedStreamIdx.value])
const channelCount = computed(() => parseInt(selectedStream.value?.channels || '2', 10))

// Speaker position → FFmpeg channel name
const POS_TO_FFMPEG: Record<string, string> = {
  'C': 'FC', 'L': 'FL', 'R': 'FR',
  'LFE': 'LFE', 'Ls': 'BL', 'Rs': 'BR',
  'Lrs': 'SL', 'Rrs': 'SR',
}

function describeLayout(stream: any): string {
  const layout = stream.channel_layout
  if (layout && layout !== 'unknown') return layout
  return `${stream.channels}ch`
}

function layoutPositions(layout: LoudnessLayout): string[] {
  return LOUDNESS_LAYOUTS[layout] || []
}

function addGroup() {
  const nextCh = groups.reduce((max, g) => {
    const vals = Object.values(g.channels).filter(v => v >= 0)
    return Math.max(max, ...vals.map(v => v + 1))
  }, 0)

  const layout: LoudnessLayout = channelCount.value >= 6 ? '5.1' : channelCount.value >= 2 ? 'stereo' : 'mono'
  const positions = LOUDNESS_LAYOUTS[layout]
  const channels: Record<string, number> = {}
  positions.forEach((pos, i) => {
    channels[pos] = nextCh + i < channelCount.value ? nextCh + i : -1
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
  const newChannels: Record<string, number> = {}
  positions.forEach((pos, i) => {
    newChannels[pos] = oldChannels[pos] ?? (i < channelCount.value ? i : -1)
  })
  group.channels = newChannels
}

function buildFilterChain(group: LoudnessGroup): string {
  const positions = LOUDNESS_LAYOUTS[group.layout]
  const layoutStr = group.layout === '7.1' ? '7.1' : group.layout === '5.1' ? '5.1' : group.layout
  const panParts = positions
    .filter(pos => (group.channels[pos] ?? -1) >= 0)
    .map(pos => `${POS_TO_FFMPEG[pos] || pos}=c${group.channels[pos]}`)

  if (panParts.length === 0) return 'loudnorm=print_format=json'
  return `pan=${layoutStr}|${panParts.join('|')},loudnorm=print_format=json`
}

async function runAnalysis() {
  if (groups.length === 0) return
  analyzing.value = true

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const filePath = props.note.link!

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]
      status.value = `Analyzing ${group.name}…`

      const filterChain = buildFilterChain(group)

      try {
        const jsonStr = await invoke<string>('run_loudnorm', {
          filePath,
          streamIndex: selectedStreamIdx.value,
          filterChain,
        })
        results[i] = JSON.parse(jsonStr)
      } catch (e) {
        console.error(`Loudness analysis failed for ${group.name}:`, e)
        results[i] = { error: String(e) }
      }
    }

    // Save config to note
    const before = history.snapshotNote(appStore.notes, props.note.id)!
    const config: LoudnessConfig = {
      streamIndex: selectedStreamIdx.value,
      groups: groups.map(g => ({ ...g, channels: { ...g.channels } })),
    }
    if (!props.note.loudnessConfig) props.note.loudnessConfig = []
    // Replace config for this stream, keep others
    const otherConfigs = props.note.loudnessConfig.filter(c => c.streamIndex !== selectedStreamIdx.value)
    props.note.loudnessConfig = [...otherConfigs, config]

    // Write results to Analysis section
    const blocks: any[] = [{
      type: 'paragraph',
      content: [{ type: 'text', text: '── Loudness ──', marks: [{ type: 'bold' }] }],
    }]

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
    status.value = `Error: ${e}`
  } finally {
    analyzing.value = false
  }
}

// Load existing config on mount
onMounted(() => {
  if (props.note.loudnessConfig) {
    const existing = props.note.loudnessConfig[0]
    if (existing) {
      selectedStreamIdx.value = existing.streamIndex
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
  width: 520px;
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

.loudness-header h3 {
  margin: 0;
  font-size: 0.95em;
  font-weight: 600;
}

.loudness-close {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.4em;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.loudness-close:hover {
  color: var(--text-primary);
}

.loudness-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.loudness-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.loudness-field label {
  font-size: 0.78em;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-faint);
}

.loudness-field select {
  background: var(--bg-input);
  border: 1px solid var(--border-input);
  border-radius: 4px;
  padding: 6px 8px;
  color: var(--text-primary);
  font-size: 0.88em;
}

.loudness-groups-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.loudness-groups-header span {
  font-size: 0.78em;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-faint);
}

.loudness-add-group {
  background: none;
  border: 1px solid var(--border-input);
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 0.8em;
  color: var(--text-secondary);
  cursor: pointer;
}

.loudness-add-group:hover {
  background: var(--bg-surface-hover);
}

.loudness-empty {
  font-size: 0.82em;
  color: var(--text-faint);
  padding: 8px 0;
}

.loudness-group {
  background: var(--bg-app);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 8px 10px;
  margin-top: 6px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.group-name-input {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border-input);
  border-radius: 3px;
  padding: 4px 6px;
  color: var(--text-primary);
  font-size: 0.85em;
}

.group-header select {
  background: var(--bg-input);
  border: 1px solid var(--border-input);
  border-radius: 3px;
  padding: 4px 6px;
  color: var(--text-primary);
  font-size: 0.85em;
}

.group-remove {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.2em;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.group-remove:hover {
  color: var(--danger-text);
}

.channel-map {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 4px 8px;
}

.channel-assign {
  display: flex;
  align-items: center;
  gap: 4px;
}

.channel-assign label {
  font-size: 0.78em;
  font-weight: 600;
  color: var(--text-secondary);
  width: 28px;
  flex-shrink: 0;
}

.channel-assign select {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border-input);
  border-radius: 3px;
  padding: 2px 4px;
  color: var(--text-primary);
  font-size: 0.82em;
}

.group-result {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--border-subtle);
}

.result-value {
  font-size: 0.82em;
  font-weight: 600;
  color: var(--accent-text);
}

.loudness-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-top: 1px solid var(--border-subtle);
  gap: 8px;
}

.loudness-status {
  font-size: 0.8em;
  color: var(--text-faint);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loudness-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.loudness-actions button {
  padding: 6px 16px;
  border-radius: 4px;
  border: 1px solid var(--border-input);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.85em;
  cursor: pointer;
}

.loudness-actions button:hover {
  background: var(--bg-surface-hover);
}

.loudness-actions button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.loudness-actions button.primary:hover {
  filter: brightness(1.1);
}

.loudness-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
