import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const watcher = vscode.workspace.createFileSystemWatcher('**/*');

  watcher.onDidChange(async (uri: vscode.Uri) => {
    await runAIPrompt(uri, 'changed');
  });
  watcher.onDidCreate(async (uri: vscode.Uri) => {
    await runAIPrompt(uri, 'created');
  });
  watcher.onDidDelete(async (uri: vscode.Uri) => {
    await runAIPrompt(uri, 'deleted');
  });

  const disposable = vscode.commands.registerCommand('cursor-ai-file-trigger.runPromptOnFileChange', async () => {
    vscode.window.showInformationMessage('AI File Trigger is active!');
  });

  context.subscriptions.push(disposable, watcher);
}

export function deactivate() {}

async function runAIPrompt(uri: vscode.Uri, eventType: string) {
  // ここでAIプロンプトを実行する処理を記述
  vscode.window.showInformationMessage(`File ${eventType}: ${uri.fsPath}`);
  // TODO: AI APIとの連携やプロンプトの実行処理を追加
} 