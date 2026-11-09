import React, { useMemo, useState } from 'react';
import { CloudRain, ExternalLink, Flame, School } from 'lucide-react';
import { PARA_MUNICIPALITIES_CATALOG } from '../data/paraMunicipalities';
import { MunicipalityRisk, RiskType } from '../types/bulletin';
import {
  coordsToSvgPath,
  MARAJO_COORDS,
  MESOREGION_DIVIDERS,
  PARA_BORDER_COORDS,
  PARA_MAP_HEIGHT,
  PARA_MAP_WIDTH,
  projectParaCoord,
} from '../utils/paraMapGeometry';
import type { MonitoredSchool } from './StateSchoolsView';

interface SchoolsRiskMapProps {
  municipalities: MunicipalityRisk[];
  schools: MonitoredSchool[];
  selectedSchoolId: string | null;
  onSelectSchool: (id: string | null) => void;
  riskFilter: 'all' | RiskType;
  onRiskFilterChange: (filter: 'all' | RiskType) => void;
}

type ThermalBand = 'vermelho' | 'laranja' | 'azul-claro' | 'azul-escuro' | null;

function classifyBand(item: MunicipalityRisk): ThermalBand {
  if (item.tipoRisco === 'normal') return null;

  const temp = item.tempMaximaC;
  if (item.tipoRisco === 'termico') {
    if ((temp ?? 38) >= 37.5 || (item.diasEstiagem ?? 0) >= 15) {
      return 'vermelho';
    }
    return 'laranja';
  }

  const pico = item.pico24hMm ?? 0;
  const acum = item.chuvaAcumuladaMm ?? 0;
  if ((temp !== undefined && temp <= 32.5) || pico >= 50 || acum >= 130) {
    return 'azul-escuro';
  }
  return 'azul-claro';
}

export const SchoolsRiskMap: React.FC<SchoolsRiskMapProps> = ({
  municipalities,
  schools,
  selectedSchoolId,
  onSelectSchool,
  riskFilter,
  onRiskFilterChange,
}) => {
  const [hoveredSchoolId, setHoveredSchoolId] = useState<string | null>(null);

  const paraPath = useMemo(() => coordsToSvgPath(PARA_BORDER_COORDS, true), []);
  const marajoPath = useMemo(() => coordsToSvgPath(MARAJO_COORDS, true), []);
  const dividerPaths = useMemo(
    () => MESOREGION_DIVIDERS.map((line) => coordsToSvgPath(line, false)),
    []
  );

  // Background thermal/pluvial contour bands from all 144 municipalities
  const contourBands = useMemo(() => {
    const plottedMuns = municipalities
      .filter((m) => riskFilter === 'all' || m.tipoRisco === riskFilter)
      .map((m) => {
        let lat = m.lat;
        let lon = m.lon;
        if (lat === undefined || lon === undefined) {
          const found = PARA_MUNICIPALITIES_CATALOG.find(
            (c) => c.municipio.toLowerCase() === m.municipio.toLowerCase()
          );
          if (found) {
            lat = found.lat;
            lon = found.lon;
          }
        }
        if (lat === undefined || lon === undefined) return null;
        const { x, y } = projectParaCoord(lat, lon);
        return { id: m.id, x, y, band: classifyBand(m) };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return {
      azulClaro: plottedMuns.filter(
        (p) => p.band === 'azul-claro' || p.band === 'azul-escuro'
      ),
      azulEscuro: plottedMuns.filter((p) => p.band === 'azul-escuro'),
      laranja: plottedMuns.filter(
        (p) => p.band === 'laranja' || p.band === 'vermelho'
      ),
      vermelho: plottedMuns.filter((p) => p.band === 'vermelho'),
    };
  }, [municipalities, riskFilter]);

  // Plot filtered schools with deterministic golden-angle spiral jitter for shared coordinates
  const plottedSchools = useMemo(() => {
    const filtered =
      riskFilter === 'all'
        ? schools
        : schools.filter((s) => s.tipoRisco === riskFilter);

    const coordCounts = new Map<string, number>();
    return filtered.map((s) => {
      const base = projectParaCoord(s.lat, s.lon);
      const key = `${s.lat.toFixed(3)},${s.lon.toFixed(3)}`;
      const idx = coordCounts.get(key) ?? 0;
      coordCounts.set(key, idx + 1);

      let x = base.x;
      let y = base.y;
      if (idx > 0) {
        const angle = idx * 2.39996323; // Golden angle in radians
        const radius = Math.min(24, 4.5 + Math.sqrt(idx) * 2.6);
        x += Math.cos(angle) * radius;
        y += Math.sin(angle) * radius;
      }

      return { ...s, x, y };
    });
  }, [schools, riskFilter]);

  const activeId = hoveredSchoolId ?? selectedSchoolId;
  const activeSchool = useMemo(
    () => plottedSchools.find((s) => s.id === activeId) ?? null,
    [plottedSchools, activeId]
  );

  const hydroCount = schools.filter((s) => s.tipoRisco === 'hidrico').length;
  const thermalCount = schools.filter((s) => s.tipoRisco === 'termico').length;

  return (
    <section
      id="mapa-escolas-para"
      className="bg-white border border-[#D5E2F4] rounded-xl overflow-hidden shadow-xs"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#E2EBF8] bg-[#F8FAFE] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[#002661]">
            Mapa Georreferenciado das Escolas Estaduais · Pará
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Distribuição das unidades escolares sobre as manchas térmicas e pluviométricas de 7 dias
          </p>
        </div>

        {/* Interactive Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-[#EBF2FC] border border-[#D5E2F4] rounded-lg">
          <button
            type="button"
            onClick={() => onRiskFilterChange('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              riskFilter === 'all'
                ? 'bg-[#0046AD] text-white shadow-xs font-semibold'
                : 'text-[#003585] hover:bg-white/60'
            }`}
          >
            Todas ({schools.length})
          </button>
          <button
            type="button"
            onClick={() => onRiskFilterChange('hidrico')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              riskFilter === 'hidrico'
                ? 'bg-[#0046AD] text-white shadow-xs font-semibold'
                : 'text-[#003585] hover:bg-white/60'
            }`}
          >
            Enchentes ({hydroCount})
          </button>
          <button
            type="button"
            onClick={() => onRiskFilterChange('termico')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              riskFilter === 'termico'
                ? 'bg-[#0046AD] text-white shadow-xs font-semibold'
                : 'text-[#003585] hover:bg-white/60'
            }`}
          >
            Queimadas ({thermalCount})
          </button>
        </div>
      </div>

      {/* Map Canvas */}
      <div className="p-5 space-y-4">
        <div className="relative bg-white border border-slate-200/80 rounded-xl overflow-hidden">
          <svg
            id="para-schools-map-svg"
            viewBox={`0 0 ${PARA_MAP_WIDTH} ${PARA_MAP_HEIGHT}`}
            className="w-full h-auto max-h-[440px] block select-none"
            role="img"
            aria-label="Mapa das escolas estaduais do Pará por risco climático"
          >
            <defs>
              <clipPath id="para-schools-territory-clip">
                <path d={paraPath} />
                <path d={marajoPath} />
              </clipPath>

              <filter
                id="schools-isopleth-contour"
                x="-25%"
                y="-25%"
                width="150%"
                height="150%"
              >
                <feGaussianBlur in="SourceGraphic" stdDeviation="16" result="blur" />
                <feColorMatrix
                  in="blur"
                  mode="matrix"
                  values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 34 -15"
                  result="contour"
                />
              </filter>
            </defs>

            {/* Clipped Territory with Neutral Gray Base + 4-Color Smooth Contour Bands */}
            <g clipPath="url(#para-schools-territory-clip)">
              <rect
                x="0"
                y="0"
                width={PARA_MAP_WIDTH}
                height={PARA_MAP_HEIGHT}
                fill="#D4D4D8"
              />

              {contourBands.azulClaro.length > 0 && (
                <g filter="url(#schools-isopleth-contour)">
                  {contourBands.azulClaro.map((pt) => (
                    <circle
                      key={`sac-${pt.id}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={68}
                      fill="#38BDF8"
                    />
                  ))}
                </g>
              )}

              {contourBands.azulEscuro.length > 0 && (
                <g filter="url(#schools-isopleth-contour)">
                  {contourBands.azulEscuro.map((pt) => (
                    <circle
                      key={`sae-${pt.id}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={40}
                      fill="#1D4ED8"
                    />
                  ))}
                </g>
              )}

              {contourBands.laranja.length > 0 && (
                <g filter="url(#schools-isopleth-contour)">
                  {contourBands.laranja.map((pt) => (
                    <circle
                      key={`sla-${pt.id}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={68}
                      fill="#F97316"
                    />
                  ))}
                </g>
              )}

              {contourBands.vermelho.length > 0 && (
                <g filter="url(#schools-isopleth-contour)">
                  {contourBands.vermelho.map((pt) => (
                    <circle
                      key={`svm-${pt.id}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={40}
                      fill="#DC2626"
                    />
                  ))}
                </g>
              )}

              <g fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round">
                {dividerPaths.map((d, idx) => (
                  <path key={`sdiv-${idx}`} d={d} />
                ))}
              </g>
            </g>

            {/* Outer Territory Borders */}
            <path
              d={paraPath}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            <path
              d={marajoPath}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />

            {/* School Pins */}
            {plottedSchools.map((school) => {
              const isSelected = school.id === activeId;
              const pinFill =
                school.tipoRisco === 'hidrico'
                  ? '#1D4ED8'
                  : school.tipoRisco === 'termico'
                    ? '#DC2626'
                    : '#18181B';

              return (
                <g
                  key={school.id}
                  transform={`translate(${school.x}, ${school.y})`}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredSchoolId(school.id)}
                  onMouseLeave={() => setHoveredSchoolId(null)}
                  onClick={() =>
                    onSelectSchool(selectedSchoolId === school.id ? null : school.id)
                  }
                >
                  <circle r={11} fill="transparent" />
                  {isSelected && (
                    <circle
                      r={9}
                      fill="none"
                      stroke="#18181B"
                      strokeWidth="2"
                      strokeOpacity="0.45"
                    />
                  )}
                  <circle
                    r={isSelected ? 5.5 : 3.5}
                    fill={pinFill}
                    stroke="#FFFFFF"
                    strokeWidth="1.5"
                  />
                </g>
              );
            })}
          </svg>
        </div>

        {/* Legend & Active School Inspector */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1">
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700 font-medium">
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-3.5 h-3.5 rounded-sm"
                style={{ backgroundColor: '#DC2626' }}
              />
              <span>Vermelho · Calor intenso / Queimadas</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-3.5 h-3.5 rounded-sm"
                style={{ backgroundColor: '#F97316' }}
              />
              <span>Laranja · Calor moderado</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-3.5 h-3.5 rounded-sm"
                style={{ backgroundColor: '#38BDF8' }}
              />
              <span>Azul Claro · Frio ameno / Chuva</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-3.5 h-3.5 rounded-sm"
                style={{ backgroundColor: '#1D4ED8' }}
              />
              <span>Azul Escuro · Mais frio / Enchentes</span>
            </div>
          </div>

          {activeSchool ? (
            <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <School className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <strong className="font-semibold text-slate-900">
                  {activeSchool.nome}
                </strong>
                {activeSchool.codigoMec && (
                  <span className="font-mono text-[11px] text-slate-500">
                    (MEC: {activeSchool.codigoMec})
                  </span>
                )}
                <span className="text-slate-300">·</span>
                <span className="text-slate-700">
                  {activeSchool.municipio} ({activeSchool.dre})
                </span>
                <span className="text-slate-300">·</span>
                {activeSchool.tipoRisco === 'hidrico' ? (
                  <span className="inline-flex items-center gap-1 font-medium text-blue-700 font-mono tabular-nums">
                    <CloudRain className="w-3.5 h-3.5" />
                    <span>
                      {activeSchool.pico24hMm ?? 0} mm/24h · {activeSchool.chuvaAcumuladaMm ?? 0} mm
                    </span>
                  </span>
                ) : activeSchool.tipoRisco === 'termico' ? (
                  <span className="inline-flex items-center gap-1 font-medium text-red-700 font-mono tabular-nums">
                    <Flame className="w-3.5 h-3.5" />
                    <span>
                      {(activeSchool.tempMaximaC ?? 0).toFixed(1).replace('.', ',')} °C ·{' '}
                      {activeSchool.diasEstiagem ?? 0}d secos
                    </span>
                  </span>
                ) : (
                  <span className="font-medium text-slate-600">Condição Normal</span>
                )}
              </div>

              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `${activeSchool.nome}, ${activeSchool.municipio} - PA`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors whitespace-nowrap"
              >
                <span>Google Maps</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              Passe o cursor ou clique em um ponto no mapa para ver a escola
            </p>
          )}
        </div>
      </div>
    </section>
  );
};
