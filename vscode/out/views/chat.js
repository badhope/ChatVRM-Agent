"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatViewProvider = void 0;
class ChatViewProvider {
    _extensionUri;
    client;
    static viewType = 'devflow.chat';
    _view;
    messageHistory = [];
    constructor(_extensionUri, client) {
        this._extensionUri = _extensionUri;
        this.client = client;
    }
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview();
        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'submit') {
                await this.handleSubmit(message.text);
            }
            else if (message.command === 'clear') {
                this.messageHistory = [];
                this._view?.webview.postMessage({ command: 'cleared' });
            }
        });
    }
    async handleSubmit(text) {
        if (!this._view) {
            return;
        }
        // Add user message to history
        this.messageHistory.push({ role: 'user', content: text });
        this._view.webview.postMessage({ command: 'userMessage', text });
        try {
            // Show typing indicator
            this._view.webview.postMessage({ command: 'typing', isTyping: true });
            const response = await this.client.chat(text);
            // Handle response based on unified ApiResponse format
            let responseText;
            if (response.success && response.data !== undefined) {
                responseText = response.data;
            }
            else {
                responseText = `Error: ${response.error?.message || 'Unknown error'} (${response.error?.code || 'UNKNOWN'})`;
            }
            // Add assistant response to history
            this.messageHistory.push({ role: 'assistant', content: responseText });
            this._view.webview.postMessage({ command: 'response', text: responseText });
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            this._view.webview.postMessage({ command: 'error', text: errorMsg });
        }
        finally {
            this._view.webview.postMessage({ command: 'typing', isTyping: false });
        }
    }
    _getHtmlForWebview() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DevFlow Chat</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 10px;
        }
        .message {
            margin-bottom: 10px;
            padding: 8px 12px;
            border-radius: 6px;
            max-width: 90%;
        }
        .message.user {
            background: var(--vscode-input-background);
            margin-left: auto;
        }
        .message.assistant {
            background: var(--vscode-editor-inactiveSelectionBackground);
        }
        .message.error {
            background: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
        }
        .input-container {
            display: flex;
            padding: 10px;
            border-top: 1px solid var(--vscode-panel-border);
            gap: 8px;
        }
        textarea {
            flex: 1;
            resize: none;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-family: inherit;
            font-size: inherit;
        }
        textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        button {
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .typing {
            font-style: italic;
            color: var(--vscode-descriptionForeground);
            padding: 8px 12px;
        }
    </style>
</head>
<body>
    <div class="chat-container" id="chat"></div>
    <div class="input-container">
        <textarea id="input" rows="3" placeholder="Ask DevFlow..."></textarea>
        <button id="send">Send</button>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const chat = document.getElementById('chat');
        const input = document.getElementById('input');
        const sendBtn = document.getElementById('send');

        function addMessage(text, className) {
            const div = document.createElement('div');
            div.className = 'message ' + className;
            div.textContent = text;
            chat.appendChild(div);
            chat.scrollTop = chat.scrollHeight;
        }

        function showTyping(show) {
            let indicator = document.getElementById('typing');
            if (show && !indicator) {
                indicator = document.createElement('div');
                indicator.id = 'typing';
                indicator.className = 'typing';
                indicator.textContent = 'DevFlow is thinking...';
                chat.appendChild(indicator);
            } else if (!show && indicator) {
                indicator.remove();
            }
            chat.scrollTop = chat.scrollHeight;
        }

        sendBtn.addEventListener('click', () => {
            const text = input.value.trim();
            if (text) {
                vscode.postMessage({ command: 'submit', text });
                input.value = '';
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendBtn.click();
            }
        });

        window.addEventListener('message', (event) => {
            const msg = event.data;
            if (msg.command === 'userMessage') {
                addMessage(msg.text, 'user');
            } else if (msg.command === 'response') {
                showTyping(false);
                addMessage(msg.text, 'assistant');
            } else if (msg.command === 'error') {
                showTyping(false);
                addMessage(msg.text, 'error');
            } else if (msg.command === 'typing') {
                showTyping(msg.isTyping);
            } else if (msg.command === 'cleared') {
                chat.innerHTML = '';
            }
        });
    </script>
</body>
</html>`;
    }
}
exports.ChatViewProvider = ChatViewProvider;
//# sourceMappingURL=chat.js.map