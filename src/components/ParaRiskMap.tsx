import React, { useMemo, useState } from 'react';
import { CloudRain, Flame, MapPin } from 'lucide-react';
import { PARA_MUNICIPALITIES_CATALOG } from '../data/paraMunicipalities';
import { MunicipalityRisk, RiskType } from '../types/bulletin';

interface ParaRiskMapProps {
  municipalities: MunicipalityRisk[];
  mostCriticalHydroId?: string;
  mostCriticalThermalId?: string;
  selectedId: string | null;
  onSelectMunicipality: (id: string | null) => void;
  riskFilter: 'all' | RiskType;
  onRiskFilterChange: (filter: 'all' | RiskType) => void;
}

const SVG_WIDTH = 760;
const SVG_HEIGHT = 560;
const PAD_X = 48;
const PAD_Y = 36;

// Geographic bounding box for Pará State
const MIN_LON = -59.2;
const MAX_LON = -45.8;
const MIN_LAT = -10.0;
const MAX_LAT = 2.7;

function project(lat: number, lon: number): { x: number; y: number } {
  const x =
    PAD_X + ((lon - MIN_LON) / (MAX_LON - MIN_LON)) * (SVG_WIDTH - PAD_X * 2);
  const y =
    PAD_Y + ((MAX_LAT - lat) / (MAX_LAT - MIN_LAT)) * (SVG_HEIGHT - PAD_Y * 2);
  return { x, y };
}

function coordsToPath(coords: [number, number][], close = true): string {
  const pts = coords.map(([lat, lon]) => {
    const { x, y } = project(lat, lon);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M ${pts.join(' L ')}${close ? ' Z' : ''}`;
}

// High-fidelity IBGE Pará mainland border in [lat, lon]
const PARA_BORDER_COORDS: [number, number][] = [
  // Northwest lobe (Guiana / Suriname border)
  [1.35, -58.35],
  [1.85, -57.6],
  [2.25, -56.6],
  [2.55, -55.85],
  [2.35, -55.1],
  [2.05, -54.55],
  [2.15, -53.95],
  [1.75, -53.3],
  // North-central V-notch (Amapá / Jari River border)
  [1.25, -52.85],
  [0.65, -52.55],
  [0.05, -52.35],
  [-0.55, -52.1],
  [-1.15, -51.9],
  [-0.85, -51.35],
  [-0.45, -50.95],
  // Marajó Bay & Atlantic coast (Salgado / Bragantina)
  [-0.85, -50.65],
  [-1.45, -50.25],
  [-1.65, -49.55],
  [-1.55, -48.85],
  [-1.25, -48.45],
  [-0.85, -48.25],
  [-0.6, -47.85],
  [-0.62, -47.35],
  [-0.85, -46.85],
  [-1.08, -46.12],
  // Eastern border (Gurupi / Tocantins / Araguaia)
  [-1.55, -46.25],
  [-2.15, -46.45],
  [-2.75, -46.95],
  [-3.35, -47.45],
  [-3.95, -47.55],
  [-4.45, -47.65],
  [-4.95, -48.15],
  [-5.35, -48.65],
  [-5.85, -48.95],
  [-6.45, -49.15],
  [-7.15, -49.25],
  [-7.85, -49.2],
  [-8.45, -49.25],
  [-9.15, -49.65],
  [-9.65, -50.15],
  // Southern border (Mato Grosso)
  [-9.75, -50.85],
  [-9.65, -51.65],
  [-9.5, -52.45],
  [-9.35, -53.25],
  [-9.25, -54.15],
  [-9.15, -55.05],
  [-9.0, -56.05],
  [-8.85, -57.15],
  [-8.78, -58.15],
  // Iconic straight diagonal southwest border (Amazonas)
  [-7.6, -57.75],
  [-6.35, -57.32],
  [-5.1, -56.88],
  [-3.85, -56.45],
  // Western border (Maués / Nhamundá)
  [-3.55, -56.95],
  [-3.15, -57.45],
  [-2.75, -57.15],
  [-2.45, -57.65],
  [-2.35, -58.35],
  [-2.05, -58.85],
  [-1.45, -58.75],
  [-0.85, -58.45],
  [-0.15, -58.4],
  [0.65, -58.45],
  [1.35, -58.35],
];

// Marajó Island in [lat, lon]
const MARAJO_COORDS: [number, number][] = [
  [-0.15, -50.35],
  [-0.1, -49.3],
  [-0.65, -48.45],
  [-1.35, -48.85],
  [-1.55, -50.15],
  [-0.9, -50.55],
  [-0.15, -50.35],
];

// Internal regional & major municipal dividers (clean white lines like reference map)
const MESOREGION_DIVIDERS: [number, number][][] = [
  // Oriximiná / Óbidos / Alenquer / Monte Alegre / Almeirim (Calha Norte)
  [
    [2.35, -55.1],
    [0.5, -55.2],
    [-1.9, -55.5],
  ],
  [
    [2.15, -53.95],
    [0.2, -53.8],
    [-2.0, -54.0],
  ],
  [
    [1.25, -52.85],
    [-0.4, -52.7],
    [-1.6, -52.6],
  ],
  // Calha Norte / Baixo Amazonas (Amazon River axis)
  [
    [-2.35, -58.35],
    [-2.1, -56.5],
    [-2.4, -54.7],
    [-2.0, -53.2],
    [-1.15, -51.9],
  ],
  // Itaituba / Jacareacanga / Novo Progresso (Tapajós)
  [
    [-2.4, -54.7],
    [-4.3, -55.9],
    [-6.2, -56.2],
    [-9.0, -56.05],
  ],
  // Altamira / São Félix do Xingu (Xingu)
  [
    [-2.0, -53.2],
    [-3.5, -52.3],
    [-5.2, -52.2],
    [-6.6, -52.0],
    [-9.35, -53.25],
  ],
  // São Félix do Xingu / Marabá / Parauapebas / Redenção
  [
    [-5.2, -52.2],
    [-5.3, -50.5],
    [-5.35, -48.65],
  ],
  [
    [-6.6, -52.0],
    [-7.1, -50.5],
    [-7.15, -49.25],
  ],
  // Tucuruí / Cametá / Abaetetuba / Paragominas
  [
    [-1.65, -49.55],
    [-2.5, -49.5],
    [-3.8, -49.6],
    [-5.3, -50.5],
  ],
  [
    [-3.8, -49.6],
    [-3.4, -48.3],
    [-2.75, -46.95],
  ],
  // Metropolitana / Nordeste / Bragantina
  [
    [-1.25, -48.45],
    [-1.8, -47.8],
    [-1.55, -46.25],
  ],
];

type ThermalBand = 'vermelho' | 'laranja' | 'azul-claro' | 'azul-escuro' | null;

function classifyBand(item: MunicipalityRisk): ThermalBand {
  if (item.tipoRisco === 'normal') {
    return null;
  }

  const temp = item.tempMaximaC;
  if (item.tipoRisco === 'termico') {
    if ((temp ?? 38) >= 37.5 || (item.diasEstiagem ?? 0) >= 15) {
      return 'vermelho';
    }
    return 'laranja';
  }

  // Hidrico (chuva / mais frio)
  const pico = item.pico24hMm ?? 0;
  const acum = item.chuvaAcumuladaMm ?? 0;
  if ((temp !== undefined && temp <= 32.5) || pico >= 50 || acum >= 130) {
    return 'azul-escuro';
  }
  return 'azul-claro';
}

export const ParaRiskMap: React.FC<ParaRiskMapProps> = ({
  municipalities,
  mostCriticalHydroId,
  mostCriticalThermalId,
  selectedId,
  onSelectMunicipality,
  riskFilter,
  onRiskFilterChange,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const plottedItems = useMemo(() => {
    return municipalities
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
        const { x, y } = project(lat, lon);
        const band = classifyBand(m);
        return { ...m, lat, lon, x, y, band };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [municipalities, riskFilter]);

  const activeId = hoveredId ?? selectedId;
  const activeItem = useMemo(
    () => plottedItems.find((p) => p.id === activeId) ?? null,
    [plottedItems, activeId]
  );

  const paraPath = useMemo(() => coordsToPath(PARA_BORDER_COORDS, true), []);
  const marajoPath = useMemo(() => coordsToPath(MARAJO_COORDS, true), []);
  const dividerPaths = useMemo(
    () => MESOREGION_DIVIDERS.map((line) => coordsToPath(line, false)),
    []
  );

  // Contour groups:
  // Outer cool band (Azul Claro: #38BDF8) covers all azul-claro & azul-escuro points
  const azulClaroPoints = plottedItems.filter(
    (p) => p.band === 'azul-claro' || p.band === 'azul-escuro'
  );
  // Inner cold/heavy-rain core (Azul Escuro: #1D4ED8)
  const azulEscuroPoints = plottedItems.filter((p) => p.band === 'azul-escuro');

  // Outer warm band (Laranja: #F97316) covers all laranja & vermelho points
  const laranjaPoints = plottedItems.filter(
    (p) => p.band === 'laranja' || p.band === 'vermelho'
  );
  // Inner extreme-heat core (Vermelho: #DC2626)
  const vermelhoPoints = plottedItems.filter((p) => p.band === 'vermelho');

  const hydroCount = municipalities.filter((m) => m.tipoRisco === 'hidrico').length;
  const thermalCount = municipalities.filter((m) => m.tipoRisco === 'termico').length;

  return (
    <section
      id="mapa-para"
      className="bg-white border border-[#D5E2F4] shadow-2xs rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#E3ECF8] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#002661]">
            Mapa Térmico e Pluviométrico · Estado do Pará
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Quanto mais vermelho, maior o calor/queimada; quanto mais azul, mais frio/chuva intensa
          </p>
        </div>

        {/* Interactive Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-[#EBF2FC] border border-[#D5E2F4] rounded-lg">
          <button
            type="button"
            onClick={() => onRiskFilterChange('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              riskFilter === 'all'
                ? 'bg-[#0046AD] text-white shadow-xs'
                : 'text-[#003585] hover:bg-white/70'
            }`}
          >
            Todos ({municipalities.length})
          </button>
          <button
            type="button"
            onClick={() => onRiskFilterChange('hidrico')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              riskFilter === 'hidrico'
                ? 'bg-[#0046AD] text-white shadow-xs'
                : 'text-[#003585] hover:bg-white/70'
            }`}
          >
            Enchentes ({hydroCount})
          </button>
          <button
            type="button"
            onClick={() => onRiskFilterChange('termico')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              riskFilter === 'termico'
                ? 'bg-[#0046AD] text-white shadow-xs'
                : 'text-[#003585] hover:bg-white/70'
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
            id="para-risk-map-svg"
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            className="w-full h-auto max-h-[440px] block select-none"
            role="img"
            aria-label="Mapa de manchas térmicas e pluviométricas do Estado do Pará"
          >
            <defs>
              {/* Clip to Pará mainland + Marajó Island */}
              <clipPath id="para-territory-clip">
                <path d={paraPath} />
                <path d={marajoPath} />
              </clipPath>

              {/* Smooth organic isopleth contour filter (merges nearby zones cleanly) */}
              <filter id="isopleth-contour" x="-25%" y="-25%" width="150%" height="150%">
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
            <g clipPath="url(#para-territory-clip)">
              {/* Neutral light-gray landmass base (matching reference map) */}
              <rect x="0" y="0" width={SVG_WIDTH} height={SVG_HEIGHT} fill="#D4D4D8" />

              {/* 1. Azul Claro (Frio ameno / Chuva moderada) */}
              {azulClaroPoints.length > 0 && (
                <g filter="url(#isopleth-contour)">
                  {azulClaroPoints.map((pt) => (
                    <circle
                      key={`ac-${pt.id}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={68}
                      fill="#38BDF8"
                    />
                  ))}
                </g>
              )}

              {/* 2. Azul Escuro (Mais frio / Chuva intensa e alagamentos) */}
              {azulEscuroPoints.length > 0 && (
                <g filter="url(#isopleth-contour)">
                  {azulEscuroPoints.map((pt) => (
                    <circle
                      key={`ae-${pt.id}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={40}
                      fill="#1D4ED8"
                    />
                  ))}
                </g>
              )}

              {/* 3. Laranja (Calor moderado / Atenção térmica) */}
              {laranjaPoints.length > 0 && (
                <g filter="url(#isopleth-contour)">
                  {laranjaPoints.map((pt) => (
                    <circle
                      key={`la-${pt.id}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={68}
                      fill="#F97316"
                    />
                  ))}
                </g>
              )}

              {/* 4. Vermelho (Calor intenso / Queimadas críticas) */}
              {vermelhoPoints.length > 0 && (
                <g filter="url(#isopleth-contour)">
                  {vermelhoPoints.map((pt) => (
                    <circle
                      key={`vm-${pt.id}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={40}
                      fill="#DC2626"
                    />
                  ))}
                </g>
              )}

              {/* Crisp White Internal Mesoregion Borders */}
              <g fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round">
                {dividerPaths.map((d, idx) => (
                  <path key={`div-${idx}`} d={d} />
                ))}
              </g>
            </g>

            {/* Crisp White Outer Territory Borders */}
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

            {/* Interactive City Points & Clean Labels */}
            {plottedItems.map((item) => {
              const isCritical =
                item.id === mostCriticalHydroId || item.id === mostCriticalThermalId;
              const isSelected = item.id === activeId;

              return (
                <g
                  key={item.id}
                  transform={`translate(${item.x}, ${item.y})`}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() =>
                    onSelectMunicipality(selectedId === item.id ? null : item.id)
                  }
                >
                  {/* Hit target */}
                  <circle r={14} fill="transparent" />

                  {/* Subtle dark/white pin dot */}
                  <circle
                    r={isSelected ? 5.5 : isCritical ? 4.5 : 3.2}
                    fill="#18181B"
                    stroke="#FFFFFF"
                    strokeWidth="1.5"
                  />

                  {/* City name label */}
                  {(isCritical || isSelected || plottedItems.length <= 12) && (
                    <text
                      x={0}
                      y={-9}
                      textAnchor="middle"
                      fontSize={isCritical || isSelected ? '11' : '9.5'}
                      fontWeight={isCritical || isSelected ? '700' : '600'}
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fill="#18181B"
                      stroke="#FFFFFF"
                      strokeWidth="3"
                      paintOrder="stroke"
                    >
                      {item.municipio}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* 4-Color Thermal/Pluvial Legend & Active Point Inspector */}
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

          {/* Selected / Hovered Municipality Detail */}
          {activeItem ? (
            <div className="flex items-center gap-2.5 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
              <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <div className="flex flex-wrap items-center gap-2">
                <strong className="font-semibold text-slate-900">
                  {activeItem.municipio}
                </strong>
                {activeItem.dre && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-600">{activeItem.dre}</span>
                  </>
                )}
                <span className="text-slate-300">·</span>
                {activeItem.tipoRisco === 'hidrico' ? (
                  <span className="inline-flex items-center gap-1 font-medium text-blue-700 font-mono tabular-nums">
                    <CloudRain className="w-3.5 h-3.5" />
                    <span>
                      {activeItem.chuvaAcumuladaMm ?? 0} mm |{' '}
                      {activeItem.pico24hMm ?? 0} mm/24h
                      {activeItem.anomaliaChuvaMm !== undefined
                        ? activeItem.anomaliaChuvaMm > 0
                          ? ` (+${activeItem.anomaliaChuvaMm} mm${
                              activeItem.anomaliaChuvaPct !== undefined &&
                              activeItem.anomaliaChuvaPct > 0
                                ? ` / +${activeItem.anomaliaChuvaPct}%`
                                : ''
                            } mais chuvoso que anos anteriores)`
                          : activeItem.anomaliaChuvaMm < 0
                            ? ` (${activeItem.anomaliaChuvaMm} mm menos chuvoso que anos anteriores)`
                            : ' (na média histórica de chuva)'
                        : ''}
                      {activeItem.anomaliaTempC !== undefined &&
                      activeItem.anomaliaTempC !== 0
                        ? activeItem.anomaliaTempC > 0
                          ? ` · +${activeItem.anomaliaTempC.toFixed(1).replace('.', ',')} °C mais quente`
                          : ` · ${activeItem.anomaliaTempC.toFixed(1).replace('.', ',')} °C mais ameno`
                        : ''}
                    </span>
                  </span>
                ) : activeItem.tipoRisco === 'termico' ? (
                  <span className="inline-flex items-center gap-1 font-medium text-red-700 font-mono tabular-nums">
                    <Flame className="w-3.5 h-3.5" />
                    <span>
                      {(activeItem.tempMaximaC ?? 0).toFixed(1).replace('.', ',')} °C
                      {activeItem.anomaliaTempC !== undefined
                        ? activeItem.anomaliaTempC > 0
                          ? ` (+${activeItem.anomaliaTempC.toFixed(1).replace('.', ',')} °C mais quente que anos anteriores)`
                          : activeItem.anomaliaTempC < 0
                            ? ` (${activeItem.anomaliaTempC.toFixed(1).replace('.', ',')} °C mais ameno que anos anteriores)`
                            : ' (na média histórica de temp.)'
                        : ''}
                      {activeItem.anomaliaChuvaMm !== undefined &&
                      activeItem.anomaliaChuvaMm !== 0
                        ? activeItem.anomaliaChuvaMm < 0
                          ? ` · ${activeItem.anomaliaChuvaMm} mm menos chuvoso`
                          : ` · +${activeItem.anomaliaChuvaMm} mm mais chuvoso`
                        : ''}{' '}
                      | {activeItem.diasEstiagem ?? 0}d secos
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-medium text-slate-600 font-mono tabular-nums">
                    <span>
                      Condição Normal · {(activeItem.tempMaximaC ?? 0).toFixed(1).replace('.', ',')} °C |{' '}
                      {activeItem.chuvaAcumuladaMm ?? 0} mm
                    </span>
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              Passe o cursor sobre um município no mapa para ver os dados
            </p>
          )}
        </div>
      </div>
    </section>
  );
};
