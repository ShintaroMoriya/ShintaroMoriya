import { loadSettings, missingKey } from './lib/settings.js';

const HISTORY_LIMIT = 20;
const BADGE = {
  idle: ['', '#5f6368'],
  recording: ['REC', '#d93025'],
  processing: ['…', '#f29900'],
};

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-recording') toggle(tab?.id);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'background') return;
  switch (msg.type) {
    case 'toggle': // ポップアップのボタンから
      chrome.tabs.query({ active: true, lastFocusedWindow: true })
        .then(([tab]) => toggle(tab?.id))
        .then(sendResponse);
      return true;
    case 'state':
      setState(msg.state);
      break;
    case 'result':
      handleResult(msg.result);
      break;
    case 'error':
      handleError(msg);
      break;
  }
});

async function toggle(tabId) {
  const settings = await loadSettings();
  const missing = missingKey(settings);
  if (missing) {
    flash('KEY', '#d93025', `${missing}を設定してください`);
    chrome.runtime.openOptionsPage();
    return 'idle';
  }
  // 停止操作をしたタブに入力する（ショートカット押下で activeTab 権限もそのタブに付く）
  if (tabId != null) await chrome.storage.session.set({ targetTabId: tabId });
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: 'offscreen', type: 'toggle', settings });
}

let creatingOffscreen = null;
async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length) return;
  creatingOffscreen ??= chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA', 'CLIPBOARD'],
    justification: '音声入力の録音と、入力できなかった時のクリップボードコピー',
  }).finally(() => { creatingOffscreen = null; });
  await creatingOffscreen;
}

const FLASH_MS = 2500;
let flashUntil = 0;
let flashTimer = null;

async function setState(state) {
  await chrome.storage.session.set({ state });
  if (state === 'idle' && Date.now() < flashUntil) return; // 結果表示（OK など）を消さない
  chrome.action.setTitle({ title: state === 'recording' ? '録音中（もう一度押すと停止）' : 'Scribe音声入力' });
  const [text, color] = BADGE[state];
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

function flash(text, color, title) {
  flashUntil = Date.now() + FLASH_MS;
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  if (title) chrome.action.setTitle({ title });
  clearTimeout(flashTimer); // 前回の表示を消すタイマーが今回の表示を消さないように
  flashTimer = setTimeout(async () => {
    const { state } = await chrome.storage.session.get('state');
    if (!state || state === 'idle') chrome.action.setBadgeText({ text: '' });
  }, FLASH_MS);
}

async function handleResult(result) {
  let inserted = false;
  if (result.text) {
    const settings = await loadSettings();
    const { targetTabId } = await chrome.storage.session.get('targetTabId');
    inserted = await insertIntoTab(targetTabId, result.text);
    if (!inserted || settings.alwaysCopy) await copyToClipboard(result.text);
  }
  await addHistory({ ...result, inserted, at: Date.now() });

  if (!result.text) flash('∅', '#5f6368', '音声を認識できませんでした');
  else if (result.note) flash('!', '#f29900', result.note);
  else if (inserted) flash('OK', '#188038');
  else flash('CP', '#1a73e8', '入力欄が見つからないためクリップボードにコピーしました');
}

async function handleError({ code, message }) {
  await addHistory({ error: message, at: Date.now() });
  flash('ERR', '#d93025', message);
  if (code === 'mic-permission') chrome.tabs.create({ url: chrome.runtime.getURL('options.html#mic') });
}

async function insertIntoTab(tabId, text) {
  if (tabId == null) return false;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: insertAtCursor,
      args: [text],
    });
    return results.some((r) => r.result === true);
  } catch {
    return false; // chrome:// ページや権限のないタブ
  }
}

// ページ側で実行される。フォーカス中の入力欄にカーソル位置で挿入する
function insertAtCursor(text) {
  if (!document.hasFocus()) return false;
  let el = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  if (!el) return false;
  const isTextField = el.tagName === 'TEXTAREA'
    || (el.tagName === 'INPUT' && /^(text|search|url|email|tel)$/.test(el.type));
  if (!isTextField && !el.isContentEditable) return false;
  // execCommand なら React 等の入力イベントも発火し、Ctrl+Z で取り消せる
  if (document.execCommand('insertText', false, text)) return true;
  if (!isTextField) return false;
  el.setRangeText(text, el.selectionStart, el.selectionEnd, 'end');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

async function copyToClipboard(text) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: 'offscreen', type: 'copy', text });
}

async function addHistory(entry) {
  const { history = [] } = await chrome.storage.local.get('history');
  await chrome.storage.local.set({ history: [entry, ...history].slice(0, HISTORY_LIMIT) });
}
