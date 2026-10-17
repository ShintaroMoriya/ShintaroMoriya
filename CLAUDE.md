# CLAUDE.md

このリポジトリは Shintaro（守谷慎太郎）の個人記録用。AIが記録を作成・整理する時は以下に従う。

## 基本方針
- 目的は「後から探せて、読み返せる記録」。網羅性より **検索性と要点** を優先する
- 日本語で書く。日付は `YYYY-MM-DD`
- 認証情報（パスワード、口座番号、カード番号、マイナンバー等）は受け取っても **書かない**
- 推測で事実を補わない。不明な点は `（要確認）` と書く

## 保存先の決め方
| 内容 | 保存先 | ファイル名 |
|---|---|---|
| 会議・商談・1on1 | `01_meetings/YYYY/` | `YYYY-MM-DD_種別_タイトル.md` |
| 仕事のプロジェクト | `02_work/projects/` | `プロジェクト名.md`（追記していく） |
| 営業ノウハウ・トーク | `02_work/sales-knowledge/` | `テーマ.md` |
| 自作ツールの仕様・改善ログ | `02_work/tools/` | `ツール名.md` |
| 週次ふりかえり | `03_journal/YYYY/` | `YYYY-Www.md` |
| 健康・住まい・家族 | `04_life/{health,house,family}/` | `YYYY-MM-DD_タイトル.md` |
| 資産スナップショット | `05_money/` | `YYYY-MM.md` |
| 読書メモ | `06_learning/books/` | `書名.md` |
| AI・ツール検証 | `06_learning/ai-lab/` | `YYYY-MM-DD_テーマ.md` |
| キャリア・発信 | `07_career/` | `テーマ.md` |
| 分類に迷うもの | `00_inbox/` | `YYYY-MM-DD_メモ.md` |

種別の例：`社内` / `商談` / `1on1` / `家族` / `個人`

## テンプレート
新規作成時は `templates/` の該当ファイルをベースにする。
- 議事録 → `templates/meeting.md`
- 週次ふりかえり → `templates/weekly-review.md`
- 読書メモ → `templates/book-note.md`
- 資産スナップショット → `templates/money-monthly.md`

## 議事録の作り方
- 文字起こしやメモを渡されたら、**決定事項 → ToDo（担当・期限）→ 論点・議論** の順にまとめる
- ToDoは `- [ ] 内容（担当／期限）` の形式にする
- 顧客名など社外秘になりうる情報は、そのまま書くか伏せるか迷ったら確認する
