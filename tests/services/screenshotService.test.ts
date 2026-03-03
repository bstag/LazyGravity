import { ScreenshotService } from '../../src/services/screenshotService';
import { EditorAdapter } from '../../src/adapters/EditorAdapter';

describe('ScreenshotService - screenshot feature (Step 8)', () => {
    let screenshotService: ScreenshotService;
    let mockEditorAdapter: jest.Mocked<EditorAdapter>;

    // Dummy Base64 image data for testing
    const dummyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    beforeEach(() => {
        mockEditorAdapter = {
            captureScreenshot: jest.fn(),
        } as unknown as jest.Mocked<EditorAdapter>;
        jest.clearAllMocks();
    });

    it('captures a screenshot and returns a Buffer', async () => {
        mockEditorAdapter.captureScreenshot.mockResolvedValue(Buffer.from(dummyBase64, 'base64'));

        screenshotService = new ScreenshotService({ editorAdapter: mockEditorAdapter });
        const result = await screenshotService.capture();

        expect(result.success).toBe(true);
        expect(result.buffer).toBeInstanceOf(Buffer);
        expect(result.buffer!.length).toBeGreaterThan(0);
        expect(mockEditorAdapter.captureScreenshot).toHaveBeenCalled();
    });

    it('returns success:false with error message when capture throws', async () => {
        mockEditorAdapter.captureScreenshot.mockRejectedValue(new Error('CDP接続エラー'));

        screenshotService = new ScreenshotService({ editorAdapter: mockEditorAdapter });
        const result = await screenshotService.capture();

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toContain('CDP接続エラー');
    });

    it('returns success:false when capture returns empty buffer', async () => {
        mockEditorAdapter.captureScreenshot.mockResolvedValue(Buffer.alloc(0));

        screenshotService = new ScreenshotService({ editorAdapter: mockEditorAdapter });
        const result = await screenshotService.capture();

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('retrieves base64-encoded image string via getBase64()', async () => {
        mockEditorAdapter.captureScreenshot.mockResolvedValue(Buffer.from(dummyBase64, 'base64'));

        screenshotService = new ScreenshotService({ editorAdapter: mockEditorAdapter });
        const result = await screenshotService.getBase64();

        expect(result).toBe(dummyBase64);
    });
});
