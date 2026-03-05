<template>
  <Teleport to="body">
    <div class="loudness-overlay" @pointerdown.self="$emit('close')">
      <div class="loudness-dialog">
        <div class="loudness-header">
          <h3>Loudness Analysis (BS.1770)</h3>
          <button class="loudness-close" @click="$emit('close')">&times;</button>
        </div>

        <div class="loudness-body">
          <!-- Available channels summary -->
          <div class="loudness-field">
            <label>Available channels</label>
            <div class="channel-summary">
              <span v-for="ch in allChannels" :key="ch.id" class="channel-tag">
                {{ ch.label }}
              </span>
            </div>
          </div>

          <div class="loudness-groups">
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
                    <option value="">—</option>
                    <option v-for="ch in allChannels" :key="ch.id" :value="ch.id">
                      {{ ch.label }}
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

const groups = reactive<LoudnessGroup[]>([])
const results = reactive<Record<number, any>>({})
const analyzing = ref(false)
const status = ref('')

// Speaker position → FFmpeg channel name
const POS_TO_FFMPEG: Record<string, string> = {
  'C': 'FC', 'L': 'FL', 'R': 'FR',
  'LFE': 'LFE', 'Ls': 'BL', 'Rs': 'BR',
  'Lrs': 'SL', 'Rrs': 'SR',
}

// ── Flat channel list across all streams ──

interface ChannelRef {
  id: string          // "0:0", "0:1", "1:0", etc.
  streamIdx: number
  channelIdx: number
  label: string       // "S0 Ch1 (aac stereo)" etc.
}

const allChannels = computed<ChannelRef[]>(() => {
  const list: ChannelRef[] = []
  for (let si = 0; si < props.audioStreams.length; si++) {
    const s = props.audioStreams[si]
    const chCount = parseInt(s.channels || '0', 10)
    const codec = s.codec_name || '?'
    const layout = s.channel_layout && s.channel_layout !== 'unknown' ? s.channel_layout : `${chCount}ch`
    for (let ci = 0; ci < chCount; ci++) {
      list.push({
        id: `${si}:${ci}`,
        streamIdx: si,
        channelIdx: ci,
        label: `S${si} Ch${ci + 1} (${codec} ${layout})`,
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
  // Collect all channel IDs already assigned in existing groups
  const used = new Set<string>()
  for (const g of groups) {
    for (const v of Object.values(g.channels)) {
      if (v) used.add(v)
    }
  }

  // Find next unassigned channels
  const available = allChannels.value.filter(ch => !used.has(ch.id))
  const remaining = available.length

  // Pick layout based on remaining channels
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
    // Keep existing assignment if position name matches, otherwise reuse by index
    newChannels[pos] = oldChannels[pos] ?? (i < oldValues.length ? oldValues[i] : '')
  })
  group.channels = newChannels
}

// ── Build FFmpeg filter chain ──

function buildFilterChain(group: LoudnessGroup): { streamIdx: number; filter: string } | null {
  const positions = LOUDNESS_LAYOUTS[group.layout]
  const assignments = positions
    .map(pos => ({ pos, ref: group.channels[pos] }))
    .filter(a => a.ref)

  if (assignments.length === 0) return null

  // Parse channel refs — all must be from the same stream for now
  const parsed = assignments.map(a => {
    const [si, ci] = a.ref.split(':').map(Number)
    return { pos: a.pos, streamIdx: si, channelIdx: ci }
  })

  const streams = new Set(parsed.map(p => p.streamIdx))
  if (streams.size > 1) {
    // Multi-stream groups need filter_complex with amerge — not supported yet
    return null
  }

  const streamIdx = parsed[0].streamIdx
  const panParts = parsed.map(p =>
    `${POS_TO_FFMPEG[p.pos] || p.pos}=c${p.channelIdx}`
  )

  const layoutStr = group.layout
  const filter = `pan=${layoutStr}|${panParts.join('|')},loudnorm=print_format=json`
  return { streamIdx, filter }
}

// ── Run analysis ──

async function runAnalysis() {
  if (groups.length === 0) return
  analyzing.value = true

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const filePath = props.note.link!

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]
      status.value = `Analyzing ${group.name}…`

      const chain = buildFilterChain(group)
      if (!chain) {
        results[i] = { error: 'No channels assigned or mixed streams (not yet supported)' }
        continue
      }

      try {
        const jsonStr = await invoke<string>('run_loudnorm', {
          filePath,
          streamIndex: chain.streamIdx,
          filterChain: chain.filter,
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
      streamIndex: 0, // legacy field, ignored in new model
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
    status.value = `Error: ${e}`
  } finally {
    analyzing.value = false
  }
}

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
  width: 560px;
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

.channel-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.channel-tag {
  font-size: 0.75em;
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--bg-surface-hover);
  color: var(--text-secondary);
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
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
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
  font-size: 0.78em;
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

.result-error {
  font-size: 0.82em;
  color: var(--danger-text);
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
