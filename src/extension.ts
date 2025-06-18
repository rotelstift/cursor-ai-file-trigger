import * as vscode from 'vscode';
import * as path from 'path';

let isEnabled = true;
let fileWatchers: vscode.FileSystemWatcher[] = [];
let statusBarItem: vscode.StatusBarItem;
let pendingPrompts = new Map<string, NodeJS.Timeout>();

export function activate(context: vscode.ExtensionContext) {
  console.log('AI File Trigger 拡張機能が有効になりました');

  // ステータスバーアイテムを作成
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'aiFileTrigger.showStatus';
  context.subscriptions.push(statusBarItem);

  // コマンドを登録
  const enableCommand = vscode.commands.registerCommand('aiFileTrigger.enable', () => {
    enableTrigger();
  });

  const disableCommand = vscode.commands.registerCommand('aiFileTrigger.disable', () => {
    disableTrigger();
  });

  const statusCommand = vscode.commands.registerCommand('aiFileTrigger.showStatus', () => {
    showStatus();
  });

  context.subscriptions.push(enableCommand, disableCommand, statusCommand);

  // 設定変更を監視
  const configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('aiFileTrigger')) {
      setupFileWatchers(context);
      updateStatusBar();
    }
  });

  context.subscriptions.push(configWatcher);

  // 初期設定
  setupFileWatchers(context);
  updateStatusBar();

  // 開始メッセージ
  const config = vscode.workspace.getConfiguration('aiFileTrigger');
  const showNotifications = config.get<boolean>('showNotifications', true);
  if (showNotifications) {
    vscode.window.showInformationMessage('AI File Trigger が開始されました！');
  }
}

export function deactivate() {
  disposeWatchers();
  if (statusBarItem) {
    statusBarItem.dispose();
  }
  // 保留中のプロンプトをクリア
  pendingPrompts.forEach(timeout => clearTimeout(timeout));
  pendingPrompts.clear();
  console.log('AI File Trigger 拡張機能が無効になりました');
}

function setupFileWatchers(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('aiFileTrigger');
  isEnabled = config.get<boolean>('enabled', true);

  // 既存のウォッチャーを破棄
  disposeWatchers();

  if (!isEnabled) {
    return;
  }

  const filePatterns = config.get<string[]>('filePatterns', ['**/*.{ts,js,tsx,jsx,py,java,cpp,c,h}']);

  filePatterns.forEach(pattern => {
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    watcher.onDidChange(async (uri: vscode.Uri) => {
      await scheduleAIPrompt(uri, '変更');
    });

    watcher.onDidCreate(async (uri: vscode.Uri) => {
      await scheduleAIPrompt(uri, '作成');
    });

    fileWatchers.push(watcher);
    context.subscriptions.push(watcher);
  });

  console.log(`ファイルウォッチャーを設定しました: ${filePatterns.join(', ')}`);
}

function disposeWatchers() {
  fileWatchers.forEach(watcher => watcher.dispose());
  fileWatchers = [];
}

async function scheduleAIPrompt(uri: vscode.Uri, eventType: string) {
  const config = vscode.workspace.getConfiguration('aiFileTrigger');
  const delayMs = config.get<number>('delayMs', 2000);
  const filePath = uri.fsPath;

  // 隠しファイルやnode_modulesなどを除外
  if (shouldIgnoreFile(filePath)) {
    return;
  }

  // 既存の保留中プロンプトをキャンセル
  if (pendingPrompts.has(filePath)) {
    clearTimeout(pendingPrompts.get(filePath)!);
  }

  // 新しいプロンプトをスケジュール
  const timeout = setTimeout(async () => {
    pendingPrompts.delete(filePath);
    await runAIPrompt(uri, eventType);
  }, delayMs);

  pendingPrompts.set(filePath, timeout);
}

function shouldIgnoreFile(filePath: string): boolean {
  const ignorePaths = [
    'node_modules',
    '.git',
    '.vscode',
    'dist',
    'build',
    '.tmp',
    '.cache'
  ];

  return ignorePaths.some(ignorePath => filePath.includes(ignorePath)) ||
         path.basename(filePath).startsWith('.');
}

async function runAIPrompt(uri: vscode.Uri, eventType: string) {
  const config = vscode.workspace.getConfiguration('aiFileTrigger');
  const prompt = config.get<string>('prompt', 'このファイルの変更内容を確認し、コードの品質や改善点についてアドバイスしてください。');
  const showNotifications = config.get<boolean>('showNotifications', true);

  const fileName = path.basename(uri.fsPath);
  
  try {
    if (showNotifications) {
      vscode.window.showInformationMessage(
        `🤖 AI分析中: ${fileName} (${eventType})`,
        { modal: false }
      );
    }

    // ファイル内容を読み取り
    const document = await vscode.workspace.openTextDocument(uri);
    const fileContent = document.getText();

    // AI実行のシミュレーション（実際のAI APIの代わり）
    const aiResponse = await simulateAIResponse(fileContent, prompt, fileName, eventType);

    // 結果を表示
    await showAIResponse(fileName, eventType, aiResponse);

    console.log(`AI分析完了: ${fileName} (${eventType})`);

  } catch (error) {
    if (showNotifications) {
      vscode.window.showErrorMessage(`❌ AI分析エラー: ${fileName} - ${error}`);
    }
    console.error('AI Prompt Error:', error);
  }
}

async function simulateAIResponse(fileContent: string, prompt: string, fileName: string, eventType: string): Promise<string> {
  // 実際のAI APIの代わりにシミュレーション
  return new Promise((resolve) => {
    setTimeout(() => {
      const lines = fileContent.split('\n').length;
      const chars = fileContent.length;
      const words = fileContent.split(/\s+/).length;
      
      // ファイルタイプの判定
      const extension = path.extname(fileName).toLowerCase();
      let fileType = 'テキスト';
      if (['.ts', '.js', '.tsx', '.jsx'].includes(extension)) {
        fileType = 'JavaScript/TypeScript';
      } else if (['.py'].includes(extension)) {
        fileType = 'Python';
      } else if (['.java'].includes(extension)) {
        fileType = 'Java';
      } else if (['.cpp', '.c', '.h'].includes(extension)) {
        fileType = 'C/C++';
      }

      const response = `# 🤖 AI ファイル分析結果

## 📁 ファイル情報
- **ファイル名**: ${fileName}
- **イベント**: ${eventType}
- **ファイルタイプ**: ${fileType}
- **行数**: ${lines}行
- **文字数**: ${chars}文字
- **単語数**: ${words}語

## 🎯 実行プロンプト
${prompt}

## 📊 分析結果
このファイルは${lines}行の${fileType}コードを含んでいます。

### ✅ 推奨事項
1. **コメント**: コードの可読性向上のため、重要な処理にコメントを追加することを推奨します
2. **エラーハンドリング**: 例外処理の追加を検討してください
3. **テスト**: ユニットテストの作成を推奨します
4. **パフォーマンス**: 処理効率の最適化を検討してください

### 🔍 コード品質
- 構造: 良好
- 可読性: 向上の余地あり
- 保守性: 標準的

---
*分析時刻: ${new Date().toLocaleString('ja-JP')}*
*AI File Trigger 拡張機能により自動生成*`;

      resolve(response);
    }, 1500); // リアルなAI処理時間をシミュレート
  });
}

async function showAIResponse(fileName: string, eventType: string, response: string) {
  const config = vscode.workspace.getConfiguration('aiFileTrigger');
  const showNotifications = config.get<boolean>('showNotifications', true);

  try {
    // 新しいドキュメントでAI応答を表示
    const doc = await vscode.workspace.openTextDocument({
      content: response,
      language: 'markdown'
    });

    await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.Beside,
      preview: false
    });

    if (showNotifications) {
      const action = await vscode.window.showInformationMessage(
        `✅ AI分析完了: ${fileName}`,
        '結果を確認',
        'OK'
      );
      
      if (action === '結果を確認') {
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      }
    }
  } catch (error) {
    console.error('AI応答表示エラー:', error);
    if (showNotifications) {
      vscode.window.showErrorMessage('AI分析結果の表示中にエラーが発生しました');
    }
  }
}

function enableTrigger() {
  const config = vscode.workspace.getConfiguration('aiFileTrigger');
  config.update('enabled', true, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage('✅ AI File Trigger が有効になりました');
}

function disableTrigger() {
  const config = vscode.workspace.getConfiguration('aiFileTrigger');
  config.update('enabled', false, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage('⛔ AI File Trigger が無効になりました');
}

function showStatus() {
  const config = vscode.workspace.getConfiguration('aiFileTrigger');
  const enabled = config.get<boolean>('enabled', true);
  const filePatterns = config.get<string[]>('filePatterns', []);
  const prompt = config.get<string>('prompt', '');
  const delayMs = config.get<number>('delayMs', 2000);
  
  const message = `🤖 AI File Trigger ステータス

**状態**: ${enabled ? '✅ 有効' : '⛔ 無効'}
**監視パターン**: ${filePatterns.join(', ')}
**保留中のプロンプト**: ${pendingPrompts.size}個
**遅延時間**: ${delayMs}ms
**プロンプト**: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}

設定を変更するには、設定画面で "AI File Trigger" を検索してください。`;

  vscode.window.showInformationMessage(message, { modal: false });
}

function updateStatusBar() {
  const config = vscode.workspace.getConfiguration('aiFileTrigger');
  const enabled = config.get<boolean>('enabled', true);
  
  if (enabled) {
    statusBarItem.text = `$(eye) AI Trigger`;
    statusBarItem.tooltip = 'AI File Trigger: 有効 (クリックで詳細表示)';
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = `$(eye-closed) AI Trigger`;
    statusBarItem.tooltip = 'AI File Trigger: 無効 (クリックで詳細表示)';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }
  
  statusBarItem.show();
} 