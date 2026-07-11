# 就活ノート

大学新卒の就職活動を管理するWebアプリ。企業研究・選考進捗・カレンダー・ES・メモを1か所で管理できます。

- データは**使う人それぞれのブラウザ内**に自動保存されます(サーバーには送信されません)
- ヘッダーの「書き出し」でバックアップ(JSON)、「読み込み」で復元・機種変更時の引き継ぎができます
- 「☁️ Drive保存 / Drive復元」で**本人のGoogleドライブ**にスプレッドシートとしてバックアップできます(要初期設定: [GOOGLE_DRIVE_SETUP.md](GOOGLE_DRIVE_SETUP.md))

## 公開手順(GitHub Pages)

1. GitHubで新しいリポジトリを作成(**Public**にする。無料プランのPagesはPublicのみ)
2. このフォルダの中身をすべてアップロード
   - Web画面なら「Add file > Upload files」でドラッグ&ドロップ
   - `.github` フォルダも忘れずに(隠しフォルダなので注意)
3. リポジトリの **Settings > Pages** を開き、**Source を「GitHub Actions」** に変更
4. 数分待つと `https://ユーザー名.github.io/リポジトリ名/` で公開されます
   - 以後、mainブランチに変更をpushするたびに自動で更新されます

## コードを編集するには

いちばん手軽なのは **github.dev**: リポジトリを開いてキーボードの `.`(ピリオド)を押すと、ブラウザ上のエディタが開きます。`src/App.jsx` を編集してコミットすれば自動で再公開されます。

ローカルで動かす場合(Node.js 18以上が必要):

```bash
npm install
npm run dev      # http://localhost:5173 で確認
npm run build    # 公開用ファイルを dist/ に生成
```

## 構成

```
index.html                    ページの入れ物(Tailwind CSSをCDNで読込)
src/App.jsx                   アプリ本体(画面・機能はすべてここ)
src/driveBackup.js            Googleドライブ連携(バックアップ・復元)
src/main.jsx                  Reactの起動処理
GOOGLE_DRIVE_SETUP.md         Drive連携の初期設定手順
vite.config.js                ビルド設定
.github/workflows/deploy.yml  push時の自動公開設定
```

## 注意事項

- データは端末のブラウザごとに保存されるため、**共有URLでも他人にデータは見えません**(逆に、端末をまたぐ同期もされません)
- ブラウザの履歴・サイトデータを削除するとデータも消えます。定期的に「書き出し」でバックアップを推奨
