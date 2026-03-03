import { EditorAdapter, SessionListItem, ChatSessionInfo } from '../adapters/EditorAdapter';

/**
 * Service for managing chat sessions on the connected Editor.
 *
 * Editor adapter dependencies are received as method arguments.
 */
export class ChatSessionService {
    private static readonly ACTIVATE_SESSION_MAX_WAIT_MS = 30000;
    private static readonly ACTIVATE_SESSION_RETRY_INTERVAL_MS = 800;
    private static readonly LIST_SESSIONS_TARGET = 20;

    /**
     * List recent sessions by querying the editor adapter.
     *
     * @param editorAdapter EditorAdapter instance to use
     * @returns Array of session list items (empty array on failure)
     */
    async listAllSessions(editorAdapter: EditorAdapter): Promise<SessionListItem[]> {
        return editorAdapter.listAllSessions();
    }

    /**
     * Start a new chat session in the Editor UI.
     *
     * @param editorAdapter EditorAdapter instance to use
     * @returns { ok: true } on success, { ok: false, error: string } on failure
     */
    async startNewChat(editorAdapter: EditorAdapter): Promise<{ ok: boolean; error?: string }> {
        return editorAdapter.startNewChat();
    }

    /**
     * Get the current chat session information.
     * @param editorAdapter EditorAdapter instance to use
     * @returns Chat session information
     */
    async getCurrentSessionInfo(editorAdapter: EditorAdapter): Promise<ChatSessionInfo> {
        return editorAdapter.getCurrentSessionInfo();
    }

    /**
     * Activate an existing chat by title.
     * Includes orchestration for retries and verification.
     * Returns ok:false if the target chat cannot be located or verified.
     */
    async activateSessionByTitle(
        editorAdapter: EditorAdapter,
        title: string,
        options?: {
            maxWaitMs?: number;
            retryIntervalMs?: number;
        },
    ): Promise<{ ok: boolean; error?: string }> {
        if (!title || title.trim().length === 0) {
            return { ok: false, error: 'Session title is empty' };
        }

        const current = await this.getCurrentSessionInfo(editorAdapter);
        if (current.title.trim() === title.trim()) {
            return { ok: true };
        }

        const maxWaitMs = options?.maxWaitMs ?? ChatSessionService.ACTIVATE_SESSION_MAX_WAIT_MS;
        const retryIntervalMs = options?.retryIntervalMs ?? ChatSessionService.ACTIVATE_SESSION_RETRY_INTERVAL_MS;

        let lastResult: { ok: boolean; error?: string } = { ok: false, error: 'not attempted' };
        let clicked = false;
        const startedAt = Date.now();
        let attempts = 0;

        while (Date.now() - startedAt <= maxWaitMs) {
            attempts += 1;
            lastResult = await editorAdapter.activateSessionByTitle(title);
            clicked = lastResult.ok;

            if (clicked) {
                break;
            }

            if (Date.now() - startedAt <= maxWaitMs) {
                await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
            }
        }

        if (!clicked) {
            return {
                ok: false,
                error:
                    `Failed to activate session "${title}" ` +
                    `after ${attempts} attempt(s) ` +
                    `(${lastResult.error || 'unknown error'})`,
            };
        }

        // Wait briefly for DOM state transition and verify destination chat.
        await new Promise((resolve) => setTimeout(resolve, 500));
        const after = await this.getCurrentSessionInfo(editorAdapter);
        if (after.title.trim() === title.trim()) {
            return { ok: true };
        }

        return {
            ok: false,
            error: `Activated chat did not match target title (expected="${title}", actual="${after.title}")`,
        };
    }
}
