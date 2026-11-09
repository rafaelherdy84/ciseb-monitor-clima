import React, { useState } from 'react';
import { FileText, Sparkles, X } from 'lucide-react';
import { MunicipalityRisk } from '../types/bulletin';

interface BatchImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (items: MunicipalityRisk[]) => void;
}

const SAMPLE_RAW_REPORT = `Relatório Meteorológico Semanal - Pará (Próximos 7 dias):
1. Belém (1ª DRE): Chuva acumulada de 168 mm, pico de 75 mm em 24h.
2. Abaetetuba (7ª DRE): Acumulado 152 mm, pico 64 mm/24h.
3. Cametá (8ª DRE): Acumulado 130 mm, pico 54 mm/24h.
4. Marabá (4ª DRE): Temperatura máxima de 39,8 °C, 19 dias sem chuva, risco severo de queimadas.
5. São Félix do Xingu (4ª DRE): Máxima de 40,4 °C, 23 dias de estiagem.
6. Redenção (13ª DRE): Máxima 38,9 °C, 16 dias secos.`;

export const BatchImportModal: React.FC<BatchImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [rawText, setRawText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleProcess = async () => {
    if (!rawText.trim()) {
      setError('Cole uma lista ou relatório meteorológico antes de processar.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/parse-municipalities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Falha ao processar os dados.');
      }

      if (!Array.isArray(data.municipalities) || data.municipalities.length === 0) {
        throw new Error('Nenhum município paraense identificado no texto informado.');
      }

      onImport(data.municipalities);
      setRawText('');
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro inesperado ao processar texto.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 id="import-modal-title" className="text-base font-semibold text-slate-900">
              Importar Lista ou Boletim Bruto
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Cole dados do INMET, SEMAS-PA, CSV ou texto livre (máximo de 20 municípios)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
            aria-label="Fechar janela"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label htmlFor="raw-weather-input" className="text-xs font-medium text-slate-700">
              Dados meteorológicos dos municípios
            </label>
            <button
              type="button"
              onClick={() => setRawText(SAMPLE_RAW_REPORT)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Carregar exemplo de relatório</span>
            </button>
          </div>

          <textarea
            id="raw-weather-input"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={8}
            placeholder="Ex: Belém - 160mm acumulados, pico 72mm/24h; Marabá - 39,5°C, 18 dias sem chuva..."
            className="w-full font-mono text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-3.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleProcess}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>{isLoading ? 'Extraindo municípios...' : 'Processar e Estruturar'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
