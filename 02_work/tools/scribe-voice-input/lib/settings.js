import { DEFAULT_INSTRUCTION } from './pipeline.js';

export const DEFAULT_SETTINGS = {
  elevenlabsApiKey: '',
  anthropicApiKey: '',
  postProcess: 'scribe', // 'scribe' | 'claude' | 'none'
  scribeModel: 'scribe_v2',
  languageCode: 'jpn',
  noVerbatim: true, // 「えー」「あのー」などのフィラーを除去
  keyterms: [],
  claudeModel: 'claude-haiku-5-5',
  instruction: '', // 空なら DEFAULT_INSTRUCTION を使う（既定文の更新が反映されるように保存しない）
  strictGuard: true,
  alwaysCopy: false,
  sound: true,
  maxSeconds: 300,
};

export async function loadSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  if (!merged.instruction.trim()) merged.instruction = DEFAULT_INSTRUCTION;
  return merged;
}

export async function saveSettings(settings) {
  const toSave = { ...settings };
  if (toSave.instruction.trim() === DEFAULT_INSTRUCTION) toSave.instruction = '';
  await chrome.storage.local.set({ settings: toSave });
}

// 録音を始める前に足りないものを返す（null なら OK）
export function missingKey(settings) {
  if (!settings.elevenlabsApiKey) return 'ElevenLabs の API キー';
  if (settings.postProcess === 'claude' && !settings.anthropicApiKey) return 'Anthropic の API キー';
  return null;
}
