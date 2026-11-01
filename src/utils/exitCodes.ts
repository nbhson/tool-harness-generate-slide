import { SlideHarnessError } from './errors';
import { OptionValidationError } from './validators';

/**
 * Exit codes chuẩn cho CLI, phân loại theo nhóm lỗi để script/CI dễ xử lý:
 * - 0: thành công (kể cả --dry-run)
 * - 1: lỗi không xác định / lỗi hệ thống
 * - 2: lỗi input từ người dùng (option sai, file không tồn tại, guardrails chặn)
 * - 3: lỗi LLM (không kết nối được, cả primary lẫn fallback fail)
 * - 4: lỗi export/ghi file PPTX
 */
export const ExitCode = {
  OK: 0,
  GENERIC_ERROR: 1,
  INPUT_ERROR: 2,
  LLM_ERROR: 3,
  EXPORT_ERROR: 4,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

/** Ánh xạ error → exit code. Không bao giờ trả giá trị ngoài bảng trên. */
export function getExitCode(error: unknown): ExitCodeValue {
  if (error instanceof OptionValidationError) {
    return ExitCode.INPUT_ERROR;
  }

  if (error instanceof SlideHarnessError) {
    switch (error.code) {
      case 'LLM_ERROR':
      case 'CONTENT_GENERATION_ERROR':
        return ExitCode.LLM_ERROR;
      case 'EXPORT_ERROR':
        return ExitCode.EXPORT_ERROR;
      case 'PLANNING_ERROR':
      case 'THEME_ERROR':
      case 'VALIDATION_ERROR':
        return ExitCode.INPUT_ERROR;
      default:
        return ExitCode.GENERIC_ERROR;
    }
  }

  // harness.generate() ném Error thường cho planning failure
  if (error instanceof Error) {
    if (error.message.startsWith('Planning failed')) {
      return ExitCode.INPUT_ERROR;
    }
    if (error.message.includes('Cannot connect to LLM')) {
      return ExitCode.LLM_ERROR;
    }
  }

  return ExitCode.GENERIC_ERROR;
}

/**
 * Gợi ý hành động cho người dùng theo nhóm lỗi.
 * Trả về chuỗi tiếng Việt, in ra stderr sau thông báo lỗi.
 */
export function getErrorHint(error: unknown): string | undefined {
  const code = getExitCode(error);

  switch (code) {
    case ExitCode.INPUT_ERROR:
      return 'Gợi ý: kiểm tra lại tham số (--input tối thiểu 5 ký tự, --theme/--language/--aspect-ratio hợp lệ, file --file tồn tại). Xem chi tiết với --help.';
    case ExitCode.LLM_ERROR:
      return 'Gợi ý: kiểm tra LLM_BASE_URL / LLM_API_KEY trong .env và đảm bảo LLM service đang chạy (thử: curl $LLM_BASE_URL/v1/models).';
    case ExitCode.EXPORT_ERROR:
      return 'Gợi ý: kiểm tra thư mục output có quyền ghi và đường dẫn kết thúc bằng .pptx.';
    default:
      return 'Gợi ý: chạy lại với --verbose để xem log chi tiết, hoặc báo lỗi kèm log tại GitHub repository.';
  }
}
