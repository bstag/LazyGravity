import { ChatSessionService } from '../../src/services/chatSessionService';
import { EditorAdapter } from '../../src/adapters/EditorAdapter';

describe('ChatSessionService', () => {
    let service: ChatSessionService;
    let mockEditorAdapter: jest.Mocked<EditorAdapter>;

    beforeEach(() => {
        mockEditorAdapter = {
            listAllSessions: jest.fn(),
            startNewChat: jest.fn(),
            getCurrentSessionInfo: jest.fn(),
            activateSessionByTitle: jest.fn(),
            waitForChatReady: jest.fn(),
            injectMessageIntoChat: jest.fn(),
            isCurrentlyGenerating: jest.fn(),
            cancelGeneration: jest.fn(),
            captureScreenshot: jest.fn(),
            getLatestResponseText: jest.fn(),
            getPendingApprovals: jest.fn(),
            isConnected: jest.fn(),
            disconnect: jest.fn(),
            discoverAndConnect: jest.fn(),
            changeUIMode: jest.fn(),
            changeUIModel: jest.fn(),
            getCurrentMode: jest.fn(),
            getCurrentModel: jest.fn(),
            getCurrentWorkspaceName: jest.fn(),
            getUiModels: jest.fn(),
            on: jest.fn(),
            once: jest.fn(),
            removeListener: jest.fn(),
            off: jest.fn(),
            addListener: jest.fn(),
            emit: jest.fn(),
            listenerCount: jest.fn(),
            listeners: jest.fn(),
            prependListener: jest.fn(),
            prependOnceListener: jest.fn(),
            removeAllListeners: jest.fn(),
            setMaxListeners: jest.fn(),
            getMaxListeners: jest.fn(),
            rawListeners: jest.fn()
        } as unknown as jest.Mocked<EditorAdapter>;

        service = new ChatSessionService();
    });

    describe('startNewChat()', () => {
        it('delegates to EditorAdapter.startNewChat', async () => {
            mockEditorAdapter.startNewChat.mockResolvedValue({ ok: true });
            const result = await service.startNewChat(mockEditorAdapter);
            expect(result.ok).toBe(true);
            expect(mockEditorAdapter.startNewChat).toHaveBeenCalled();
        });
    });

    describe('getCurrentSessionInfo()', () => {
        it('delegates to EditorAdapter.getCurrentSessionInfo', async () => {
            mockEditorAdapter.getCurrentSessionInfo.mockResolvedValue({ title: 'Test', hasActiveChat: true });
            const info = await service.getCurrentSessionInfo(mockEditorAdapter);
            expect(info.title).toBe('Test');
            expect(mockEditorAdapter.getCurrentSessionInfo).toHaveBeenCalled();
        });
    });

    describe('activateSessionByTitle()', () => {
        it('returns ok when already on the target session title', async () => {
            mockEditorAdapter.getCurrentSessionInfo.mockResolvedValue({ title: 'target-session', hasActiveChat: true });
            const result = await service.activateSessionByTitle(mockEditorAdapter, 'target-session');
            expect(result).toEqual({ ok: true });
        });

        it('returns ok:false for empty title', async () => {
            const result = await service.activateSessionByTitle(mockEditorAdapter, '');
            expect(result.ok).toBe(false);
            expect(result.error).toContain('empty');
        });

        it('delegates to EditorAdapter.activateSessionByTitle and retries', async () => {
            mockEditorAdapter.getCurrentSessionInfo.mockResolvedValueOnce({ title: 'old-session', hasActiveChat: true })
                .mockResolvedValue({ title: 'target-session', hasActiveChat: true });
            mockEditorAdapter.activateSessionByTitle.mockResolvedValue({ ok: true });

            const result = await service.activateSessionByTitle(mockEditorAdapter, 'target-session', { maxWaitMs: 100, retryIntervalMs: 10 });
            expect(result.ok).toBe(true);
            expect(mockEditorAdapter.activateSessionByTitle).toHaveBeenCalledWith('target-session');
        });
    });

    describe('listAllSessions()', () => {
        it('delegates to EditorAdapter.listAllSessions', async () => {
            mockEditorAdapter.listAllSessions.mockResolvedValue([{ title: 'Session A', isActive: true }]);
            const sessions = await service.listAllSessions(mockEditorAdapter);
            expect(sessions).toHaveLength(1);
            expect(mockEditorAdapter.listAllSessions).toHaveBeenCalled();
        });
    });
});
