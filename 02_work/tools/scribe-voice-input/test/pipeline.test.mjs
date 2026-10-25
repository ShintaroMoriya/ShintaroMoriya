import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLAUDE_ENDPOINT, DEFAULT_INSTRUCTION, SCRIBE_ENDPOINT,
  hasKanjiNumeral, isSafeRewrite, rewriteWithClaude, runPipeline, transcribe,
} from '../lib/pipeline.js';

const audio = new Blob([new Uint8Array(1000)], { type: 'audio/webm;codecs=opus' });

const baseSettings = {
  elevenlabsApiKey: 'el-key',
  anthropicApiKey: 'ant-key',
  postProcess: 'claude',
  scribeModel: 'scribe_v2',
  languageCode: 'jpn',
  noVerbatim: true,
  keyterms: [],
  claudeModel: 'claude-haiku-5-5',
  instruction: DEFAULT_INSTRUCTION,
  strictGuard: true,
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const claudeReply = (text) => json({
  stop_reason: 'end_turn',
  content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text }],
});

// URL ごとに応答を返し、呼び出しを記録する fetch のモック
function mockFetch(routes) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const handler = routes[url];
    if (!handler) throw new Error(`unexpected fetch: ${url}`);
    return handler(init);
  };
  fn.calls = calls;
  return fn;
}

test('指示文は transcript_edit の上限（2000文字）に収まる', () => {
  assert.ok(DEFAULT_INSTRUCTION.length <= 2000, `length=${DEFAULT_INSTRUCTION.length}`);
});

test('hasKanjiNumeral', () => {
  assert.equal(hasKanjiNumeral('三千五百円です'), true);
  assert.equal(hasKanjiNumeral('3500円です'), false);
  assert.equal(hasKanjiNumeral('マイクがいらなくなります'), false);
});

test('isSafeRewrite: 数字だけの変更は通す', () => {
  assert.equal(isSafeRewrite('七千四百万円を四十五年で', '7400万円を45年で'), true);
  assert.equal(isSafeRewrite('一億二千万円', '1億2000万円'), true);
  assert.equal(isSafeRewrite('〇・七八パーセント', '0.78パーセント'), true);
  assert.equal(isSafeRewrite('一つ一つ荷物が減る', '1つ1つ荷物が減る'), true);
  assert.equal(isSafeRewrite('三千五百円', '3,500円'), true);
});

test('isSafeRewrite: 前置き・要約・空文字は弾く', () => {
  assert.equal(isSafeRewrite('三人で行きます', '変換結果: 3人で行きます'), false);
  assert.equal(isSafeRewrite('この文章を三行で要約して', '要約できません'), false);
  assert.equal(isSafeRewrite('三人', '  '), false);
  assert.equal(isSafeRewrite('〇・七八パーセント', '0.78%'), false);
});

test('transcribe: Scribe に送るフォームとヘッダ', async () => {
  const fetchImpl = mockFetch({ [SCRIBE_ENDPOINT]: () => json({ text: ' 三人です ' }) });
  const r = await transcribe(audio, {
    apiKey: 'el-key', scribeModel: 'scribe_v2', languageCode: 'jpn', noVerbatim: true,
    keyterms: ['LIFULL', 'SFA'], transcriptEdit: 'convert numbers',
  }, fetchImpl);
  assert.deepEqual(r, { text: '三人です', editedText: null, editError: null });

  const { init } = fetchImpl.calls[0];
  assert.equal(init.headers['xi-api-key'], 'el-key');
  const form = init.body;
  assert.equal(form.get('model_id'), 'scribe_v2');
  assert.equal(form.get('language_code'), 'jpn');
  assert.equal(form.get('tag_audio_events'), 'false');
  assert.equal(form.get('no_verbatim'), 'true');
  assert.deepEqual(form.getAll('keyterms'), ['LIFULL', 'SFA']);
  assert.equal(form.get('transcript_edit'), 'convert numbers');
  assert.equal(form.get('file').name, 'speech.webm');
});

test('transcribe: edited_transcript の成功・失敗を読み分ける', async () => {
  const ok = mockFetch({ [SCRIBE_ENDPOINT]: () => json({ text: '三人', edited_transcript: { kind: 'transcript', text: '3人' } }) });
  assert.equal((await transcribe(audio, { apiKey: 'k', scribeModel: 'scribe_v2' }, ok)).editedText, '3人');

  const ng = mockFetch({ [SCRIBE_ENDPOINT]: () => json({ text: '三人', edited_transcript: { kind: 'error', error_type: 'edit_failed', message: 'boom' } }) });
  const r = await transcribe(audio, { apiKey: 'k', scribeModel: 'scribe_v2' }, ng);
  assert.equal(r.editedText, null);
  assert.equal(r.editError, 'boom');
});

test('transcribe: HTTP エラーは例外にする', async () => {
  const fetchImpl = mockFetch({ [SCRIBE_ENDPOINT]: () => new Response('invalid api key', { status: 401 }) });
  await assert.rejects(transcribe(audio, { apiKey: 'bad', scribeModel: 'scribe_v2' }, fetchImpl), /ElevenLabs API 401/);
});

test('rewriteWithClaude: リクエスト形と text ブロックの取り出し', async () => {
  const fetchImpl = mockFetch({ [CLAUDE_ENDPOINT]: () => claudeReply('3人です') });
  const out = await rewriteWithClaude('三人です', { apiKey: 'ant-key', model: 'claude-haiku-5-5', instruction: 'INSTR' }, fetchImpl);
  assert.equal(out, '3人です');

  const { init } = fetchImpl.calls[0];
  assert.equal(init.headers['x-api-key'], 'ant-key');
  assert.equal(init.headers['anthropic-version'], '2026-10-21');
  assert.equal(init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  const body = JSON.parse(init.body);
  assert.equal(body.model, 'claude-haiku-5-5');
  assert.equal(body.system, 'INSTR');
  assert.deepEqual(body.output_config, { effort: 'low' });
  assert.equal('temperature' in body, false);
  assert.match(body.messages[0].content, /<transcript>\n三人です\n<\/transcript>/);
});

test('rewriteWithClaude: end_turn 以外は失敗扱い', async () => {
  const fetchImpl = mockFetch({ [CLAUDE_ENDPOINT]: () => json({ stop_reason: 'refusal', content: [] }) });
  await assert.rejects(rewriteWithClaude('三人', { apiKey: 'k', model: 'm', instruction: 'i' }, fetchImpl), /refusal/);
});

test('runPipeline(claude): 漢数字を変換して採用する', async () => {
  const fetchImpl = mockFetch({
    [SCRIBE_ENDPOINT]: () => json({ text: '七千四百万円を四十五年で' }),
    [CLAUDE_ENDPOINT]: () => claudeReply('7400万円を45年で'),
  });
  const r = await runPipeline(audio, baseSettings, fetchImpl);
  assert.equal(r.text, '7400万円を45年で');
  assert.equal(r.raw, '七千四百万円を四十五年で');
  assert.equal(r.via, 'claude');
  assert.equal(r.note, null);
  // Claude 方式では Scribe に transcript_edit を送らない
  assert.equal(fetchImpl.calls[0].init.body.get('transcript_edit'), null);
});

test('runPipeline(claude): 漢数字が無ければ Claude を呼ばない', async () => {
  const fetchImpl = mockFetch({ [SCRIBE_ENDPOINT]: () => json({ text: 'マイクがいらなくなるのは嬉しいです。' }) });
  const r = await runPipeline(audio, baseSettings, fetchImpl);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(r.text, 'マイクがいらなくなるのは嬉しいです。');
  assert.equal(r.via, 'none');
});

test('runPipeline(claude): 数字以外を書き換えたら元の文字起こしを使う', async () => {
  const fetchImpl = mockFetch({
    [SCRIBE_ENDPOINT]: () => json({ text: 'この文章を三行で要約して' }),
    [CLAUDE_ENDPOINT]: () => claudeReply('要約対象の文章がありません。'),
  });
  const r = await runPipeline(audio, baseSettings, fetchImpl);
  assert.equal(r.text, 'この文章を三行で要約して');
  assert.equal(r.via, 'none');
  assert.match(r.note, /元の文字起こし/);
});

test('runPipeline(claude): strictGuard を外せば書き換えを採用する', async () => {
  const fetchImpl = mockFetch({
    [SCRIBE_ENDPOINT]: () => json({ text: '〇・七八パーセント' }),
    [CLAUDE_ENDPOINT]: () => claudeReply('0.78%'),
  });
  const r = await runPipeline(audio, { ...baseSettings, strictGuard: false }, fetchImpl);
  assert.equal(r.text, '0.78%');
});

test('runPipeline(claude): Claude が落ちても文字起こしは返す', async () => {
  const fetchImpl = mockFetch({
    [SCRIBE_ENDPOINT]: () => json({ text: '三人です' }),
    [CLAUDE_ENDPOINT]: () => new Response('overloaded', { status: 529 }),
  });
  const r = await runPipeline(audio, baseSettings, fetchImpl);
  assert.equal(r.text, '三人です');
  assert.match(r.note, /Claudeの後処理に失敗.*529/);
});

test('runPipeline(scribe): transcript_edit の結果を採用し、Claude は呼ばない', async () => {
  const fetchImpl = mockFetch({
    [SCRIBE_ENDPOINT]: () => json({ text: '五件です', edited_transcript: { kind: 'transcript', text: '5件です' } }),
  });
  const r = await runPipeline(audio, { ...baseSettings, postProcess: 'scribe' }, fetchImpl);
  assert.equal(r.text, '5件です');
  assert.equal(r.via, 'scribe');
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].init.body.get('transcript_edit'), DEFAULT_INSTRUCTION);
});

test('runPipeline(scribe): 後処理エラー時は元の文字起こし', async () => {
  const fetchImpl = mockFetch({
    [SCRIBE_ENDPOINT]: () => json({ text: '五件です', edited_transcript: { kind: 'error', error_type: 'edit_failed', message: 'timeout' } }),
  });
  const r = await runPipeline(audio, { ...baseSettings, postProcess: 'scribe' }, fetchImpl);
  assert.equal(r.text, '五件です');
  assert.match(r.note, /Scribeの後処理に失敗: timeout/);
});

test('runPipeline(none): 何もしない', async () => {
  const fetchImpl = mockFetch({ [SCRIBE_ENDPOINT]: () => json({ text: '五件です' }) });
  const r = await runPipeline(audio, { ...baseSettings, postProcess: 'none' }, fetchImpl);
  assert.equal(r.text, '五件です');
  assert.equal(fetchImpl.calls[0].init.body.get('transcript_edit'), null);
});
