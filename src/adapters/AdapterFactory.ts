import { EditorAdapter } from './EditorAdapter';
import { AntigravityAdapter } from './antigravity/AntigravityAdapter';

import { CdpService } from '../services/cdpService';

export class AdapterFactory {
    /**
     * Creates and returns the appropriate EditorAdapter based on configuration.
     * @param targetEditor The name of the editor to target (e.g., 'antigravity').
     * @param cdp The active CdpService connection.
     */
    static create(targetEditor: string = 'antigravity', cdp: CdpService): EditorAdapter {
        switch (targetEditor.toLowerCase()) {
            case 'antigravity':
                return new AntigravityAdapter(cdp);
            default:
                throw new Error(`Unsupported editor target: ${targetEditor}`);
        }
    }
}

