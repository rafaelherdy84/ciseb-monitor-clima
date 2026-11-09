import { DirectiveOption, MunicipalityRisk } from '../types/bulletin';
import { classifyBandeira } from './protocolSeduc';

export function sortHydroRisks(items: MunicipalityRisk[]): MunicipalityRisk[] {
  return [...items]
    .filter((item) => item.tipoRisco === 'hidrico')
    .sort((a, b) => {
      const picoDiff = (b.pico24hMm ?? 0) - (a.pico24hMm ?? 0);
      if (picoDiff !== 0) return picoDiff;
      return (b.chuvaAcumuladaMm ?? 0) - (a.chuvaAcumuladaMm ?? 0);
    });
}

export function sortThermalRisks(items: MunicipalityRisk[]): MunicipalityRisk[] {
  return [...items]
    .filter((item) => item.tipoRisco === 'termico')
    .sort((a, b) => {
      const tempDiff = (b.tempMaximaC ?? 0) - (a.tempMaximaC ?? 0);
      if (tempDiff !== 0) return tempDiff;
      return (b.diasEstiagem ?? 0) - (a.diasEstiagem ?? 0);
    });
}

export function analyzeConditionsAndSuggestDirectives(
  municipalities: MunicipalityRisk[]
): DirectiveOption[] {
  const hydro = sortHydroRisks(municipalities);
  const thermal = sortThermalRisks(municipalities);

  const hydroCount = hydro.length;
  const thermalCount = thermal.length;

  const redCount = municipalities.filter((m) => classifyBandeira(m) === 'vermelha').length;

  const topHydro = hydro[0];
  const topThermal = thermal[0];

  const maxPico24h = topHydro?.pico24hMm ?? 0;
  const maxAcumulado = topHydro?.chuvaAcumuladaMm ?? 0;
  const maxTemp = topThermal?.tempMaximaC ?? 0;
  const maxDryDays = topThermal?.diasEstiagem ?? 0;

  const suggestions: DirectiveOption[] = [];

  // 1. Hydro-specific directives when there are flood/rain alerts
  if (hydroCount > 0) {
    const hydroTarget = topHydro
      ? `${topHydro.municipio} (pico de ${maxPico24h} mm/24h)`
      : 'áreas de baixada';

    if (maxPico24h >= 55 || maxAcumulado >= 140) {
      suggestions.push({
        id: 'dyn-hydro-elevate',
        category: 'hidrico',
        bandeira: 'vermelha',
        text: `[Bandeira Vermelha] Comunicar imediatamente a DRE por Memorando Oficial e elevar computadores, livros e prontuários para pisos superiores nas escolas de ${hydroTarget}, avaliando acionamento do CEMEP ("Aluno sem aula zero") caso o acesso seja comprometido.`,
        selected: true,
      });
    } else {
      suggestions.push({
        id: 'dyn-hydro-elevate',
        category: 'hidrico',
        bandeira: 'amarela',
        text: `[Bandeira Amarela] Proteger equipamentos de informática, arquivos e insumos da merenda escolar contra infiltrações e realizar inspeção de calhas/drenagem nas unidades de ${hydroTarget} (acumulado de até ${maxAcumulado} mm).`,
        selected: true,
      });
    }

    if (thermalCount === 0) {
      suggestions.push({
        id: 'dyn-hydro-transport',
        category: 'hidrico',
        bandeira: 'amarela',
        text: `[Bandeira Amarela] Monitorar rotas do transporte escolar terrestre e fluvial em ${topHydro?.municipio ?? 'regiões afetadas'}, preparando cadernos de atividades complementares para estudantes com risco de isolamento.`,
        selected: true,
      });
    }
  }

  // 2. Thermal / Drought / Wildfire directives aligned with Protocolo El Niño SEDUC/PA
  if (thermalCount > 0) {
    const thermalTarget = topThermal
      ? `${topThermal.municipio} (máxima de ${maxTemp.toFixed(1).replace('.', ',')} °C)`
      : 'municípios sob alerta térmico';

    if (maxTemp >= 38.0 || maxDryDays >= 18) {
      suggestions.push({
        id: 'dyn-term-red',
        category: 'termico',
        bandeira: 'vermelha',
        text: `[Bandeira Vermelha] Suspender atividades externas, restringir áreas expostas à fumaça/calor em ${thermalTarget} e comunicar a DRE por Memorando Oficial, avaliando flexibilização de rotina via CEMEP ("Aluno sem aula zero") e Protocolo de Apoio Psicossocial.`,
        selected: true,
      });
    } else {
      suggestions.push({
        id: 'dyn-term-yellow',
        category: 'termico',
        bandeira: 'amarela',
        text: `[Bandeira Amarela] Reduzir aulas de Educação Física e atividades ao ar livre nos horários críticos (10h às 16h) nas escolas de ${thermalTarget}, reforçando pontos de hidratação e flexibilização de horários.`,
        selected: true,
      });
    }

    suggestions.push({
      id: 'dyn-term-water-smoke',
      category: 'termico',
      bandeira: maxDryDays >= 14 ? 'vermelha' : 'amarela',
      text: `Verificar diariamente as condições de abastecimento e armazenamento de água potável para consumo/higiene, racionalizar água e energia e acompanhar os boletins de qualidade do ar/fumaça da Defesa Civil (estiagem de até ${maxDryDays} dias).`,
      selected: true,
    });

    suggestions.push({
      id: 'dyn-term-cadernos',
      category: 'termico',
      bandeira: 'amarela',
      text: `Confirmar contatos das famílias, organizar o banco de cadernos de atividades complementares e prever rotas alternativas de entrega de material impresso para estudantes em áreas com risco de isolamento por estiagem ou queimadas.`,
      selected: suggestions.filter((s) => s.selected).length < 4,
    });
  }

  // 3. Governance / Communication Flow (Escola -> DRE -> SEDUC/PA Comitê de Crise)
  suggestions.push({
    id: 'dyn-geral-anexo1',
    category: 'geral',
    bandeira: redCount > 0 ? 'vermelha' : 'verde',
    text: `Registrar formalmente as ocorrências e medidas adotadas pela escola e encaminhar Memorando Oficial à respectiva DRE para deliberação do Comitê de Crise SEDUC/PA.`,
    selected: suggestions.filter((s) => s.selected).length < 4,
  });

  return suggestions;
}

export function formatTelegramBulletin(
  municipalities: MunicipalityRisk[],
  directives: DirectiveOption[]
): string {
  const allHydro = sortHydroRisks(municipalities);
  const allThermal = sortThermalRisks(municipalities);

  const countVermelha = municipalities.filter((m) => classifyBandeira(m) === 'vermelha').length;
  const countAmarela = municipalities.filter((m) => classifyBandeira(m) === 'amarela').length;
  const countVerde = municipalities.filter((m) => classifyBandeira(m) === 'verde').length;

  // Select up to 20 most critical municipalities balanced between hydro and thermal
  const hydro = allHydro.slice(0, 10);
  const thermal = allThermal.slice(0, 20 - hydro.length);
  if (hydro.length + thermal.length < 20 && allHydro.length > 10) {
    hydro.push(...allHydro.slice(10, 10 + (20 - hydro.length - thermal.length)));
  }

  const hydroLabel =
    allHydro.length === 1
      ? '1 município em alerta hídrico'
      : `${allHydro.length} municípios em alerta hídrico`;
  const thermalLabel =
    allThermal.length === 1
      ? '1 município em alerta térmico/seca'
      : `${allThermal.length} municípios em alerta térmico/seca`;

  const lines: string[] = [
    '🚨 *ALERTA PREDITIVO SEMANAL: VIGILÂNCIA METEOROLÓGICA (SEDUC/PA)*',
    '_Protocolo de Gestão e Resposta aos Efeitos do El Niño · Nota Técnica nº 987/2026 CEMADEN_',
    '',
    `🚩 *Bandeiramento Estadual:* 🔴 ${countVermelha} Vermelha | 🟡 ${countAmarela} Amarela | 🟢 ${countVerde} Verde`,
    `${hydroLabel} | ${thermalLabel}`,
    '',
    '🌧️ *RISCO DE ALAGAMENTOS E ENXURRADAS*',
  ];

  if (hydro.length === 0) {
    lines.push('_Nenhum município em alerta hídrico para o período._');
  } else {
    hydro.forEach((item, index) => {
      const bandeira = classifyBandeira(item);
      const prefix = bandeira === 'vermelha' || index === 0 ? '🔴' : '🟡';
      const bandeiraTag =
        bandeira === 'vermelha' ? ' [Bandeira Vermelha]' : ' [Bandeira Amarela]';
      const metrics: string[] = [];
      if (item.chuvaAcumuladaMm !== undefined && item.chuvaAcumuladaMm > 0) {
        let rainText = `Acumulado: ${item.chuvaAcumuladaMm} mm`;
        if (item.anomaliaChuvaMm !== undefined) {
          if (item.anomaliaChuvaMm > 0) {
            const pctStr =
              item.anomaliaChuvaPct !== undefined && item.anomaliaChuvaPct > 0
                ? ` / +${item.anomaliaChuvaPct}%`
                : '';
            rainText += ` (+${item.anomaliaChuvaMm} mm${pctStr} vs. média 5a)`;
          } else if (item.anomaliaChuvaMm < 0) {
            rainText += ` (${item.anomaliaChuvaMm} mm vs. média 5a)`;
          }
        }
        metrics.push(rainText);
      }
      if (item.pico24hMm !== undefined && item.pico24hMm > 0) {
        metrics.push(`Pico 24h: ${item.pico24hMm} mm`);
      }
      const metricsStr = metrics.length > 0 ? ` — ${metrics.join(' | ')}` : '';
      const criticalTag = index === 0 ? ' _(Mais Crítico)_' : '';
      lines.push(`${prefix} *${item.municipio}*${bandeiraTag}${metricsStr}${criticalTag}`);
    });
  }

  lines.push('');
  lines.push('🔥 *RISCO DE QUEIMADAS, FUMAÇA E ESTIAGEM (EL NIÑO)*');

  if (thermal.length === 0) {
    lines.push('_Nenhum município em alerta térmico/seca para o período._');
  } else {
    thermal.forEach((item, index) => {
      const bandeira = classifyBandeira(item);
      const prefix = bandeira === 'vermelha' || index === 0 ? '🔴' : '🟡';
      const bandeiraTag =
        bandeira === 'vermelha' ? ' [Bandeira Vermelha]' : ' [Bandeira Amarela]';
      const metrics: string[] = [];
      if (item.tempMaximaC !== undefined && item.tempMaximaC > 0) {
        let tempText = `Máx: ${item.tempMaximaC.toFixed(1).replace('.', ',')} °C`;
        if (item.anomaliaTempC !== undefined) {
          if (item.anomaliaTempC > 0) {
            tempText += ` (+${item.anomaliaTempC.toFixed(1).replace('.', ',')} °C vs. média 5a)`;
          } else if (item.anomaliaTempC < 0) {
            tempText += ` (${item.anomaliaTempC.toFixed(1).replace('.', ',')} °C vs. média 5a)`;
          }
        }
        metrics.push(tempText);
      }
      if (item.diasEstiagem !== undefined && item.diasEstiagem > 0) {
        metrics.push(`${item.diasEstiagem} dias sem chuva`);
      }
      const metricsStr = metrics.length > 0 ? ` — ${metrics.join(' | ')}` : '';
      const criticalTag = index === 0 ? ' _(Mais Crítico)_' : '';
      lines.push(`${prefix} *${item.municipio}*${bandeiraTag}${metricsStr}${criticalTag}`);
    });
  }

  const activeDirectives = directives.filter((d) => d.selected).slice(0, 4);
  const fallbackDirectives =
    activeDirectives.length >= 3
      ? activeDirectives
      : directives.slice(0, 4);

  lines.push('');
  lines.push('📋 *FLUXO DE AÇÃO POR BANDEIRAMENTO (PROTOCOLO SEDUC/PA):*');
  fallbackDirectives.forEach((dir, idx) => {
    lines.push(`${idx + 1}. ${dir.text}`);
  });

  return lines.join('\n');
}

export interface SchoolBulletinInput {
  id: string;
  codigoMec?: string;
  nome: string;
  municipio: string;
  dre: string;
  tipoRisco: 'hidrico' | 'termico' | 'normal';
  bandeira?: 'verde' | 'amarela' | 'vermelha';
  chuvaAcumuladaMm?: number;
  pico24hMm?: number;
  tempMaximaC?: number;
  diasEstiagem?: number;
  anomaliaTempC?: number;
  anomaliaChuvaMm?: number;
}

export function formatSchoolsTelegramBulletin(
  schools: SchoolBulletinInput[],
  scopeLabel: string,
  directives: DirectiveOption[]
): string {
  let countVermelha = 0;
  let countAmarela = 0;
  let countVerde = 0;

  for (const s of schools) {
    const b = s.bandeira ?? classifyBandeira(s);
    if (b === 'vermelha') countVermelha++;
    else if (b === 'amarela') countAmarela++;
    else countVerde++;
  }

  const hydroSchools = schools
    .filter((s) => s.tipoRisco === 'hidrico')
    .sort(
      (a, b) =>
        (b.pico24hMm ?? 0) - (a.pico24hMm ?? 0) ||
        (b.chuvaAcumuladaMm ?? 0) - (a.chuvaAcumuladaMm ?? 0)
    );

  const thermalSchools = schools
    .filter((s) => s.tipoRisco === 'termico')
    .sort(
      (a, b) =>
        (b.tempMaximaC ?? 0) - (a.tempMaximaC ?? 0) ||
        (b.diasEstiagem ?? 0) - (a.diasEstiagem ?? 0)
    );

  const topHydro = hydroSchools.slice(0, 10);
  const topThermal = thermalSchools.slice(0, 10);

  const lines: string[] = [
    '🚨 *BOLETIM PREDITIVO SEMANAL · ESCOLAS ESTADUAIS (SEDUC/PA)*',
    `_Protocolo El Niño & Bandeiramento Escolar · Recorte: ${scopeLabel}_`,
    '',
    `🏫 *Total no recorte:* ${schools.length} unidades escolares`,
    `🚩 *Bandeiramento:* 🔴 ${countVermelha} Vermelha | 🟡 ${countAmarela} Amarela | 🟢 ${countVerde} Verde`,
    `${hydroSchools.length} escolas em risco hídrico | ${thermalSchools.length} escolas em risco térmico/seca`,
    '',
    '🌧️ *ESCOLAS EM ALERTA DE ALAGAMENTOS E ENXURRADAS*',
  ];

  if (topHydro.length === 0) {
    lines.push('_Nenhuma unidade escolar em alerta hídrico neste recorte._');
  } else {
    topHydro.forEach((s) => {
      const b = s.bandeira ?? classifyBandeira(s);
      const prefix = b === 'vermelha' ? '🔴' : '🟡';
      const bTag = b === 'vermelha' ? '[Bandeira Vermelha]' : '[Bandeira Amarela]';
      lines.push(
        `${prefix} *${s.nome}* (${s.municipio} · ${s.dre}) — ${bTag} | Pico 24h: ${s.pico24hMm ?? 0} mm | Acum.: ${s.chuvaAcumuladaMm ?? 0} mm`
      );
    });
    if (hydroSchools.length > topHydro.length) {
      lines.push(
        `_...e mais ${hydroSchools.length - topHydro.length} escolas estaduais em monitoramento hídrico._`
      );
    }
  }

  lines.push('');
  lines.push('🔥 *ESCOLAS EM ALERTA DE QUEIMADAS, FUMAÇA E ESTIAGEM (EL NIÑO)*');

  if (topThermal.length === 0) {
    lines.push('_Nenhuma unidade escolar em alerta térmico/seca neste recorte._');
  } else {
    topThermal.forEach((s) => {
      const b = s.bandeira ?? classifyBandeira(s);
      const prefix = b === 'vermelha' ? '🔴' : '🟡';
      const bTag = b === 'vermelha' ? '[Bandeira Vermelha]' : '[Bandeira Amarela]';
      lines.push(
        `${prefix} *${s.nome}* (${s.municipio} · ${s.dre}) — ${bTag} | Máx: ${(s.tempMaximaC ?? 0).toFixed(1).replace('.', ',')} °C | ${s.diasEstiagem ?? 0}d sem chuva`
      );
    });
    if (thermalSchools.length > topThermal.length) {
      lines.push(
        `_...e mais ${thermalSchools.length - topThermal.length} escolas estaduais em monitoramento térmico/estiagem._`
      );
    }
  }

  const activeDirectives = directives.filter((d) => d.selected).slice(0, 4);
  const fallbackDirectives =
    activeDirectives.length >= 3 ? activeDirectives : directives.slice(0, 4);

  lines.push('');
  lines.push('📋 *ORIENTAÇÕES IMEDIATAS ÀS ESCOLAS E DREs (PROTOCOLO SEDUC/PA):*');
  if (fallbackDirectives.length > 0) {
    fallbackDirectives.forEach((dir, idx) => {
      lines.push(`${idx + 1}. ${dir.text}`);
    });
  } else {
    lines.push(
      '1. Unidades em Bandeira Amarela e Vermelha devem preencher e encaminhar o Memorando Oficial à respectiva DRE.'
    );
    lines.push(
      '2. Monitorar diariamente a qualidade do ar/fumaça e as condições de abastecimento e armazenamento de água potável.'
    );
    lines.push(
      '3. Adequar atividades externas/Educação Física nos horários de pico de calor e organizar cadernos de atividades complementares.'
    );
    lines.push(
      '4. Em Bandeira Vermelha, articular com a DRE/SEDUC o acionamento do CEMEP ("Aluno sem aula zero") e do Protocolo de Apoio Psicossocial.'
    );
  }

  return lines.join('\n');
}
