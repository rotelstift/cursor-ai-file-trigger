# Cursor AI File Trigger

**Cursor専用拡張機能** 🎯

この拡張機能は[Cursor](https://cursor.sh/)専用に設計されており、Cursorの AI チャット機能と連携してファイル変更を自動検知し、AIプロンプトを送信します。

## ⚠️ 重要な注意事項

- **この拡張機能はCursor専用です**
- VSCodeでは多分動作しません
- Cursorをお持ちでない場合は、[cursor.sh](https://cursor.sh/)からダウンロードしてください

## 機能

- ファイル変更の自動検知
- Cursor AI チャットとの自動連携
- ファイルパターン毎のカスタムプロンプト設定
- `@filename` 形式での効率的なファイル参照

## インストール

### 方法1: 手動インストール
1. [Releases](https://github.com/rotelstift/cursor-ai-file-trigger/releases)から最新の`.vsix`ファイルをダウンロード
2. Cursorで `Ctrl+Shift+P` → "Extensions: Install from VSIX..."
3. ダウンロードした`.vsix`ファイルを選択

## 設定例

```json
{
  "aiFileTrigger.filePatternConfigs": [
    {
      "pattern": "**/*.{ts,js,tsx,jsx}",
      "prompt": "このTypeScript/JavaScriptファイルを分析して、Cursorでの開発効率を上げるアドバイスをください。"
    }
  ]
}
```

## サポート

- [GitHub Issues](https://github.com/your-username/cursor-ai-file-trigger/issues)
- [Cursor Community](https://cursor.sh/community)

## ライセンス

MIT License
