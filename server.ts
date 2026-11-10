import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import {
  PARA_MUNICIPALITIES_CATALOG,
  type ParaRegion,
} from './src/data/paraMunicipalities.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));

interface OpenMeteoDaily {
  time: string[];
  precipitation_sum: (number | null)[];
  temperature_2m_max: (number | null)[];
}

interface OpenMeteoResponse {
  daily?: OpenMeteoDaily;
}

interface HistoricalBaseline {
  historicoTempMediaC: number;
  historicoChuvaMediaMm: number;
}

const historicalCache = new Map<
  string,
  { data: Map<string, HistoricalBaseline>; expiresAt: number }
>();

async function fetchHistoricalBaselines(
  coords: { lat: number; lon: number }[],
  forecastDates: string[]
): Promise<Map<string, HistoricalBaseline>> {
  const result = new Map<string, HistoricalBaseline>();
  if (coords.length === 0 || forecastDates.length === 0) return result;

  try {
    const firstDate = forecastDates[0]; // YYYY-MM-DD
    const lastDate = forecastDates[forecastDates.length - 1];
    const currentYear = Number(firstDate.slice(0, 4));
    const startYear = currentYear - 5;
    const endYear = currentYear - 1;

    const mmddSet = new Set(forecastDates.map((d) => d.slice(5))); // MM-DD
    const startMmDd = firstDate.slice(5);
    const endMmDd = lastDate.slice(5);
    const cacheKey = `${startYear}-${endYear}:${startMmDd}:${endMmDd}:${coords.length}`;

    const cached = historicalCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const startDate = `${startYear}-${startMmDd}`;
    const endDate = `${endYear}-${endMmDd}`;

    // Query in chunks of 72 coordinates using fast Open-Meteo Climate API
    const CHUNK_SIZE = 72;
    const chunks: { lat: number; lon: number }[][] = [];
    for (let i = 0; i < coords.length; i += CHUNK_SIZE) {
      chunks.push(coords.slice(i, i + CHUNK_SIZE));
    }

    const chunkResponses = await Promise.all(
      chunks.map(async (chunk) => {
        const lats = chunk.map((c) => c.lat).join(',');
        const lons = chunk.map((c) => c.lon).join(',');
        const url = `https://climate-api.open-meteo.com/v1/climate?latitude=${lats}&longitude=${lons}&start_date=${startDate}&end_date=${endDate}&models=EC_Earth3P_HR&daily=precipitation_sum,temperature_2m_max`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const json = await res.json();
        return (Array.isArray(json) ? json : [json]) as OpenMeteoResponse[];
      })
    );

    const flatResponses = chunkResponses.flat();

    coords.forEach((coord, idx) => {
      const daily = flatResponses[idx]?.daily;
      if (!daily || !daily.time) return;

      const byYear = new Map<string, { precipSum: number; tempMax: number }>();

      daily.time.forEach((dateStr, dIdx) => {
        const mmdd = dateStr.slice(5);
        if (!mmddSet.has(mmdd)) return;
        const yr = dateStr.slice(0, 4);
        const p = daily.precipitation_sum?.[dIdx] ?? 0;
        const t = daily.temperature_2m_max?.[dIdx] ?? 30;

        const prev = byYear.get(yr) ?? { precipSum: 0, tempMax: -99 };
        byYear.set(yr, {
          precipSum: prev.precipSum + p,
          tempMax: Math.max(prev.tempMax, t),
        });
      });

      const years = Array.from(byYear.values());
      if (years.length > 0) {
        const avgPrecip = Math.round(
          years.reduce((acc, y) => acc + y.precipSum, 0) / years.length
        );
        const avgTemp = Number(
          (years.reduce((acc, y) => acc + y.tempMax, 0) / years.length).toFixed(1)
        );
        result.set(`${coord.lat.toFixed(4)},${coord.lon.toFixed(4)}`, {
          historicoTempMediaC: avgTemp,
          historicoChuvaMediaMm: avgPrecip,
        });
      }
    });

    historicalCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
  } catch {
    // Graceful fallback if archive API is temporarily unreachable
  }

  return result;
}

function computeRiskFromDaily(
  municipio: string,
  dre: string | undefined,
  daily: OpenMeteoDaily,
  idPrefix: string,
  lat?: number,
  lon?: number,
  baseline?: HistoricalBaseline
) {
  const precipAll = daily.precipitation_sum ?? [];
  const tempAll = daily.temperature_2m_max ?? [];

  // past_days=14 + forecast_days=7 => last 7 entries are the 7-day forecast
  const forecastStart = Math.max(0, precipAll.length - 7);
  const forecastPrecip = precipAll.slice(forecastStart).map((v) => v ?? 0);
  const forecastTemp = tempAll.slice(forecastStart).map((v) => v ?? 30);

  const chuvaAcumuladaMm = Math.round(
    forecastPrecip.reduce((acc, val) => acc + val, 0)
  );
  const pico24hMm = Math.round(Math.max(0, ...forecastPrecip));
  const tempMaximaC = Number(Math.max(0, ...forecastTemp).toFixed(1));

  // Count consecutive dry days (< 1.0mm) across the 21-day window
  let maxDryStreak = 0;
  let currentStreak = 0;
  for (const p of precipAll) {
    if ((p ?? 0) < 1.0) {
      currentStreak += 1;
      if (currentStreak > maxDryStreak) maxDryStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
  }

  const historicoTempMediaC = baseline?.historicoTempMediaC;
  const historicoChuvaMediaMm = baseline?.historicoChuvaMediaMm;
  const anomaliaTempC =
    historicoTempMediaC !== undefined
      ? Number((tempMaximaC - historicoTempMediaC).toFixed(1))
      : undefined;
  const anomaliaChuvaMm =
    historicoChuvaMediaMm !== undefined
      ? Math.round(chuvaAcumuladaMm - historicoChuvaMediaMm)
      : undefined;
  const anomaliaChuvaPct =
    historicoChuvaMediaMm !== undefined && historicoChuvaMediaMm >= 5
      ? Math.round(((chuvaAcumuladaMm - historicoChuvaMediaMm) / historicoChuvaMediaMm) * 100)
      : undefined;

  // Realistic INMET / Defesa Civil alert thresholds for Pará:
  // Hydro alert: >= 40mm in 24h OR >= 110mm in 7 days OR (>= 30mm/24h AND >= +50% above historical average)
  const isHydro =
    pico24hMm >= 40 ||
    chuvaAcumuladaMm >= 110 ||
    (pico24hMm >= 30 && anomaliaChuvaPct !== undefined && anomaliaChuvaPct >= 50);

  if (isHydro) {
    const bandeira =
      pico24hMm >= 55 ||
      chuvaAcumuladaMm >= 140 ||
      (pico24hMm >= 45 && (anomaliaChuvaPct ?? 0) >= 60)
        ? ('vermelha' as const)
        : ('amarela' as const);
    return {
      id: idPrefix,
      municipio,
      dre,
      tipoRisco: 'hidrico' as const,
      bandeira,
      riscoFumacaAr: 'baixo' as const,
      chuvaAcumuladaMm,
      pico24hMm,
      tempMaximaC,
      lat,
      lon,
      historicoTempMediaC,
      historicoChuvaMediaMm,
      anomaliaTempC,
      anomaliaChuvaMm,
      anomaliaChuvaPct,
    };
  }

  // Thermal / Wildfire alert: >= 37.5°C OR (>= 36.0°C AND >= 12 dry days) OR (>= 16 dry days AND >= 34.5°C) OR (>= +2.5°C anomaly AND >= 35.5°C)
  const isThermal =
    tempMaximaC >= 37.5 ||
    (tempMaximaC >= 36.0 && maxDryStreak >= 12) ||
    (maxDryStreak >= 16 && tempMaximaC >= 34.5) ||
    (anomaliaTempC !== undefined && anomaliaTempC >= 2.5 && tempMaximaC >= 35.5);

  if (isThermal) {
    const bandeira =
      tempMaximaC >= 38.0 ||
      (tempMaximaC >= 37.0 && maxDryStreak >= 14) ||
      maxDryStreak >= 18 ||
      ((anomaliaTempC ?? 0) >= 3.0 && tempMaximaC >= 36.5)
        ? ('vermelha' as const)
        : ('amarela' as const);
    const riscoFumacaAr =
      bandeira === 'vermelha' || maxDryStreak >= 16
        ? ('critico' as const)
        : tempMaximaC >= 36.5 || maxDryStreak >= 12
          ? ('alto' as const)
          : ('moderado' as const);
    return {
      id: idPrefix,
      municipio,
      dre,
      tipoRisco: 'termico' as const,
      bandeira,
      riscoFumacaAr,
      tempMaximaC,
      diasEstiagem: maxDryStreak,
      lat,
      lon,
      historicoTempMediaC,
      historicoChuvaMediaMm,
      anomaliaTempC,
      anomaliaChuvaMm,
      anomaliaChuvaPct,
    };
  }

  // Normal / Nominal meteorological condition (Bandeira Verde or preventive Amarela)
  const bandeira =
    tempMaximaC >= 36.2 || maxDryStreak >= 12 || pico24hMm >= 32 || chuvaAcumuladaMm >= 95
      ? ('amarela' as const)
      : ('verde' as const);
  const riscoFumacaAr =
    maxDryStreak >= 10 || tempMaximaC >= 35.5 ? ('moderado' as const) : ('baixo' as const);
  return {
    id: idPrefix,
    municipio,
    dre,
    tipoRisco: 'normal' as const,
    bandeira,
    riscoFumacaAr,
    chuvaAcumuladaMm,
    pico24hMm,
    tempMaximaC,
    diasEstiagem: maxDryStreak,
    lat,
    lon,
    historicoTempMediaC,
    historicoChuvaMediaMm,
    anomaliaTempC,
    anomaliaChuvaMm,
    anomaliaChuvaPct,
  };
}

const weatherCache = new Map<
  string,
  {
    municipalities: ReturnType<typeof computeRiskFromDaily>[];
    fetchedAt: string;
    cycleKey: string;
  }
>();

const directivesDailyCache = new Map<
  string,
  {
    directives: { id: string; category: string; text: string; selected: boolean }[];
    cycleKey: string;
  }
>();

const DAILY_SNAPSHOT_FILE = path.join(os.tmpdir(), 'ciseb-daily-snapshot.json');
const PREVIOUS_SNAPSHOT_FILE = path.join(os.tmpdir(), 'ciseb-previous-snapshot.json');

/**
 * Returns the calendar date key (YYYY-MM-DD) in America/Belem (UTC-3).
 * Used to lock updates to strictly once per day starting from the first access of the day.
 */
function getBelemDateKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Belem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function populateRegionalWeatherCaches(
  allSorted: ReturnType<typeof computeRiskFromDaily>[],
  fetchedAt: string,
  cycleKey: string
) {
  weatherCache.set('all', {
    municipalities: allSorted,
    fetchedAt,
    cycleKey,
  });

  const regionMap = new Map(
    PARA_MUNICIPALITIES_CATALOG.map((m) => [m.municipio.toLowerCase(), m.region])
  );
  const subRegions: Exclude<ParaRegion, 'all'>[] = [
    'metropolitana-nordeste',
    'sul-sudeste',
    'oeste-baixo-amazonas',
  ];
  for (const sub of subRegions) {
    weatherCache.set(sub, {
      municipalities: allSorted.filter(
        (m) => regionMap.get(m.municipio.toLowerCase()) === sub
      ),
      fetchedAt,
      cycleKey,
    });
  }
}

function saveDailySnapshotToDisk() {
  try {
    const currentCycleKey = getBelemDateKey();
    const allEntry = weatherCache.get('all');
    if (!allEntry || allEntry.cycleKey !== currentCycleKey) return;
    const dirEntry = directivesDailyCache.get(currentCycleKey);

    // If a snapshot file exists from a previous cycle, preserve it as PREVIOUS_SNAPSHOT_FILE for 48h transitions
    if (fs.existsSync(DAILY_SNAPSHOT_FILE)) {
      try {
        const oldContent = fs.readFileSync(DAILY_SNAPSHOT_FILE, 'utf-8');
        const oldParsed = JSON.parse(oldContent);
        if (oldParsed?.cycleKey && oldParsed.cycleKey !== currentCycleKey) {
          fs.writeFileSync(PREVIOUS_SNAPSHOT_FILE, oldContent, 'utf-8');
        }
      } catch {
        // Ignore read/write errors on previous snapshot
      }
    }

    const payload = {
      cycleKey: currentCycleKey,
      fetchedAt: allEntry.fetchedAt,
      municipalities: allEntry.municipalities,
      directives: dirEntry?.directives ?? null,
    };
    fs.writeFileSync(DAILY_SNAPSHOT_FILE, JSON.stringify(payload), 'utf-8');
  } catch {
    // Ignore transient disk write errors
  }
}

function getPreviousCycleBandeiraMap(): Map<string, 'verde' | 'amarela' | 'vermelha'> {
  const map = new Map<string, 'verde' | 'amarela' | 'vermelha'>();
  try {
    let raw = null;
    if (fs.existsSync(PREVIOUS_SNAPSHOT_FILE)) {
      raw = JSON.parse(fs.readFileSync(PREVIOUS_SNAPSHOT_FILE, 'utf-8'));
    } else if (fs.existsSync(DAILY_SNAPSHOT_FILE)) {
      const candidate = JSON.parse(fs.readFileSync(DAILY_SNAPSHOT_FILE, 'utf-8'));
      if (candidate?.cycleKey !== getBelemDateKey()) {
        raw = candidate;
      }
    }
    if (raw && Array.isArray(raw.municipalities)) {
      for (const m of raw.municipalities) {
        if (m?.municipio && m?.bandeira) {
          map.set(m.municipio.toLowerCase(), m.bandeira);
        }
      }
    }
  } catch {
    // Ignore fallback errors
  }
  return map;
}

function loadDailySnapshotFromDisk() {
  try {
    if (!fs.existsSync(DAILY_SNAPSHOT_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(DAILY_SNAPSHOT_FILE, 'utf-8'));
    const currentCycleKey = getBelemDateKey();
    if (
      raw &&
      raw.cycleKey === currentCycleKey &&
      Array.isArray(raw.municipalities) &&
      raw.municipalities.length > 0
    ) {
      populateRegionalWeatherCaches(
        raw.municipalities,
        String(raw.fetchedAt || new Date().toISOString()),
        currentCycleKey
      );
      if (Array.isArray(raw.directives) && raw.directives.length > 0) {
        directivesDailyCache.set(currentCycleKey, {
          directives: raw.directives,
          cycleKey: currentCycleKey,
        });
      }
    }
  } catch {
    // Ignore corrupt or missing cache file
  }
}

let inFlightDailyWeatherPromise: Promise<void> | null = null;

async function fetchAndCacheRegionWeather(regionParam: ParaRegion) {
  const candidates =
    regionParam === 'all'
      ? PARA_MUNICIPALITIES_CATALOG
      : PARA_MUNICIPALITIES_CATALOG.filter((m) => m.region === regionParam);

  if (candidates.length === 0) {
    throw new Error('Região inválida.');
  }

  // Split into chunks of 72 coordinates for fast parallel Open-Meteo batch requests
  const CHUNK_SIZE = 72;
  const chunks: typeof candidates[] = [];
  for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
    chunks.push(candidates.slice(i, i + CHUNK_SIZE));
  }

  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      const latitudes = chunk.map((c) => c.lat).join(',');
      const longitudes = chunk.map((c) => c.lon).join(',');
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitudes}&longitude=${longitudes}&daily=precipitation_sum,temperature_2m_max&timezone=America%2FBelem&past_days=14&forecast_days=7`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Open-Meteo retornou status ${response.status}`);
      }
      const rawData = await response.json();
      return (Array.isArray(rawData) ? rawData : [rawData]) as OpenMeteoResponse[];
    })
  );

  const resultsArray = chunkResults.flat();

  // Extract the 7 forecast dates (last 7 entries of daily.time)
  const sampleTimes = resultsArray[0]?.daily?.time ?? [];
  const forecastDates = sampleTimes.slice(Math.max(0, sampleTimes.length - 7));

  const baselines = await fetchHistoricalBaselines(
    candidates.map((c) => ({ lat: c.lat, lon: c.lon })),
    forecastDates
  );

  const previousBandeiraMap = getPreviousCycleBandeiraMap();

  const computed = candidates
    .map((item, idx) => {
      const daily = resultsArray[idx]?.daily;
      if (!daily) return null;
      const baseline = baselines.get(`${item.lat.toFixed(4)},${item.lon.toFixed(4)}`);
      const baseResult = computeRiskFromDaily(
        item.municipio,
        item.dre,
        daily,
        `real-${item.municipio.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
        item.lat,
        item.lon,
        baseline
      );

      // Amortecimento de 48h (Anti-Efeito Gangorra) para desescalada de Bandeira Vermelha
      const prevBandeira = previousBandeiraMap.get(item.municipio.toLowerCase());
      let finalBandeira = baseResult.bandeira;
      let statusTransicao: 'em-vigilancia' | 'estavel' = 'estavel';

      if (prevBandeira === 'vermelha' && baseResult.bandeira !== 'vermelha') {
        // Se esteve em Bandeira Vermelha nas últimas 24/48h e hoje desescalou,
        // mantém em estado de alerta e vigilância transitória (Bandeira Amarela em Vigilância)
        finalBandeira = 'amarela';
        statusTransicao = 'em-vigilancia';
      }

      return {
        ...baseResult,
        bandeira: finalBandeira,
        bandeiraAnterior: prevBandeira,
        statusTransicao,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Rank by severity: hydro by pico24hMm/chuvaAcumuladaMm, thermal by tempMaximaC/diasEstiagem
  const hydro = computed
    .filter((c) => c.tipoRisco === 'hidrico')
    .sort(
      (a, b) =>
        (b.pico24hMm ?? 0) - (a.pico24hMm ?? 0) ||
        (b.chuvaAcumuladaMm ?? 0) - (a.chuvaAcumuladaMm ?? 0)
    );

  const thermal = computed
    .filter((c) => c.tipoRisco === 'termico')
    .sort(
      (a, b) =>
        (b.tempMaximaC ?? 0) - (a.tempMaximaC ?? 0) ||
        (b.diasEstiagem ?? 0) - (a.diasEstiagem ?? 0)
    );

  const normal = computed
    .filter((c) => c.tipoRisco === 'normal')
    .sort((a, b) => a.municipio.localeCompare(b.municipio, 'pt-BR'));

  const allSorted = [...hydro, ...thermal, ...normal];
  const fetchedAt = new Date().toISOString();
  const cycleKey = getBelemDateKey();

  if (regionParam === 'all') {
    populateRegionalWeatherCaches(allSorted, fetchedAt, cycleKey);
    saveDailySnapshotToDisk();
  } else {
    weatherCache.set(regionParam, {
      municipalities: allSorted,
      fetchedAt,
      cycleKey,
    });
  }

  return weatherCache.get(regionParam)!;
}

app.get('/api/weather/para', async (req, res) => {
  try {
    const regionParam = (String(req.query.region || 'all') as ParaRegion) || 'all';
    const validRegion =
      regionParam === 'all' ||
      PARA_MUNICIPALITIES_CATALOG.some((m) => m.region === regionParam);
    if (!validRegion) {
      res.status(400).json({ error: 'Região inválida.' });
      return;
    }

    const currentCycleKey = getBelemDateKey();
    let cached = weatherCache.get(regionParam);
    if (!cached || cached.cycleKey !== currentCycleKey) {
      loadDailySnapshotFromDisk();
      cached = weatherCache.get(regionParam);
    }

    // Strictly one update per day starting from the first access of the day:
    // if today's snapshot already exists, return it immediately without calling external APIs.
    if (cached && cached.cycleKey === currentCycleKey) {
      res.json({
        municipalities: cached.municipalities,
        fetchedAt: cached.fetchedAt,
        cycleKey: cached.cycleKey,
        source: 'Open-Meteo (ECMWF / NOAA / INMET) · Atualização Única no 1º Acesso do Dia',
      });
      return;
    }

    // First access of the day: deduplicate concurrent requests and fetch 'all' once
    if (!inFlightDailyWeatherPromise) {
      inFlightDailyWeatherPromise = fetchAndCacheRegionWeather('all')
        .then(() => {})
        .finally(() => {
          inFlightDailyWeatherPromise = null;
        });
    }
    await inFlightDailyWeatherPromise;

    const fresh = weatherCache.get(regionParam)!;
    res.json({
      municipalities: fresh.municipalities,
      fetchedAt: fresh.fetchedAt,
      cycleKey: fresh.cycleKey,
      source: 'Open-Meteo Forecast + Histórico 5 anos · Atualização Única no 1º Acesso do Dia',
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erro ao consultar previsão meteorológica real.';
    res.status(502).json({ error: message });
  }
});

app.get('/api/weather/municipality', async (req, res) => {
  try {
    const name = String(req.query.name || '').trim();
    if (!name) {
      res.status(400).json({ error: 'Informe o nome do município.' });
      return;
    }

    const catalogMatch = PARA_MUNICIPALITIES_CATALOG.find(
      (c) => c.municipio.toLowerCase() === name.toLowerCase()
    );

    let lat: number;
    let lon: number;
    let resolvedName = name;
    let dre = catalogMatch?.dre;

    if (catalogMatch) {
      lat = catalogMatch.lat;
      lon = catalogMatch.lon;
      resolvedName = catalogMatch.municipio;
    } else {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        name
      )}&count=5&language=pt&format=json`;
      const geoRes = await fetch(geoUrl);
      if (!geoRes.ok) {
        throw new Error('Falha ao localizar coordenadas do município.');
      }
      const geoJson = await geoRes.json();
      const results = Array.isArray(geoJson.results) ? geoJson.results : [];
      const paraMatch =
        results.find(
          (r: { country_code?: string; admin1?: string }) =>
            r.country_code === 'BR' &&
            (r.admin1?.toLowerCase().includes('pará') ||
              r.admin1?.toLowerCase().includes('para'))
        ) ||
        results.find((r: { country_code?: string }) => r.country_code === 'BR');

      if (!paraMatch) {
        res.status(404).json({ error: `Município "${name}" não encontrado no Pará.` });
        return;
      }

      lat = paraMatch.latitude;
      lon = paraMatch.longitude;
      resolvedName = paraMatch.name;
    }

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_sum,temperature_2m_max&timezone=America%2FBelem&past_days=14&forecast_days=7`;
    const weatherRes = await fetch(weatherUrl);
    if (!weatherRes.ok) {
      throw new Error('Falha ao obter previsão meteorológica para o município.');
    }
    const weatherJson: OpenMeteoResponse = await weatherRes.json();
    if (!weatherJson.daily) {
      throw new Error('Dados diários indisponíveis para este município.');
    }

    const item = computeRiskFromDaily(
      resolvedName,
      dre,
      weatherJson.daily,
      `mun-${Date.now()}`,
      lat,
      lon
    );

    res.json({
      municipality: item,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erro ao buscar previsão do município.';
    res.status(500).json({ error: message });
  }
});

function getOptionalGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const SEDUC_SYSTEM_INSTRUCTION = `Você é o Assistente Especialista do Comitê de Crise para Gestão e Resposta aos Efeitos do El Niño nas Escolas Públicas do Estado do Pará (SEDUC-PA & BID · Nota Técnica nº 987/2026 CEMADEN).

Sua função é receber uma lista estruturada contendo até 20 municípios paraenses com previsão de risco meteorológico e classificação de Bandeiramento (Verde, Amarela, Vermelha) para os próximos 7 dias e redigir um Boletim Preditivo Semanal conciso, formal e acionável para o Telegram, direcionado aos Diretores Escolares e Dirigentes Regionais de Ensino (DREs).

Regras de Resposta:
1. Comece diretamente com o cabeçalho oficial:
   🚨 *ALERTA PREDITIVO SEMANAL: VIGILÂNCIA METEOROLÓGICA (SEDUC/PA)*
   _Protocolo de Gestão e Resposta aos Efeitos do El Niño · Nota Técnica nº 987/2026 CEMADEN_

2. Apresente o Resumo do Bandeiramento Estadual (🔴 Bandeira Vermelha | 🟡 Bandeira Amarela | 🟢 Bandeira Verde) e o resumo quantitativo por ameaça.

3. Divida estritamente os municípios em dois blocos:
   - 🌧️ *RISCO DE ALAGAMENTOS E ENXURRADAS* (ordenado pelo maior acumulado ou pico em 24h).
   - 🔥 *RISCO DE QUEIMADAS, FUMAÇA E ESTIAGEM (EL NIÑO)* (ordenado pela maior temperatura e estiagem).
   Para cada município, cite o nome em negrito, a bandeira correspondente ([Bandeira Vermelha] ou [Bandeira Amarela]), as métricas essenciais (chuva em mm ou temp. máxima em °C) e a anomalia em relação à média histórica de 5 anos.

4. Finalize com a seção de ações imediatas segundo o Fluxo de Ação por Bandeiramento:
   📋 *FLUXO DE AÇÃO POR BANDEIRAMENTO (PROTOCOLO SEDUC/PA):*
   Forneça exatamente 4 diretrizes práticas e operacionais citando os instrumentos do protocolo (envio do Memorando Anexo I à DRE, monitoramento de qualidade do ar/fumaça e reservatórios de água, organização de cadernos de atividades complementares e mobilização do CEMEP "Aluno sem aula zero" / Protocolo de Apoio Psicossocial em caso de Bandeira Vermelha).

5. Formatação:
   - Use formatação Markdown compatível com Telegram (*negrito*, _itálico_).
   - Não inclua introduções conversacionais nem encerramentos genéricos.`;

function selectTop20Balanced(items: any[]) {
  const hydro = items
    .filter((m) => m.tipoRisco === 'hidrico')
    .sort(
      (a, b) =>
        (b.pico24hMm ?? 0) - (a.pico24hMm ?? 0) ||
        (b.chuvaAcumuladaMm ?? 0) - (a.chuvaAcumuladaMm ?? 0)
    );
  const thermal = items
    .filter((m) => m.tipoRisco === 'termico')
    .sort(
      (a, b) =>
        (b.tempMaximaC ?? 0) - (a.tempMaximaC ?? 0) ||
        (b.diasEstiagem ?? 0) - (a.diasEstiagem ?? 0)
    );
  const topH = hydro.slice(0, 10);
  const topT = thermal.slice(0, 20 - topH.length);
  if (topH.length + topT.length < 20 && hydro.length > 10) {
    topH.push(...hydro.slice(10, 10 + (20 - topH.length - topT.length)));
  }
  return [...topH, ...topT];
}

app.post('/api/generate-bulletin', async (req, res) => {
  try {
    const { municipalities, directives } = req.body;
    if (!Array.isArray(municipalities) || municipalities.length === 0) {
      res.status(400).json({ error: 'Forneça ao menos 1 município para gerar o boletim.' });
      return;
    }

    const ai = getOptionalGeminiClient();
    const limited = selectTop20Balanced(municipalities);

    if (ai) {
      try {
        const promptPayload = JSON.stringify(
          {
            municipios: limited,
            diretrizes_preferenciais: Array.isArray(directives) ? directives : [],
          },
          null,
          2
        );

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `Gere o Boletim Preditivo Semanal para o Telegram com base nos seguintes dados meteorológicos dos municípios do Pará:\n\n${promptPayload}`,
          config: {
            systemInstruction: SEDUC_SYSTEM_INSTRUCTION,
          },
        });

        const text = response.text?.trim();
        if (text) {
          res.json({ bulletin: text });
          return;
        }
      } catch {
        // Fallback to structured Civil Defense formatter if Gemini key is unavailable/quota-limited
      }
    }

    const hydro = limited.filter((m) => m.tipoRisco === 'hidrico');
    const thermal = limited.filter((m) => m.tipoRisco === 'termico');
    const lines: string[] = [
      '🚨 *ALERTA PREDITIVO SEMANAL: VIGILÂNCIA METEOROLÓGICA (SEDUC/PA)*',
      '_Boletim Executivo de Contingência Escolar · Próximos 7 Dias_',
      '',
      `${hydro.length} municípios em alerta hídrico | ${thermal.length} municípios em alerta térmico/seca`,
      '',
      '🌧️ *RISCO DE ALAGAMENTOS E ENXURRADAS*',
    ];
    if (hydro.length === 0) {
      lines.push('_Nenhum município em alerta hídrico para o período._');
    } else {
      hydro.forEach((m, idx) => {
        const prefix = idx === 0 ? '🔴' : '•';
        const anom =
          typeof m.anomaliaChuvaMm === 'number' && m.anomaliaChuvaMm > 0
            ? ` (+${m.anomaliaChuvaMm} mm mais chuvoso que anos anteriores)`
            : '';
        lines.push(
          `${prefix} *${m.municipio}* — Acumulado: ${m.chuvaAcumuladaMm ?? 0} mm${anom} | Pico 24h: ${m.pico24hMm ?? 0} mm`
        );
      });
    }
    lines.push('', '🔥 *RISCO DE QUEIMADAS E ESTIAGEM SEVERA*');
    if (thermal.length === 0) {
      lines.push('_Nenhum município em alerta térmico/seca para o período._');
    } else {
      thermal.forEach((m, idx) => {
        const prefix = idx === 0 ? '🔴' : '•';
        const anom =
          typeof m.anomaliaTempC === 'number' && m.anomaliaTempC > 0
            ? ` (+${m.anomaliaTempC.toFixed(1).replace('.', ',')} °C mais quente que anos anteriores)`
            : '';
        lines.push(
          `${prefix} *${m.municipio}* — Máx: ${(m.tempMaximaC ?? 0).toFixed(1).replace('.', ',')} °C${anom} | ${m.diasEstiagem ?? 0} dias sem chuva`
        );
      });
    }
    const dirs = Array.isArray(directives) && directives.length > 0 ? directives.slice(0, 4) : [];
    if (dirs.length > 0) {
      lines.push('', '📋 *AÇÕES PREVENTIVAS RECOMENDADAS PARA A SEMANA:*');
      dirs.forEach((d: string, i: number) => lines.push(`${i + 1}. ${d}`));
    }

    res.json({ bulletin: lines.join('\n') });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao gerar boletim.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/analyze-directives', async (req, res) => {
  try {
    const { municipalities } = req.body;
    if (!Array.isArray(municipalities) || municipalities.length === 0) {
      res.status(400).json({ error: 'Forneça ao menos 1 município para analisar.' });
      return;
    }

    const currentCycleKey = getBelemDateKey();
    let cached = directivesDailyCache.get(currentCycleKey);
    if (!cached || cached.cycleKey !== currentCycleKey) {
      loadDailySnapshotFromDisk();
      cached = directivesDailyCache.get(currentCycleKey);
    }
    if (cached && cached.cycleKey === currentCycleKey) {
      res.json({ directives: cached.directives, cycleKey: currentCycleKey });
      return;
    }

    const ai = getOptionalGeminiClient();
    if (!ai) {
      res.json({ directives: [] });
      return;
    }
    const limited = selectTop20Balanced(municipalities);
    const analysisPayload =
      limited.length > 0
        ? limited
        : municipalities.slice(0, 10).map((m) => ({
            municipio: m.municipio,
            dre: m.dre,
            tipoRisco: m.tipoRisco,
            tempMaximaC: m.tempMaximaC,
            chuvaAcumuladaMm: m.chuvaAcumuladaMm,
          }));

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Você é o Especialista em Gestão de Risco e Defesa Civil Escolar da SEDUC-PA.
Analise os dados meteorológicos reais dos próximos 7 dias e a comparação histórica de 5 anos para os municípios do Pará listados abaixo e recomende exatamente 4 ações preventivas práticas, específicas e operacionais para os Diretores Escolares e Dirigentes Regionais de Ensino (DREs), seguindo rigorosamente as orientações oficiais da Defesa Civil (CEDEC-PA, CEMADEN, INMET e Corpo de Bombeiros).

Regras obrigatórias:
- As ações devem refletir diretamente a gravidade, as anomalias históricas e o tipo de risco predominante nos dados:
  * Se houver risco hídrico (picos de chuva >= 40mm/24h ou acumulado >= 110mm): recomende elevação de equipamentos eletrônicos/prontuários, desobstrução de calhas/drenagem, verificação da rede elétrica e monitoramento de rotas de transporte escolar terrestre/fluvial conforme protocolos da Defesa Civil.
  * Se houver risco térmico/queimadas (máximas >= 37,5°C ou estiagem prolongada): recomende suspensão de atividades físicas ao ar livre entre 10h e 16h, pontos de hidratação contínua, vedação/proteção contra fumaça de queimadas para alunos com histórico respiratório e vigilância de focos de calor no entorno escolar.
  * Se os municípios estiverem em normalidade: recomende ações preventivas de prontidão da Defesa Civil Escolar (manutenção preventiva de telhados/calhas, revisão de rotas de evacuação, estoque de água potável e monitoramento contínuo dos alertas CEMADEN/INMET).
- Cite os municípios ou regiões mais críticos quando houver alerta.
- Seja direto, formal e operacional (1 frase objetiva por diretriz, sem numeração no texto).

Dados atuais:\n${JSON.stringify(analysisPayload, null, 2)}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              category: {
                type: Type.STRING,
                description: 'Deve ser "hidrico", "termico" ou "geral".',
              },
              text: {
                type: Type.STRING,
                description: 'Texto objetivo e operacional da diretriz preventiva para as escolas.',
              },
            },
            required: ['category', 'text'],
          },
        },
      },
    });

    const jsonStr = (response.text ?? '[]').trim();
    const parsed = JSON.parse(jsonStr);
    const directives = Array.isArray(parsed)
      ? parsed.slice(0, 4).map((d, idx) => ({
          id: `ai-dir-${Date.now()}-${idx}`,
          category:
            d.category === 'hidrico' || d.category === 'termico' ? d.category : 'geral',
          text: String(d.text || '').trim(),
          selected: true,
        }))
      : [];

    if (directives.length > 0) {
      directivesDailyCache.set(currentCycleKey, {
        directives,
        cycleKey: currentCycleKey,
      });
      saveDailySnapshotToDisk();
    }

    res.json({ directives, cycleKey: currentCycleKey });
  } catch {
    res.json({ directives: [] });
  }
});

const mapsGroundingCache = new Map<
  string,
  {
    summary: string;
    places: { title: string; uri: string }[];
    expiresAt: number;
  }
>();

async function fetchOpenStreetMapTerritorialData(
  municipio: string,
  dre: string | undefined,
  lat: number,
  lon: number,
  tipoRisco: string | undefined
): Promise<{ summary: string; places: { title: string; uri: string }[] }> {
  const query = `[out:json][timeout:10];
(
  node["amenity"~"school|hospital|clinic|fire_station"](around:12000,${lat},${lon});
  way["amenity"~"school|hospital|clinic|fire_station"](around:12000,${lat},${lon});
  way["highway"~"trunk|primary|secondary"](around:15000,${lat},${lon});
  way["waterway"="river"](around:15000,${lat},${lon});
);
out center 40;`;

  const resp = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  const schools: { name: string; lat: number; lon: number }[] = [];
  const support: { name: string; lat: number; lon: number }[] = [];
  const roads = new Set<string>();
  const rivers = new Set<string>();

  if (resp.ok) {
    const data = (await resp.json()) as {
      elements?: Array<{
        lat?: number;
        lon?: number;
        center?: { lat: number; lon: number };
        tags?: Record<string, string>;
      }>;
    };
    for (const el of data.elements ?? []) {
      const tags = el.tags ?? {};
      const name = tags.name;
      const elLat = el.lat ?? el.center?.lat;
      const elLon = el.lon ?? el.center?.lon;
      if (!name) continue;

      if (tags.amenity === 'school' && elLat && elLon) {
        if (!schools.some((s) => s.name === name)) {
          schools.push({ name, lat: elLat, lon: elLon });
        }
      } else if (
        (tags.amenity === 'hospital' ||
          tags.amenity === 'clinic' ||
          tags.amenity === 'fire_station') &&
        elLat &&
        elLon
      ) {
        if (!support.some((s) => s.name === name)) {
          support.push({ name, lat: elLat, lon: elLon });
        }
      } else if (tags.highway) {
        roads.add(tags.ref ? `${tags.ref} (${name})` : name);
      } else if (tags.waterway === 'river') {
        rivers.add(name);
      }
    }
  }

  const schoolNames =
    schools.length > 0
      ? schools
          .slice(0, 4)
          .map((s) => s.name)
          .join(', ')
      : `unidades escolares da sede urbana de ${municipio}`;
  const supportNames =
    support.length > 0
      ? support
          .slice(0, 3)
          .map((s) => s.name)
          .join(', ')
      : `unidades de saúde e Defesa Civil Municipal de ${municipio}`;

  const roadList = Array.from(roads).slice(0, 3);
  const riverList = Array.from(rivers).slice(0, 3);
  const routesText =
    [
      roadList.length > 0 ? `rodovias ${roadList.join(', ')}` : `malha rodoviária estadual/municipal de ${municipio}`,
      riverList.length > 0 ? `eixo fluvial (${riverList.join(', ')})` : 'rotas fluviais locais',
    ].join(' e ');

  const riskFocus =
    tipoRisco === 'hidrico'
      ? `bairros de baixada, igarapés urbanos e áreas de várzea sujeitas a alagamento em ${municipio}.`
      : tipoRisco === 'termico'
        ? `zonas periurbanas, áreas rurais e faixas de vegetação seca com risco de fumaça e focos de calor em ${municipio}.`
        : `áreas de baixada e entorno escolar sob monitoramento preventivo da ${dre || 'DRE local'}.`;

  const summary = [
    `1. Escolas e Pontos de Apoio: ${schoolNames}; apoio de saúde/emergência em ${supportNames}.`,
    `2. Rotas Rodoviárias e Fluviais: atenção ao transporte escolar via ${routesText}.`,
    `3. Áreas de Risco Próximas: ${riskFocus}`,
  ].join('\n');

  const places: { title: string; uri: string }[] = [
    {
      title: `Mapa de ${municipio} - PA`,
      uri: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`,
    },
    ...schools.slice(0, 3).map((s) => ({
      title: s.name,
      uri: `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lon}`,
    })),
    ...support.slice(0, 2).map((s) => ({
      title: s.name,
      uri: `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lon}`,
    })),
  ];

  return { summary, places };
}

app.post('/api/maps/grounding', async (req, res) => {
  try {
    const { municipio, dre, lat, lon, tipoRisco, tempMaximaC, chuvaAcumuladaMm, pico24hMm } =
      req.body;

    if (!municipio || typeof lat !== 'number' || typeof lon !== 'number') {
      res.status(400).json({ error: 'Informe município e coordenadas (lat, lon) válidas.' });
      return;
    }

    const cacheKey = `${String(municipio).toLowerCase()}:${tipoRisco || 'normal'}`;
    const cached = mapsGroundingCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json({ summary: cached.summary, places: cached.places });
      return;
    }

    const ai = getOptionalGeminiClient();
    if (ai) {
      try {
        const riskContext =
          tipoRisco === 'hidrico'
            ? `Risco Hídrico / Alagamento (acumulado previsto de ${chuvaAcumuladaMm ?? 0} mm e pico de ${pico24hMm ?? 0} mm/24h)`
            : tipoRisco === 'termico'
              ? `Risco Térmico / Queimadas (temperatura máxima prevista de ${tempMaximaC ?? 37} °C)`
              : `Monitoramento Preventivo (máxima de ${tempMaximaC ?? 33} °C e acumulado de ${chuvaAcumuladaMm ?? 0} mm)`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `Você é o Especialista em Gestão de Risco e Defesa Civil Escolar da SEDUC-PA.
Para o município de ${municipio} - PA (${dre || 'Rede Estadual PA'}), sob ${riskContext}, consulte o Google Maps e forneça um resumo objetivo em 3 tópicos curtos (em português, sem introdução):
1. *Escolas Estaduais e Pontos de Apoio*: principais escolas estaduais, hospitais/UPAs ou ginásios/pontos de apoio da Defesa Civil na sede urbana.
2. *Rotas Rodoviárias e Fluviais*: principais rodovias (BR/PA) e rios/portos utilizados pelo transporte escolar e possíveis pontos de atenção.
3. *Áreas de Risco Próximas*: bairros de baixada/várzea ou zonas rurais/florestais com maior vulnerabilidade.`,
          config: {
            tools: [{ googleMaps: {} }],
            toolConfig: {
              retrievalConfig: {
                latLng: {
                  latitude: lat,
                  longitude: lon,
                },
              },
            },
          },
        });

        const summary = (response.text ?? '').trim();
        const rawChunks =
          response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

        const seenUris = new Set<string>();
        const places: { title: string; uri: string }[] = [];
        for (const chunk of rawChunks as Array<{
          maps?: { uri?: string; title?: string };
        }>) {
          const uri = chunk.maps?.uri;
          const title = chunk.maps?.title;
          if (uri && title && !seenUris.has(uri)) {
            seenUris.add(uri);
            places.push({ title, uri });
          }
        }

        if (summary) {
          mapsGroundingCache.set(cacheKey, {
            summary,
            places,
            expiresAt: Date.now() + 30 * 60 * 1000,
          });
          res.json({ summary, places });
          return;
        }
      } catch {
        // Fallback to OpenStreetMap Overpass public data
      }
    }

    const osmResult = await fetchOpenStreetMapTerritorialData(
      String(municipio),
      dre ? String(dre) : undefined,
      lat,
      lon,
      tipoRisco ? String(tipoRisco) : undefined
    );

    mapsGroundingCache.set(cacheKey, {
      summary: osmResult.summary,
      places: osmResult.places,
      expiresAt: Date.now() + 30 * 60 * 1000,
    });

    res.json(osmResult);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erro ao consultar dados territoriais.';
    res.status(500).json({ error: message });
  }
});

interface CachedSchoolItem {
  id: string;
  codigoMec: string;
  nome: string;
  endereco?: string;
  municipio: string;
  dre: string;
  lat: number;
  lon: number;
  tipoRisco: 'hidrico' | 'termico' | 'normal';
  recomendacao: string;
}

function normalizeLookupKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

let seducSchoolsCache: {
  schools: CachedSchoolItem[];
  dres: string[];
} | null = null;

function loadSeducSchoolsFromCsv(): {
  schools: CachedSchoolItem[];
  dres: string[];
} {
  if (seducSchoolsCache) {
    return seducSchoolsCache;
  }

  const catalogByKey = new Map<
    string,
    (typeof PARA_MUNICIPALITIES_CATALOG)[number]
  >();
  for (const item of PARA_MUNICIPALITIES_CATALOG) {
    catalogByKey.set(normalizeLookupKey(item.municipio), item);
  }

  const csvPath = path.join(
    __dirname,
    'public/assets/aistudio/BASE_MATR_CULAS_505271e6'
  );
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const schools: CachedSchoolItem[] = [];
  const dreSet = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 5) continue;

    const rawDre = parts[1].trim().replace(/^DRE\s+DRE\s+/i, 'DRE ');
    const rawMun = parts[2].trim();
    const codigoMec = parts[3].trim();
    const nome = parts.slice(4).join(',').trim();

    if (!nome || !codigoMec) continue;

    const normMun = normalizeLookupKey(rawMun);
    const isMosqueiro = normMun === 'belemmosqueiro';
    const catalogMatch = isMosqueiro
      ? catalogByKey.get('belem')
      : catalogByKey.get(normMun);

    const municipio = catalogMatch ? catalogMatch.municipio : rawMun;
    const lat = isMosqueiro ? -1.1636 : (catalogMatch?.lat ?? -1.4558);
    const lon = isMosqueiro ? -48.4686 : (catalogMatch?.lon ?? -48.4902);

    dreSet.add(rawDre);

    schools.push({
      id: `mec-${codigoMec}`,
      codigoMec,
      nome,
      endereco: isMosqueiro ? 'Distrito de Mosqueiro, Belém - PA' : undefined,
      municipio,
      dre: rawDre,
      lat,
      lon,
      tipoRisco: 'normal',
      recomendacao:
        'Manter rotina escolar com verificação preventiva de drenagem e pontos de hidratação.',
    });
  }

  const dres = Array.from(dreSet).sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { numeric: true })
  );

  seducSchoolsCache = { schools, dres };
  return seducSchoolsCache;
}

app.get('/api/schools/para', async (req, res) => {
  try {
    const mode = String(req.query.mode || '');
    const munParam = String(req.query.municipality || '').trim();
    const dreParam = String(req.query.dre || '').trim();
    const munListParam = String(req.query.municipalities || '').trim();

    const { schools: allSchools, dres } = loadSeducSchoolsFromCsv();

    let filtered: CachedSchoolItem[] = [];

    if (dreParam && dreParam !== 'all') {
      const targetDre = normalizeLookupKey(dreParam);
      filtered = allSchools.filter(
        (s) => normalizeLookupKey(s.dre) === targetDre
      );
    } else if (mode === 'all') {
      filtered = allSchools;
    } else if (mode === 'critical') {
      const requestedKeys = munListParam
        ? munListParam
            .split(',')
            .map((s) => normalizeLookupKey(s))
            .filter(Boolean)
        : [];

      const targetKeys =
        requestedKeys.length > 0
          ? requestedKeys.slice(0, 6)
          : ['belem', 'santarem', 'maraba', 'altamira', 'abaetetuba'];

      const targetSet = new Set(targetKeys);
      filtered = allSchools.filter((s) =>
        targetSet.has(normalizeLookupKey(s.municipio))
      );
    } else if (munParam && munParam !== 'all') {
      const targetMun = normalizeLookupKey(munParam);
      filtered = allSchools.filter(
        (s) => normalizeLookupKey(s.municipio) === targetMun
      );
    } else {
      filtered = allSchools;
    }

    res.json({
      schools: filtered,
      dres,
      totalCatalogSchools: allSchools.length,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erro ao consultar escolas estaduais.';
    res.status(500).json({ error: message });
  }
});

app.post('/api/parse-municipalities', async (req, res) => {
  try {
    const { rawText } = req.body;
    if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
      res.status(400).json({ error: 'Insira o texto ou lista de municípios para processar.' });
      return;
    }

    const ai = getOptionalGeminiClient();

    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `Extraia até 20 municípios do estado do Pará e suas métricas meteorológicas do texto abaixo. Classifique cada município em "hidrico" (chuva, alagamento, enxurrada, mm) ou "termico" (calor, temperatura máxima, queimada, estiagem, seca, °C). Se o texto mencionar DRE, inclua em "dre".\n\nTexto:\n${rawText.slice(0, 8000)}`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  municipio: {
                    type: Type.STRING,
                    description: 'Nome do município paraense.',
                  },
                  dre: {
                    type: Type.STRING,
                    description: 'Diretoria Regional de Ensino (DRE), se mencionada.',
                  },
                  tipoRisco: {
                    type: Type.STRING,
                    description: 'Deve ser exatamente "hidrico" ou "termico".',
                  },
                  chuvaAcumuladaMm: {
                    type: Type.NUMBER,
                    description: 'Acumulado de chuva previsto em mm (para risco hidrico).',
                  },
                  pico24hMm: {
                    type: Type.NUMBER,
                    description: 'Pico de chuva em 24h em mm (para risco hidrico).',
                  },
                  tempMaximaC: {
                    type: Type.NUMBER,
                    description: 'Temperatura máxima prevista em °C (para risco termico).',
                  },
                  diasEstiagem: {
                    type: Type.NUMBER,
                    description: 'Dias consecutivos sem chuva (para risco termico).',
                  },
                },
                required: ['municipio', 'tipoRisco'],
              },
            },
          },
        });

        const jsonStr = (response.text ?? '[]').trim();
        const parsed = JSON.parse(jsonStr);
        const sanitized = Array.isArray(parsed)
          ? parsed.slice(0, 20).map((item, idx) => ({
              id: `parsed-${Date.now()}-${idx}`,
              municipio: String(item.municipio || '').trim(),
              dre: item.dre ? String(item.dre).trim() : undefined,
              tipoRisco: item.tipoRisco === 'termico' ? 'termico' : 'hidrico',
              chuvaAcumuladaMm:
                typeof item.chuvaAcumuladaMm === 'number' ? item.chuvaAcumuladaMm : undefined,
              pico24hMm: typeof item.pico24hMm === 'number' ? item.pico24hMm : undefined,
              tempMaximaC: typeof item.tempMaximaC === 'number' ? item.tempMaximaC : undefined,
              diasEstiagem: typeof item.diasEstiagem === 'number' ? item.diasEstiagem : undefined,
            }))
          : [];

        if (sanitized.length > 0) {
          res.json({ municipalities: sanitized });
          return;
        }
      } catch {
        // Fallback to catalog/regex parser
      }
    }

    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 20);

    const fallbackParsed = lines
      .map((line, idx) => {
        const lower = line.toLowerCase();
        const catalogHit = PARA_MUNICIPALITIES_CATALOG.find((c) =>
          lower.includes(c.municipio.toLowerCase())
        );
        const tempMatch = line.match(/(\d{2}(?:[.,]\d)?)\s*°?\s*C/i);
        const mmMatches = [...line.matchAll(/(\d+(?:[.,]\d+)?)\s*mm/gi)].map((m) =>
          Number(m[1].replace(',', '.'))
        );
        const isThermal =
          Boolean(tempMatch) ||
          /calor|queimada|seca|estiagem|fogo/i.test(line);

        const municipio =
          catalogHit?.municipio ??
          line.split(/[-–—,:|]/)[0].trim().slice(0, 40);

        if (!municipio) return null;

        return {
          id: `parsed-${Date.now()}-${idx}`,
          municipio,
          dre: catalogHit?.dre,
          tipoRisco: isThermal ? 'termico' : 'hidrico',
          chuvaAcumuladaMm: !isThermal ? (mmMatches[0] ?? 120) : undefined,
          pico24hMm: !isThermal ? (mmMatches[1] ?? mmMatches[0] ?? 45) : undefined,
          tempMaximaC: isThermal
            ? tempMatch
              ? Number(tempMatch[1].replace(',', '.'))
              : 38.0
            : undefined,
          diasEstiagem: isThermal ? 10 : undefined,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    res.json({ municipalities: fallbackParsed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao interpretar lista de municípios.';
    res.status(500).json({ error: message });
  }
});

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ CRC32_TABLE[(c ^ buf[i]) & 0xff];
  }
  return (c ^ -1) >>> 0;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function buildZipBuffer(entries: { name: string; data: Buffer }[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf-8');
    const compressed = zlib.deflateRawSync(entry.data);
    const crc = crc32(entry.data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 flag
    localHeader.writeUInt16LE(8, 8); // Deflate
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDir.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, endRecord]);
}

function collectProjectFiles(dir: string, baseDir: string, out: { name: string; data: Buffer }[]) {
  const skip = new Set(['node_modules', 'dist', '.git', '.env']);
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(item.name) || item.name.startsWith('.env.')) continue;
    const fullPath = path.join(dir, item.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
    if (item.isDirectory()) {
      collectProjectFiles(fullPath, baseDir, out);
    } else if (item.isFile()) {
      out.push({ name: `ciseb-monitor-clima/${relPath}`, data: fs.readFileSync(fullPath) });
    }
  }
}

app.get('/api/export-project.zip', (_req, res) => {
  try {
    const entries: { name: string; data: Buffer }[] = [];
    collectProjectFiles(__dirname, __dirname, entries);
    const zipBuffer = buildZipBuffer(entries);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="ciseb-monitor-clima.zip"');
    res.send(zipBuffer);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao compactar projeto.';
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  // Load existing daily snapshot from disk if available (no background timers or boot-time external requests)
  loadDailySnapshotFromDisk();

  const PORT = Number(process.env.PORT) || 3000;
  const distPath = path.resolve(__dirname, 'dist');
  const hasDistBuild = fs.existsSync(path.join(distPath, 'index.html'));

  if (process.env.NODE_ENV !== 'production' && !hasDistBuild) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SEDUC-PA Defesa Civil Escolar server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
