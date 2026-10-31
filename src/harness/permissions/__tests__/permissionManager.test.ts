import { describe, expect, it } from 'vitest';
import { PermissionManager } from '../permissionManager';

describe('PermissionManager', () => {
  it('defaults to allowing known tools', () => {
    const pm = new PermissionManager();
    expect(pm.isAllowed('generateSlideContent')).toBe(true);
    expect(pm.isAllowed('exportPPTX')).toBe(true);
    expect(pm.isAllowed('spellChecker')).toBe(true);
  });

  it('denies unknown tools', () => {
    const pm = new PermissionManager();
    // @ts-expect-error intentionally unknown
    expect(pm.isAllowed('unknownTool')).toBe(false);
  });

  it('respects rate limits', () => {
    const pm = new PermissionManager({
      generateSlideContent: { rateLimit: 2 },
    });
    expect(pm.isAllowed('generateSlideContent')).toBe(true);
    pm.recordUsage('generateSlideContent');
    pm.recordUsage('generateSlideContent');
    expect(pm.isAllowed('generateSlideContent')).toBe(false);
  });

  it('reports usage stats', () => {
    const pm = new PermissionManager();
    pm.recordUsage('generateSlideContent');
    pm.recordUsage('generateSlideContent');
    pm.recordUsage('exportPPTX');
    expect(pm.getUsageStats()).toEqual({
      generateSlideContent: 2,
      exportPPTX: 1,
      generateImage: 0,
      validateHTML: 0,
      validateCSS: 0,
      exportPDF: 0,
      templateEngine: 0,
      spellChecker: 0,
    });
  });

  it('can disable a tool entirely', () => {
    const pm = new PermissionManager({
      exportPPTX: { allowed: false },
    });
    expect(pm.isAllowed('exportPPTX')).toBe(false);
  });

  it('requiresValidation returns correct values', () => {
    const pm = new PermissionManager();
    expect(pm.requiresValidation('generateSlideContent')).toBe(true);
    expect(pm.requiresValidation('spellChecker')).toBe(false);
  });

  it('resetUsage clears all counters', () => {
    const pm = new PermissionManager();
    pm.recordUsage('generateSlideContent');
    pm.resetUsage();
    expect(pm.getUsageStats().generateSlideContent).toBe(0);
  });
});