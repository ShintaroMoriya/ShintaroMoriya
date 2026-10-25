import { DEFAULT_INSTRUCTION, isSafeRewrite, rewriteWithClaude } from './lib/pipeline.js';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './lib/settings.js';

const $ = (id) => document.getElementById(id);
const form = $('form');
const FIELDS = Object.keys(DEFAULT_SETTINGS).filter((k) => $(k));

function readForm() {
  const s = {};
  for (const key of FIELDS) {
    const el = $(key);
    if (el.type === 'checkbox') s[key] = el.checked;
    else if (el.type === 'number') s[key] = Number(el.value) || DEFAULT_SETTINGS[key];
    else if (key === 'keyterms') s[key] = el.value.split('\n').map((t) => t.trim()).filter(Boolean);
    else s[key] = el.value.trim();
  }
  if (!s.instruction) s.instruction = DEFAULT_INSTRUCTION;
  return s;
}

function fillForm(s) {
  for (const key of FIELDS) {
    const el = $(key);
    if (el.type === 'checkbox') el.checked = s[key];
    else if (key === 'keyterms') el.value = s[key].join('\n');
    else el.value = s[key];
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  await saveSettings(readForm());
  $('saveStatus').textContent = `保存しました（${new Date().toLocaleTimeString('ja-JP')}）`;
});

$('resetInstruction').addEventListener('click', () => {
  $('instruction').value = DEFAULT_INSTRUCTION;
});

$('grantMic').addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    $('micStatus').textContent = '許可されています ✅';
  } catch (e) {
    $('micStatus').textContent = `許可されていません（${e.name}）。アドレスバー左のアイコンからマイクを許可してください。`;
  }
});

$('editShortcut').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

$('runTest').addEventListener('click', async () => {
  const s = readForm();
  const input = $('testInput').value.trim();
  const out = $('testOutput');
  if (!s.anthropicApiKey) {
    out.textContent = 'Anthropic API キーを入力してください。';
    return;
  }
  out.textContent = '変換中…';
  const t0 = Date.now();
  try {
    const text = await rewriteWithClaude(input, { apiKey: s.anthropicApiKey, model: s.claudeModel, instruction: s.instruction });
    const guard = isSafeRewrite(input, text) ? '数字以外の変更なし' : '⚠️ 数字以外の変更あり（実運用では元の文字起こしを使います）';
    out.textContent = `${text}\n\n${((Date.now() - t0) / 1000).toFixed(1)}秒 / ${guard}`;
  } catch (e) {
    out.textContent = `エラー: ${e.message}`;
  }
});

async function showMicStatus() {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' });
    $('micStatus').textContent = status.state === 'granted' ? '許可されています ✅' : '未許可';
  } catch {
    // permissions API が使えない環境ではボタンを押して確認してもらう
  }
}

chrome.commands.getAll().then((commands) => {
  const cmd = commands.find((c) => c.name === 'toggle-recording');
  $('shortcut').textContent = cmd?.shortcut || '未設定';
});
loadSettings().then(fillForm);
showMicStatus();
