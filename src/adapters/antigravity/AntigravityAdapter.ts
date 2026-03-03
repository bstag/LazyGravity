import { EventEmitter } from 'events';
import { EditorAdapter, Attachment, UiSyncResult, ResponseStatus } from '../EditorAdapter';
import { CdpService } from '../../services/cdpService';
import { AntigravityDomConfig } from './AntigravityDomConfig';
import { classifyAssistantSegments } from '../../services/assistantDomExtractor';

export class AntigravityAdapter extends EventEmitter implements EditorAdapter {
    /** 
     * Currently wrapping the existing CdpService.
     * In a future step, this will wrap a pure CdpClient instead.
     */
    public readonly cdp: CdpService;

    constructor(cdp: CdpService) {
        super();
        this.cdp = cdp;

        this.cdp.on('disconnected', () => this.emit('disconnected'));
        this.cdp.on('reconnected', () => this.emit('reconnected'));
        this.cdp.on('reconnectFailed', (err) => this.emit('reconnectFailed', err));
    }

    // --- Connection Management ---

    async discoverAndConnect(workspacePath: string): Promise<boolean> {
        return this.cdp.discoverAndConnectForWorkspace(workspacePath);
    }

    async disconnect(): Promise<void> {
        await this.cdp.disconnect();
    }

    isConnected(): boolean {
        return this.cdp.isConnected();
    }

    getCurrentWorkspaceName(): string | null {
        return this.cdp.getCurrentWorkspaceName();
    }

    // --- Session Management ---

    async listAllSessions(): Promise<{ title: string; isActive: boolean }[]> {
        try {
            const btnState = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.FIND_PAST_CONVERSATIONS_BUTTON_SCRIPT);
            if (!btnState?.found) return [];

            await this.cdpMouseClick(btnState.x, btnState.y);
            await new Promise((r) => setTimeout(r, 500));

            let scrapeResult = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.SCRAPE_PAST_CONVERSATIONS_SCRIPT);
            let sessions = scrapeResult?.sessions ?? [];

            if (sessions.length < 20) {
                const showMoreState = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.FIND_SHOW_MORE_BUTTON_SCRIPT);
                if (showMoreState?.found) {
                    await this.cdpMouseClick(showMoreState.x, showMoreState.y);
                    await new Promise((r) => setTimeout(r, 500));

                    scrapeResult = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.SCRAPE_PAST_CONVERSATIONS_SCRIPT);
                    sessions = scrapeResult?.sessions ?? [];
                }
            }

            await this.cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
            await this.cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });

            return sessions.slice(0, 20);
        } catch (_) {
            return [];
        }
    }

    async startNewChat(): Promise<{ ok: boolean; error?: string }> {
        try {
            let btnState = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.GET_NEW_CHAT_BUTTON_SCRIPT);

            if (!btnState?.found) {
                const maxRetries = 5;
                for (let i = 0; i < maxRetries && (!btnState || !btnState.found); i++) {
                    await new Promise(r => setTimeout(r, 1000));
                    btnState = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.GET_NEW_CHAT_BUTTON_SCRIPT);
                }
            }

            if (!btnState?.found) {
                return { ok: false, error: 'New chat button not found' };
            }

            if (!btnState.enabled) {
                return { ok: true };
            }

            await this.cdpMouseClick(btnState.x, btnState.y);
            return { ok: true };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    }

    async getCurrentSessionInfo(): Promise<{ title: string; hasActiveChat: boolean }> {
        try {
            const result = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.GET_CHAT_TITLE_SCRIPT);
            if (result && typeof result.title === 'string') {
                return { title: result.title, hasActiveChat: !!result.hasActiveChat };
            }
            return { title: '(Untitled)', hasActiveChat: false };
        } catch (_) {
            return { title: '(Untitled)', hasActiveChat: false };
        }
    }

    async activateSessionByTitle(title: string): Promise<{ ok: boolean; error?: string }> {
        // Try visible in side panel first
        const sidePanelResult = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.BUILD_ACTIVATE_CHAT_BY_TITLE_SCRIPT(title));
        if (sidePanelResult?.ok) {
            return { ok: true };
        }

        // Try past conversations
        const pastResult = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.BUILD_ACTIVATE_VIA_PAST_CONVERSATIONS_SCRIPT(title));
        return {
            ok: pastResult?.ok ?? false,
            error: pastResult?.error || 'Failed to activate session from past conversations'
        };
    }

    // --- Actions ---

    async waitForChatReady(timeoutMs = 10000, pollIntervalMs = 500): Promise<boolean> {
        return this.cdp.waitForCascadePanelReady(timeoutMs, pollIntervalMs);
    }

    async injectAndSubmitMessage(text: string, files?: Attachment[]): Promise<{ ok: boolean; error?: string }> {
        try {
            // Focus the input
            const focusRes = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.FOCUS_INPUT(AntigravityDomConfig.SELECTORS.CHAT_INPUT));
            if (!focusRes?.ok) {
                return { ok: false, error: 'Failed to focus chat input' };
            }

            // If we have files, inject them first
            if (files && files.length > 0) {
                const injectFilesScript = `(async () => {
                    const dt = new DataTransfer();
                    const filesData = ${JSON.stringify(files)};
                    
                    for (const f of filesData) {
                        try {
                            const res = await fetch('data:' + f.mimeType + ';base64,' + f.base64Data);
                            const blob = await res.blob();
                            dt.items.add(new File([blob], f.name, { type: f.mimeType }));
                        } catch (e) {
                            console.error('Failed to create file blob:', e);
                        }
                    }
                    
                    const inputContainer = document.querySelector('.textarea-container, .input-container') || document.body;
                    inputContainer.dispatchEvent(new DragEvent('drop', {
                        bubbles: true,
                        cancelable: true,
                        dataTransfer: dt
                    }));
                    
                    // Wait for image thumbnail to render
                    await new Promise(r => setTimeout(r, 1000));
                    return { ok: true };
                })()`;

                await this.evaluateScript(injectFilesScript, true);
            }

            // Inject the text
            const injectTextScript = `(() => {
                const editors = Array.from(document.querySelectorAll('${AntigravityDomConfig.SELECTORS.CHAT_INPUT}'));
                const visible = editors.filter(el => el.offsetParent !== null);
                const editor = visible[visible.length - 1];
                if (!editor) return { ok: false, error: 'No editor found' };
                
                // Clear existing
                editor.innerHTML = '';
                
                // Set new
                const p = document.createElement('p');
                p.textContent = ${JSON.stringify(text)};
                editor.appendChild(p);

                editor.dispatchEvent(new Event('input', { bubbles: true }));
                editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
                
                return { ok: true };
            })()`;

            const textRes = await this.evaluateScript(injectTextScript);
            if (!textRes?.ok) {
                return { ok: false, error: 'Failed to inject text into input' };
            }

            // Click submit
            const submitRes = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.CLICK_SUBMIT);
            if (!submitRes?.ok) {
                return { ok: false, error: submitRes?.error || 'Failed to click submit' };
            }

            return { ok: true };
        } catch (error: any) {
            return { ok: false, error: error.message };
        }
    }

    async cancelGeneration(): Promise<boolean> {
        const result = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.CLICK_STOP_BUTTON);
        return result?.ok === true;
    }

    async handleUIApproval(action: 'accept' | 'reject'): Promise<boolean> {
        if (action === 'accept') {
            const approveRes = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.BUILD_CLICK_SCRIPT('Allow'));
            return approveRes?.ok === true;
        } else {
            const denyRes = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.BUILD_CLICK_SCRIPT('Deny'));
            return denyRes?.ok === true;
        }
    }

    async changeUIMode(modeName: string): Promise<UiSyncResult> {
        const safeMode = JSON.stringify(modeName);
        const uiNameMap = JSON.stringify({ fast: 'Fast', plan: 'Planning' });

        const script = '(async () => {'
            + ' const targetMode = ' + safeMode + ';'
            + ' const targetModeLower = targetMode.toLowerCase();'
            + ' const uiNameMap = ' + uiNameMap + ';'
            + ' const targetUiName = uiNameMap[targetModeLower] || targetMode;'
            + ' const targetUiNameLower = targetUiName.toLowerCase();'
            + ' const allBtns = Array.from(document.querySelectorAll("button"));'
            + ' const visibleBtns = allBtns.filter(b => b.offsetParent !== null);'
            + ' const knownModes = Object.values(uiNameMap).map(n => n.toLowerCase());'
            + ' const modeToggleBtn = visibleBtns.find(b => {'
            + '   const text = (b.textContent || "").trim().toLowerCase();'
            + '   const hasChevron = b.querySelector("svg[class*=\\"chevron\\"]");'
            + '   return knownModes.some(m => text === m) && hasChevron;'
            + ' });'
            + ' if (!modeToggleBtn) {'
            + '   return { ok: false, error: "Mode toggle button not found" };'
            + ' }'
            + ' const currentModeText = (modeToggleBtn.textContent || "").trim().toLowerCase();'
            + ' if (currentModeText === targetUiNameLower) {'
            + '   return { ok: true, mode: targetUiName, alreadySelected: true };'
            + ' }'
            + ' modeToggleBtn.click();'
            + ' await new Promise(r => setTimeout(r, 500));'
            + ' const dialogs = Array.from(document.querySelectorAll("[role=\\"dialog\\"]"));'
            + ' const visibleDialog = dialogs.find(d => {'
            + '   const style = window.getComputedStyle(d);'
            + '   return style.visibility !== "hidden" && style.display !== "none";'
            + ' });'
            + ' let modeOption = null;'
            + ' if (visibleDialog) {'
            + '   const fontMediumEls = Array.from(visibleDialog.querySelectorAll(".font-medium"));'
            + '   const matchEl = fontMediumEls.find(el => {'
            + '     const text = (el.textContent || "").trim().toLowerCase();'
            + '     return text === targetUiNameLower;'
            + '   });'
            + '   if (matchEl) {'
            + '     modeOption = matchEl.closest("div.cursor-pointer") || matchEl.parentElement;'
            + '   }'
            + ' }'
            + ' if (!modeOption) {'
            + '   const fallbackEls = Array.from(document.querySelectorAll("div[class*=\\"cursor-pointer\\"]")).filter(el => el.offsetParent !== null);'
            + '   modeOption = fallbackEls.find(el => {'
            + '     if (el === modeToggleBtn) return false;'
            + '     const fm = el.querySelector(".font-medium");'
            + '     if (fm) {'
            + '       const text = (fm.textContent || "").trim().toLowerCase();'
            + '       return text === targetUiNameLower;'
            + '     }'
            + '     return false;'
            + '   });'
            + ' }'
            + ' if (modeOption) {'
            + '   modeOption.click();'
            + '   await new Promise(r => setTimeout(r, 500));'
            + '   const updBtn = Array.from(document.querySelectorAll("button")).filter(b => b.offsetParent !== null).find(b => b.querySelector("svg[class*=\\"chevron\\"]") && knownModes.some(m => (b.textContent || "").trim().toLowerCase() === m));'
            + '   const newMode = updBtn ? (updBtn.textContent || "").trim() : "unknown";'
            + '   return { ok: true, mode: newMode };'
            + ' }'
            + ' document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));'
            + ' await new Promise(r => setTimeout(r, 200));'
            + ' return { ok: false, error: "Mode option " + targetUiName + " not found in dropdown" };'
            + '})()';

        const res = await this.evaluateScript(script, true);
        if (res?.ok) {
            return { ok: true, mode: res.mode };
        }
        return { ok: false, error: res?.error || 'UI operation failed' };
    }

    async getCurrentMode(): Promise<string | null> {
        const expression = '(() => {'
            + ' const uiNameMap = { fast: "Fast", plan: "Planning" };'
            + ' const knownModes = Object.values(uiNameMap).map(n => n.toLowerCase());'
            + ' const reverseMap = {};'
            + ' Object.entries(uiNameMap).forEach(([k, v]) => { reverseMap[v.toLowerCase()] = k; });'
            + ' const allBtns = Array.from(document.querySelectorAll("button"));'
            + ' const visibleBtns = allBtns.filter(b => b.offsetParent !== null);'
            + ' const modeToggleBtn = visibleBtns.find(b => {'
            + '   const text = (b.textContent || "").trim().toLowerCase();'
            + '   const hasChevron = b.querySelector("svg[class*=\\"chevron\\"]");'
            + '   return knownModes.some(m => text === m) && hasChevron;'
            + ' });'
            + ' if (!modeToggleBtn) return null;'
            + ' const currentModeText = (modeToggleBtn.textContent || "").trim().toLowerCase();'
            + ' return reverseMap[currentModeText] || null;'
            + '})()';

        return await this.evaluateScript(expression);
    }

    async changeUIModel(modelName: string): Promise<UiSyncResult> {
        const safeModel = JSON.stringify(modelName);
        const script = `(async () => {
            const targetModel = ${safeModel};
            const modelItems = Array.from(document.querySelectorAll('div.cursor-pointer'))
                .filter(e => e.className.includes('px-2 py-1 flex items-center justify-between'));
            if (modelItems.length === 0) return { ok: false, error: 'Model list not found.' };
            const targetItem = modelItems.find(el => {
                const text = (el.textContent || '').trim().replace(/New$/, '').trim();
                return text === targetModel || text.toLowerCase() === targetModel.toLowerCase();
            });
            if (!targetItem) return { ok: false, error: 'Model not found.' };
            if (targetItem.className.includes('bg-gray-500/20') && !targetItem.className.includes('hover:bg-gray-500/20')) {
                return { ok: true, model: targetModel, alreadySelected: true };
            }
            targetItem.click();
            await new Promise(r => setTimeout(r, 500));
            return { ok: true, model: targetModel, verified: true };
        })()`;

        const res = await this.evaluateScript(script, true);
        if (res?.ok) {
            return { ok: true, model: res.model };
        }
        return { ok: false, error: res?.error || 'UI operation failed' };
    }

    async getUiModels(): Promise<string[]> {
        const script = `(async () => {
            return Array.from(document.querySelectorAll('div.cursor-pointer'))
                .map(e => ({text: (e.textContent || '').trim().replace(/New$/, ''), class: e.className}))
                .filter(e => e.class.includes('px-2 py-1 flex items-center justify-between') || e.text.includes('Gemini') || e.text.includes('GPT') || e.text.includes('Claude'))
                .map(e => e.text);
        })()`;

        const value = await this.evaluateScript(script, true);
        if (Array.isArray(value)) {
            return Array.from(new Set(value));
        }
        return [];
    }

    async getCurrentModel(): Promise<string | null> {
        const script = `(() => {
            return Array.from(document.querySelectorAll('div.cursor-pointer'))
                .find(e => e.className.includes('px-2 py-1 flex items-center justify-between') && e.className.includes('bg-gray-500/20'))
                ?.textContent?.trim().replace(/New$/, '') || null;
        })()`;

        return await this.evaluateScript(script, true);
    }


    async isCurrentlyGenerating(): Promise<boolean> {
        const result = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.DETECT_STOP_BUTTON);
        return result?.isGenerating === true;
    }

    async getLatestResponseText(): Promise<{ text: string; files: Attachment[] }> {
        const textResult = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.EXTRACT_RESPONSE_TEXT);
        return { text: textResult || '', files: [] };
    }

    async pollResponseStatus(extractionMode?: 'structured' | 'legacy'): Promise<ResponseStatus> {
        const isGenerating = await this.isCurrentlyGenerating();
        let text: string | null = null;
        let processLogs: string[] | undefined;
        let quotaDetected = false;

        const quotaRes = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.DETECT_QUOTA_ERROR);
        if (quotaRes === true) {
            quotaDetected = true;
        }

        if (extractionMode === 'structured') {
            const payload = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.EXTRACT_STRUCTURED_RESPONSE);
            const classified = classifyAssistantSegments(payload);
            if (classified.diagnostics.source === 'dom-structured') {
                text = classified.finalOutputText;
                processLogs = classified.activityLines;
            } else {
                // Fallback to legacy
                const rawText = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.EXTRACT_RESPONSE_TEXT);
                text = typeof rawText === 'string' ? rawText.trim() || null : null;
                const logs = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.EXTRACT_PROCESS_LOGS);
                if (Array.isArray(logs)) {
                    processLogs = logs;
                }
            }
        } else {
            const rawText = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.EXTRACT_RESPONSE_TEXT);
            text = typeof rawText === 'string' ? rawText.trim() || null : null;
            const logs = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.EXTRACT_PROCESS_LOGS);
            if (Array.isArray(logs)) {
                processLogs = logs;
            }
        }

        return { isGenerating, text, processLogs, quotaDetected };
    }

    async getPendingApprovals(): Promise<{ requiresApproval: boolean; details?: string }> {
        const result = await this.evaluateScript(AntigravityDomConfig.SCRIPTS.DETECT_APPROVAL);
        if (result) {
            return { requiresApproval: true, details: result.description };
        }
        return { requiresApproval: false };
    }

    async captureScreenshot(): Promise<Buffer> {
        // We call the existing CDP screenshot command
        const res = await this.cdp.call('Page.captureScreenshot', { format: 'png', quality: 80 });
        return Buffer.from(res.data, 'base64');
    }

    // --- Internal Helpers ---

    private async evaluateScript(expression: string, awaitPromise = false): Promise<any> {
        const contextId = this.cdp.getPrimaryContextId();
        const callParams: Record<string, unknown> = {
            expression,
            returnByValue: true,
            awaitPromise,
        };
        if (contextId !== null) {
            callParams.contextId = contextId;
        }
        const result = await this.cdp.call('Runtime.evaluate', callParams);
        return result?.result?.value;
    }

    private async cdpMouseClick(x: number, y: number): Promise<void> {
        await this.cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await this.cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await this.cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }
}
