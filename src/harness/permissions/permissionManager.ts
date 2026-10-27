import { logger } from '../../utils/logger';

export type ToolName =
  | 'generateSlideContent'
  | 'generateImage'
  | 'validateHTML'
  | 'validateCSS'
  | 'exportPPTX'
  | 'exportPDF'
  | 'templateEngine'
  | 'spellChecker';

export interface ToolPermission {
  tool: ToolName;
  allowed: boolean;
  requiresValidation: boolean;
  rateLimit?: number;
}

const log = logger.child('PermissionManager');

const defaultPermissions: ToolPermission[] = [
  { tool: 'generateSlideContent', allowed: true, requiresValidation: true, rateLimit: 50 },
  { tool: 'generateImage', allowed: true, requiresValidation: true, rateLimit: 10 },
  { tool: 'validateHTML', allowed: true, requiresValidation: false },
  { tool: 'validateCSS', allowed: true, requiresValidation: false },
  { tool: 'exportPPTX', allowed: true, requiresValidation: true },
  { tool: 'exportPDF', allowed: true, requiresValidation: true },
  { tool: 'templateEngine', allowed: true, requiresValidation: true },
  { tool: 'spellChecker', allowed: true, requiresValidation: false },
];

export class PermissionManager {
  private permissions: Map<ToolName, ToolPermission>;
  private usageCount: Map<ToolName, number> = new Map();

  constructor(customPermissions?: Partial<Record<ToolName, Partial<ToolPermission>>>) {
    this.permissions = new Map();

    for (const perm of defaultPermissions) {
      const custom = customPermissions?.[perm.tool];
      this.permissions.set(perm.tool, { ...perm, ...custom });
      this.usageCount.set(perm.tool, 0);
    }

    log.info('PermissionManager initialized');
  }

  isAllowed(tool: ToolName): boolean {
    const perm = this.permissions.get(tool);
    if (!perm) {
      log.warn(`Unknown tool requested: ${tool}`);
      return false;
    }

    if (!perm.allowed) {
      log.warn(`Tool ${tool} is not allowed`);
      return false;
    }

    if (perm.rateLimit) {
      const count = this.usageCount.get(tool) || 0;
      if (count >= perm.rateLimit) {
        log.warn(`Tool ${tool} rate limit reached (${count}/${perm.rateLimit})`);
        return false;
      }
    }

    return true;
  }

  requiresValidation(tool: ToolName): boolean {
    const perm = this.permissions.get(tool);
    return perm?.requiresValidation ?? false;
  }

  recordUsage(tool: ToolName): void {
    const count = this.usageCount.get(tool) || 0;
    this.usageCount.set(tool, count + 1);
  }

  getUsageStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [tool, count] of this.usageCount) {
      stats[tool] = count;
    }
    return stats;
  }

  resetUsage(): void {
    for (const tool of this.usageCount.keys()) {
      this.usageCount.set(tool, 0);
    }
  }
}
