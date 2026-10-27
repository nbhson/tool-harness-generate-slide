# Plan — tool-harness-generate-slide

CLI sinh slide, TypeScript, vitest.

## Baseline audit (00:44, 28-10-2026)
- Tests: ✅ **38 pass** (9 files)
- Lint: ⚠️ **140 warnings** `@typescript-eslint/no-explicit-any` (0 errors) — type-safety yếu
- Có file `PERFORMANCE_IMPROVEMENT_PLAN.md` — đối chiếu xem đã thực hiện tới đâu
- Thư mục `output/` trong repo — kiểm tra .gitignore

## Roadmap
### P0
- [ ] Không có lỗi chặn (test/build/lint không fail)

### P1 (chất lượng)
- [x] Loại bỏ `no-explicit-any` warnings (140) — thay bằng types cụ thể hoặc `unknown` + narrowing
- [ ] Audit logic generate slide: error handling, path traversal khi ghi file output
- [ ] Đối chiếu PERFORMANCE_IMPROVEMENT_PLAN, cập nhật trạng thái

### P2 (hardening)
- [ ] CI workflow
- [ ] Docs sync

## Self-review log
- _0:44_ Audit lần 1: 38/38 pass, lint 140 warnings.
- _1:35_ **P1 type-safety HOÀN THÀNH.** Giảm `no-explicit-any` từ 139 → **0**.
  - `utils/concurrency.ts`: `TaskResult<any>` → `TaskResult<unknown>`
  - `harness/memory/cache.ts`: `CacheEntry<any>` → `CacheEntry<unknown>`
  - `utils/requestCoalescer.ts`: `Promise<any>`/`any` → `Promise<unknown>`/`unknown`
  - `utils/workerPool.ts`: `WorkerTask.data` → `unknown`; thêm `PptxExportTaskData`; `run<T = unknown>`
  - `harness/tools/contentGenerator.ts` (41): fetch polyfill `as unknown as typeof globalThis.fetch`; type `Response` từ node-fetch; interface `LLMChatResponse`; các hàm `parse*` nhận `unknown` + cast `Partial<T>` (giữ nguyên fallback semantics)
  - `harness/tools/slideExporter.ts` (89): `pptSlide` → `PptxGenJS.Slide`; `content` → `SlideContent`; text runs → `TextRun` (TextPropsOptions); `tableRows` → `PptxGenJS.TableRow[]`; `toPptxChartSeries(chart: SlideChart)` + `Record<string, unknown>` narrowing; `addImageSafe` typed
  - `schemas/slide.schema.ts`: khai báo tường minh `SlideContent.chart?: SlideChart` (contract ngầm exporter đã dùng: `content.chart || content.visuals?.chart`)
  - Không còn any nào — không cần justification comment.
  - Verify: build ✅, test 38/38 ✅, lint 0 errors / 0 no-explicit-any (1 warning `no-console` còn lại tại src/index.ts:55, ngoài phạm vi P1).
