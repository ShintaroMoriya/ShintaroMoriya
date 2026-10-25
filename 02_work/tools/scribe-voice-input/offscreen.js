// 録音・API呼び出し・クリップボードを担当する offscreen document。
// offscreen では chrome.runtime しか使えないので、設定は background から受け取る。
import { runPipeline } from './lib/pipeline.js';

const MIN_RECORDING_MS = 500; // これより短い録音は押し間違いとして捨てる

let state = 'idle'; // 'idle' | 'recording' | 'processing'
let settings = null;
let stream = null;
let recorder = null;
let chunks = [];
let startedAt = 0;
let cancelled = false;
let autoStopTimer = null;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'offscreen') return;
  switch (msg.type) {
    case 'toggle':
      toggle(msg.settings).then(sendResponse);
      return true;
    case 'cancel':
      cancel();
      sendResponse(state);
      break;
    case 'copy':
      sendResponse(copyToClipboard(msg.text));
      break;
  }
});

function send(message) {
  chrome.runtime.sendMessage({ target: 'background', ...message });
}

function setState(next) {
  state = next;
  send({ type: 'state', state });
}

async function toggle(nextSettings) {
  if (state === 'idle') return start(nextSettings);
  if (state === 'recording') stop();
  return state; // processing 中は無視
}

async function start(nextSettings) {
  settings = nextSettings;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    const code = e.name === 'NotAllowedError' ? 'mic-permission' : 'mic-error';
    send({ type: 'error', code, message: `マイクを使えません: ${e.name}` });
    return state;
  }
  chunks = [];
  cancelled = false;
  recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = onStopped;
  recorder.start();
  startedAt = Date.now();
  autoStopTimer = setTimeout(stop, settings.maxSeconds * 1000);
  setState('recording');
  beep(880);
  return state;
}

function stop() {
  clearTimeout(autoStopTimer);
  if (recorder?.state === 'recording') recorder.stop();
}

function cancel() {
  cancelled = true;
  stop();
}

async function onStopped() {
  stream.getTracks().forEach((t) => t.stop()); // マイク使用中表示を消す
  if (cancelled || Date.now() - startedAt < MIN_RECORDING_MS) {
    setState('idle');
    return;
  }
  setState('processing');
  beep(660);
  const audio = new Blob(chunks, { type: recorder.mimeType.split(';')[0] }); // 'audio/webm'
  try {
    const result = await runPipeline(audio, settings);
    send({ type: 'result', result });
  } catch (e) {
    send({ type: 'error', code: 'api', message: e.message });
  } finally {
    setState('idle');
  }
}

// offscreen はフォーカスを持てず navigator.clipboard が使えないため execCommand で書き込む
function copyToClipboard(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.append(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  return ok;
}

function beep(freq) {
  if (!settings?.sound) return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => ctx.close();
  } catch {
    // 効果音は無くても動作に影響しない
  }
}
