import React from 'react';
import {
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  Mail,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

interface TelegramPreviewProps {
  bulletinText: string;
  mapImageUrl: string | null;
  isCustomEdited: boolean;
  isGeneratingAI: boolean;
  aiError: string | null;
  copied: boolean;
  copiedImage: boolean;
  viewMode: 'preview' | 'raw';
  onViewModeChange: (mode: 'preview' | 'raw') => void;
  onChangeText: (text: string) => void;
  onResetAuto: () => void;
  onGenerateAI: () => void;
  onCopy: () => void;
  onCopyImage: () => void;
  onDownloadTxt: () => void;
  onDownloadMapImage: () => void;
}

function renderTelegramFormattedLine(line: string, lineIdx: number): React.ReactNode {
  if (!line.trim()) {
    return <div key={lineIdx} className="h-3" />;
  }

  // Parse *bold* and _italic_ tokens compatible with Telegram Markdown
  const parts: React.ReactNode[] = [];
  const regex = /(\*[^*]+\*|_[^_]+_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <strong key={`${lineIdx}-${match.index}`} className="font-semibold text-slate-900">
          {token.slice(1, -1)}
        </strong>
      );
    } else if (token.startsWith('_') && token.endsWith('_')) {
      parts.push(
        <em key={`${lineIdx}-${match.index}`} className="italic text-slate-600">
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }

  return (
    <p key={lineIdx} className="text-[14px] leading-[1.55] text-slate-800 break-words">
      {parts}
    </p>
  );
}

export const TelegramPreview: React.FC<TelegramPreviewProps> = ({
  bulletinText,
  mapImageUrl,
  isCustomEdited,
  isGeneratingAI,
  aiError,
  copied,
  copiedImage,
  viewMode,
  onViewModeChange,
  onChangeText,
  onResetAuto,
  onGenerateAI,
  onCopy,
  onCopyImage,
  onDownloadTxt,
  onDownloadMapImage,
}) => {
  const lines = bulletinText.split('\n');

  return (
    <section
      id="previa-telegram"
      className="bg-white border border-[#D5E2F4] shadow-2xs rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#E3ECF8] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#002661]">
            Boletim Preditivo Semanal
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Formatação oficial Telegram · Diretores Escolares e DREs
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#EBF2FC] border border-[#D5E2F4] rounded-lg">
          <button
            type="button"
            onClick={() => onViewModeChange('preview')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              viewMode === 'preview'
                ? 'bg-[#0046AD] text-white shadow-xs'
                : 'text-[#003585] hover:bg-white/70'
            }`}
          >
            Prévia Telegram
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('raw')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              viewMode === 'raw'
                ? 'bg-[#0046AD] text-white shadow-xs'
                : 'text-[#003585] hover:bg-white/70'
            }`}
          >
            Markdown Bruto
          </button>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="px-5 py-3 bg-[#F4F7FB] border-b border-[#E3ECF8] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onGenerateAI}
            disabled={isGeneratingAI}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#003585] bg-white border border-[#D5E2F4] rounded-lg hover:bg-[#EBF2FC]/60 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#0046AD]" />
            <span>{isGeneratingAI ? 'Redigindo com IA...' : 'Refinar com IA'}</span>
          </button>

          {isCustomEdited && (
            <button
              type="button"
              onClick={onResetAuto}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-[#0046AD] transition-colors whitespace-nowrap shrink-0"
              title="Voltar à geração automática baseada na tabela"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Sincronizar</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {mapImageUrl && (
            <>
              <button
                type="button"
                onClick={onDownloadMapImage}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#003585] bg-white border border-[#D5E2F4] rounded-lg hover:bg-[#EBF2FC]/60 transition-colors whitespace-nowrap shrink-0"
                title="Baixar imagem PNG do mapa para anexar no Telegram"
              >
                <ImageIcon className="w-3.5 h-3.5 text-[#0046AD]" />
                <span>Baixar Mapa</span>
              </button>

              <button
                type="button"
                onClick={onCopyImage}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#003585] bg-white border border-[#D5E2F4] rounded-lg hover:bg-[#EBF2FC]/60 transition-colors whitespace-nowrap shrink-0"
                title="Copiar imagem do mapa para colar (Ctrl+V) no Telegram"
              >
                {copiedImage ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Mapa Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Mapa</span>
                  </>
                )}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onDownloadTxt}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#003585] bg-white border border-[#D5E2F4] rounded-lg hover:bg-[#EBF2FC]/60 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>.txt</span>
          </button>

          <a
            href={`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(
              'Boletim Preditivo Semanal - Vigilância Meteorológica (SEDUC/PA)'
            )}&body=${encodeURIComponent(
              `${bulletinText.replace(/[*_]/g, '')}\n\nAcesse o painel interativo:\n${
                typeof window !== 'undefined'
                  ? window.location.origin.replace('ais-dev-', 'ais-pre-')
                  : ''
              }`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#003585] bg-white border border-[#D5E2F4] rounded-lg hover:bg-[#EBF2FC]/60 transition-colors whitespace-nowrap shrink-0"
            title="Abrir nova aba no Gmail com o boletim preenchido"
          >
            <Mail className="w-3.5 h-3.5 text-[#0046AD]" />
            <span>Gmail</span>
          </a>

          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0046AD] rounded-lg hover:bg-[#003585] shadow-xs transition-colors whitespace-nowrap shrink-0"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-300" />
                <span>Texto Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar Texto</span>
              </>
            )}
          </button>
        </div>
      </div>

      {aiError && (
        <div className="px-5 py-2.5 bg-red-50 border-b border-red-200 text-xs text-red-700">
          {aiError}
        </div>
      )}

      {/* Body */}
      <div className="p-5">
        {isGeneratingAI ? (
          <div className="space-y-3 py-4 animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-3/4" />
            <div className="h-3 bg-slate-100 rounded w-1/2" />
            <div className="h-3 bg-slate-200 rounded w-2/3 mt-4" />
            <div className="space-y-2 pt-2">
              <div className="h-3 bg-slate-100 rounded w-full" />
              <div className="h-3 bg-slate-100 rounded w-5/6" />
              <div className="h-3 bg-slate-100 rounded w-4/5" />
            </div>
            <div className="space-y-2 pt-3">
              <div className="h-3 bg-slate-100 rounded w-full" />
              <div className="h-3 bg-slate-100 rounded w-11/12" />
            </div>
          </div>
        ) : viewMode === 'preview' ? (
          <div className="bg-slate-100/90 border border-slate-200/80 rounded-xl p-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs space-y-1">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                <span className="text-xs font-semibold text-blue-700">
                  SEDUC-PA · Defesa Civil Escolar
                </span>
                <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                  Canal Oficial
                </span>
              </div>
              {mapImageUrl && (
                <div className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <img
                    src={mapImageUrl}
                    alt="Mapa de Risco Climático do Estado do Pará"
                    className="w-full h-auto block"
                  />
                </div>
              )}
              {lines.map((line, idx) => renderTelegramFormattedLine(line, idx))}
              <div className="pt-2 flex justify-end">
                <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                  {bulletinText.length} caracteres
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <textarea
              value={bulletinText}
              onChange={(e) => onChangeText(e.target.value)}
              rows={18}
              aria-label="Texto Markdown do Boletim para Telegram"
              className="w-full font-mono text-xs leading-relaxed text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>Sintaxe Telegram: *negrito* e _itálico_</span>
              <span className="font-mono tabular-nums">{bulletinText.length} caracteres</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
