import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CloudRain,
  Copy,
  FileText,
  Flag,
  Flame,
  MessageSquareText,
  RefreshCw,
  Trash2,
  Wind,
  X,
} from 'lucide-react';
import { AnexoIMemorandumModal } from './components/AnexoIMemorandumModal';
import { MapsGroundingPanel } from './components/MapsGroundingPanel';
import { ParaRiskMap } from './components/ParaRiskMap';
import { SeducProtocolPanel } from './components/SeducProtocolPanel';
import { MonitoredSchool, StateSchoolsView } from './components/StateSchoolsView';
import { TelegramPreview } from './components/TelegramPreview';
import {
  DEFAULT_DIRECTIVES,
  PARA_MUNICIPALITIES_CATALOG,
  ParaRegion,
  REGION_FILTERS,
} from './data/paraMunicipalities';
import {
  BandeiraLevel,
  DirectiveOption,
  MunicipalityRisk,
  RiskType,
} from './types/bulletin';
import {
  analyzeConditionsAndSuggestDirectives,
  formatTelegramBulletin,
  sortHydroRisks,
  sortThermalRisks,
} from './utils/bulletinFormatter';
import { exportParaMapToPng, MapImageResult } from './utils/mapImageExporter';
import {
  classifyBandeira,
  classifySmokeAndWaterRisk,
  getSchoolProtocolRecommendation,
  SEDUC_BANDEIRA_PROTOCOLS,
} from './utils/protocolSeduc';

const MAX_MUNICIPALITIES = 144;
const DAILY_SNAPSHOT_STORAGE_KEY = 'ciseb_daily_snapshot_v1';

const REGION_BY_MUNICIPALITY = new Map(
  PARA_MUNICIPALITIES_CATALOG.map((m) => [m.municipio.toLowerCase(), m.region])
);

function getBelemDateKeyClient(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Belem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function App() {
  const [allMunicipalities, setAllMunicipalities] = useState<MunicipalityRisk[]>([]);
  const [municipalities, setMunicipalities] = useState<MunicipalityRisk[]>([]);
  const [directives, setDirectives] = useState<DirectiveOption[]>(DEFAULT_DIRECTIVES);

  // Real-time weather fetch state
  const [activeRegion, setActiveRegion] = useState<ParaRegion>('all');
  const [isLoadingWeather, setIsLoadingWeather] = useState<boolean>(true);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<string>(
    'Open-Meteo (ECMWF / NOAA / INMET) · Atualização Única no 1º Acesso do Dia'
  );

  // Table & map filter/selection
  const [riskFilter, setRiskFilter] = useState<'all' | RiskType>('all');
  const [bandeiraFilter, setBandeiraFilter] = useState<'all' | BandeiraLevel>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMunicipalityId, setSelectedMunicipalityId] = useState<string | null>(null);
  const [memoTargetSchool, setMemoTargetSchool] = useState<MonitoredSchool | null>(null);

  // AI directive analysis state
  const [isAnalyzingDirectives, setIsAnalyzingDirectives] = useState(false);
  const [directivesError, setDirectivesError] = useState<string | null>(null);

  // Bulletin state
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');
  const [customBulletin, setCustomBulletin] = useState<string | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [mapImage, setMapImage] = useState<MapImageResult | null>(null);
  const [activeView, setActiveView] = useState<'municipalities' | 'schools'>('municipalities');
  const [isBulletinDrawerOpen, setIsBulletinDrawerOpen] = useState<boolean>(false);

  const applyRegionFilter = useCallback(
    (sourceList: MunicipalityRisk[], region: ParaRegion) => {
      setActiveRegion(region);
      const filtered =
        region === 'all'
          ? sourceList
          : sourceList.filter(
              (m) => REGION_BY_MUNICIPALITY.get(m.municipio.toLowerCase()) === region
            );
      setMunicipalities(filtered);
      setCustomBulletin(null);
    },
    []
  );

  const fetchRealWeather = useCallback(
    async (region: ParaRegion) => {
      setWeatherError(null);
      setActiveRegion(region);

      // If we already loaded today's full dataset in memory, filter locally without any API call
      if (allMunicipalities.length > 0) {
        applyRegionFilter(allMunicipalities, region);
        return;
      }

      const todayKey = getBelemDateKeyClient();

      // Check browser localStorage for today's snapshot so subsequent opens on the same day make 0 requests
      try {
        const rawCached = localStorage.getItem(DAILY_SNAPSHOT_STORAGE_KEY);
        if (rawCached) {
          const parsed = JSON.parse(rawCached);
          if (
            parsed &&
            parsed.cycleKey === todayKey &&
            Array.isArray(parsed.municipalities) &&
            parsed.municipalities.length > 0
          ) {
            const loaded: MunicipalityRisk[] = parsed.municipalities.map(
              (m: MunicipalityRisk) => ({
                ...m,
                bandeira: m.bandeira ?? classifyBandeira(m),
                riscoFumacaAr: m.riscoFumacaAr ?? classifySmokeAndWaterRisk(m),
              })
            );
            setAllMunicipalities(loaded);
            applyRegionFilter(loaded, region);
            if (Array.isArray(parsed.directives) && parsed.directives.length > 0) {
              setDirectives(parsed.directives);
            } else {
              setDirectives(analyzeConditionsAndSuggestDirectives(loaded));
            }
            setLastUpdated(parsed.fetchedAt || new Date().toISOString());
            if (parsed.source) {
              setDataSource(parsed.source);
            }
            setIsLoadingWeather(false);
            return;
          }
        }
      } catch {
        // Ignore storage read errors
      }

      setIsLoadingWeather(true);

      try {
        const response = await fetch('/api/weather/para?region=all');
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Falha ao consultar dados meteorológicos reais.');
        }

        const rawLoaded: MunicipalityRisk[] = Array.isArray(data.municipalities)
          ? data.municipalities
          : [];
        const loaded = rawLoaded.map((m) => ({
          ...m,
          bandeira: m.bandeira ?? classifyBandeira(m),
          riscoFumacaAr: m.riscoFumacaAr ?? classifySmokeAndWaterRisk(m),
        }));
        const fallbackDirs =
          loaded.length > 0 ? analyzeConditionsAndSuggestDirectives(loaded) : DEFAULT_DIRECTIVES;

        setAllMunicipalities(loaded);
        applyRegionFilter(loaded, region);
        setDirectives(fallbackDirs);

        const fetchedAtStr = data.fetchedAt || new Date().toISOString();
        const sourceStr =
          data.source ||
          'Open-Meteo (ECMWF / NOAA / INMET) · Atualização Única no 1º Acesso do Dia';
        setLastUpdated(fetchedAtStr);
        setDataSource(sourceStr);

        // Save daily snapshot to localStorage
        try {
          localStorage.setItem(
            DAILY_SNAPSHOT_STORAGE_KEY,
            JSON.stringify({
              cycleKey: data.cycleKey || todayKey,
              fetchedAt: fetchedAtStr,
              source: sourceStr,
              municipalities: loaded,
              directives: null,
            })
          );
        } catch {
          // Ignore storage quota errors
        }
      } catch (err: unknown) {
        setWeatherError(
          err instanceof Error ? err.message : 'Erro de conexão com o serviço meteorológico.'
        );
      } finally {
        setIsLoadingWeather(false);
      }
    },
    [allMunicipalities, applyRegionFilter]
  );

  useEffect(() => {
    fetchRealWeather('all');
  }, [fetchRealWeather]);

  // Analyze directives once per day on the first access of the day
  useEffect(() => {
    if (allMunicipalities.length === 0) {
      return;
    }

    const todayKey = getBelemDateKeyClient();
    try {
      const rawCached = localStorage.getItem(DAILY_SNAPSHOT_STORAGE_KEY);
      if (rawCached) {
        const parsed = JSON.parse(rawCached);
        if (
          parsed &&
          parsed.cycleKey === todayKey &&
          Array.isArray(parsed.directives) &&
          parsed.directives.length > 0
        ) {
          setDirectives(parsed.directives);
          return;
        }
      }
    } catch {
      // Ignore storage read errors
    }

    let cancelled = false;
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setIsAnalyzingDirectives(true);
      setDirectivesError(null);
      try {
        const res = await fetch('/api/analyze-directives', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ municipalities: allMunicipalities }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!cancelled && res.ok && Array.isArray(data.directives) && data.directives.length > 0) {
          setDirectives(data.directives);
          setCustomBulletin(null);
          try {
            const rawCached = localStorage.getItem(DAILY_SNAPSHOT_STORAGE_KEY);
            const parsed = rawCached ? JSON.parse(rawCached) : {};
            localStorage.setItem(
              DAILY_SNAPSHOT_STORAGE_KEY,
              JSON.stringify({
                ...parsed,
                cycleKey: data.cycleKey || todayKey,
                directives: data.directives,
              })
            );
          } catch {
            // Ignore storage write errors
          }
        }
      } catch {
        // Keep deterministic condition-aware directives if AI request is aborted or unavailable
      } finally {
        if (!cancelled) {
          setIsAnalyzingDirectives(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [allMunicipalities]);

  const hydroSorted = useMemo(() => sortHydroRisks(municipalities), [municipalities]);
  const thermalSorted = useMemo(() => sortThermalRisks(municipalities), [municipalities]);

  const mostCriticalHydroId = hydroSorted[0]?.id;
  const mostCriticalThermalId = thermalSorted[0]?.id;

  const bandeiraCounts = useMemo(() => {
    let vermelha = 0;
    let amarela = 0;
    let verde = 0;
    for (const m of municipalities) {
      const b = classifyBandeira(m);
      if (b === 'vermelha') vermelha++;
      else if (b === 'amarela') amarela++;
      else verde++;
    }
    return { vermelha, amarela, verde };
  }, [municipalities]);

  const inspectedMunicipality = useMemo(
    () =>
      municipalities.find((m) => m.id === selectedMunicipalityId) ??
      hydroSorted[0] ??
      thermalSorted[0] ??
      municipalities[0] ??
      null,
    [municipalities, selectedMunicipalityId, hydroSorted, thermalSorted]
  );

  const autoBulletin = useMemo(
    () => formatTelegramBulletin(municipalities, directives),
    [municipalities, directives]
  );

  const activeBulletin = customBulletin ?? autoBulletin;

  const normalSorted = useMemo(
    () =>
      [...municipalities]
        .filter((m) => m.tipoRisco === 'normal')
        .sort((a, b) => a.municipio.localeCompare(b.municipio, 'pt-BR')),
    [municipalities]
  );

  const filteredMunicipalities = useMemo(() => {
    const combined = [...hydroSorted, ...thermalSorted, ...normalSorted];
    const byRisk =
      riskFilter === 'all'
        ? combined
        : combined.filter((item) => item.tipoRisco === riskFilter);
    const byBandeira =
      bandeiraFilter === 'all'
        ? byRisk
        : byRisk.filter((item) => classifyBandeira(item) === bandeiraFilter);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return byBandeira;
    return byBandeira.filter(
      (item) =>
        item.municipio.toLowerCase().includes(q) ||
        (item.dre && item.dre.toLowerCase().includes(q))
    );
  }, [hydroSorted, thermalSorted, normalSorted, riskFilter, bandeiraFilter, searchQuery]);

  const handleRemoveMunicipality = (id: string) => {
    setMunicipalities((prev) => prev.filter((item) => item.id !== id));
    setCustomBulletin(null);
  };

  const handleClearAll = () => {
    setMunicipalities([]);
    setCustomBulletin(null);
    setAiError(null);
  };

  const handleOpenMunicipalityMemo = (item: MunicipalityRisk) => {
    const bandeira = classifyBandeira(item);
    setMemoTargetSchool({
      id: item.id,
      nome: `Unidade Escolar Estadual de ${item.municipio}`,
      municipio: item.municipio,
      dre: item.dre || 'DRE Local',
      lat: item.lat ?? -1.4558,
      lon: item.lon ?? -48.4902,
      tipoRisco: item.tipoRisco,
      bandeira,
      riscoFumacaAr: classifySmokeAndWaterRisk(item),
      chuvaAcumuladaMm: item.chuvaAcumuladaMm,
      pico24hMm: item.pico24hMm,
      tempMaximaC: item.tempMaximaC,
      diasEstiagem: item.diasEstiagem,
      anomaliaTempC: item.anomaliaTempC,
      anomaliaChuvaMm: item.anomaliaChuvaMm,
      recomendacao: getSchoolProtocolRecommendation(item),
    });
  };

  const handleGenerateWithAI = async () => {
    if (municipalities.length === 0) {
      setAiError('Adicione ao menos 1 município antes de solicitar redação por IA.');
      return;
    }

    setIsGeneratingAI(true);
    setAiError(null);

    try {
      const selectedDirs = directives.map((d) => d.text);
      const response = await fetch('/api/generate-bulletin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          municipalities,
          directives: selectedDirs,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao gerar boletim com IA.');
      }

      setCustomBulletin(data.bulletin);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Falha na comunicação com o servidor.');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleCopyBulletin = async () => {
    try {
      await navigator.clipboard.writeText(activeBulletin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = activeBulletin;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([activeBulletin], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `boletim-preditivo-seduc-pa-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (isLoadingWeather || municipalities.length === 0) {
      setMapImage(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await exportParaMapToPng();
        if (!cancelled && result) {
          setMapImage(result);
        }
      } catch {
        // Ignore transient SVG serialization errors
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [municipalities, riskFilter, selectedMunicipalityId, isLoadingWeather]);

  const handleDownloadMapImage = async () => {
    const current = mapImage ?? (await exportParaMapToPng());
    if (!current) return;
    const url = URL.createObjectURL(current.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapa-risco-seduc-pa-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyMapImage = async () => {
    const current = mapImage ?? (await exportParaMapToPng());
    if (!current) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': current.blob,
        }),
      ]);
      setCopiedImage(true);
      setTimeout(() => setCopiedImage(false), 2200);
    } catch {
      handleDownloadMapImage();
    }
  };

  const maxHydroPico = hydroSorted[0]?.pico24hMm ?? 0;
  const maxThermalTemp = thermalSorted[0]?.tempMaximaC ?? 0;

  const formattedUpdatedAt = lastUpdated
    ? new Date(lastUpdated).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F7FB] text-slate-900">
      {/* Institutional Top Stripe (CISEB Royal Blue + Pará Gold/Red accents) */}
      <div className="h-1.5 bg-gradient-to-r from-[#002B6B] via-[#0046AD] to-[#005CE6]" />

      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="bg-white border-b border-[#D5E2F4] shadow-2xs sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between gap-6">
          <a
            href="#top"
            onClick={() => setActiveView('municipalities')}
            className="flex items-center gap-3.5 shrink-0 group"
          >
            <img
              src="/logo-ciseb.png"
              alt="CISEB · Secretaria de Educação do Estado do Pará"
              className="h-14 w-auto object-contain"
            />
            <div className="hidden sm:flex flex-col border-l border-[#D5E2F4] pl-3.5">
              <span className="text-sm font-bold tracking-tight text-[#003585] font-display leading-tight">
                Monitor do Clima
              </span>
              <span className="text-[11px] font-medium text-[#0046AD]/80 leading-tight mt-0.5">
                Protocolo El Niño & Bandeiramento · SEDUC-PA
              </span>
            </div>
          </a>

          <div className="flex items-center gap-1 p-1 bg-[#EBF2FC] border border-[#D5E2F4] rounded-lg">
            <button
              type="button"
              onClick={() => setActiveView('municipalities')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'municipalities'
                  ? 'bg-[#0046AD] text-white shadow-xs'
                  : 'text-[#003585] hover:bg-white/70'
              }`}
            >
              Municípios (144)
            </button>
            <button
              type="button"
              onClick={() => setActiveView('schools')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'schools'
                  ? 'bg-[#0046AD] text-white shadow-xs'
                  : 'text-[#003585] hover:bg-white/70'
              }`}
            >
              Escolas Estaduais (960)
            </button>
          </div>

          {activeView === 'municipalities' ? (
            <nav className="hidden lg:flex items-center gap-5 text-sm font-medium text-slate-600">
              <a
                href="#mapa-para"
                className="hover:text-[#0046AD] transition-colors whitespace-nowrap shrink-0"
              >
                Mapa
              </a>
              <a
                href="#municipios"
                className="hover:text-[#0046AD] transition-colors whitespace-nowrap shrink-0"
              >
                Municípios
              </a>
              <a
                href="#protocolo-seduc"
                className="hover:text-[#0046AD] transition-colors whitespace-nowrap shrink-0"
              >
                Bandeiramento
              </a>
              <a
                href="#diretrizes"
                className="hover:text-[#0046AD] transition-colors whitespace-nowrap shrink-0"
              >
                Diretrizes
              </a>
            </nav>
          ) : (
            <nav className="hidden lg:flex items-center gap-5 text-sm font-medium text-slate-600">
              <a
                href="#mapa-escolas-para"
                className="hover:text-[#0046AD] transition-colors whitespace-nowrap shrink-0"
              >
                Mapa Escolas
              </a>
              <a
                href="#tabela-escolas"
                className="hover:text-[#0046AD] transition-colors whitespace-nowrap shrink-0"
              >
                Escolas
              </a>
              <a
                href="#protocolo-seduc"
                className="hover:text-[#0046AD] transition-colors whitespace-nowrap shrink-0"
              >
                Bandeiramento
              </a>
            </nav>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsBulletinDrawerOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0046AD] rounded-lg hover:bg-[#003585] shadow-xs transition-colors whitespace-nowrap shrink-0"
            >
              <MessageSquareText className="w-3.5 h-3.5" />
              <span>Boletim Preditivo Semanal</span>
            </button>

            <button
              type="button"
              onClick={handleCopyBulletin}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#003585] bg-[#EBF2FC] border border-[#C5D9F7] rounded-lg hover:bg-[#DCE8FA] transition-colors whitespace-nowrap shrink-0"
              title="Copiar texto do Boletim Preditivo Semanal"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-8">
        {activeView === 'schools' ? (
          <StateSchoolsView
            municipalities={municipalities}
            directives={directives}
            isBulletinDrawerOpen={isBulletinDrawerOpen}
            onToggleBulletinDrawer={() => setIsBulletinDrawerOpen((v) => !v)}
          />
        ) : (
          <>
            {/* Page Title & Real-Time Regional Controls */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-[#D5E2F4]">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#EBF2FC] text-[#0046AD] border border-[#C5D9F7] mb-2">
                  <span>
                    CISEB · Protocolo de Gestão e Resposta aos Efeitos do El Niño (SEDUC/PA & BID · NT 987/2026 CEMADEN)
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#002661]">
                  Painel de Bandeiramento e Vigilância Meteorológica Escolar
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span>Fonte: {dataSource}</span>
                  <span aria-hidden="true">·</span>
                  <span>Previsão real de 7 dias</span>
                  {formattedUpdatedAt && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-[#0046AD] font-medium tabular-nums">
                        Atualizado em {formattedUpdatedAt}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {REGION_FILTERS.map((region) => (
                  <button
                    key={region.id}
                    type="button"
                    disabled={isLoadingWeather}
                    onClick={() => fetchRealWeather(region.id)}
                    className={`px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${
                      activeRegion === region.id
                        ? 'bg-[#0046AD] text-white border-[#0046AD] shadow-2xs'
                        : 'bg-white text-slate-700 border-[#D5E2F4] hover:bg-[#EBF2FC]/60 hover:text-[#003585]'
                    }`}
                  >
                    {region.label}
                  </button>
                ))}

                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#003585] bg-[#EBF2FC]/60 border border-[#D5E2F4] rounded-lg whitespace-nowrap shrink-0"
                  title="Os dados meteorológicos e diretrizes são atualizados apenas uma vez por dia, a partir do primeiro acesso do dia, para economizar recursos"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                  <span>1 atualização/dia (1º acesso)</span>
                </span>

                {municipalities.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 transition-colors whitespace-nowrap shrink-0"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            {weatherError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-4 text-xs text-red-800">
                <span>{weatherError}</span>
                <button
                  type="button"
                  onClick={() => fetchRealWeather(activeRegion)}
                  className="px-3 py-1.5 font-medium bg-white border border-red-200 rounded-lg hover:bg-red-100 transition-colors whitespace-nowrap shrink-0"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {/* 4-Column Quantitative Summary Strip with Official Bandeiramento */}
            <section
              aria-label="Resumo quantitativo de alertas e bandeiramento"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white border border-[#D5E2F4] shadow-2xs rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-[#E3ECF8]"
            >
              <div className="p-5">
                <p className="text-xs font-semibold text-[#003585]">
                  Sistema de Bandeiramento SEDUC
                </p>
                <div className="mt-2 flex items-center gap-2 font-mono text-xs font-bold tabular-nums">
                  <span className="px-2 py-1 rounded bg-red-50 text-red-700 border border-red-200">
                    🔴 {bandeiraCounts.vermelha} Vermelha
                  </span>
                  <span className="px-2 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200">
                    🟡 {bandeiraCounts.amarela} Amarela
                  </span>
                  <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                    🟢 {bandeiraCounts.verde} Verde
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-slate-500 font-mono tabular-nums">
                  {municipalities.length} / {MAX_MUNICIPALITIES} municípios monitorados
                </p>
              </div>

              <div className="p-5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                  <Flame className="w-3.5 h-3.5" />
                  <span>Queimadas, Fumaça e Estiagem (El Niño)</span>
                </div>
                <p className="mt-1.5 text-2xl font-bold text-[#002661] font-mono tabular-nums">
                  {thermalSorted.length}
                </p>
                <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                  {thermalSorted.length > 0
                    ? `Máxima prevista: ${maxThermalTemp.toFixed(1).replace('.', ',')} °C`
                    : 'Sem ocorrências registradas'}
                </p>
              </div>

              <div className="p-5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0046AD]">
                  <CloudRain className="w-3.5 h-3.5" />
                  <span>Alerta Hídrico (Alagamentos)</span>
                </div>
                <p className="mt-1.5 text-2xl font-bold text-[#002661] font-mono tabular-nums">
                  {hydroSorted.length}
                </p>
                <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                  {hydroSorted.length > 0
                    ? `Maior pico 24h: ${maxHydroPico} mm`
                    : 'Sem ocorrências registradas'}
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold text-[#003585]">
                  Comitê de Crise & Escolas
                </p>
                <p className="mt-1.5 text-2xl font-bold text-[#002661] font-mono tabular-nums">
                  {directives.length}
                  <span className="text-sm font-normal text-slate-400"> diretrizes</span>
                </p>
                <button
                  type="button"
                  onClick={() => setActiveView('schools')}
                  className="mt-1 text-xs font-semibold text-[#0046AD] hover:underline inline-flex items-center gap-1"
                >
                  <span>Monitorar Escolas e Memorandos →</span>
                </button>
              </div>
            </section>

            {/* Full-Width Objective Workspace: Map + Table side-by-side on desktop */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
              <div className="xl:col-span-5">
                <ParaRiskMap
                  municipalities={municipalities}
                  mostCriticalHydroId={mostCriticalHydroId}
                  mostCriticalThermalId={mostCriticalThermalId}
                  selectedId={selectedMunicipalityId}
                  onSelectMunicipality={setSelectedMunicipalityId}
                  riskFilter={riskFilter}
                  onRiskFilterChange={setRiskFilter}
                />
              </div>

              <div className="xl:col-span-7">
                {/* Municipality Management Card */}
                <section
                  id="municipios"
                  className="bg-white border border-[#D5E2F4] shadow-2xs rounded-xl overflow-hidden"
                >
                  <div className="px-5 py-4 border-b border-[#E3ECF8] flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-[#002661]">
                        Municípios Paraenses por Bandeiramento ({filteredMunicipalities.length})
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Classificação pelo Protocolo El Niño SEDUC/PA, métricas de 7 dias e emissão de Memorando Oficial à DRE
                      </p>
                    </div>

                    {/* Search & Filter Tabs */}
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar município ou DRE..."
                        aria-label="Buscar município ou DRE"
                        className="px-3 py-1.5 text-xs bg-[#F4F7FB] border border-[#D5E2F4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0046AD] focus:bg-white w-44"
                      />

                      {/* Bandeira Filter */}
                      <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setBandeiraFilter('all')}
                          className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
                            bandeiraFilter === 'all'
                              ? 'bg-[#0046AD] text-white'
                              : 'text-slate-700 hover:bg-white'
                          }`}
                        >
                          Todas
                        </button>
                        <button
                          type="button"
                          onClick={() => setBandeiraFilter('vermelha')}
                          className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
                            bandeiraFilter === 'vermelha'
                              ? 'bg-red-600 text-white'
                              : 'text-red-800 hover:bg-red-50'
                          }`}
                        >
                          🔴 {bandeiraCounts.vermelha}
                        </button>
                        <button
                          type="button"
                          onClick={() => setBandeiraFilter('amarela')}
                          className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
                            bandeiraFilter === 'amarela'
                              ? 'bg-amber-500 text-white'
                              : 'text-amber-800 hover:bg-amber-50'
                          }`}
                        >
                          🟡 {bandeiraCounts.amarela}
                        </button>
                        <button
                          type="button"
                          onClick={() => setBandeiraFilter('verde')}
                          className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
                            bandeiraFilter === 'verde'
                              ? 'bg-emerald-600 text-white'
                              : 'text-emerald-800 hover:bg-emerald-50'
                          }`}
                        >
                          🟢 {bandeiraCounts.verde}
                        </button>
                      </div>

                      <div className="flex items-center gap-1 p-1 bg-[#EBF2FC] border border-[#D5E2F4] rounded-lg">
                        <button
                          type="button"
                          onClick={() => setRiskFilter('all')}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                            riskFilter === 'all'
                              ? 'bg-[#0046AD] text-white shadow-xs'
                              : 'text-[#003585] hover:bg-white/70'
                          }`}
                        >
                          Todos
                        </button>
                        <button
                          type="button"
                          onClick={() => setRiskFilter('hidrico')}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                            riskFilter === 'hidrico'
                              ? 'bg-[#0046AD] text-white shadow-xs'
                              : 'text-[#003585] hover:bg-white/70'
                          }`}
                        >
                          Hídrico ({hydroSorted.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setRiskFilter('termico')}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                            riskFilter === 'termico'
                              ? 'bg-[#0046AD] text-white shadow-xs'
                              : 'text-[#003585] hover:bg-white/70'
                          }`}
                        >
                          Térmico ({thermalSorted.length})
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* High-Density Data Table */}
                  {isLoadingWeather ? (
                    <div className="p-6 space-y-3 animate-pulse">
                      {[1, 2, 3, 4, 5, 6].map((row) => (
                        <div
                          key={row}
                          className="h-10 bg-slate-100 rounded-lg w-full"
                        />
                      ))}
                    </div>
                  ) : filteredMunicipalities.length === 0 ? (
                    <div className="p-10 text-center">
                      <p className="text-sm font-medium text-slate-700">
                        Nenhum município encontrado para este filtro
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Altere a bandeira ou região selecionada acima.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-slate-50">
                          <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                            <th className="py-2.5 px-4">Município / DRE</th>
                            <th className="py-2.5 px-3">Bandeira & Ameaça</th>
                            <th className="py-2.5 px-3 text-right">Métricas Previstas (7d)</th>
                            <th className="py-2.5 px-4 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                          {filteredMunicipalities.map((item) => {
                            const isMostCritical =
                              item.id === mostCriticalHydroId || item.id === mostCriticalThermalId;

                            const isSelected = item.id === selectedMunicipalityId;
                            const bandeira = classifyBandeira(item);
                            const bSpec = SEDUC_BANDEIRA_PROTOCOLS[bandeira];
                            const smokeRisk = classifySmokeAndWaterRisk(item);

                            return (
                              <tr
                                key={item.id}
                                onClick={() =>
                                  setSelectedMunicipalityId(
                                    selectedMunicipalityId === item.id ? null : item.id
                                  )
                                }
                                className={`cursor-pointer transition-colors ${
                                  isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50/80'
                                }`}
                              >
                                <td className="py-2.5 px-4">
                                  <div className="font-medium text-slate-900 flex items-center gap-2">
                                    <span>{item.municipio}</span>
                                    {isMostCritical && (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700">
                                        <AlertTriangle className="w-3 h-3" />
                                        <span>Mais Crítico</span>
                                      </span>
                                    )}
                                  </div>
                                  {item.dre && (
                                    <div className="text-xs text-slate-500">{item.dre}</div>
                                  )}
                                </td>

                                <td className="py-2.5 px-3 space-y-1">
                                  <div>
                                    <span
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-full border ${bSpec.badgeBg} ${bSpec.badgeText} ${bSpec.badgeBorder}`}
                                    >
                                      <Flag className="w-3 h-3" />
                                      <span>{bSpec.title}</span>
                                    </span>
                                  </div>
                                  <div>
                                    {item.tipoRisco === 'hidrico' ? (
                                      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700">
                                        <CloudRain className="w-3.5 h-3.5" />
                                        <span>Alagamento</span>
                                      </span>
                                    ) : item.tipoRisco === 'termico' ? (
                                      <div className="space-y-0.5">
                                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                                          <Flame className="w-3.5 h-3.5" />
                                          <span>Queimada / Estiagem</span>
                                        </span>
                                        {(smokeRisk === 'critico' || smokeRisk === 'alto') && (
                                          <div className="flex items-center gap-1 text-[10px] font-semibold text-red-700">
                                            <Wind className="w-3 h-3" />
                                            <span>Fumaça & Água: {smokeRisk.toUpperCase()}</span>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-xs font-medium text-slate-500">
                                        Monitoramento Normal
                                      </span>
                                    )}
                                  </div>
                                </td>

                                <td className="py-2.5 px-3 text-right font-mono text-xs text-slate-700 tabular-nums">
                                  {item.tipoRisco === 'hidrico' ? (
                                    <div>
                                      <span>
                                        {item.chuvaAcumuladaMm ?? 0} mm acum. ·{' '}
                                        <strong className="font-semibold text-slate-900">
                                          {item.pico24hMm ?? 0} mm/24h
                                        </strong>
                                      </span>
                                      {item.anomaliaChuvaMm !== undefined && (
                                        <div className="text-[11px] text-blue-700">
                                          {item.anomaliaChuvaMm > 0
                                            ? `+${item.anomaliaChuvaMm} mm${
                                                item.anomaliaChuvaPct !== undefined &&
                                                item.anomaliaChuvaPct > 0
                                                  ? ` (+${item.anomaliaChuvaPct}%)`
                                                  : ''
                                              } vs. média 5a`
                                            : item.anomaliaChuvaMm < 0
                                              ? `${item.anomaliaChuvaMm} mm vs. média 5a`
                                              : 'Na média histórica (5a)'}
                                        </div>
                                      )}
                                    </div>
                                  ) : item.tipoRisco === 'termico' ? (
                                    <div>
                                      <span>
                                        <strong className="font-semibold text-slate-900">
                                          {(item.tempMaximaC ?? 0).toFixed(1).replace('.', ',')} °C
                                        </strong>{' '}
                                        · {item.diasEstiagem ?? 0}d secos
                                      </span>
                                      {item.anomaliaTempC !== undefined && (
                                        <div className="text-[11px] text-amber-700">
                                          {item.anomaliaTempC > 0
                                            ? `+${item.anomaliaTempC.toFixed(1).replace('.', ',')} °C mais quente (5a)`
                                            : item.anomaliaTempC < 0
                                              ? `${item.anomaliaTempC.toFixed(1).replace('.', ',')} °C mais ameno`
                                              : 'Na média histórica (5a)'}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-slate-500">
                                      <span>
                                        {(item.tempMaximaC ?? 0).toFixed(1).replace('.', ',')} °C ·{' '}
                                        {item.chuvaAcumuladaMm ?? 0} mm
                                      </span>
                                    </div>
                                  )}
                                </td>

                                <td className="py-2.5 px-4 text-right">
                                  <div className="inline-flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenMunicipalityMemo(item);
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-amber-900 bg-amber-50 border border-amber-300 rounded hover:bg-amber-100 transition-colors"
                                      title="Gerar Memorando Oficial para a DRE"
                                    >
                                      <FileText className="w-3 h-3 text-amber-700" />
                                      <span>Memorando</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveMunicipality(item.id);
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-md transition-colors"
                                      aria-label={`Remover ${item.municipio}`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            </div>

            {/* Official SEDUC/PA Bandeiramento & Competence Matrix Panel */}
            <SeducProtocolPanel
              counts={bandeiraCounts}
              unitLabel="municípios"
              activeBandeiraFilter={bandeiraFilter}
              onSelectBandeiraFilter={setBandeiraFilter}
            />

            {/* Bottom 2-Column Row: Directives + Territorial Intelligence */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-7">
                {/* Operational Directives Section */}
                <section
                  id="diretrizes"
                  className="bg-white border border-[#D5E2F4] shadow-2xs rounded-xl overflow-hidden"
                >
                  <div className="px-5 py-4 border-b border-[#E3ECF8] flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-[#002661]">
                        Diretrizes da Semana (Protocolo SEDUC/PA)
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Recomendações automáticas conforme o Bandeiramento e a Nota Técnica nº 987/2026 CEMADEN
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsBulletinDrawerOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0046AD] bg-[#EBF2FC] border border-[#C5D9F7] rounded-lg hover:bg-[#DCE8FA] transition-colors whitespace-nowrap shrink-0"
                    >
                      <MessageSquareText className="w-3.5 h-3.5" />
                      <span>Ver Boletim Preditivo Semanal</span>
                    </button>
                  </div>

                  {directivesError && (
                    <div className="px-5 py-2.5 bg-red-50 border-b border-red-200 text-xs text-red-700">
                      {directivesError}
                    </div>
                  )}

                  <div className="divide-y divide-[#E3ECF8]">
                    {directives.map((dir, index) => (
                      <div
                        key={dir.id}
                        className="flex items-start justify-between gap-3.5 px-5 py-3.5"
                      >
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 inline-flex items-center justify-center px-2 py-0.5 text-[11px] font-mono font-semibold rounded bg-[#EBF2FC] text-[#0046AD] border border-[#C5D9F7] shrink-0 tabular-nums">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <p className="text-sm text-slate-700 leading-relaxed">{dir.text}</p>
                        </div>
                        <span
                          className={`mt-0.5 inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded whitespace-nowrap shrink-0 ${
                            dir.category === 'hidrico'
                              ? 'bg-[#EBF2FC] text-[#0046AD] border border-[#C5D9F7]'
                              : dir.category === 'termico'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {dir.category === 'hidrico'
                            ? 'Risco Hídrico'
                            : dir.category === 'termico'
                              ? 'El Niño / Estiagem'
                              : 'Comitê SEDUC'}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="lg:col-span-5">
                {/* Google Maps Grounding Territorial Intelligence */}
                <MapsGroundingPanel municipality={inspectedMunicipality} />
              </div>
            </div>

            {/* Slide-Over Drawer for Boletim Preditivo Semanal (Hidden until button is clicked) */}
            {isBulletinDrawerOpen && (
              <div
                className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs"
                role="dialog"
                aria-modal="true"
                aria-label="Boletim Preditivo Semanal Estadual"
                onClick={() => setIsBulletinDrawerOpen(false)}
              >
                <div
                  className="w-full max-w-2xl bg-[#F4F7FB] h-full shadow-2xl border-l border-[#D5E2F4] flex flex-col overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-6 py-4 bg-white border-b border-[#D5E2F4] flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-base font-bold text-[#002661]">
                        Boletim Preditivo Semanal · Municípios (SEDUC/PA)
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Pronto para copiar e disparar no Telegram ou Gmail para Diretores e DREs
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsBulletinDrawerOpen(false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4" />
                      <span>Fechar</span>
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6">
                    <TelegramPreview
                      bulletinText={activeBulletin}
                      mapImageUrl={mapImage?.dataUrl ?? null}
                      isCustomEdited={customBulletin !== null}
                      isGeneratingAI={isGeneratingAI}
                      aiError={aiError}
                      copied={copied}
                      copiedImage={copiedImage}
                      viewMode={viewMode}
                      onViewModeChange={setViewMode}
                      onChangeText={(text) => setCustomBulletin(text)}
                      onResetAuto={() => setCustomBulletin(null)}
                      onGenerateAI={handleGenerateWithAI}
                      onCopy={handleCopyBulletin}
                      onCopyImage={handleCopyMapImage}
                      onDownloadTxt={handleDownloadTxt}
                      onDownloadMapImage={handleDownloadMapImage}
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {memoTargetSchool && (
        <AnexoIMemorandumModal
          school={memoTargetSchool}
          onClose={() => setMemoTargetSchool(null)}
        />
      )}
    </div>
  );
}

export default App;
