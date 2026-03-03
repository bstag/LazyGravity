import { EventEmitter } from 'events';

export interface Attachment {
    name: string;
    mimeType: string;
    base64Data?: string;
    url?: string;
}

export interface UiSyncResult {
    ok: boolean;
    mode?: string;
    model?: string;
    error?: string;
}

export interface ResponseStatus {
    /** True if the AI is currently generating a response */
    isGenerating: boolean;
    /** The current text of the response, if any */
    text: string | null;
    /** Any processing/activity logs detected (e.g. tool execution steps) */
    processLogs?: string[];
    /** True if a quota exceeded warning was detected */
    quotaDetected?: boolean;
}

export interface ProgressState {
    status: 'generating' | 'idle';
    lastMessage?: string;
}

export interface SessionListItem {
    title: string;
    isActive: boolean;
}

export interface ChatSessionInfo {
    title: string;
    hasActiveChat: boolean;
}

/**
 * Base interface for interacting with any AI Editor.
 * Adapters (like AntigravityAdapter or CursorAdapter) implement this to handle
 * editor-specific connection, DOM interaction, and state monitoring.
 * 
 * Emits events:
 * - 'disconnected': The editor connection was lost.
 * - 'reconnected': The editor connection was restored.
 * - 'reconnectFailed': Failed to reconnect to the editor.
 */
export interface EditorAdapter extends EventEmitter {
    /**
     * Finds the target editor process for a workspace and connects to it.
     * @param workspacePath The local path to the workspace directory.
     */
    discoverAndConnect(workspacePath: string): Promise<boolean>;

    /**
     * Disonnects from the editor.
     */
    disconnect(): Promise<void>;

    /**
     * Returns true if currently connected.
     */
    isConnected(): boolean;

    /**
     * Returns the name of the currently connected workspace.
     */
    getCurrentWorkspaceName(): string | null;

    /**
     * Waits until the editor's chat UI is ready to receive input.
     */
    waitForChatReady(timeoutMs?: number, pollIntervalMs?: number): Promise<boolean>;

    // --------------------------------------------------------------------------
    // SESSION MANAGEMENT
    // --------------------------------------------------------------------------

    listAllSessions(): Promise<SessionListItem[]>;
    startNewChat(): Promise<{ ok: boolean; error?: string }>;
    getCurrentSessionInfo(): Promise<ChatSessionInfo>;
    activateSessionByTitle(title: string): Promise<{ ok: boolean; error?: string }>;

    // --------------------------------------------------------------------------
    // ACTION METHODS
    // --------------------------------------------------------------------------

    /**
     * Injects the text and attachments into the editor's prompt box and submits.
     */
    injectAndSubmitMessage(text: string, files?: Attachment[]): Promise<{ ok: boolean; error?: string }>;

    /**
     * Clicks the "Cancel" or "Stop Generation" button in the editor.
     */
    cancelGeneration(): Promise<boolean>;

    /**
     * Accepts or rejects pending AI actions (like file changes).
     */
    handleUIApproval(action: 'accept' | 'reject'): Promise<boolean>;

    /**
     * Changes the agent mode in the editor's UI.
     */
    changeUIMode(modeText: string): Promise<UiSyncResult>;

    /**
     * Get the currently selected mode from the editor's UI.
     */
    getCurrentMode(): Promise<string | null>;

    /**
     * Dynamically retrieve the list of available models from the editor's UI.
     */
    getUiModels(): Promise<string[]>;

    /**
     * Get the currently selected model from the editor's UI.
     */
    getCurrentModel(): Promise<string | null>;

    /**
     * Changes the AI model in the editor's UI.
     */
    changeUIModel(modelText: string): Promise<UiSyncResult>;

    // --------------------------------------------------------------------------
    // OBSERVATION METHODS
    // --------------------------------------------------------------------------

    /**
     * Checks if the AI is currently generating a response.
     */
    isCurrentlyGenerating(): Promise<boolean>;

    /**
     * Polls the current state of the AI response generation.
     * This includes whether it's generating, the current text, and any process logs.
     * Use extractionMode 'structured' or 'legacy' depending on the editor's capabilities.
     */
    pollResponseStatus(extractionMode?: 'structured' | 'legacy'): Promise<ResponseStatus>;

    /**
     * Checks if the editor is waiting for the user to approve changes.
     */
    getPendingApprovals(): Promise<{ requiresApproval: boolean; details?: string }>;

    /**
     * Captures a screenshot of the editor.
     */
    captureScreenshot(): Promise<Buffer>;
}
