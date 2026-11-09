import React, { useEffect, useState } from 'react';
import { ExternalLink, MapPin } from 'lucide-react';
import { MunicipalityRisk } from '../types/bulletin';

interface MapsGroundingPlace {
  title: string;
  uri: string;
}

interface MapsGroundingPanelProps {
  municipality: MunicipalityRisk | null;
}

export const MapsGroundingPanel: React.FC<MapsGroundingPanelProps> = ({
  municipality,
}) => {
  const [summary, setSummary] = useState<string>('');
  const [places, setPlaces] = useState<MapsGroundingPlace[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!municipality || typeof municipality.lat !== 'number' || typeof municipality.lon !== 'number') {
      setSummary('');
      setPlaces([]);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const fetchGrounding = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/maps/grounding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            municipio: municipality.municipio,
            dre: municipality.dre,
            lat: municipality.lat,
            lon: municipality.lon,
            tipoRisco: municipality.tipoRisco,
            tempMaximaC: municipality.tempMaximaC,
            chuvaAcumuladaMm: municipality.chuvaAcumuladaMm,
            pico24hMm: municipality.pico24hMm,
          }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!cancelled) {
          if (!res.ok) {
            throw new Error(data.error || 'Erro ao consultar dados do Google Maps.');
          }
          setSummary(data.summary || '');
          setPlaces(Array.isArray(data.places) ? data.places : []);
        }
      } catch (err: unknown) {
        if (!cancelled && (err as Error)?.name !== 'AbortError') {
          setError(
            err instanceof Error ? err.message : 'Falha ao consultar Google Maps Grounding.'
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    const timer = setTimeout(fetchGrounding, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    municipality?.id,
    municipality?.municipio,
    municipality?.lat,
    municipality?.lon,
    municipality?.tipoRisco,
  ]);

  if (!municipality) return null;

  const lines = summary
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <section
      id="inteligencia-territorial"
      className="bg-white border border-[#D5E2F4] rounded-xl overflow-hidden shadow-xs"
    >
      <div className="px-5 py-4 border-b border-[#E2EBF8] bg-[#F8FAFE] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <MapPin className="w-4 h-4 text-[#0046AD] shrink-0" />
          <div>
            <h2 className="text-base font-bold text-[#002661]">
              Inteligência Territorial · {municipality.municipio}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Escolas estaduais, pontos de apoio e rotas via Google Maps Grounding
            </p>
          </div>
        </div>

        <span className="text-xs font-mono font-medium text-[#0046AD] bg-[#EBF2FC] px-2.5 py-1 rounded-md border border-[#C6DAF7] tabular-nums whitespace-nowrap shrink-0">
          {municipality.dre || 'Rede Estadual PA'}
        </span>
      </div>

      <div className="p-5 space-y-4">
        {isLoading ? (
          <div className="space-y-2.5 animate-pulse">
            <div className="h-3.5 bg-slate-200 rounded w-3/4" />
            <div className="h-3.5 bg-slate-100 rounded w-full" />
            <div className="h-3.5 bg-slate-100 rounded w-5/6" />
          </div>
        ) : error ? (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">
            {error}
          </p>
        ) : (
          <>
            {lines.length > 0 && (
              <div className="space-y-2 text-sm text-slate-700 leading-relaxed">
                {lines.map((line, idx) => {
                  const formatted = line.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
                  return <p key={idx}>{formatted}</p>;
                })}
              </div>
            )}

            {places.length > 0 && (
              <div className="pt-3 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-2">
                  Locais e Rotas Verificados no Google Maps:
                </p>
                <div className="flex flex-wrap gap-2">
                  {places.map((place) => (
                    <a
                      key={place.uri}
                      href={place.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50/70 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      <span>{place.title}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};
