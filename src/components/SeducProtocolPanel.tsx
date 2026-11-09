import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Flag,
  Radio,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { BandeiraLevel } from '../types/bulletin';
import {
  SEDUC_BANDEIRA_PROTOCOLS,
  SEDUC_COMPETENCE_MATRIX,
} from '../utils/protocolSeduc';

interface SeducProtocolPanelProps {
  counts: {
    vermelha: number;
    amarela: number;
    verde: number;
  };
  unitLabel?: 'municípios' | 'escolas';
  activeBandeiraFilter?: 'all' | BandeiraLevel;
  onSelectBandeiraFilter?: (bandeira: 'all' | BandeiraLevel) => void;
}

export const SeducProtocolPanel: React.FC<SeducProtocolPanelProps> = ({
  counts,
  unitLabel = 'municípios',
  activeBandeiraFilter,
  onSelectBandeiraFilter,
}) => {
  const defaultTab: BandeiraLevel =
    counts.vermelha > 0 ? 'vermelha' : counts.amarela > 0 ? 'amarela' : 'verde';

  const [selectedBandeira, setSelectedBandeira] = useState<BandeiraLevel>(defaultTab);
  const [panelMode, setPanelMode] = useState<'bandeiras' | 'matriz'>('bandeiras');
  const [checkedActions, setCheckedActions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (activeBandeiraFilter && activeBandeiraFilter !== 'all') {
      setSelectedBandeira(activeBandeiraFilter);
    } else if (counts.vermelha > 0) {
      setSelectedBandeira('vermelha');
    } else if (counts.amarela > 0) {
      setSelectedBandeira('amarela');
    }
  }, [activeBandeiraFilter, counts.vermelha, counts.amarela]);

  const currentSpec = SEDUC_BANDEIRA_PROTOCOLS[selectedBandeira];

  const toggleCheck = (key: string) => {
    setCheckedActions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <section
      id="protocolo-seduc"
      className="bg-white border border-[#D5E2F4] shadow-2xs rounded-xl overflow-hidden"
    >
      {/* Top Header */}
      <div className="px-5 py-4 bg-[#F8FAFE] border-b border-[#E3ECF8] flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#0046AD] text-white">
              Protocolo SEDUC/PA · BID
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              Nota Técnica nº 987/2026 CEMADEN · Comitê de Crise El Niño
            </span>
          </div>
          <h2 className="text-base font-bold text-[#002661] mt-1">
            Fluxo de Ação por Bandeiramento e Matriz de Competências
          </h2>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center gap-1 p-1 bg-[#EBF2FC] border border-[#D5E2F4] rounded-lg">
          <button
            type="button"
            onClick={() => setPanelMode('bandeiras')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              panelMode === 'bandeiras'
                ? 'bg-[#0046AD] text-white shadow-xs'
                : 'text-[#003585] hover:bg-white/70'
            }`}
          >
            Bandeiramento (Verde / Amarela / Vermelha)
          </button>
          <button
            type="button"
            onClick={() => setPanelMode('matriz')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              panelMode === 'matriz'
                ? 'bg-[#0046AD] text-white shadow-xs'
                : 'text-[#003585] hover:bg-white/70'
            }`}
          >
            Matriz Escola · DRE · SEDUC
          </button>
        </div>
      </div>

      {panelMode === 'bandeiras' ? (
        <div className="p-5 space-y-5">
          {/* 3 Flag Selector Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(
              [
                {
                  level: 'verde' as const,
                  count: counts.verde,
                  ringActive: 'ring-2 ring-emerald-600 bg-emerald-50/70 border-emerald-300',
                  dotBg: 'bg-emerald-500',
                  textStrong: 'text-emerald-900',
                },
                {
                  level: 'amarela' as const,
                  count: counts.amarela,
                  ringActive: 'ring-2 ring-amber-500 bg-amber-50/70 border-amber-300',
                  dotBg: 'bg-amber-500',
                  textStrong: 'text-amber-900',
                },
                {
                  level: 'vermelha' as const,
                  count: counts.vermelha,
                  ringActive: 'ring-2 ring-red-600 bg-red-50/70 border-red-300',
                  dotBg: 'bg-red-600',
                  textStrong: 'text-red-900',
                },
              ]
            ).map((card) => {
              const spec = SEDUC_BANDEIRA_PROTOCOLS[card.level];
              const isSelected = selectedBandeira === card.level;
              const isFiltered = activeBandeiraFilter === card.level;

              return (
                <div
                  key={card.level}
                  onClick={() => {
                    setSelectedBandeira(card.level);
                    if (onSelectBandeiraFilter) {
                      onSelectBandeiraFilter(
                        activeBandeiraFilter === card.level ? 'all' : card.level
                      );
                    }
                  }}
                  className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
                    isSelected
                      ? card.ringActive
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${card.dotBg} shrink-0`} />
                      <span className={`text-xs font-bold ${card.textStrong}`}>
                        {spec.title}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-800 bg-white/90 px-2 py-0.5 rounded border border-slate-200 tabular-nums">
                      {card.count} {unitLabel}
                    </span>
                  </div>
                  <p className="text-[11px] font-medium text-slate-600 mt-1">
                    {spec.subtitle}
                  </p>
                  {onSelectBandeiraFilter && (
                    <p className="text-[10px] text-[#0046AD] font-semibold mt-1.5">
                      {isFiltered ? '✓ Filtro ativo na tabela/mapa (clique p/ todos)' : 'Clique para inspecionar e filtrar'}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selected Flag Details & Step Flow */}
          <div
            className={`p-4 rounded-xl border ${currentSpec.badgeBg} ${currentSpec.badgeBorder} space-y-4`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Flag className={`w-4 h-4 ${currentSpec.badgeText}`} />
                <h3 className={`text-sm font-bold ${currentSpec.badgeText}`}>
                  {currentSpec.title} · {currentSpec.subtitle}
                </h3>
              </div>
              <span className="text-[11px] font-medium text-slate-600">
                Definição exclusiva: Comitê de Crise SEDUC/PA
              </span>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed">{currentSpec.summary}</p>

            {/* Official Flow Steps Pills (Pages 6, 7, 9) */}
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-2">
                Fluxo Operacional ({currentSpec.title}):
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {currentSpec.flowSteps.map((step, idx) => (
                  <React.Fragment key={step}>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0046AD] text-white shadow-2xs">
                      <span className="text-[10px] font-mono opacity-75">
                        {idx + 1}.
                      </span>
                      <span>{step}</span>
                    </span>
                    {idx < currentSpec.flowSteps.length - 1 && (
                      <ArrowRight className="w-3.5 h-3.5 text-[#0046AD] shrink-0" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          {/* Interactive School Actions Checklist */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#002661]">
                Checklist de Ações da Escola ({currentSpec.title})
              </h4>
              <span className="text-[11px] text-slate-500">
                Marque as providências já verificadas pela gestão escolar
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {currentSpec.schoolActions.map((action, idx) => {
                const checkKey = `${selectedBandeira}-${idx}`;
                const isDone = Boolean(checkedActions[checkKey]);
                return (
                  <label
                    key={checkKey}
                    onClick={() => toggleCheck(checkKey)}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                      isDone
                        ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                        : 'bg-slate-50/70 border-slate-200/90 text-slate-700 hover:bg-slate-100/70'
                    }`}
                  >
                    <CheckCircle2
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        isDone ? 'text-emerald-600' : 'text-slate-400'
                      }`}
                    />
                    <span className={isDone ? 'line-through opacity-80' : ''}>
                      {action}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Special DRE Actions Box for Bandeira Vermelha (Page 11) */}
          {currentSpec.dreActions && (
            <div className="p-4 bg-[#EBF2FC] border border-[#C5D9F7] rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[#002661]">
                  <Radio className="w-4 h-4 text-[#0046AD]" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">
                    Ações da Diretoria Regional de Ensino (DRE) em Caso de Bandeira Vermelha (Pág. 11)
                  </h4>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white text-[#0046AD] border border-[#C5D9F7]">
                  <BookOpen className="w-3 h-3" />
                  <span>CEMEP · "Aluno sem aula zero"</span>
                </span>
              </div>

              <ul className="space-y-1.5 text-xs text-slate-700">
                {currentSpec.dreActions.map((dreAct, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="font-mono font-bold text-[#0046AD] mt-0.5">
                      •
                    </span>
                    <span>{dreAct}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        /* Competence Matrix & Communication Flow View (Pages 5 & 12) */
        <div className="p-5 space-y-5">
          {/* Official Communication Flow (Page 5) */}
          <div className="p-4 bg-[#F4F7FB] border border-[#D5E2F4] rounded-xl">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#002661] mb-3">
              Fluxo Oficial de Comunicação e Resposta (Pág. 5)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
              {[
                {
                  step: '1. ESCOLA',
                  desc: 'Identifica, monitora, registra e comunica formalmente à DRE.',
                },
                {
                  step: '2. DRE',
                  desc: 'Consolida, orienta, articula e comunica à SEDUC.',
                },
                {
                  step: '3. SEDUC/PA',
                  desc: 'Coordena, apoia, define bandeira e orientações gerais.',
                },
                {
                  step: '4. RETORNO À DRE',
                  desc: 'Implementação das medidas e comunicação com a escola.',
                },
                {
                  step: '5. MONITORAMENTO',
                  desc: 'Orienta as ações contínuas e reposição pedagógica.',
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="p-3 bg-white border border-[#D5E2F4] rounded-lg flex flex-col justify-between"
                >
                  <span className="text-[11px] font-bold text-[#0046AD]">
                    {item.step}
                  </span>
                  <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Competence Matrix Table (Page 12) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#0046AD]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#002661]">
                Matriz de Competências no Sistema de Bandeiramento (Pág. 12)
              </h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {SEDUC_COMPETENCE_MATRIX.map((row) => (
                <div
                  key={row.level}
                  className="p-4 bg-white border border-[#D5E2F4] rounded-xl flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                      <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-[#0046AD] text-white">
                        {row.level}
                      </span>
                      <ShieldAlert className="w-4 h-4 text-[#0046AD]" />
                    </div>
                    <p className="text-xs font-semibold text-[#002661] mt-2">
                      {row.roleTitle}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 italic">
                      {row.flowSummary}
                    </p>

                    <ul className="mt-3 space-y-1.5 text-xs text-slate-700">
                      {row.competencies.map((comp, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-[#0046AD] font-bold">•</span>
                          <span>{comp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
