# ElevenLabs Scribe で音声入力（マイク不要化）

- 日付: 2026-10-25
- 結論: **外付けマイクは不要**。Scribe の雑音分離が強く、内蔵マイクで実用になる。速さより雑音耐性を取る

## 比較（使ってみた実感）
| | ElevenLabs Scribe | OpenAI Whisper |
|---|---|---|
| 速さ | Whisper より遅い | 速い |
| 雑音 | 雑音をきれいに切り分け、自分の声だけを拾う | 雑音に弱く、ノイズが混ざる |
| 数字 | やたら漢数字にする | （要確認） |

→ マイクが要らなくなり、荷物が1つ減る。

## 漢数字問題への対応
- 方針: LLM の後処理で算用数字に直す
- 調べて分かったこと（2026-10-25 時点のドキュメント）
  - Scribe に **`transcript_edit`** が追加されていた（2026-09-28、実験的機能）。文字起こしの後に、自然言語の指示（最大2000文字）で編集した結果を `edited_transcript` で返す。料金は +30%（1回最低10秒分）
  - ガイドに **`numbers_format`**（数字か文字かを選ぶ。"where supported"）の記載があるが、APIリファレンスには載っていない（要確認）
  - `no_verbatim=true` で「えー」「あのー」などのフィラーを除去できる（scribe_v2）
  - `keyterms` で社名・商品名などの認識を補強できる（+20%）
- 実装: [Scribe音声入力（Chrome拡張）](../../02_work/tools/scribe-voice-input.md)

## 出典
- [Speech to Text API リファレンス](https://elevenlabs.io/docs/api-reference/speech-to-text/convert)
- [Transcript editing（batch）](https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/batch/transcript-editing)
- [Changelog 2026-09-28](https://elevenlabs.io/docs/changelog/2026/9/28)
