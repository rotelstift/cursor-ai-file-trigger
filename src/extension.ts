import * as vscode from 'vscode';
import * as path from 'path';

let isEnabled = true;
let fileWatchers: vscode.FileSystemWatcher[] = [];
let statusBarItem: vscode.StatusBarItem;
let pendingPrompts = new Map<string, NodeJS.Timeout>();

// ファイルパターンとプロンプトの型定義
interface FilePatternConfig {
  pattern: string;
  prompt: string;
}

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

  const filePatternConfigs = getFilePatternConfigs(config);

  filePatternConfigs.forEach((patternConfig, index) => {
    const watcher = vscode.workspace.createFileSystemWatcher(patternConfig.pattern);

    watcher.onDidChange(async (uri: vscode.Uri) => {
      await scheduleAIPrompt(uri, '変更', patternConfig.prompt);
    });

    watcher.onDidCreate(async (uri: vscode.Uri) => {
      await scheduleAIPrompt(uri, '作成', patternConfig.prompt);
    });

    fileWatchers.push(watcher);
    context.subscriptions.push(watcher);
  });

  console.log(`ファイルウォッチャーを設定しました: ${filePatternConfigs.map(c => c.pattern).join(', ')}`);
}

function getFilePatternConfigs(config: vscode.WorkspaceConfiguration): FilePatternConfig[] {
  const filePatternConfigs = config.get<FilePatternConfig[]>('filePatternConfigs', []);
  
  // 設定が空の場合はデフォルト設定を返す
  if (filePatternConfigs.length === 0) {
    return [
      {
        pattern: '**/*.{ts,js,tsx,jsx}',
        prompt: 'このTypeScript/JavaScriptファイルを分析して、コードの品質や改善点についてアドバイスしてください。'
      },
      {
        pattern: '**/*.py',
        prompt: 'このPythonファイルを分析して、コードの品質や改善点についてアドバイスしてください。'
      },
      {
        pattern: '**/*.{java,cpp,c,h}',
        prompt: 'このファイルを分析して、コードの品質や改善点についてアドバイスしてください。'
      }
    ];
  }

  return filePatternConfigs.map(config => ({
    pattern: config.pattern || '**/*',
    prompt: config.prompt || 'このファイルを分析して、コードの品質や改善点についてアドバイスしてください。'
  }));
}

function disposeWatchers() {
  fileWatchers.forEach(watcher => watcher.dispose());
  fileWatchers = [];
}

async function scheduleAIPrompt(uri: vscode.Uri, eventType: string, prompt: string) {
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
    
    try {
      const fileName = path.basename(uri.fsPath);
      const relativePath = vscode.workspace.asRelativePath(uri, false);

      // @filename 形式を使ったプロンプトを構築
      const chatPrompt = `@${relativePath}
${prompt}`;

      // チャットウィンドウに送信
      await sendToChat(chatPrompt, fileName, eventType);
      
      console.log(`AI分析完了: ${fileName} (${eventType})`);
      
    } catch (error) {
      const config = vscode.workspace.getConfiguration('aiFileTrigger');
      const showNotifications = config.get<boolean>('showNotifications', true);
      
      if (showNotifications) {
        vscode.window.showErrorMessage(`❌ AI分析エラー: ${path.basename(uri.fsPath)} - ${error}`);
      }
      console.error('AI Prompt Error:', error);
    }
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

            // クリップボードの内容をペースト
            await vscode.commands.executeCommand('execPaste');
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
  const filePatternConfigs = getFilePatternConfigs(config);
  const delayMs = config.get<number>('delayMs', 2000);
  
  const patternsInfo = filePatternConfigs.map((config, index) => 
    `${index + 1}. ${config.pattern}: ${config.prompt.substring(0, 40)}${config.prompt.length > 40 ? '...' : ''}`
  ).join('\n');
  
  const message = `🤖 AI File Trigger ステータス

**状態**: ${enabled ? '✅ 有効' : '⛔ 無効'}
**保留中のプロンプト**: ${pendingPrompts.size}個
**遅延時間**: ${delayMs}ms

**ファイルパターン設定** (${filePatternConfigs.length}件):
${patternsInfo}

設定を変更するには、設定画面で "aiFileTrigger.filePatternConfigs" を検索してください。`;

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