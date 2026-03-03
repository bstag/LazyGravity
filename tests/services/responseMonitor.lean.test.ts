import { ResponseMonitor, ResponsePhase } from '../../src/services/responseMonitor';
import { EditorAdapter, ResponseStatus } from '../../src/adapters/EditorAdapter';

describe('Lean ResponseMonitor (new API)', () => {
    let mockEditorAdapter: jest.Mocked<EditorAdapter>;

    beforeEach(() => {
        jest.useFakeTimers();
        mockEditorAdapter = {
            pollResponseStatus: jest.fn().mockResolvedValue({
                isGenerating: false,
                text: null,
                quotaDetected: false,
                processLogs: [],
            }),
            cancelGeneration: jest.fn().mockResolvedValue(true),
            on: jest.fn(),
            removeListener: jest.fn(),
        } as unknown as jest.Mocked<EditorAdapter>;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    function createMonitor(overrides: Partial<any> = {}): ResponseMonitor {
        return new ResponseMonitor({
            editorAdapter: mockEditorAdapter,
            pollIntervalMs: 2000,
            stopGoneConfirmCount: 3,
            extractionMode: 'legacy',
            ...overrides,
        });
    }

    function mockPollStatus(status: Partial<ResponseStatus>) {
        return mockEditorAdapter.pollResponseStatus.mockResolvedValueOnce({
            isGenerating: false,
            text: null,
            quotaDetected: false,
            processLogs: [],
            ...status
        });
    }

    it('start() captures baseline, sets phase to waiting, starts polling', async () => {
        const phases: ResponsePhase[] = [];
        const monitor = createMonitor({
            onPhaseChange: (phase: ResponsePhase) => { phases.push(phase); },
        });

        mockPollStatus({ text: 'existing text' }); // Baseline

        await monitor.start();

        expect(phases).toContain('waiting');
        expect(monitor.getPhase()).toBe('waiting');
        expect(mockEditorAdapter.pollResponseStatus).toHaveBeenCalledTimes(1);

        await monitor.stop();
    });

    it('stop button appearing sets phase to thinking', async () => {
        const phases: ResponsePhase[] = [];
        const monitor = createMonitor({
            onPhaseChange: (phase: ResponsePhase) => { phases.push(phase); },
        });

        mockPollStatus({ text: null }); // Baseline
        await monitor.start();

        mockPollStatus({ isGenerating: true }); // Poll 1
        await jest.advanceTimersByTimeAsync(2000);

        expect(phases).toContain('thinking');
        await monitor.stop();
    });

    it('text update triggers onProgress and sets phase to generating', async () => {
        const phases: ResponsePhase[] = [];
        const progressTexts: string[] = [];
        const monitor = createMonitor({
            onPhaseChange: (phase: ResponsePhase) => { phases.push(phase); },
            onProgress: (text: string) => { progressTexts.push(text); },
        });

        mockPollStatus({ text: null }); // Baseline
        await monitor.start();

        mockPollStatus({ isGenerating: true, text: 'Hello' }); // Poll 1
        await jest.advanceTimersByTimeAsync(2000);

        expect(phases).toContain('generating');
        expect(progressTexts).toContain('Hello');

        await monitor.stop();
    });

    it('stop button disappearing 3 consecutive times triggers onComplete', async () => {
        let completedText: string | null = null;
        const monitor = createMonitor({
            onComplete: (text: string) => { completedText = text; },
        });

        mockPollStatus({ text: null }); // Baseline
        await monitor.start();

        mockPollStatus({ isGenerating: true, text: 'response' }); // Poll 1
        await jest.advanceTimersByTimeAsync(2000);

        mockPollStatus({ isGenerating: false, text: 'response' }); // Poll 2 (gone count 1)
        await jest.advanceTimersByTimeAsync(2000);
        expect(completedText).toBeNull();

        mockPollStatus({ isGenerating: false, text: 'response' }); // Poll 3 (gone count 2)
        await jest.advanceTimersByTimeAsync(2000);
        expect(completedText).toBeNull();

        mockPollStatus({ isGenerating: false, text: 'response' }); // Poll 4 (gone count 3)
        await jest.advanceTimersByTimeAsync(2000);
        expect(completedText).toBe('response');
    });

    it('stop button reappearing resets gone counter', async () => {
        let completedText: string | null = null;
        const monitor = createMonitor({
            onComplete: (text: string) => { completedText = text; },
        });

        mockPollStatus({ text: null }); // Baseline
        await monitor.start();

        mockPollStatus({ isGenerating: true, text: 'resp' }); // Poll 1
        await jest.advanceTimersByTimeAsync(2000);

        mockPollStatus({ isGenerating: false, text: 'resp' }); // Poll 2 (gone 1)
        await jest.advanceTimersByTimeAsync(2000);

        mockPollStatus({ isGenerating: false, text: 'resp' }); // Poll 3 (gone 2)
        await jest.advanceTimersByTimeAsync(2000);

        mockPollStatus({ isGenerating: true, text: 'resp' }); // Poll 4 (reset)
        await jest.advanceTimersByTimeAsync(2000);

        mockPollStatus({ isGenerating: false, text: 'resp' }); // Poll 5 (gone 1 again)
        await jest.advanceTimersByTimeAsync(2000);

        expect(completedText).toBeNull();
        await monitor.stop();
    });

    it('text change does NOT reset stop gone counter — completion still fires', async () => {
        let completedText: string | null = null;
        const monitor = createMonitor({
            onComplete: (text: string) => { completedText = text; },
        });

        mockPollStatus({ text: null }); // Baseline
        await monitor.start();

        mockPollStatus({ isGenerating: true, text: 'first' }); // Poll 1
        await jest.advanceTimersByTimeAsync(2000);

        mockPollStatus({ isGenerating: false, text: 'first' }); // Poll 2 (gone 1)
        await jest.advanceTimersByTimeAsync(2000);

        mockPollStatus({ isGenerating: false, text: 'first updated' }); // Poll 3 (gone 2)
        await jest.advanceTimersByTimeAsync(2000);

        mockPollStatus({ isGenerating: false, text: 'first updated' }); // Poll 4 (gone 3)
        await jest.advanceTimersByTimeAsync(2000);

        expect(completedText).toBe('first updated');
    });

    it('continuous text updates after stop button disappears do NOT block completion', async () => {
        let completedText: string | null = null;
        const monitor = createMonitor({
            onComplete: (text: string) => { completedText = text; },
        });

        mockPollStatus({ text: null }); // Baseline
        await monitor.start();

        mockPollStatus({ isGenerating: true, text: 'token1' }); // Poll 1
        await jest.advanceTimersByTimeAsync(2000);

        mockPollStatus({ isGenerating: false, text: 'token1 token2' }); // Poll 2 (gone 1)
        await jest.advanceTimersByTimeAsync(2000);

        mockPollStatus({ isGenerating: false, text: 'token1 token2 token3' }); // Poll 3 (gone 2)
        await jest.advanceTimersByTimeAsync(2000);

        mockPollStatus({ isGenerating: false, text: 'token1 token2 token3 final' }); // Poll 4 (gone 3 => complete)
        await jest.advanceTimersByTimeAsync(2000);

        expect(completedText).toBe('token1 token2 token3 final');
    });

    it('baseline text is suppressed (same text as before is not treated as new)', async () => {
        const progressTexts: string[] = [];
        const monitor = createMonitor({
            onProgress: (text: string) => { progressTexts.push(text); },
        });

        mockPollStatus({ text: 'old response' }); // Baseline
        await monitor.start();

        mockPollStatus({ isGenerating: false, text: 'old response' }); // Poll 1
        await jest.advanceTimersByTimeAsync(2000);

        expect(progressTexts).not.toContain('old response');
        await monitor.stop();
    });

    it('baseline suppression does not block completion when stop button disappears', async () => {
        let completedText: string | null = null;
        const monitor = createMonitor({
            onComplete: (text: string) => { completedText = text; },
        });

        mockPollStatus({ text: 'old response' }); // Baseline
        await monitor.start();

        mockPollStatus({ isGenerating: true, text: 'old response' }); // Poll 1
        await jest.advanceTimersByTimeAsync(2000);
        expect(completedText).toBeNull();

        for (let i = 0; i < 3; i++) {
            mockPollStatus({ isGenerating: false, text: 'old response' }); // Poll 2-4
            await jest.advanceTimersByTimeAsync(2000);
        }

        expect(completedText).toBe(''); // Completes empty because baseline is ignored
    });

    it('timeout triggers onTimeout after maxDurationMs', async () => {
        let timedOutText: string | null = null;
        const monitor = createMonitor({
            maxDurationMs: 10000,
            onTimeout: (text: string) => { timedOutText = text; },
        });

        mockPollStatus({ text: null }); // Baseline
        await monitor.start();

        mockEditorAdapter.pollResponseStatus.mockResolvedValue({ isGenerating: false, text: null, quotaDetected: false, processLogs: [] });

        await jest.advanceTimersByTimeAsync(10000);

        expect(timedOutText).not.toBeNull();
    });

    it('quota detection with no text triggers immediate complete with empty string', async () => {
        let completedText: string | undefined;
        const monitor = createMonitor({
            onComplete: (text: string) => { completedText = text; },
        });

        mockPollStatus({ text: null }); // Baseline
        await monitor.start();

        mockPollStatus({ isGenerating: false, quotaDetected: true, text: null }); // Poll 1
        await jest.advanceTimersByTimeAsync(2000);

        expect(completedText).toBe('');
    });

    it('clickStopButton returns { ok: true } on success', async () => {
        const monitor = createMonitor();

        mockPollStatus({ text: null }); // Baseline
        await monitor.start();

        const result = await monitor.clickStopButton();
        expect(result).toEqual({ ok: true });
    });

    it('subscribes to adapter connection events on start and removes them on stop', async () => {
        const monitor = createMonitor();

        mockPollStatus({ text: null }); // Baseline
        await monitor.start();

        expect(mockEditorAdapter.on).toHaveBeenCalledWith('disconnected', expect.any(Function));
        expect(mockEditorAdapter.on).toHaveBeenCalledWith('reconnected', expect.any(Function));
        expect(mockEditorAdapter.on).toHaveBeenCalledWith('reconnectFailed', expect.any(Function));

        await monitor.stop();

        expect(mockEditorAdapter.removeListener).toHaveBeenCalledWith('disconnected', expect.any(Function));
        expect(mockEditorAdapter.removeListener).toHaveBeenCalledWith('reconnected', expect.any(Function));
        expect(mockEditorAdapter.removeListener).toHaveBeenCalledWith('reconnectFailed', expect.any(Function));
    });

    it('default poll interval is 2000ms', async () => {
        const defaultMonitor = new ResponseMonitor({
            editorAdapter: mockEditorAdapter, // Omit pollIntervalMs
        });

        mockPollStatus({ text: null }); // Baseline
        await defaultMonitor.start();

        const callCountAfterStart = mockEditorAdapter.pollResponseStatus.mock.calls.length;
        mockEditorAdapter.pollResponseStatus.mockResolvedValue({ isGenerating: false, text: null, quotaDetected: false, processLogs: [] });

        await jest.advanceTimersByTimeAsync(1000);
        expect(mockEditorAdapter.pollResponseStatus.mock.calls.length).toBe(callCountAfterStart);

        await jest.advanceTimersByTimeAsync(1000);
        expect(mockEditorAdapter.pollResponseStatus.mock.calls.length).toBeGreaterThan(callCountAfterStart);

        await defaultMonitor.stop();
    });

    it('pauses polling on CDP disconnect and resumes on reconnect', async () => {
        const onProgress = jest.fn();
        const onPhaseChange = jest.fn();

        const monitor = createMonitor({ onProgress, onPhaseChange });

        mockPollStatus({ text: null }); // Baseline
        await monitor.start();

        mockPollStatus({ isGenerating: true, text: 'Hello' }); // Poll 1
        await jest.advanceTimersByTimeAsync(2000);
        expect(onProgress).toHaveBeenCalledWith('Hello');

        // Simulate disconnect
        const disconnectHandler = mockEditorAdapter.on.mock.calls.find(c => c[0] === 'disconnected')?.[1];
        disconnectHandler!();

        expect(onPhaseChange).toHaveBeenCalledWith('disconnected', 'Hello');

        const callCountAtDisconnect = mockEditorAdapter.pollResponseStatus.mock.calls.length;
        await jest.advanceTimersByTimeAsync(4000);
        expect(mockEditorAdapter.pollResponseStatus.mock.calls.length).toBe(callCountAtDisconnect); // Paused

        // Simulate reconnect
        const reconnectHandler = mockEditorAdapter.on.mock.calls.find(c => c[0] === 'reconnected')?.[1];
        reconnectHandler!();

        expect(onPhaseChange).toHaveBeenCalledWith('generating', 'Hello');

        mockPollStatus({ isGenerating: true, text: 'Hello World' }); // Resume polling
        await jest.advanceTimersByTimeAsync(2000);
        expect(onProgress).toHaveBeenCalledWith('Hello World');

        await monitor.stop();
    });

    it('calls onTimeout when adaptation reconnection fails', async () => {
        const onTimeout = jest.fn();
        const monitor = createMonitor({ onTimeout });

        mockPollStatus({ text: null }); // Baseline
        await monitor.start();

        mockPollStatus({ isGenerating: true, text: 'Partial' }); // Poll 1
        await jest.advanceTimersByTimeAsync(2000);

        const disconnectHandler = mockEditorAdapter.on.mock.calls.find(c => c[0] === 'disconnected')?.[1];
        disconnectHandler!();

        const reconnectFailedHandler = mockEditorAdapter.on.mock.calls.find(c => c[0] === 'reconnectFailed')?.[1];
        reconnectFailedHandler!(new Error('Max retries'));

        await jest.advanceTimersByTimeAsync(0);

        expect(onTimeout).toHaveBeenCalledWith('Partial');
        expect(monitor.isActive()).toBe(false);
    });

    it('does not timeout while text is actively changing', async () => {
        let timedOutText: string | null = null;
        const monitor = createMonitor({
            maxDurationMs: 6000,
            onTimeout: (text: string) => { timedOutText = text; },
        });

        mockPollStatus({ text: null }); // Baseline
        await monitor.start();

        mockPollStatus({ isGenerating: true, text: 'Line 1' }); // Poll 1
        await jest.advanceTimersByTimeAsync(2000);

        mockPollStatus({ isGenerating: true, text: 'Line 1\nLine 2' }); // Poll 2
        await jest.advanceTimersByTimeAsync(2000);

        mockPollStatus({ isGenerating: true, text: 'Line 1\nLine 2\nLine 3' }); // Poll 3
        await jest.advanceTimersByTimeAsync(2000);

        expect(timedOutText).toBeNull();
        await monitor.stop();
    });

    it('activity-based timeout fires only after inactivity, not fixed duration', async () => {
        let timedOutText: string | null = null;
        const monitor = createMonitor({
            maxDurationMs: 4000, // 4s inactivity timeout
            onTimeout: (text: string) => { timedOutText = text; },
        });

        mockPollStatus({ text: null }); // Baseline
        await monitor.start();

        mockPollStatus({ isGenerating: true, text: 'Line 1' }); // Poll 1
        await jest.advanceTimersByTimeAsync(2000);

        mockPollStatus({ isGenerating: true, text: 'Line 1\nLine 2' }); // Poll 2
        await jest.advanceTimersByTimeAsync(2000);

        expect(timedOutText).toBeNull(); // 4s from start, but reset internally

        mockPollStatus({ isGenerating: true, text: 'Line 1\nLine 2\nLine 3' }); // Poll 3
        await jest.advanceTimersByTimeAsync(2000);

        expect(timedOutText).toBeNull(); // 6s from start, still active
        await monitor.stop();
    });
});
