export type RiskType = 'hidrico' | 'termico' | 'normal';

export type BandeiraLevel = 'verde' | 'amarela' | 'vermelha';

export type SmokeAirRiskLevel = 'baixo' | 'moderado' | 'alto' | 'critico';

export interface MunicipalityRisk {
  id: string;
  municipio: string;
  dre?: string;
  tipoRisco: RiskType;
  /** Classificação oficial pelo Sistema de Bandeiramento SEDUC/PA */
  bandeira?: BandeiraLevel;
  /** Status de transição/vigilância de 48h para amortecer variações bruscas */
  statusTransicao?: 'em-vigilancia' | 'estavel';
  /** Bandeira registrada nas últimas 24h/48h para histórico de acompanhamento */
  bandeiraAnterior?: BandeiraLevel;
  /** Risco estimado de fumaça / qualidade do ar e redução hídrica (Protocolo El Niño) */
  riscoFumacaAr?: SmokeAirRiskLevel;
  /** Acumulado semanal previsto em mm (para risco hídrico) */
  chuvaAcumuladaMm?: number;
  /** Pico máximo em 24h previsto em mm (para risco hídrico) */
  pico24hMm?: number;
  /** Temperatura máxima prevista em °C (para risco térmico/seca) */
  tempMaximaC?: number;
  /** Dias consecutivos sem chuva / estiagem (para risco térmico/seca) */
  diasEstiagem?: number;
  /** Latitude geográfica */
  lat?: number;
  /** Longitude geográfica */
  lon?: number;
  /** Média histórica (5 anos) da temperatura máxima para o mesmo período (°C) */
  historicoTempMediaC?: number;
  /** Média histórica (5 anos) do acumulado de chuva para o mesmo período (mm) */
  historicoChuvaMediaMm?: number;
  /** Diferença de temperatura em relação à média dos últimos 5 anos (°C) */
  anomaliaTempC?: number;
  /** Diferença de precipitação em relação à média dos últimos 5 anos (mm) */
  anomaliaChuvaMm?: number;
  /** Diferença percentual de precipitação em relação à média dos últimos 5 anos (%) */
  anomaliaChuvaPct?: number;
}

export interface DirectiveOption {
  id: string;
  category: 'hidrico' | 'termico' | 'geral';
  bandeira?: BandeiraLevel;
  text: string;
  selected: boolean;
}

export interface PresetScenario {
  id: string;
  label: string;
  periodLabel: string;
  municipalities: Omit<MunicipalityRisk, 'id'>[];
}
