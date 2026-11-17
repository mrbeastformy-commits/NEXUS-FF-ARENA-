import { AlertCircle, CheckCircle2, RefreshCw, Upload } from 'lucide-react';
import type { ImageUploadProgress } from './imageUpload';

interface UploadStatusBannerProps {
  status: ImageUploadProgress;
  successText?: string;
  onRetry?: () => void;
  onChooseAnother?: () => void;
  compact?: boolean;
}

export function UploadStatusBanner({
  status,
  successText = 'Image saved.',
  onRetry,
  onChooseAnother,
  compact = false,
}: UploadStatusBannerProps) {
  if (status.state === 'idle') return null;

  return (
    <div
      className={`rounded-xl border ${
        status.state === 'error'
          ? 'border-[#FF1E38]/40 bg-[#FF1E38]/10'
          : status.state === 'done'
            ? 'border-emerald-500/35 bg-emerald-500/10'
            : 'border-white/10 bg-[#07090E]'
      } ${compact ? 'p-2.5 space-y-1.5' : 'p-3 space-y-2'} text-xs`}
    >
      {status.originalKb !== undefined &&
        status.compressedKb !== undefined &&
        status.compressedKb < status.originalKb && (
          <p className="text-[11px] font-mono tabular-nums text-slate-400">
            Optimized: {status.originalKb} KB -&gt; {status.compressedKb} KB
            {status.width && status.height ? ` (${status.width}x${status.height})` : ''}
          </p>
        )}

      {(status.state === 'compressing' || status.state === 'uploading') && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-[#F5C451] font-medium truncate">
              {status.state === 'compressing'
                ? `Compressing ${status.fileName || 'image'} on device...`
                : `Saving ${status.fileName || 'image'}...`}
            </span>
            <span className="font-mono tabular-nums text-white font-semibold shrink-0">
              {status.state === 'compressing' ? '...' : `${status.progress}%`}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-150 ease-out"
              style={{
                width: `${status.state === 'compressing' ? 12 : status.progress}%`,
                background: 'linear-gradient(90deg, #FF1E38 0%, #F5C451 100%)',
              }}
            />
          </div>
        </div>
      )}

      {status.state === 'done' && (
        <div className="space-y-1.5">
          <div className="h-1.5 w-full rounded-full bg-emerald-500/20 overflow-hidden">
            <div className="h-full w-full rounded-full bg-emerald-400" />
          </div>
          <p className="text-[11px] text-emerald-300 font-medium flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>{successText}</span>
          </p>
        </div>
      )}

      {status.state === 'error' && (
        <div className="space-y-2">
          <p className="text-[11px] text-[#FF1E38] break-words flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{status.errorMessage || 'Upload failed.'}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="min-h-[34px] px-3 rounded-lg bg-[#FF1E38] hover:bg-[#E11D48] text-white text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Upload</span>
              </button>
            )}
            {onChooseAnother && (
              <button
                type="button"
                onClick={onChooseAnother}
                className="min-h-[34px] px-3 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Choose Another File</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
