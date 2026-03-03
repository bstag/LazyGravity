import { logger } from '../utils/logger';
import { EditorAdapter } from '../adapters/EditorAdapter';

/** Screenshot capture options */
export interface CaptureOptions {
    /** Image format (default: 'png') */
    format?: 'png' | 'jpeg' | 'webp';
    /** JPEG quality (0-100, JPEG only) */
    quality?: number;
    /** Clip region to capture */
    clip?: {
        x: number;
        y: number;
        width: number;
        height: number;
        scale: number;
    };
    /** Full width capture (including scroll) */
    captureBeyondViewport?: boolean;
}

/** Screenshot result */
export interface CaptureResult {
    /** Whether the capture succeeded */
    success: boolean;
    /** Image data buffer (on success) */
    buffer?: Buffer;
    /** Error message (on failure) */
    error?: string;
}

export interface ScreenshotServiceOptions {
    /** Editor adapter instance */
    editorAdapter: EditorAdapter;
}

/**
 * Service for capturing UI screenshots
 *
 * Uses the EditorAdapter to capture the current browser screen and return it as a Buffer sendable to Discord.
 */
export class ScreenshotService {
    private editorAdapter: EditorAdapter;

    constructor(options: ScreenshotServiceOptions) {
        this.editorAdapter = options.editorAdapter;
    }

    /**
     * Capture the current screen.
     *
     * @param options Capture options (currently mostly ignored by the generic adapter interface, but kept for future expansion)
     * @returns Capture result (Buffer on success, error message on failure)
     */
    async capture(options: CaptureOptions = {}): Promise<CaptureResult> {
        try {
            const buffer = await this.editorAdapter.captureScreenshot();

            if (!buffer || buffer.length === 0) {
                return {
                    success: false,
                    error: 'Screenshot data was empty.',
                };
            }

            return {
                success: true,
                buffer,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error('[ScreenshotService] Error during capture:', error);
            return {
                success: false,
                error: message,
            };
        }
    }

    /**
     * Return a Base64-encoded image string (for use in Discord embeds).
     *
     * @param options Capture options
     * @returns Base64-encoded image string (null on failure)
     */
    async getBase64(options: CaptureOptions = {}): Promise<string | null> {
        try {
            const buffer = await this.editorAdapter.captureScreenshot();
            return buffer.toString('base64');
        } catch (error) {
            logger.error('[ScreenshotService] Error while getting Base64:', error);
            return null;
        }
    }
}
