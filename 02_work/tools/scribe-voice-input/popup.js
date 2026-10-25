const VIA_LABEL = { scribe: 'Scribe後処理', claude: 'Claude後処理', none: '後処理なし' };
const BUTTON_LABEL = { idle: '録音開始', recording: '録音停止', processing: '変換中…' };

const toggleButton = document.getElementById('toggle');
const shortcutLink = document.getElementById('shortcut');
const historyList = document.getElementById('history');

toggleButton.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ target: 'background', type: 'toggle' });
  window.close(); // ポップアップを閉じてページにフォーカスを戻す（戻らないと挿入できない）
});

shortcutLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

function renderState(state = 'idle') {
  toggleButton.textContent = BUTTON_LABEL[state];
  toggleButton.disabled = state === 'processing';
  toggleButton.className = state === 'recording' ? 'recording' : 'primary';
}

function renderHistory(history = []) {
  historyList.replaceChildren(...history.map((h) => {
    const li = document.createElement('li');
    const meta = document.createElement('div');
    meta.className = 'meta muted';
    const info = document.createElement('span');
    const time = new Date(h.at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    info.textContent = h.error
      ? `${time} エラー`
      : `${time} ${VIA_LABEL[h.via] ?? ''} ${(h.sttMs / 1000).toFixed(1)}s+${(h.postMs / 1000).toFixed(1)}s${h.inserted ? '' : ' 📋'}`;
    meta.append(info);
    if (h.text) {
      const copy = document.createElement('button');
      copy.textContent = 'コピー';
      copy.addEventListener('click', () => navigator.clipboard.writeText(h.text));
      meta.append(copy);
    }
    const text = document.createElement('div');
    text.className = 'text';
    text.textContent = h.error ?? (h.text || '（認識なし）');
    li.append(meta, text);
    if (h.raw && h.raw !== h.text) {
      const raw = document.createElement('div');
      raw.className = 'muted';
      raw.textContent = `元: ${h.raw}`;
      li.append(raw);
    }
    if (h.note) {
      const note = document.createElement('div');
      note.className = 'muted warn';
      note.textContent = h.note;
      li.append(note);
    }
    return li;
  }));
}

chrome.commands.getAll().then((commands) => {
  const cmd = commands.find((c) => c.name === 'toggle-recording');
  shortcutLink.textContent = cmd?.shortcut || '未設定';
});
chrome.storage.session.get('state').then(({ state }) => renderState(state));
chrome.storage.local.get('history').then(({ history }) => renderHistory(history));
chrome.storage.onChanged.addListener((changes) => {
  if (changes.state) renderState(changes.state.newValue);
  if (changes.history) renderHistory(changes.history.newValue);
});
