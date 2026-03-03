import { AntigravityDomConfig } from '../../src/adapters/antigravity/AntigravityDomConfig';
const RESPONSE_SELECTORS = AntigravityDomConfig.SCRIPTS;

describe('Lean RESPONSE_SELECTORS', () => {
    it('STOP_BUTTON script contains input-send-button-cancel-tooltip', () => {
        expect(RESPONSE_SELECTORS.DETECT_STOP_BUTTON).toContain('input-send-button-cancel-tooltip');
    });

    it('STOP_BUTTON script does NOT contain svg analysis', () => {
        expect(RESPONSE_SELECTORS.DETECT_STOP_BUTTON.toLowerCase()).not.toContain('svg');
    });

    it('STOP_BUTTON script does NOT contain getBoundingClientRect', () => {
        expect(RESPONSE_SELECTORS.DETECT_STOP_BUTTON).not.toContain('getBoundingClientRect');
    });

    it('STOP_BUTTON script does NOT contain getComputedStyle', () => {
        expect(RESPONSE_SELECTORS.DETECT_STOP_BUTTON).not.toContain('getComputedStyle');
    });

    it('STOP_BUTTON script does NOT contain composer DOM traversal', () => {
        expect(RESPONSE_SELECTORS.DETECT_STOP_BUTTON.toLowerCase()).not.toContain('composer');
    });

    it('CLICK_STOP_BUTTON script contains input-send-button-cancel-tooltip', () => {
        expect(RESPONSE_SELECTORS.CLICK_STOP_BUTTON).toContain('input-send-button-cancel-tooltip');
    });

    it('CLICK_STOP_BUTTON script does NOT contain svg analysis', () => {
        expect(RESPONSE_SELECTORS.CLICK_STOP_BUTTON.toLowerCase()).not.toContain('svg');
    });

    it('CLICK_STOP_BUTTON script does NOT contain heuristic fallback', () => {
        expect(RESPONSE_SELECTORS.CLICK_STOP_BUTTON.toLowerCase()).not.toContain('heuristic');
    });

    it('STOP_BUTTON script does NOT use broad substring includes matching', () => {
        expect(RESPONSE_SELECTORS.DETECT_STOP_BUTTON).not.toContain('blob.includes');
        expect(RESPONSE_SELECTORS.DETECT_STOP_BUTTON).not.toContain('includes(w)');
    });

    it('STOP_BUTTON script includes Japanese stop labels', () => {
        expect(RESPONSE_SELECTORS.DETECT_STOP_BUTTON).toContain('停止');
    });

    it('does NOT have ACTIVITY_STATUS property', () => {
        expect((RESPONSE_SELECTORS as any).ACTIVITY_STATUS).toBeUndefined();
    });

    it('does NOT have RESPONSE_DIAGNOSTICS property', () => {
        expect((RESPONSE_SELECTORS as any).RESPONSE_DIAGNOSTICS).toBeUndefined();
    });

    it('does NOT have RESPONSE_TEXT_FROM_START property', () => {
        expect((RESPONSE_SELECTORS as any).RESPONSE_TEXT_FROM_START).toBeUndefined();
    });

    it('RESPONSE_TEXT script contains scored/priority-based selector approach', () => {
        const script = RESPONSE_SELECTORS.EXTRACT_RESPONSE_TEXT.toLowerCase();
        const hasScoring = script.includes('score') || script.includes('priority') || script.includes('weight');
        expect(hasScoring).toBe(true);
    });

    it('RESPONSE_TEXT script contains details exclusion via .closest', () => {
        const script = RESPONSE_SELECTORS.EXTRACT_RESPONSE_TEXT;
        expect(script).toContain("closest('details')");
    });

    it('RESPONSE_TEXT script contains feedback/footer exclusion', () => {
        const script = RESPONSE_SELECTORS.EXTRACT_RESPONSE_TEXT.toLowerCase();
        expect(script).toContain('feedback');
        expect(script).toContain('footer');
    });

    it('RESPONSE_TEXT script contains MCP tool output pattern filter', () => {
        const script = RESPONSE_SELECTORS.EXTRACT_RESPONSE_TEXT.toLowerCase();
        expect(script).toContain('looksliketooloutput');
    });

    it('QUOTA_ERROR script uses h3 span text-based detection', () => {
        const script = RESPONSE_SELECTORS.DETECT_QUOTA_ERROR;
        expect(script).toContain('h3 span');
        expect(script).toContain('h3');
    });

    it('QUOTA_ERROR script checks for model quota reached keyword', () => {
        const script = RESPONSE_SELECTORS.DETECT_QUOTA_ERROR.toLowerCase();
        expect(script).toContain('model quota reached');
        expect(script).toContain('rate limit');
        expect(script).toContain('quota exceeded');
    });

    it('QUOTA_ERROR script excludes rendered-markdown and prose containers', () => {
        const script = RESPONSE_SELECTORS.DETECT_QUOTA_ERROR;
        expect(script).toContain('.rendered-markdown');
        expect(script).toContain('.prose');
    });

    it('QUOTA_ERROR script retains class-based fallback selectors', () => {
        const script = RESPONSE_SELECTORS.DETECT_QUOTA_ERROR;
        expect(script).toContain('[role="alert"]');
        expect(script).toContain('[class*="error"]');
    });

    it('RESPONSE_TEXT script excludes .notify-user-container via isInsideExcludedContainer', () => {
        const script = RESPONSE_SELECTORS.EXTRACT_RESPONSE_TEXT;
        expect(script).toContain('.notify-user-container');
    });

    it('PROCESS_LOGS script excludes .notify-user-container', () => {
        const script = RESPONSE_SELECTORS.EXTRACT_PROCESS_LOGS;
        expect(script).toContain('.notify-user-container');
    });

    it('QUOTA_ERROR script detects inline exhausted quota pattern', () => {
        const script = RESPONSE_SELECTORS.DETECT_QUOTA_ERROR.toLowerCase();
        expect(script).toContain('exhausted your quota');
    });

    it('QUOTA_ERROR script queries span elements for inline error detection', () => {
        const script = RESPONSE_SELECTORS.DETECT_QUOTA_ERROR;
        expect(script).toContain("querySelectorAll('span')");
    });
});
