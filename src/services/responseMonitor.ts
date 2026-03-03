import { logger } from '../utils/logger';
import type { ExtractionMode } from '../utils/config';
import { EditorAdapter } from '../adapters/EditorAdapter';

/** Response generation phases */
export type ResponsePhase = 'waiting' | 'thinking' | 'generating' | 'complete' | 'timeout' | 'quotaReached' | 'disconnected';

export interface ResponseMonitorOptions {
    /** Editor adapter instance */
    editorAdapter: EditorAdapter;
    /** Poll interval in ms (default: 2000) */
    pollIntervalMs?: number;
    /** Max monitoring duration in ms (default: 300000) */
    maxDurationMs?: number;
    /** Consecutive stop-gone confirmations needed (default: 3) */
    stopGoneConfirmCount?: number;
    /** Extraction mode: 'legacy' uses innerText, 'structured' uses DOM segment extraction */
    extractionMode?: ExtractionMode;
    /** Text update callback */
    onProgress?: (text: string) => void;
    /** Generation complete callback */
    onComplete?: (finalText: string) => void;
    /** Timeout callback */
    onTimeout?: (lastText: string) => void;
    /** Phase change callback */
    onPhaseChange?: (phase: ResponsePhase, text: string | null) => void;
    /** Process log update callback (activity messages + tool output) */
    onProcessLog?: (text: string) => void;
}

/**
 * Lean AI response monitor.
 *
 * Polls the EditorAdapter to determine generation state, text, and process logs.
 * Completion: stop button gone N consecutive times -> complete.
 */
export class ResponseMonitor {
    private readonly editorAdapter: EditorAdapter;
    private readonly pollIntervalMs: number;
    private readonly maxDurationMs: number;
    private readonly stopGoneConfirmCount: number;
    private readonly extractionMode: ExtractionMode;
    private readonly onProgress?: (text: string) => void;
    private readonly onComplete?: (finalText: string) => void;
    private readonly onTimeout?: (lastText: string) => void;
    private readonly onPhaseChange?: (phase: ResponsePhase, text: string | null) => void;
    private readonly onProcessLog?: (text: string) => void;

    private pollTimer: ReturnType<typeof setTimeout> | null = null;
    private isRunning: boolean = false;
    private lastText: string | null = null;
    private baselineText: string | null = null;
    private generationStarted: boolean = false;
    private currentPhase: ResponsePhase = 'waiting';
    private stopGoneCount: number = 0;
    private quotaDetected: boolean = false;
    private seenProcessLogKeys: Set<string> = new Set();

    // CDP disconnect handling (#48)
    private isPaused: boolean = false;
    private onEditorDisconnected: (() => void) | null = null;
    private onEditorReconnected: (() => void) | null = null;
    private onEditorReconnectFailed: ((err: Error) => void | Promise<void>) | null = null;

    // Activity-based timeout (#49)
    private lastActivityTime: number = 0;

    constructor(options: ResponseMonitorOptions) {
        this.editorAdapter = options.editorAdapter;
        this.pollIntervalMs = options.pollIntervalMs ?? 2000;
        this.maxDurationMs = options.maxDurationMs ?? 300000;
        this.stopGoneConfirmCount = options.stopGoneConfirmCount ?? 3;
        this.extractionMode = options.extractionMode ?? 'structured';
        this.onProgress = options.onProgress;
        this.onComplete = options.onComplete;
        this.onTimeout = options.onTimeout;
        this.onPhaseChange = options.onPhaseChange;
        this.onProcessLog = options.onProcessLog;
    }

    /** Start monitoring */
    async start(): Promise<void> {
        return this.initMonitoring(false);
    }

    /**
     * Start monitoring in passive mode.
     * Same as start() but with generationStarted=true, so text changes
     * are detected immediately without waiting for the stop button to appear.
     * Used when joining an existing session that may already be generating.
     */
    async startPassive(): Promise<void> {
        return this.initMonitoring(true);
    }

    /** Internal initialization shared between start() and startPassive() */
    private async initMonitoring(passive: boolean): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;
        this.isPaused = false;
        this.lastText = null;
        this.baselineText = null;
        this.generationStarted = passive;
        this.currentPhase = passive ? 'generating' : 'waiting';
        this.stopGoneCount = 0;
        this.quotaDetected = false;
        this.seenProcessLogKeys = new Set();

        this.onPhaseChange?.(this.currentPhase, null);

        // Capture baseline state
        try {
            const status = await this.editorAdapter.pollResponseStatus(this.extractionMode);
            this.baselineText = status.text;
            if (status.processLogs) {
                this.seenProcessLogKeys = new Set(
                    status.processLogs
                        .map(s => (s || '').replace(/\\r/g, '').trim())
                        .filter(s => s.length > 0)
                        .map(s => s.slice(0, 200))
                );
            }
        } catch {
            this.baselineText = null;
        }

        // Activity-based timeout: track last activity time instead of fixed timer (#49)
        this.lastActivityTime = Date.now();

        // Register adapter connection event listeners
        this.registerConnectionListeners();

        const mode = passive ? 'Passive monitoring' : 'Monitoring';
        logger.debug(
            `── ${mode} started | poll=${this.pollIntervalMs}ms inactivityTimeout=${this.maxDurationMs / 1000}s baseline=${this.baselineText?.length ?? 0}ch`,
        );

        this.schedulePoll();
    }

    /** Stop monitoring */
    async stop(): Promise<void> {
        this.isRunning = false;
        this.isPaused = false;
        this.unregisterConnectionListeners();
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
    }

    /** Get current phase */
    getPhase(): ResponsePhase {
        return this.currentPhase;
    }

    /** Whether quota error was detected */
    getQuotaDetected(): boolean {
        return this.quotaDetected;
    }

    /** Whether monitoring is active */
    isActive(): boolean {
        return this.isRunning;
    }

    /** Get last extracted text */
    getLastText(): string | null {
        return this.lastText;
    }

    /** Click the stop button to interrupt LLM generation */
    async clickStopButton(): Promise<{ ok: boolean; method?: string; error?: string }> {
        try {
            const ok = await this.editorAdapter.cancelGeneration();

            if (this.isRunning) {
                await this.stop();
            }

            return { ok };
        } catch (error: any) {
            return { ok: false, error: error.message || 'Failed to click stop button' };
        }
    }

    private setPhase(phase: ResponsePhase, text: string | null): void {
        if (this.currentPhase !== phase) {
            this.currentPhase = phase;
            const len = text?.length ?? 0;
            switch (phase) {
                case 'thinking':
                    logger.phase('Thinking');
                    break;
                case 'generating':
                    logger.phase(`Generating (${len} chars)`);
                    break;
                case 'complete':
                    logger.done(`Complete (${len} chars)`);
                    break;
                case 'timeout':
                    logger.warn(`Timeout (${len} chars captured)`);
                    break;
                case 'quotaReached':
                    logger.warn('Quota Reached');
                    break;
                case 'disconnected':
                    logger.warn(`Editor Disconnected — paused (${len} chars captured)`);
                    break;
                default:
                    logger.phase(`${phase}`);
            }
            this.onPhaseChange?.(phase, text);
        }
    }

    private registerConnectionListeners(): void {
        this.onEditorDisconnected = () => {
            if (!this.isRunning) return;
            logger.warn('[ResponseMonitor] Editor disconnected — pausing poll');
            this.isPaused = true;
            if (this.pollTimer) {
                clearTimeout(this.pollTimer);
                this.pollTimer = null;
            }
            this.setPhase('disconnected', this.lastText);
        };

        this.onEditorReconnected = () => {
            if (!this.isRunning) return;
            logger.warn('[ResponseMonitor] Editor reconnected — resuming poll');
            this.isPaused = false;
            this.lastActivityTime = Date.now();
            const resumePhase = this.generationStarted ? 'generating' : 'waiting';
            this.setPhase(resumePhase, this.lastText);
            this.schedulePoll();
        };

        this.onEditorReconnectFailed = async (err: Error) => {
            if (!this.isRunning) return;
            logger.error('[ResponseMonitor] Editor reconnection failed — stopping monitor:', err.message);
            const lastText = this.lastText ?? '';
            this.setPhase('disconnected', lastText);
            await this.stop();
            try {
                await Promise.resolve(this.onTimeout?.(lastText));
            } catch (error) {
                logger.error('[ResponseMonitor] timeout callback failed:', error);
            }
        };

        this.editorAdapter.on('disconnected', this.onEditorDisconnected);
        this.editorAdapter.on('reconnected', this.onEditorReconnected);
        this.editorAdapter.on('reconnectFailed', this.onEditorReconnectFailed);
    }

    private unregisterConnectionListeners(): void {
        if (this.onEditorDisconnected) {
            this.editorAdapter.removeListener('disconnected', this.onEditorDisconnected);
            this.onEditorDisconnected = null;
        }
        if (this.onEditorReconnected) {
            this.editorAdapter.removeListener('reconnected', this.onEditorReconnected);
            this.onEditorReconnected = null;
        }
        if (this.onEditorReconnectFailed) {
            this.editorAdapter.removeListener('reconnectFailed', this.onEditorReconnectFailed);
            this.onEditorReconnectFailed = null;
        }
    }

    private schedulePoll(): void {
        if (!this.isRunning || this.isPaused) return;
        this.pollTimer = setTimeout(async () => {
            await this.poll();
            if (this.isRunning) {
                this.schedulePoll();
            }
        }, this.pollIntervalMs);
    }

    /**
     * Emit new process log entries, deduplicating against previously seen keys.
     */
    private emitNewProcessLogs(entries: string[]): void {
        const newEntries: string[] = [];
        for (const line of entries) {
            const normalized = (line || '').replace(/\\r/g, '').trim();
            if (!normalized) continue;
            const key = normalized.slice(0, 200);
            if (this.seenProcessLogKeys.has(key)) continue;
            this.seenProcessLogKeys.add(key);
            newEntries.push(normalized.slice(0, 300));
        }
        if (newEntries.length > 0) {
            this.lastActivityTime = Date.now();
            try {
                this.onProcessLog?.(newEntries.join('\n\n'));
            } catch {
                // callback error
            }
        }
    }

    /**
     * Single poll cycle.
     */
    private async poll(): Promise<void> {
        try {
            const status = await this.editorAdapter.pollResponseStatus(this.extractionMode);
            const isGenerating = status.isGenerating;
            const quotaDetected = status.quotaDetected === true;
            const currentText = status.text;

            if (status.processLogs && status.processLogs.length > 0) {
                this.emitNewProcessLogs(status.processLogs);
            }

            // Handle stop button appearing
            if (isGenerating) {
                this.lastActivityTime = Date.now();
                if (!this.generationStarted) {
                    this.generationStarted = true;
                    this.setPhase('thinking', null);
                }
                this.stopGoneCount = 0;
            }

            // Handle quota detection
            if (quotaDetected) {
                const hasText = !!(this.lastText && this.lastText.trim().length > 0);
                logger.warn(`[ResponseMonitor] quota detected hasText=${hasText}`);
                if (hasText) {
                    this.quotaDetected = true;
                } else {
                    this.setPhase('quotaReached', '');
                    await this.stop();
                    try {
                        await Promise.resolve(this.onComplete?.(''));
                    } catch (error) {
                        logger.error('[ResponseMonitor] complete callback failed:', error);
                    }
                    return;
                }
            }

            // Baseline suppression: do not emit progress for pre-existing text.
            const effectiveText = (
                currentText !== null &&
                this.baselineText !== null &&
                currentText === this.baselineText &&
                this.lastText === null
            ) ? null : currentText;

            // Text change handling
            const textChanged = effectiveText !== null && effectiveText !== this.lastText;
            if (textChanged) {
                this.lastActivityTime = Date.now();
                this.lastText = effectiveText;

                if (this.currentPhase === 'waiting' || this.currentPhase === 'thinking') {
                    this.setPhase('generating', effectiveText);
                    if (!this.generationStarted) {
                        this.generationStarted = true;
                    }
                }

                this.onProgress?.(effectiveText);
            }

            // Completion: stop button gone N consecutive times
            if (!isGenerating && this.generationStarted) {
                this.stopGoneCount++;
                if (this.stopGoneCount >= this.stopGoneConfirmCount) {
                    const finalText = this.lastText ?? '';
                    this.setPhase('complete', finalText);
                    await this.stop();
                    try {
                        await Promise.resolve(this.onComplete?.(finalText));
                    } catch (error) {
                        logger.error('[ResponseMonitor] complete callback failed:', error);
                    }
                    return;
                }
            }

            // Activity-based inactivity timeout (#49)
            if (this.maxDurationMs > 0 && Date.now() - this.lastActivityTime >= this.maxDurationMs) {
                const lastText = this.lastText ?? '';
                this.setPhase('timeout', lastText);
                await this.stop();
                try {
                    await Promise.resolve(this.onTimeout?.(lastText));
                } catch (error) {
                    logger.error('[ResponseMonitor] timeout callback failed:', error);
                }
                return;
            }
        } catch (error) {
            logger.error('[ResponseMonitor] poll error:', error);
        }
    }
}
