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

async function sendToChat(message: string, fileName: string, eventType: string): Promise<void> {
  const config = vscode.workspace.getConfiguration('aiFileTrigger');
  const autoCopyToClipboard = config.get<boolean>('autoCopyToClipboard', true);
  const autoOpenChat = config.get<boolean>('autoOpenChat', true);
  const autoSubmitToChat = config.get<boolean>('autoSubmitToChat', true);

  try {
    let clipboardCopied = false;
    let chatOpened = false;
    let messageSubmitted = false;
    
    // クリップボードにコピー（設定で有効な場合）
    if (autoCopyToClipboard) {
      await vscode.env.clipboard.writeText(message);
      clipboardCopied = true;
    }
    
    // チャットを自動で開く（設定で有効な場合）
    if (autoOpenChat) {
      try {
        await vscode.commands.executeCommand('aichat.newchataction');
        chatOpened = true;
        console.log(`Successfully opened chat with command: aichat.newchataction`);
        
        // チャットが開かれるまで少し待機
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // クリップボード経由でプロンプトを送信（設定で有効な場合）
        if (autoSubmitToChat && clipboardCopied) {
          try {
            // チャット入力欄にフォーカスを当ててペースト・送信
            await vscode.commands.executeCommand('aichat.newfollowupaction');
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // 入力欄をクリアしてからペースト
            // await vscode.commands.executeCommand('editor.action.selectAll');
            await vscode.commands.executeCommand('execPaste');
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // workbench.action.chat.submit で送信
            await vscode.commands.executeCommand('workbench.action.chat.submit');
            messageSubmitted = true;
            console.log(`Successfully submitted via clipboard with command: workbench.action.chat.submit`);
          } catch (error) {
            console.log('Clipboard paste and submit method failed:', error);
          }
        }
        
      } catch (commandError) {
        console.log(`Command aichat.newchataction failed:`, commandError);
      }
    }
    
    // 通知メッセージを構築
    let notificationMessage = `🤖 ファイル分析プロンプト: ${fileName}`;
    if (clipboardCopied) {
      notificationMessage += '\n📋 クリップボードにコピー済み';
    }
    if (chatOpened) {
      notificationMessage += '\n💬 チャットビューを開きました';
    }
    if (messageSubmitted) {
      notificationMessage += '\n✅ プロンプトを自動送信しました';
    }
    
    const actions: string[] = [];
    if (!clipboardCopied) {
      actions.push('クリップボードにコピー');
    }
    if (!chatOpened) {
      actions.push('チャットを開く');
    }
    if (!messageSubmitted && chatOpened) {
      actions.push('手動送信');
    }
    actions.push('OK');
    
    // ユーザーに通知
    const action = await vscode.window.showInformationMessage(
      notificationMessage,
      ...actions
    );
    
    // アクションの処理
    if (action === 'クリップボードにコピー') {
      await vscode.env.clipboard.writeText(message);
      vscode.window.showInformationMessage('📋 クリップボードにコピーしました');
    } else if (action === 'チャットを開く') {
      try {
        await vscode.commands.executeCommand('aichat.newchataction');
        if (!clipboardCopied) {
          await vscode.env.clipboard.writeText(message);
        }
        vscode.window.showInformationMessage('💬 チャットを開きました');
      } catch (commandError) {
        console.log('Failed to open chat:', commandError);
      }
    } else if (action === '手動送信') {
      vscode.window.showInformationMessage('💡 チャット欄にペースト（Ctrl+V）して送信してください');
    }

  } catch (error) {
    console.error('Chat send error:', error);
    // フォールバック: クリップボードにコピーのみ
    await vscode.env.clipboard.writeText(message);
    vscode.window.showWarningMessage(
      `チャット機能が利用できませんが、プロンプトをクリップボードにコピーしました: ${fileName}`
    );
  }
}

async function simulateAIResponse(fileContent: string, prompt: string, fileName: string, eventType: string): Promise<string> {
  try {
    // ファイル情報を取得
    const lines = fileContent.split('\n').length;
    const chars = fileContent.length;
    const extension = path.extname(fileName).toLowerCase();
    
    // ファイルタイプの判定
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

    // チャットに送信するプロンプトを構築
    const chatPrompt = `${prompt}

📁 **ファイル情報**
- ファイル名: ${fileName}
- ファイルタイプ: ${fileType}  
- イベント: ${eventType}
- 行数: ${lines}行
- 文字数: ${chars}文字

📄 **ファイル内容:**
\`\`\`${extension.substring(1) || 'text'}
${fileContent}
\`\`\`

上記のファイルを分析して、コードの品質、改善点、セキュリティ考慮点、パフォーマンス改善点について日本語でアドバイスしてください。`;

    // チャットウィンドウに送信
    await sendToChat(chatPrompt, fileName, eventType);

    // 分析結果のプレースホルダーを返す
    const response = `# 🤖 AI ファイル分析結果

## 📁 ファイル情報
- **ファイル名**: ${fileName}
- **イベント**: ${eventType}
- **ファイルタイプ**: ${fileType}
- **行数**: ${lines}行
- **文字数**: ${chars}文字

## 🎯 実行プロンプト
${prompt}

## 💬 チャット送信完了
ファイル分析のプロンプトをチャットウィンドウに送信しました。
チャットパネルでAIの応答を確認してください。

---
*送信時刻: ${new Date().toLocaleString('ja-JP')}*
*AI File Trigger 拡張機能により自動送信*`;

    return response;

  } catch (error: any) {
    console.error('Chat send error:', error);
    return `# ❌ エラー

チャットへの送信中にエラーが発生しました: ${error.message}

---
*エラー時刻: ${new Date().toLocaleString('ja-JP')}*`;
  }
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