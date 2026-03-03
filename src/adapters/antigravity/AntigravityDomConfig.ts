/**
 * Contains all CSS selectors and exact string identifiers used to puppet the Antigravity UI.
 * Abstracted into this config so it can be updated independently of the core adapter logic.
 */
import { extractAssistantSegmentsPayloadScript } from '../../services/assistantDomExtractor';

export const AntigravityDomConfig = {
    SELECTORS: {
        /** Chat input box: textbox excluding terminal */
        CHAT_INPUT: 'div[role="textbox"]:not(.xterm-helper-textarea)',
        /** Submit button search target tag */
        SUBMIT_BUTTON_CONTAINER: 'button',
        /** Submit icon SVG class candidates */
        SUBMIT_BUTTON_SVG_CLASSES: ['lucide-arrow-right', 'lucide-arrow-up', 'lucide-send'],
        /** Keyword to identify message injection target context in CDP */
        CONTEXT_URL_KEYWORD: 'cascade-panel',
    },

    SCRIPTS: {

        // --- Chat Interaction ---
        FOCUS_INPUT: (selector: string) => `(() => {
            const editors = Array.from(document.querySelectorAll('${selector}'));
            const visible = editors.filter(el => el.offsetParent !== null);
            const editor = visible[visible.length - 1];
            if (!editor) return { ok: false, error: 'No editor found' };
            editor.focus();
            return { ok: true };
        })()`,

        CLICK_SUBMIT: `(() => {
            const inputContainer = document.querySelector('div.textarea-container, div.input-container') || document.body;
            const buttons = Array.from(inputContainer.querySelectorAll('button:not(:disabled)'));
            const submitBtn = buttons.find(b => {
                const svgs = b.querySelectorAll('svg');
                return Array.from(svgs).some(svg => {
                    const classes = svg.getAttribute('class') || '';
                    return classes.includes('lucide-arrow-right') || 
                           classes.includes('lucide-arrow-up') || 
                           classes.includes('lucide-send');
                });
            });
            if (!submitBtn) return { ok: false, error: 'Terminal/chat submit button not found' };
            submitBtn.click();
            return { ok: true };
        })()`,

        // --- Response Extraction ---
        EXTRACT_RESPONSE_TEXT: `(() => {
            const panel = document.querySelector('.antigravity-agent-side-panel');
            const scopes = [panel, document].filter(Boolean);
            const selectors = [
                { sel: '.rendered-markdown', score: 10 },
                { sel: '.leading-relaxed.select-text', score: 9 },
                { sel: '.flex.flex-col.gap-y-3', score: 8 },
                { sel: '[data-message-author-role="assistant"]', score: 7 },
                { sel: '[data-message-role="assistant"]', score: 6 },
                { sel: '[class*="assistant-message"]', score: 5 },
                { sel: '[class*="message-content"]', score: 4 },
                { sel: '[class*="markdown-body"]', score: 3 },
                { sel: '.prose', score: 2 },
            ];

            const looksLikeActivityLog = (text) => {
                const normalized = (text || '').trim().toLowerCase();
                if (!normalized) return false;
                const activityPattern = /^(?:analy[sz]ing|reading|writing|running|searching|planning|thinking|processing|loading|executing|testing|debugging|fetching|connecting|creating|updating|deleting|installing|building|compiling|deploying|checking|scanning|parsing|resolving|downloading|uploading|analyzed|read|wrote|ran|created|updated|deleted|fetched|built|compiled|installed|resolved|downloaded|connected)\\b/i;
                if (activityPattern.test(normalized) && normalized.length <= 220) return true;
                if (/^initiating\\s/i.test(normalized) && normalized.length <= 500) return true;
                if (/^thought for\\s/i.test(normalized) && normalized.length <= 500) return true;
                return false;
            };

            const looksLikeFeedbackFooter = (text) => {
                const normalized = (text || '').trim().toLowerCase().replace(/\\s+/g, ' ');
                if (!normalized) return false;
                return normalized === 'good bad' || normalized === 'good' || normalized === 'bad';
            };

            const isInsideExcludedContainer = (node) => {
                if (node.closest('details')) return true;
                if (node.closest('[class*="feedback"], footer')) return true;
                if (node.closest('.notify-user-container')) return true;
                if (node.closest('[role="dialog"]')) return true;
                return false;
            };

            const looksLikeToolOutput = (text) => {
                const first = (text || '').trim().split('\\n')[0] || '';
                if (/^[a-z0-9._-]+\\s*\\/\\s*[a-z0-9._-]+$/i.test(first)) return true;
                if (/^full output written to\\b/i.test(first)) return true;
                if (/^output\\.[a-z0-9._-]+(?:#l\\d+(?:-\\d+)?)?$/i.test(first)) return true;
                if (/^(json|javascript|typescript|python|bash|sh|html|css|xml|yaml|yml|toml|sql|graphql|markdown|text|plaintext|log|ruby|go|rust|java|c|cpp|csharp|php|swift|kotlin)$/i.test(first)) return true;
                return false;
            };

            const combinedSelector = selectors.map((s) => s.sel).join(', ');
            const seen = new Set();

            for (const scope of scopes) {
                const nodes = scope.querySelectorAll(combinedSelector);
                for (let i = nodes.length - 1; i >= 0; i--) {
                    const node = nodes[i];
                    if (!node || seen.has(node)) continue;
                    seen.add(node);
                    if (isInsideExcludedContainer(node)) continue;
                    const text = (node.innerText || node.textContent || '').replace(/\\r/g, '').trim();
                    if (!text || text.length < 2) continue;
                    if (looksLikeActivityLog(text)) continue;
                    if (looksLikeFeedbackFooter(text)) continue;
                    if (looksLikeToolOutput(text)) continue;
                    return text;
                }
            }
            return null;
        })()`,

        EXTRACT_PROCESS_LOGS: `(() => {
            const panel = document.querySelector('.antigravity-agent-side-panel');
            const scopes = [panel, document].filter(Boolean);

            const selectors = [
                { sel: '.rendered-markdown', score: 10 },
                { sel: '.leading-relaxed.select-text', score: 9 },
                { sel: '.flex.flex-col.gap-y-3', score: 8 },
                { sel: '[data-message-author-role="assistant"]', score: 7 },
                { sel: '[data-message-role="assistant"]', score: 6 },
                { sel: '[class*="assistant-message"]', score: 5 },
                { sel: '[class*="message-content"]', score: 4 },
                { sel: '[class*="markdown-body"]', score: 3 },
                { sel: '.prose', score: 2 },
            ];

            const looksLikeActivityLog = (text) => {
                const normalized = (text || '').trim().toLowerCase();
                if (!normalized) return false;
                const activityPattern = /^(?:analy[sz]ing|reading|writing|running|searching|planning|thinking|processing|loading|executing|testing|debugging|fetching|connecting|creating|updating|deleting|installing|building|compiling|deploying|checking|scanning|parsing|resolving|downloading|uploading|analyzed|read|wrote|ran|created|updated|deleted|fetched|built|compiled|installed|resolved|downloaded|connected)\\b/i;
                if (activityPattern.test(normalized) && normalized.length <= 220) return true;
                if (/^initiating\\s/i.test(normalized) && normalized.length <= 500) return true;
                if (/^thought for\\s/i.test(normalized) && normalized.length <= 500) return true;
                return false;
            };

            const looksLikeToolOutput = (text) => {
                const first = (text || '').trim().split('\\n')[0] || '';
                if (/^[a-z0-9._-]+\\s*\\/\\s*[a-z0-9._-]+$/i.test(first)) return true;
                if (/^full output written to\\b/i.test(first)) return true;
                if (/^output\\.[a-z0-9._-]+(?:#l\\d+(?:-\\d+)?)?$/i.test(first)) return true;
                var lower = (text || '').trim().toLowerCase();
                if (/^title:\\s/.test(lower) && /\\surl:\\s/.test(lower) && /\\ssnippet:\\s/.test(lower)) return true;
                if (/^(json|javascript|typescript|python|bash|sh|html|css|xml|yaml|yml|toml|sql|graphql|markdown|text|plaintext|log|ruby|go|rust|java|c|cpp|csharp|php|swift|kotlin)$/i.test(first)) return true;
                return false;
            };

            const isInsideExcludedContainer = (node) => {
                if (node.closest('details')) return true;
                if (node.closest('[class*="feedback"], footer')) return true;
                if (node.closest('.notify-user-container')) return true;
                if (node.closest('[role="dialog"]')) return true;
                return false;
            };

            const results = [];
            const seen = new Set();

            for (const scope of scopes) {
                for (const { sel } of selectors) {
                    const nodes = scope.querySelectorAll(sel);
                    for (let i = 0; i < nodes.length; i++) {
                        const node = nodes[i];
                        if (!node || seen.has(node)) continue;
                        seen.add(node);
                        if (isInsideExcludedContainer(node)) continue;
                        const text = (node.innerText || node.textContent || '').replace(/\\r/g, '').trim();
                        if (!text || text.length < 4) continue;
                        if (looksLikeActivityLog(text) || looksLikeToolOutput(text)) {
                            results.push(text.slice(0, 300));
                        }
                    }
                }
            }

            return results;
        })()`,

        DETECT_QUOTA_ERROR: `(() => {
            const panel = document.querySelector('.antigravity-agent-side-panel');
            const scope = panel || document;
            const QUOTA_KEYWORDS = ['model quota reached', 'rate limit', 'quota exceeded', 'exhausted your quota', 'exhausted quota'];
            const isInsideResponse = (node) =>
                node.closest('.rendered-markdown, .prose, pre, code, [data-message-author-role="assistant"], [data-message-role="assistant"], [class*="message-content"]');

            const headings = scope.querySelectorAll('h3 span, h3');
            for (const el of headings) {
                if (isInsideResponse(el)) continue;
                const text = (el.textContent || '').trim().toLowerCase();
                if (QUOTA_KEYWORDS.some(kw => text.includes(kw))) return true;
            }

            const inlineSpans = scope.querySelectorAll('span');
            for (const el of inlineSpans) {
                if (isInsideResponse(el)) continue;
                const text = (el.textContent || '').trim().toLowerCase();
                if (text.includes('exhausted your quota') || text.includes('exhausted quota')) return true;
            }

            const errorSelectors = [
                '[role="alert"]', '[class*="error"]', '[class*="warning"]', '[class*="toast"]',
                '[class*="banner"]', '[class*="notification"]', '[class*="alert"]',
                '[class*="quota"]', '[class*="rate-limit"]',
            ];
            const errorElements = scope.querySelectorAll(errorSelectors.join(', '));
            for (const el of errorElements) {
                if (isInsideResponse(el)) continue;
                const text = (el.textContent || '').trim().toLowerCase();
                if (QUOTA_KEYWORDS.some(kw => text.includes(kw))) return true;
            }
            return false;
        })()`,

        EXTRACT_STRUCTURED_RESPONSE: extractAssistantSegmentsPayloadScript(),

        DETECT_STOP_BUTTON: `(() => {
            const panel = document.querySelector('.antigravity-agent-side-panel');
            const scopes = [panel, document].filter(Boolean);
            
            for (const scope of scopes) {
                const el = scope.querySelector('[data-tooltip-id="input-send-button-cancel-tooltip"]');
                if (el) return { isGenerating: true };
            }

            const normalize = (value) => (value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
            const STOP_PATTERNS = [/^stop$/, /^stop generating$/, /^stop response$/, /^停止$/, /^生成を停止$/, /^応答を停止$/];
            
            for (const scope of scopes) {
                const buttons = scope.querySelectorAll('button, [role="button"]');
                for (let i = 0; i < buttons.length; i++) {
                    const btn = buttons[i];
                    const labels = [btn.textContent || '', btn.getAttribute('aria-label') || '', btn.getAttribute('title') || ''];
                    if (labels.some(lbl => STOP_PATTERNS.some(re => re.test(normalize(lbl))))) {
                        return { isGenerating: true };
                    }
                }
            }
            return { isGenerating: false };
        })()`,

        CLICK_STOP_BUTTON: `(() => {
            const panel = document.querySelector('.antigravity-agent-side-panel');
            const scopes = [panel, document].filter(Boolean);

            for (const scope of scopes) {
                const el = scope.querySelector('[data-tooltip-id="input-send-button-cancel-tooltip"]');
                if (el && typeof el.click === 'function') {
                    el.click();
                    return { ok: true, method: 'tooltip-id' };
                }
            }

            const normalize = (value) => (value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
            const STOP_PATTERNS = [/^stop$/, /^stop generating$/, /^stop response$/, /^停止$/, /^生成を停止$/, /^応答を停止$/];
            
            for (const scope of scopes) {
                const buttons = scope.querySelectorAll('button, [role="button"]');
                for (let i = 0; i < buttons.length; i++) {
                    const btn = buttons[i];
                    const labels = [btn.textContent || '', btn.getAttribute('aria-label') || '', btn.getAttribute('title') || ''];
                    if (labels.some(lbl => STOP_PATTERNS.some(re => re.test(normalize(lbl)))) && typeof btn.click === 'function') {
                        btn.click();
                        return { ok: true, method: 'text-fallback' };
                    }
                }
            }
            return { ok: false, error: 'Stop button not found' };
        })()`,

        // --- Approvals ---
        DETECT_APPROVAL: `(() => {
            const ALLOW_ONCE_PATTERNS = ['allow once', 'allow one time', '今回のみ許可', '1回のみ許可', '一度許可'];
            const ALWAYS_ALLOW_PATTERNS = ['allow this conversation', 'allow this chat', 'always allow', '常に許可', 'この会話を許可'];
            const ALLOW_PATTERNS = ['allow', 'permit', '許可', '承認', '確認'];
            const DENY_PATTERNS = ['deny', '拒否', 'decline'];

            const normalize = (text) => (text || '').toLowerCase().replace(/\\s+/g, ' ').trim();
            const allButtons = Array.from(document.querySelectorAll('button')).filter(btn => btn.offsetParent !== null);

            let approveBtn = allButtons.find(btn => ALLOW_ONCE_PATTERNS.some(p => normalize(btn.textContent).includes(p))) || null;
            if (!approveBtn) {
                approveBtn = allButtons.find(btn => !ALWAYS_ALLOW_PATTERNS.some(p => normalize(btn.textContent).includes(p)) && ALLOW_PATTERNS.some(p => normalize(btn.textContent).includes(p))) || null;
            }
            if (!approveBtn) return null;

            const container = approveBtn.closest('[role="dialog"], .modal, .dialog, .approval-container, .permission-dialog') || approveBtn.parentElement?.parentElement || approveBtn.parentElement || document.body;
            const containerButtons = Array.from(container.querySelectorAll('button')).filter(btn => btn.offsetParent !== null);
            
            const denyBtn = containerButtons.find(btn => DENY_PATTERNS.some(p => normalize(btn.textContent).includes(p))) || null;
            if (!denyBtn) return null;

            const alwaysAllowBtn = containerButtons.find(btn => ALWAYS_ALLOW_PATTERNS.some(p => normalize(btn.textContent).includes(p))) || null;

            /** Description extraction logic omitted for brevity in config, 
             * can be fully implemented or handled by a generic DOM extraction
             */
            let description = 'Approval required'; 

            return { 
                approveText: (approveBtn.textContent || '').trim(), 
                alwaysAllowText: alwaysAllowBtn ? (alwaysAllowBtn.textContent || '').trim() : '', 
                denyText: (denyBtn.textContent || '').trim(), 
                description 
            };
        })()`,

        BUILD_CLICK_SCRIPT: (buttonText: string) => {
            const safeText = JSON.stringify(buttonText);
            return `(() => {
                const normalize = (text) => (text || '').toLowerCase().replace(/\\s+/g, ' ').trim();
                const text = ${safeText};
                const wanted = normalize(text);
                const allButtons = Array.from(document.querySelectorAll('button'));
                const target = allButtons.find(btn => {
                    if (!btn.offsetParent) return false;
                    const bText = normalize(btn.textContent || '');
                    const aria = normalize(btn.getAttribute('aria-label') || '');
                    return bText === wanted || aria === wanted || bText.includes(wanted) || aria.includes(wanted);
                });
                if (!target) return { ok: false, error: 'Button not found: ' + text };
                target.click();
                return { ok: true };
            })()`;
        },

        // --- Sessions ---
        GET_NEW_CHAT_BUTTON_SCRIPT: `(() => {
            const btn = document.querySelector('[data-tooltip-id="new-conversation-tooltip"]');
            if (!btn) return { found: false };
            const cursor = window.getComputedStyle(btn).cursor;
            const rect = btn.getBoundingClientRect();
            return {
                found: true,
                enabled: cursor === 'pointer',
                cursor,
                x: Math.round(rect.x + rect.width / 2),
                y: Math.round(rect.y + rect.height / 2),
            };
        })()`,

        GET_CHAT_TITLE_SCRIPT: `(() => {
            const panel = document.querySelector('.antigravity-agent-side-panel');
            if (!panel) return { title: '', hasActiveChat: false };
            const header = panel.querySelector('div[class*="border-b"]');
            if (!header) return { title: '', hasActiveChat: false };
            const titleEl = header.querySelector('div[class*="text-ellipsis"]');
            const title = titleEl ? (titleEl.textContent || '').trim() : '';
            const hasActiveChat = title.length > 0 && title !== 'Agent';
            return { title: title || '(Untitled)', hasActiveChat };
        })()`,

        FIND_PAST_CONVERSATIONS_BUTTON_SCRIPT: `(() => {
            const isVisible = (el) => !!el && el instanceof HTMLElement && el.offsetParent !== null;
            const getRect = (el) => {
                const rect = el.getBoundingClientRect();
                return { found: true, x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
            };

            const toggle = document.querySelector('[data-past-conversations-toggle]');
            if (toggle && isVisible(toggle)) return getRect(toggle);

            const tooltipEls = Array.from(document.querySelectorAll('[data-tooltip-id]'));
            for (const el of tooltipEls) {
                if (!isVisible(el)) continue;
                const tid = (el.getAttribute('data-tooltip-id') || '').toLowerCase();
                if (tid.includes('history') || tid.includes('past-conversations')) {
                    return getRect(el);
                }
            }

            const icons = Array.from(document.querySelectorAll('svg.lucide-history, svg[class*="lucide-history"]'));
            for (const icon of icons) {
                const parent = icon.closest('a, button, [role="button"], div[class*="cursor-pointer"]');
                const target = parent instanceof HTMLElement && isVisible(parent) ? parent : icon;
                if (isVisible(target)) return getRect(target);
            }

            return { found: false, x: 0, y: 0 };
        })()`,

        SCRAPE_PAST_CONVERSATIONS_SCRIPT: `(() => {
            const isVisible = (el) => !!el && el instanceof HTMLElement && el.offsetParent !== null;
            const normalize = (text) => (text || '').trim();
            const items = [];
            const seen = new Set();
            const containers = Array.from(document.querySelectorAll('div[class*="overflow-auto"], div[class*="overflow-y-scroll"]'));
            const container = containers.find((c) => isVisible(c) && c.querySelectorAll('div[class*="cursor-pointer"]').length > 0) || document;
            
            let boundaryTop = Infinity;
            const headerCandidates = container.querySelectorAll('div[class*="text-xs"][class*="opacity"]');
            for (const el of headerCandidates) {
                if (!isVisible(el)) continue;
                const t = normalize(el.textContent || '');
                if (/^Other\\s+Conversations?$/i.test(t)) {
                    boundaryTop = el.getBoundingClientRect().top;
                    break;
                }
            }

            const rows = Array.from(container.querySelectorAll('div[class*="cursor-pointer"]'));
            for (const row of rows) {
                if (!isVisible(row)) continue;
                if (row.getBoundingClientRect().top >= boundaryTop) continue;
                const spans = Array.from(row.querySelectorAll('span.text-sm span, span.text-sm'));
                let title = '';
                for (const span of spans) {
                    const t = normalize(span.textContent || '');
                    if (/^\\d+\\s+(min|hr|hour|day|sec|week|month|year)s?\\s+ago$/i.test(t)) continue;
                    if (t.length < 2 || t.length > 200) continue;
                    if (/^(show\\s+\\d+\\s+more|new|past|history|settings|close|menu)\\b/i.test(t)) continue;
                    title = t;
                    break;
                }
                if (!title || seen.has(title)) continue;
                seen.add(title);
                const isActive = /focusBackground/i.test(row.className || '');
                items.push({ title, isActive });
            }
            return { sessions: items };
        })()`,

        FIND_SHOW_MORE_BUTTON_SCRIPT: `(() => {
            const isVisible = (el) => !!el && el instanceof HTMLElement && el.offsetParent !== null;
            const els = Array.from(document.querySelectorAll('div, span'));
            for (const el of els) {
                if (!isVisible(el)) continue;
                const text = (el.textContent || '').trim();
                if (/^Show\\s+\\d+\\s+more/i.test(text)) {
                    const rect = el.getBoundingClientRect();
                    return { found: true, x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
                }
            }
            return { found: false, x: 0, y: 0 };
        })()`,

        BUILD_ACTIVATE_CHAT_BY_TITLE_SCRIPT: (title: string) => {
            const safeTitle = JSON.stringify(title);
            return `(() => {
                const wantedRaw = ${safeTitle};
                const wanted = (wantedRaw || '').toLowerCase().replace(/\\s+/g, ' ').trim();
                if (!wanted) return { ok: false, error: 'Empty target title' };

                const panel = document.querySelector('.antigravity-agent-side-panel') || document;
                const normalize = (text) => (text || '').toLowerCase().replace(/\\s+/g, ' ').trim();
                const isVisible = (el) => !!el && el instanceof HTMLElement && el.offsetParent !== null;
                const clickTarget = (el) => {
                    const clickable = el.closest('button, [role="button"], a, li, [data-testid*="conversation"]') || el;
                    if (!(clickable instanceof HTMLElement)) return false;
                    clickable.click();
                    return true;
                };

                const nodes = Array.from(panel.querySelectorAll('button, [role="button"], a, li, div, span')).filter(isVisible);
                const exact = [];
                const includes = [];
                for (const node of nodes) {
                    const text = normalize(node.textContent || '');
                    if (!text) continue;
                    if (text === wanted) {
                        exact.push({ node, textLength: text.length });
                    } else if (text.includes(wanted)) {
                        includes.push({ node, textLength: text.length });
                    }
                }

                const pick = (list) => {
                    if (list.length === 0) return null;
                    list.sort((a, b) => a.textLength - b.textLength);
                    return list[0].node;
                };

                const target = pick(exact) || pick(includes);
                if (!target) return { ok: false, error: 'Chat title not found in side panel' };
                if (!clickTarget(target)) return { ok: false, error: 'Matched element is not clickable' };
                return { ok: true };
            })()`;
        },

        BUILD_ACTIVATE_VIA_PAST_CONVERSATIONS_SCRIPT: (title: string) => {
            const safeTitle = JSON.stringify(title);
            return `(() => {
                const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
                const wantedRaw = ${safeTitle};
                const normalize = (text) => (text || '')
                    .normalize('NFKC')
                    .toLowerCase()
                    .replace(/[\\u2018\\u2019\\u201C\\u201D'"\`]/g, '')
                    .replace(/\\s+/g, ' ')
                    .trim();
                const normalizeLoose = (text) => normalize(text).replace(/[^a-z0-9\\u3040-\\u30ff\\u4e00-\\u9faf\\s]/g, '').replace(/\\s+/g, ' ').trim();

                const wanted = normalize(wantedRaw || '');
                const wantedLoose = normalizeLoose(wantedRaw || '');
                if (!wanted) return { ok: false, error: 'Empty target title' };

                const isVisible = (el) => !!el && el instanceof HTMLElement && el.offsetParent !== null;
                const asArray = (nodeList) => Array.from(nodeList || []);
                const getLabelText = (el) => {
                    if (!el || !(el instanceof Element)) return '';
                    const parts = [
                        el.textContent || '',
                        el.getAttribute('aria-label') || '',
                        el.getAttribute('title') || '',
                        el.getAttribute('placeholder') || '',
                        el.getAttribute('data-tooltip-content') || '',
                        el.getAttribute('data-testid') || '',
                    ];
                    return parts.filter(Boolean).join(' ');
                };
                const getClickable = (el) => {
                    if (!el || !(el instanceof Element)) return null;
                    const clickable = el.closest('button, [role="button"], a, li, [role="option"], [data-testid*="conversation"]');
                    return clickable instanceof HTMLElement ? clickable : (el instanceof HTMLElement ? el : null);
                };
                const pickBest = (elements, patterns) => {
                    const matched = [];
                    for (const el of elements) {
                        if (!isVisible(el)) continue;
                        const text = normalize(getLabelText(el));
                        const textLoose = normalizeLoose(getLabelText(el));
                        if (!text) continue;
                        for (const pattern of patterns) {
                            if (!pattern) continue;
                            const p = normalize(pattern);
                            const pLoose = normalizeLoose(pattern);
                            if (
                                text === p ||
                                text.includes(p) ||
                                (pLoose && (textLoose === pLoose || textLoose.includes(pLoose)))
                            ) {
                                matched.push({ el, score: Math.abs(text.length - pattern.length) });
                                break;
                            }
                        }
                    }
                    if (matched.length === 0) return null;
                    matched.sort((a, b) => a.score - b.score);
                    return matched[0].el;
                };
                const clickByPatterns = (patterns, selector) => {
                    const nodes = asArray(document.querySelectorAll('button, [role="button"], a, li, div, span'));
                    const scopedNodes = selector ? asArray(document.querySelectorAll(selector)) : [];
                    const source = scopedNodes.length > 0 ? scopedNodes : nodes;
                    const target = pickBest(source, patterns);
                    const clickable = getClickable(target);
                    if (!clickable) return false;
                    clickable.click();
                    return true;
                };
                const setInputValue = (el, value) => {
                    if (!el) return false;
                    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                        el.focus();
                        el.value = value;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        return true;
                    }
                    if (el instanceof HTMLElement) {
                        el.focus();
                        if (el.isContentEditable) {
                            el.textContent = value;
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            return true;
                        }
                    }
                    return false;
                };
                const clickIconHistoryButton = () => {
                    const iconTargets = asArray(document.querySelectorAll('svg, i, span, div'));
                    const patterns = ['history', 'clock', 'conversation', 'past'];
                    for (const icon of iconTargets) {
                        const descriptor = normalize([
                            icon.getAttribute?.('class') || '',
                            icon.getAttribute?.('data-testid') || '',
                            icon.getAttribute?.('data-icon') || '',
                            icon.getAttribute?.('aria-label') || '',
                            icon.getAttribute?.('title') || '',
                            icon.getAttribute?.('data-tooltip-id') || '',
                        ].join(' '));
                        if (!descriptor) continue;
                        if (!patterns.some((p) => descriptor.includes(p))) continue;
                        const clickable = getClickable(icon);
                        if (clickable && isVisible(clickable)) {
                            clickable.click();
                            return true;
                        }
                    }
                    return false;
                };
                const openMenuThenClickPast = async () => {
                    const openedMenu = clickByPatterns(
                        ['more', 'options', 'menu', 'actions', '...', 'ellipsis', '設定', '操作'],
                        'button[aria-haspopup], [role="button"][aria-haspopup], button, [role="button"]',
                    );
                    if (!openedMenu) return false;
                    await wait(180);
                    return clickByPatterns([
                        'past conversations',
                        'past conversation',
                        'conversation history',
                        'past chats',
                        '過去の会話',
                        'chat history',
                    ], '[role="menuitem"], [role="option"], button, [role="button"], li, div, span');
                };
                const pressEnter = (el) => {
                    if (!(el instanceof HTMLElement)) return;
                    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
                    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
                };
                const findSearchInput = () => {
                    const inputs = asArray(document.querySelectorAll('input, textarea, [role="combobox"], [role="searchbox"], [contenteditable="true"]'));
                    const strongPatterns = ['select a conversation', 'search conversation', 'search chats', 'search'];
                    const placeholders = [];
                    for (const el of inputs) {
                        if (!isVisible(el)) continue;
                        const placeholder = normalize(el.getAttribute('placeholder') || '');
                        const ariaLabel = normalize(el.getAttribute('aria-label') || '');
                        const text = normalize(getLabelText(el));
                        const combined = [placeholder, ariaLabel, text].filter(Boolean).join(' ');
                        placeholders.push({ el, combined });
                    }
                    for (const p of strongPatterns) {
                        const found = placeholders.find((x) => x.combined.includes(p));
                        if (found) return found.el;
                    }
                    return placeholders[0]?.el || null;
                };

                return (async () => {
                    let opened = false;
                    const toggleBtn = document.querySelector('[data-past-conversations-toggle]');
                    if (toggleBtn && isVisible(toggleBtn)) {
                        const clickable = getClickable(toggleBtn);
                        if (clickable) { clickable.click(); opened = true; }
                    }
                    if (!opened) {
                        const tooltipEls = asArray(document.querySelectorAll('[data-tooltip-id]'));
                        for (const el of tooltipEls) {
                            if (!isVisible(el)) continue;
                            const tid = normalize(el.getAttribute('data-tooltip-id') || '');
                            if (tid.includes('history') || tid.includes('past-conversations')) {
                                const cl = getClickable(el);
                                if (cl) { cl.click(); opened = true; break; }
                            }
                        }
                    }
                    if (!opened) opened = clickByPatterns(['past conversations', 'past conversation', 'conversation history', 'past chats', '過去の会話', 'chat history']);
                    if (!opened) opened = clickIconHistoryButton();
                    if (!opened) opened = await openMenuThenClickPast();
                    if (!opened) return { ok: false, error: 'Past Conversations button not found' };

                    await wait(320);

                    clickByPatterns(['select a conversation', 'select conversation', 'conversation'], '[role="button"], button, [aria-haspopup], [data-testid*="conversation"]');
                    await wait(220);

                    const input = findSearchInput();
                    if (input) {
                        setInputValue(input, wantedRaw);
                        await wait(260);
                    }

                    let selected = clickByPatterns([wanted, wantedLoose], '[role="option"], li, button, [data-testid*="conversation"]');
                    if (!selected && input) {
                        pressEnter(input);
                        await wait(220);
                        selected = true;
                    }
                    if (!selected) return { ok: false, error: 'Conversation not found in Past Conversations' };
                    return { ok: true };
                })();
            })()`;
        },

        // --- Error Popups ---
        DETECT_ERROR_POPUP: `(() => {
            const ERROR_PATTERNS = ['agent terminated', 'terminated due to error', 'unexpected error', 'something went wrong', 'an error occurred'];
            const normalize = (text) => (text || '').toLowerCase().replace(/\\s+/g, ' ').trim();

            const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], .modal, .dialog')).filter(el => el.offsetParent !== null || el.getAttribute('aria-modal') === 'true');
            if (dialogs.length === 0) {
                const overlays = Array.from(document.querySelectorAll('div[class*="fixed"], div[class*="absolute"]'))
                    .filter(el => {
                        const style = window.getComputedStyle(el);
                        return (style.position === 'fixed' || style.position === 'absolute')
                            && style.zIndex && parseInt(style.zIndex, 10) > 10
                            && el.querySelector('button');
                    });
                dialogs.push(...overlays);
            }

            for (const dialog of dialogs) {
                const fullText = normalize(dialog.textContent || '');
                const isError = ERROR_PATTERNS.some(p => fullText.includes(p));
                if (!isError) continue;

                const headingEl = dialog.querySelector('h1, h2, h3, h4, [class*="title"], [class*="heading"]');
                const title = headingEl ? (headingEl.textContent || '').trim() : 'Error';
                
                const allButtons = Array.from(dialog.querySelectorAll('button'));
                const buttons = allButtons.map(btn => (btn.textContent || '').trim()).filter(t => t.length > 0);
                if (buttons.length === 0) continue;

                return { title, body: 'Error popup detected', buttons };
            }
            return null;
        })()`
    }
};
