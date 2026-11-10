import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CloudRain,
  Droplets,
  ExternalLink,
  FileText,
  Flag,
  Flame,
  Mail,
  MessageSquareText,
  RefreshCw,
  School,
  Wind,
  X,
} from 'lucide-react';
import { PARA_MUNICIPALITIES_CATALOG } from '../data/paraMunicipalities';
import {
  BandeiraLevel,
  DirectiveOption,
  MunicipalityRisk,
  RiskType,
  SmokeAirRiskLevel,
} from '../types/bulletin';
import {
  analyzeConditionsAndSuggestDirectives,
  formatSchoolsTelegramBulletin,
} from '../utils/bulletinFormatter';
import { exportParaMapToPng, MapImageResult } from '../utils/mapImageExporter';
import {
  classifyBandeira,
  classifySmokeAndWaterRisk,
  getSchoolProtocolRecommendation,
  SEDUC_BANDEIRA_PROTOCOLS,
} from '../utils/protocolSeduc';
import { AnexoIMemorandumModal } from './AnexoIMemorandumModal';
import { SchoolsRiskMap } from './SchoolsRiskMap';
import { SeducProtocolPanel } from './SeducProtocolPanel';
import { TelegramPreview } from './TelegramPreview';

export interface MonitoredSchool {
  id: string;
  codigoMec?: string;
  nome: string;
  endereco?: string;
  municipio: string;
  dre: string;
  lat: number;
  lon: number;
  tipoRisco: RiskType;
  bandeira?: BandeiraLevel;
  riscoFumacaAr?: SmokeAirRiskLevel;
  chuvaAcumuladaMm?: number;
  pico24hMm?: number;
  tempMaximaC?: number;
  diasEstiagem?: number;
  anomaliaTempC?: number;
  anomaliaChuvaMm?: number;
  recomendacao: string;
}

interface StateSchoolsViewProps {
  municipalities: MunicipalityRisk[];
  directives?: DirectiveOption[];
  isBulletinDrawerOpen?: boolean;
  onToggleBulletinDrawer?: () => void;
}

export const StateSchoolsView: React.FC<StateSchoolsViewProps> = ({
  municipalities,
  directives = [],
  isBulletinDrawerOpen = false,
  onToggleBulletinDrawer,
}) => {
  const [selectedMunicipio, setSelectedMunicipio] = useState<string>('all');
  const [selectedDre, setSelectedDre] = useState<string>('all');
  const [availableDres, setAvailableDres] = useState<string[]>([]);
  const [totalCatalogSchools, setTotalCatalogSchools] = useState<number>(960);
  const [riskFilter, setRiskFilter] = useState<'all' | RiskType>('all');
  const [bandeiraFilter, setBandeiraFilter] = useState<'all' | BandeiraLevel>('all');
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [memorandumSchool, setMemorandumSchool] = useState<MonitoredSchool | null>(null);
  const [localBulletinOpen, setLocalBulletinOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [schools, setSchools] = useState<MonitoredSchool[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const showBulletin = onToggleBulletinDrawer ? isBulletinDrawerOpen : localBulletinOpen;
  const toggleBulletin = onToggleBulletinDrawer ?? (() => setLocalBulletinOpen((v) => !v));

  // Weekly Predictive Bulletin state for the State Schools tab
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');
  const [customBulletin, setCustomBulletin] = useState<string | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [mapImage, setMapImage] = useState<MapImageResult | null>(null);

  const normalizeKey = (val: string) =>
    val
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase();

  const fetchSchools = useCallback(
    async (munParam: string, dreParam: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const criticalNames = municipalities
          .filter((m) => m.tipoRisco !== 'normal')
          .map((m) => m.municipio)
          .join(',');

        let query = '';
        if (dreParam && dreParam !== 'all') {
          query = `dre=${encodeURIComponent(dreParam)}`;
        } else if (munParam === 'all') {
          query = 'mode=all';
        } else if (munParam === 'critical') {
          query = `mode=critical&municipalities=${encodeURIComponent(criticalNames)}`;
        } else {
          query = `municipality=${encodeURIComponent(munParam)}`;
        }

        const res = await fetch(`/api/schools/para?${query}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Erro ao carregar escolas estaduais.');
        }

        if (Array.isArray(data.dres) && data.dres.length > 0) {
          setAvailableDres(data.dres);
        }
        if (typeof data.totalCatalogSchools === 'number') {
          setTotalCatalogSchools(data.totalCatalogSchools);
        }

        const rawSchools: MonitoredSchool[] = Array.isArray(data.schools)
          ? data.schools
          : [];

        const munMap = new Map(
          municipalities.map((m) => [normalizeKey(m.municipio), m])
        );

        const enriched = rawSchools.map((s) => {
          const live = munMap.get(normalizeKey(s.municipio));
          if (!live) {
            return {
              ...s,
              bandeira: 'verde' as const,
              riscoFumacaAr: 'baixo' as const,
              recomendacao: getSchoolProtocolRecommendation({
                tipoRisco: s.tipoRisco,
                bandeira: 'verde',
              }),
            };
          }
          const tipoRisco = live.tipoRisco;
          const bandeira = classifyBandeira(live);
          const riscoFumacaAr = classifySmokeAndWaterRisk(live);
          const recomendacao = getSchoolProtocolRecommendation({
            tipoRisco,
            bandeira,
            tempMaximaC: live.tempMaximaC,
            diasEstiagem: live.diasEstiagem,
            pico24hMm: live.pico24hMm,
            chuvaAcumuladaMm: live.chuvaAcumuladaMm,
          });
          return {
            ...s,
            tipoRisco,
            bandeira,
            bandeiraAnterior: live.bandeiraAnterior,
            statusTransicao: live.statusTransicao,
            riscoFumacaAr,
            chuvaAcumuladaMm: live.chuvaAcumuladaMm,
            pico24hMm: live.pico24hMm,
            tempMaximaC: live.tempMaximaC,
            diasEstiagem: live.diasEstiagem,
            anomaliaTempC: live.anomaliaTempC,
            anomaliaChuvaMm: live.anomaliaChuvaMm,
            recomendacao,
          };
        });

        const bandeiraRank: Record<BandeiraLevel, number> = {
          vermelha: 0,
          amarela: 1,
          verde: 2,
        };
        enriched.sort((a, b) => {
          const bA = bandeiraRank[a.bandeira ?? 'verde'];
          const bB = bandeiraRank[b.bandeira ?? 'verde'];
          if (bA !== bB) return bA - bB;
          return a.municipio.localeCompare(b.municipio, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR');
        });

        setSchools(enriched);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : 'Falha ao consultar escolas estaduais.'
        );
      } finally {
        setIsLoading(false);
      }
    },
    [municipalities]
  );

  useEffect(() => {
    fetchSchools(selectedMunicipio, selectedDre);
  }, [selectedMunicipio, selectedDre, fetchSchools]);

  const hydroCount = useMemo(
    () => schools.filter((s) => s.tipoRisco === 'hidrico').length,
    [schools]
  );
  const thermalCount = useMemo(
    () => schools.filter((s) => s.tipoRisco === 'termico').length,
    [schools]
  );
  const dreCount = useMemo(
    () => new Set(schools.map((s) => s.dre).filter(Boolean)).size,
    [schools]
  );

  const bandeiraCounts = useMemo(() => {
    let vermelha = 0;
    let amarela = 0;
    let verde = 0;
    for (const s of schools) {
      const b = s.bandeira ?? classifyBandeira(s);
      if (b === 'vermelha') vermelha++;
      else if (b === 'amarela') amarela++;
      else verde++;
    }
    return { vermelha, amarela, verde };
  }, [schools]);

  const filteredSchools = useMemo(() => {
    const byRisk =
      riskFilter === 'all'
        ? schools
        : schools.filter((s) => s.tipoRisco === riskFilter);
    const byBandeira =
      bandeiraFilter === 'all'
        ? byRisk
        : byRisk.filter((s) => (s.bandeira ?? classifyBandeira(s)) === bandeiraFilter);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return byBandeira;
    return byBandeira.filter(
      (s) =>
        s.nome.toLowerCase().includes(q) ||
        (s.codigoMec && s.codigoMec.toLowerCase().includes(q)) ||
        s.municipio.toLowerCase().includes(q) ||
        s.dre.toLowerCase().includes(q)
    );
  }, [schools, riskFilter, bandeiraFilter, searchQuery]);

  const sortedCatalog = useMemo(
    () =>
      [...PARA_MUNICIPALITIES_CATALOG].sort((a, b) =>
        a.municipio.localeCompare(b.municipio, 'pt-BR')
      ),
    []
  );

  const defaultMemoSchool = useMemo(
    () =>
      schools.find((s) => s.id === selectedSchoolId) ??
      schools.find((s) => s.bandeira === 'vermelha') ??
      schools.find((s) => s.bandeira === 'amarela') ??
      schools[0] ??
      null,
    [schools, selectedSchoolId]
  );

  const scopeLabel = useMemo(() => {
    if (selectedDre !== 'all') return selectedDre;
    if (selectedMunicipio === 'all') return 'Rede Estadual Completa (144 Municípios)';
    if (selectedMunicipio === 'critical') return 'Municípios em Alerta Crítico';
    return selectedMunicipio;
  }, [selectedDre, selectedMunicipio]);

  const effectiveDirectives = useMemo(
    () =>
      directives.length > 0
        ? directives
        : analyzeConditionsAndSuggestDirectives(municipalities),
    [directives, municipalities]
  );

  const autoSchoolsBulletin = useMemo(
    () =>
      formatSchoolsTelegramBulletin(
        filteredSchools,
        scopeLabel,
        effectiveDirectives
      ),
    [filteredSchools, scopeLabel, effectiveDirectives]
  );

  const activeBulletin = customBulletin ?? autoSchoolsBulletin;

  useEffect(() => {
    if (isLoading || filteredSchools.length === 0) {
      setMapImage(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await exportParaMapToPng(
          'para-schools-map-svg',
          `SEDUC-PA · Mapa das Escolas Estaduais (${filteredSchools.length} unidades no recorte)`
        );
        if (!cancelled && result) {
          setMapImage(result);
        }
      } catch {
        // Ignore transient SVG serialization errors
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filteredSchools, riskFilter, selectedSchoolId, isLoading]);

  const handleGenerateWithAI = async () => {
    if (municipalities.length === 0) {
      setAiError('Aguarde o carregamento dos dados meteorológicos para refinar com IA.');
      return;
    }

    setIsGeneratingAI(true);
    setAiError(null);

    try {
      const selectedDirs = effectiveDirectives.map((d) => d.text);
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
    a.download = `boletim-escolas-seduc-pa-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadMapImage = async () => {
    const current =
      mapImage ??
      (await exportParaMapToPng(
        'para-schools-map-svg',
        `SEDUC-PA · Mapa das Escolas Estaduais (${filteredSchools.length} unidades no recorte)`
      ));
    if (!current) return;
    const url = URL.createObjectURL(current.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapa-escolas-seduc-pa-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyMapImage = async () => {
    const current =
      mapImage ??
      (await exportParaMapToPng(
        'para-schools-map-svg',
        `SEDUC-PA · Mapa das Escolas Estaduais (${filteredSchools.length} unidades no recorte)`
      ));
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

  return (
    <div className="space-y-8">
      {/* Header & Municipality / DRE Selectors */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-[#D5E2F4]">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#EBF2FC] text-[#0046AD] border border-[#C5D9F7] mb-2">
            <span>Protocolo SEDUC/PA & BID · Nota Técnica nº 987/2026 CEMADEN</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#002661]">
            Monitoramento por Bandeiramento das Escolas Estaduais
          </h1>
          <p className="mt-2 text-xs text-slate-600">
            Base oficial SEDUC-PA ({totalCatalogSchools} unidades escolares) integrada ao Fluxo de Ação por Bandeiramento e emissão de Memorando Oficial à DRE
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filtrar escolas por Diretoria Regional de Ensino (DRE)"
            value={selectedDre}
            onChange={(e) => {
              setSelectedDre(e.target.value);
            }}
            className="px-3 py-2 text-xs font-medium bg-white border border-[#D5E2F4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0046AD]"
          >
            <option value="all">Todas as DREs (Filtrar por Município)</option>
            {availableDres.map((dre) => (
              <option key={dre} value={dre}>
                {dre}
              </option>
            ))}
          </select>

          <select
            aria-label="Selecionar município para monitorar escolas"
            value={selectedMunicipio}
            disabled={selectedDre !== 'all'}
            onChange={(e) => setSelectedMunicipio(e.target.value)}
            className="px-3 py-2 text-xs font-medium bg-white border border-[#D5E2F4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0046AD] disabled:opacity-50"
          >
            <option value="all">Todos os Municípios (Toda a Rede Estadual)</option>
            <option value="critical">Apenas Municípios em Alerta Crítico</option>
            {sortedCatalog.map((c) => (
              <option key={c.municipio} value={c.municipio}>
                {c.municipio} ({c.dre})
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={isLoading}
            onClick={() => fetchSchools(selectedMunicipio, selectedDre)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#003585] bg-white border border-[#D5E2F4] rounded-lg hover:bg-[#EBF2FC]/60 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#0046AD]' : 'text-[#0046AD]'}`}
            />
            <span>Atualizar</span>
          </button>

          {defaultMemoSchool && (
            <button
              type="button"
              onClick={() => setMemorandumSchool(defaultMemoSchool)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-950 bg-amber-100 border border-amber-300 rounded-lg hover:bg-amber-200 transition-colors whitespace-nowrap shrink-0"
            >
              <FileText className="w-3.5 h-3.5 text-amber-800" />
              <span>Emitir Memorando</span>
            </button>
          )}

          <button
            type="button"
            onClick={toggleBulletin}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0046AD] rounded-lg hover:bg-[#003585] shadow-xs transition-colors whitespace-nowrap shrink-0"
          >
            <MessageSquareText className="w-3.5 h-3.5" />
            <span>Boletim Preditivo Semanal</span>
          </button>

          <a
            href={`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(
              `CISEB Monitor do Clima - Bandeiramento Escolar (${
                selectedDre !== 'all'
                  ? selectedDre
                  : selectedMunicipio === 'all'
                    ? 'Rede Estadual Completa'
                    : selectedMunicipio === 'critical'
                      ? 'Municípios Críticos'
                      : selectedMunicipio
              })`
            )}&body=${encodeURIComponent(
              `Prezados Diretores Escolares e Dirigentes (${
                selectedDre !== 'all' ? selectedDre : 'Rede Estadual SEDUC/PA'
              }),\n\nSegue o resumo do Bandeiramento Climático (Protocolo El Niño SEDUC/PA · próximos 7 dias):\n\n• Total de escolas monitoradas no recorte: ${schools.length}\n• 🔴 Bandeira Vermelha (Resposta e Proteção): ${bandeiraCounts.vermelha}\n• 🟡 Bandeira Amarela (Atenção e Preparação): ${bandeiraCounts.amarela}\n• 🟢 Bandeira Verde (Prevenção e Monitoramento): ${bandeiraCounts.verde}\n• Em risco térmico (calor/queimada/estiagem): ${thermalCount}\n• Em risco hídrico (alagamento/enxurrada): ${hydroCount}\n\nLembramos que as unidades em Bandeira Amarela e Vermelha devem encaminhar o Memorando Oficial à respectiva DRE.\n\nAtenciosamente,\nComitê de Crise / CISEB · SEDUC-PA`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#003585] bg-white border border-[#D5E2F4] rounded-lg hover:bg-[#EBF2FC]/60 transition-colors whitespace-nowrap shrink-0"
          >
            <Mail className="w-3.5 h-3.5 text-[#0046AD]" />
            <span>Resumo p/ Gmail</span>
          </a>
        </div>
      </div>

      {/* KPI Summary Strip with Bandeiramento */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white border border-[#D5E2F4] shadow-2xs rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-[#E3ECF8]">
        <div className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-red-700">
              🔴 Bandeira Vermelha
            </p>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
              Resposta e Proteção
            </span>
          </div>
          <p className="mt-1.5 text-2xl font-bold text-red-700 font-mono tabular-nums">
            {bandeiraCounts.vermelha}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Comunicar DRE e avaliar CEMEP ("Aluno sem aula zero")
          </p>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-amber-700">
              🟡 Bandeira Amarela
            </p>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
              Atenção e Preparação
            </span>
          </div>
          <p className="mt-1.5 text-2xl font-bold text-amber-700 font-mono tabular-nums">
            {bandeiraCounts.amarela}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Restringir atividades externas, água/fumaça e cadernos
          </p>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-emerald-700">
              🟢 Bandeira Verde
            </p>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
              Prevenção
            </span>
          </div>
          <p className="mt-1.5 text-2xl font-bold text-emerald-700 font-mono tabular-nums">
            {bandeiraCounts.verde}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Rotina mantida · Monitorar reservatórios e território
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-semibold text-[#003585]">
            Escolas no Recorte ({dreCount} DREs)
          </p>
          <p className="mt-1.5 text-2xl font-bold text-[#002661] font-mono tabular-nums">
            {schools.length}
            <span className="text-sm font-normal text-slate-400"> / {totalCatalogSchools}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {thermalCount} em risco térmico · {hydroCount} em risco hídrico
          </p>
        </div>
      </section>

      {/* Full-Width Objective Workspace: Map + Table side-by-side on desktop, Protocol below */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        <div className="xl:col-span-5">
          <SchoolsRiskMap
            municipalities={municipalities}
            schools={filteredSchools}
            selectedSchoolId={selectedSchoolId}
            onSelectSchool={setSelectedSchoolId}
            riskFilter={riskFilter}
            onRiskFilterChange={setRiskFilter}
          />
        </div>

        <div className="xl:col-span-7">
          {/* Schools Table */}
          <section
            id="tabela-escolas"
            className="bg-white border border-[#D5E2F4] shadow-2xs rounded-xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-[#E3ECF8] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <School className="w-4 h-4 text-[#0046AD] shrink-0" />
                <div>
                  <h2 className="text-base font-semibold text-[#002661]">
                    Unidades Escolares Monitoradas ({filteredSchools.length})
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Bandeiramento SEDUC/PA, condições de fumaça/água e emissão de Memorando Oficial para a DRE
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar escola, MEC, município ou DRE..."
                  aria-label="Buscar escola, MEC, município ou DRE"
                  className="px-3 py-1.5 text-xs bg-[#F4F7FB] border border-[#D5E2F4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0046AD] focus:bg-white w-52"
                />

                {/* Bandeira Filter Pills */}
                <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setBandeiraFilter('all')}
                    className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      bandeiraFilter === 'all'
                        ? 'bg-[#0046AD] text-white shadow-2xs'
                        : 'text-slate-700 hover:bg-white'
                    }`}
                  >
                    Todas ({schools.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBandeiraFilter('vermelha')}
                    className={`px-2 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      bandeiraFilter === 'vermelha'
                        ? 'bg-red-600 text-white shadow-2xs'
                        : 'text-red-800 hover:bg-red-50'
                    }`}
                  >
                    🔴 {bandeiraCounts.vermelha}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBandeiraFilter('amarela')}
                    className={`px-2 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      bandeiraFilter === 'amarela'
                        ? 'bg-amber-500 text-white shadow-2xs'
                        : 'text-amber-800 hover:bg-amber-50'
                    }`}
                  >
                    🟡 {bandeiraCounts.amarela}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBandeiraFilter('verde')}
                    className={`px-2 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      bandeiraFilter === 'verde'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-emerald-800 hover:bg-emerald-50'
                    }`}
                  >
                    🟢 {bandeiraCounts.verde}
                  </button>
                </div>

                {/* Nature of Risk Filter */}
                <div className="flex items-center gap-1 p-1 bg-[#EBF2FC] border border-[#D5E2F4] rounded-lg">
                  <button
                    type="button"
                    onClick={() => setRiskFilter('all')}
                    className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      riskFilter === 'all'
                        ? 'bg-[#0046AD] text-white shadow-xs'
                        : 'text-[#003585] hover:bg-white/70'
                    }`}
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    onClick={() => setRiskFilter('hidrico')}
                    className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      riskFilter === 'hidrico'
                        ? 'bg-[#0046AD] text-white shadow-xs'
                        : 'text-[#003585] hover:bg-white/70'
                    }`}
                  >
                    Hídrico ({hydroCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRiskFilter('termico')}
                    className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      riskFilter === 'termico'
                        ? 'bg-[#0046AD] text-white shadow-xs'
                        : 'text-[#003585] hover:bg-white/70'
                    }`}
                  >
                    Térmico ({thermalCount})
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div className="px-5 py-3 bg-red-50 border-b border-red-200 text-xs text-red-700">
                {error}
              </div>
            )}

            {isLoading ? (
              <div className="p-6 space-y-3 animate-pulse">
                {[1, 2, 3, 4, 5].map((row) => (
                  <div key={row} className="h-12 bg-slate-100 rounded-lg w-full" />
                ))}
              </div>
            ) : filteredSchools.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm font-medium text-slate-700">
                  Nenhuma escola encontrada para o filtro selecionado.
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Selecione outra Bandeira ou município acima, ou limpe a busca.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-slate-50 z-10 shadow-2xs">
                    <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="py-2.5 px-4">Escola / Município</th>
                      <th className="py-2.5 px-3">Bandeira & Risco</th>
                      <th className="py-2.5 px-3">Orientação Objetiva</th>
                      <th className="py-2.5 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredSchools.map((school) => {
                      const isSelected = school.id === selectedSchoolId;
                      const bandeira = school.bandeira ?? classifyBandeira(school);
                      const bSpec = SEDUC_BANDEIRA_PROTOCOLS[bandeira];
                      const smokeRisk = school.riscoFumacaAr ?? classifySmokeAndWaterRisk(school);

                      return (
                        <tr
                          key={school.id}
                          onClick={() =>
                            setSelectedSchoolId(isSelected ? null : school.id)
                          }
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">{school.nome}</div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-xs text-slate-500">
                              <span className="font-medium text-slate-700">{school.municipio}</span>
                              <span>·</span>
                              <span>{school.dre}</span>
                              {school.codigoMec && (
                                <>
                                  <span>·</span>
                                  <span className="font-mono text-[11px]">MEC {school.codigoMec}</span>
                                </>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-3 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-full border whitespace-nowrap ${bSpec.badgeBg} ${bSpec.badgeText} ${bSpec.badgeBorder}`}
                              >
                                <Flag className="w-3 h-3" />
                                <span>{bSpec.title}</span>
                              </span>
                              {school.statusTransicao === 'em-vigilancia' && (
                                <span
                                  className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-300 rounded whitespace-nowrap"
                                  title="Esteve em Bandeira Vermelha nas últimas 24h/48h. Em período de vigilância preventiva de 48h para evitar desescalada abrupta."
                                >
                                  🛡️ Transição 48h
                                </span>
                              )}
                            </div>

                            {school.tipoRisco === 'hidrico' ? (
                              <div>
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700">
                                  <CloudRain className="w-3.5 h-3.5" />
                                  <span>Alagamento</span>
                                </span>
                                <div className="text-[11px] font-mono text-slate-600 tabular-nums">
                                  {school.pico24hMm ?? 0} mm/24h · {school.chuvaAcumuladaMm ?? 0} mm
                                </div>
                              </div>
                            ) : school.tipoRisco === 'termico' ? (
                              <div>
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                                  <Flame className="w-3.5 h-3.5" />
                                  <span>Queimada / Estiagem</span>
                                </span>
                                <div className="text-[11px] font-mono text-slate-600 tabular-nums">
                                  {(school.tempMaximaC ?? 0).toFixed(1).replace('.', ',')} °C ·{' '}
                                  {school.diasEstiagem ?? 0}d secos
                                </div>
                                {(smokeRisk === 'critico' || smokeRisk === 'alto') && (
                                  <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 mt-0.5">
                                    <Wind className="w-3 h-3" />
                                    <span>Ar/Água: {smokeRisk.toUpperCase()}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-[11px] text-slate-500 flex items-center gap-1">
                                <Droplets className="w-3 h-3 text-emerald-600" />
                                <span>Rotina Normal</span>
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-3 text-xs text-slate-700 max-w-sm leading-relaxed">
                            {school.recomendacao}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMemorandumSchool(school);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors whitespace-nowrap"
                                title="Gerar Memorando Oficial de comunicação para a DRE"
                              >
                                <FileText className="w-3 h-3 text-amber-700" />
                                <span>Memorando</span>
                              </button>

                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                  `${school.nome}, ${school.municipio} - PA`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50/70 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap"
                              >
                                <span>Mapa</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
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

      {/* Interactive SEDUC Protocol Panel (Bandeiramento + Competence Matrix) */}
      <SeducProtocolPanel
        counts={bandeiraCounts}
        unitLabel="escolas"
        activeBandeiraFilter={bandeiraFilter}
        onSelectBandeiraFilter={setBandeiraFilter}
      />

      {/* Slide-Over Drawer for Boletim Preditivo Semanal (Hidden until button is clicked) */}
      {showBulletin && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Boletim Preditivo Semanal das Escolas Estaduais"
          onClick={toggleBulletin}
        >
          <div
            className="w-full max-w-2xl bg-[#F4F7FB] h-full shadow-2xl border-l border-[#D5E2F4] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-white border-b border-[#D5E2F4] flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-[#002661]">
                  Boletim Preditivo Semanal · Escolas Estaduais
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pronto para copiar e disparar no Telegram ou Gmail para Diretores e DREs
                </p>
              </div>
              <button
                type="button"
                onClick={toggleBulletin}
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

      {/* Official Memorandum Modal */}
      {memorandumSchool && (
        <AnexoIMemorandumModal
          school={memorandumSchool}
          onClose={() => setMemorandumSchool(null)}
        />
      )}
    </div>
  );
};
