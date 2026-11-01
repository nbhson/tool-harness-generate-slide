import { describe, expect, it } from 'vitest';
import {
  ExitCode,
  getErrorHint,
  getExitCode,
} from '../exitCodes';
import {
  ExportError,
  LLMConnectionError,
  LLMError,
  PlanningError,
  SlideHarnessError,
  ThemeError,
} from '../errors';
import { OptionValidationError } from '../validators';

describe('exitCodes', () => {
  describe('getExitCode', () => {
    it('OptionValidationError → INPUT_ERROR (2)', () => {
      expect(getExitCode(new OptionValidationError('bad theme', 'theme', 'x', 'modern'))).toBe(
        ExitCode.INPUT_ERROR,
      );
    });

    it('LLMError / LLMConnectionError → LLM_ERROR (3)', () => {
      expect(getExitCode(new LLMError('boom', { model: 'm' }))).toBe(ExitCode.LLM_ERROR);
      expect(getExitCode(new LLMConnectionError('http://x'))).toBe(ExitCode.LLM_ERROR);
    });

    it('ExportError → EXPORT_ERROR (4)', () => {
      expect(getExitCode(new ExportError('cannot write'))).toBe(ExitCode.EXPORT_ERROR);
    });

    it('PlanningError / ThemeError → INPUT_ERROR (2)', () => {
      expect(getExitCode(new PlanningError('planning failed'))).toBe(ExitCode.INPUT_ERROR);
      expect(getExitCode(new ThemeError('nope', ['modern']))).toBe(ExitCode.INPUT_ERROR);
    });

    it('Error thường "Planning failed: ..." → INPUT_ERROR (2)', () => {
      expect(getExitCode(new Error('Planning failed: Input is too short'))).toBe(
        ExitCode.INPUT_ERROR,
      );
    });

    it('Error thường chứa "Cannot connect to LLM" → LLM_ERROR (3)', () => {
      expect(getExitCode(new Error('Cannot connect to LLM at http://x: ECONNREFUSED'))).toBe(
        ExitCode.LLM_ERROR,
      );
    });

    it('SlideHarnessError code lạ → GENERIC_ERROR (1)', () => {
      expect(getExitCode(new SlideHarnessError('weird', { code: 'WEIRD' }))).toBe(
        ExitCode.GENERIC_ERROR,
      );
    });

    it('Error thường khác → GENERIC_ERROR (1)', () => {
      expect(getExitCode(new Error('something else'))).toBe(ExitCode.GENERIC_ERROR);
      expect(getExitCode('chuỗi lạ')).toBe(ExitCode.GENERIC_ERROR);
    });
  });

  describe('getErrorHint', () => {
    it('hint cho input error nhắc --help', () => {
      const hint = getErrorHint(new OptionValidationError('bad', 'theme', 'x', 'y'));
      expect(hint).toContain('--help');
    });

    it('hint cho LLM error nhắc LLM_BASE_URL', () => {
      const hint = getErrorHint(new LLMConnectionError('http://x'));
      expect(hint).toContain('LLM_BASE_URL');
    });

    it('hint cho export error nhắc quyền ghi + .pptx', () => {
      const hint = getErrorHint(new ExportError('denied'));
      expect(hint).toContain('.pptx');
    });

    it('hint mặc định nhắc --verbose', () => {
      expect(getErrorHint(new Error('mysterious'))).toContain('--verbose');
    });
  });
});
