import { BandeiraLevel, MunicipalityRisk, SmokeAirRiskLevel } from '../types/bulletin';

/**
 * Classifica o nível de Bandeiramento (Verde, Amarela, Vermelha) conforme o
 * Protocolo de Gestão e Resposta aos Efeitos do El Niño nas Escolas Públicas do Estado do Pará
 * (SEDUC/PA · BID · Nota Técnica nº 987/2026 CEMADEN).
 */
export function classifyBandeira(
  item: Pick<
    MunicipalityRisk,
    | 'tipoRisco'
    | 'tempMaximaC'
    | 'diasEstiagem'
    | 'pico24hMm'
    | 'chuvaAcumuladaMm'
    | 'anomaliaTempC'
    | 'anomaliaChuvaPct'
    | 'bandeira'
  >
): BandeiraLevel {
  if (item.bandeira) {
    return item.bandeira;
  }

  const temp = item.tempMaximaC ?? 0;
  const dryDays = item.diasEstiagem ?? 0;
  const pico = item.pico24hMm ?? 0;
  const acum = item.chuvaAcumuladaMm ?? 0;
  const anomTemp = item.anomaliaTempC ?? 0;
  const anomRainPct = item.anomaliaChuvaPct ?? 0;

  // Bandeira Vermelha: Situação crítica com potencial comprometimento da segurança, saúde,
  // abastecimento de água, qualidade do ar (fumaça) ou acesso à unidade escolar.
  if (item.tipoRisco === 'termico') {
    if (
      temp >= 38.0 ||
      (temp >= 37.0 && dryDays >= 14) ||
      dryDays >= 18 ||
      (anomTemp >= 3.0 && temp >= 36.5)
    ) {
      return 'vermelha';
    }
    return 'amarela';
  }

  if (item.tipoRisco === 'hidrico') {
    if (
      pico >= 55 ||
      acum >= 140 ||
      (pico >= 45 && anomRainPct >= 60)
    ) {
      return 'vermelha';
    }
    return 'amarela';
  }

  // Mesmo se classificado inicialmente como normal, verifica limiar de atenção preventiva
  if (temp >= 36.2 || dryDays >= 12 || pico >= 32 || acum >= 95) {
    return 'amarela';
  }

  return 'verde';
}

/**
 * Estima o risco associado à fumaça de queimadas, qualidade do ar e redução hídrica
 * (págs. 2, 6, 7 e 9 do Protocolo SEDUC/PA).
 */
export function classifySmokeAndWaterRisk(
  item: Pick<MunicipalityRisk, 'tipoRisco' | 'tempMaximaC' | 'diasEstiagem' | 'anomaliaTempC'>
): SmokeAirRiskLevel {
  const temp = item.tempMaximaC ?? 0;
  const dryDays = item.diasEstiagem ?? 0;
  const anomTemp = item.anomaliaTempC ?? 0;

  if (item.tipoRisco === 'termico') {
    if (temp >= 38.0 || dryDays >= 16 || (temp >= 37.0 && anomTemp >= 2.5)) {
      return 'critico';
    }
    if (temp >= 36.5 || dryDays >= 12) {
      return 'alto';
    }
    return 'moderado';
  }

  if (dryDays >= 10 || temp >= 35.5) {
    return 'moderado';
  }

  return 'baixo';
}

export interface BandeiraProtocolSpec {
  level: BandeiraLevel;
  title: string;
  subtitle: string;
  summary: string;
  flowSteps: string[];
  schoolActions: string[];
  dreActions?: string[];
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  dotColor: string;
}

export const SEDUC_BANDEIRA_PROTOCOLS: Record<BandeiraLevel, BandeiraProtocolSpec> = {
  verde: {
    level: 'verde',
    title: 'Bandeira Verde',
    subtitle: 'Prevenção e Monitoramento',
    summary:
      'Condições normais, sem ocorrência relevante de queimadas, estiagem severa ou alagamento capaz de comprometer a rotina escolar. Manutenção do calendário escolar com ações preventivas e verificação de água.',
    flowSteps: ['MONITORAR', 'PREVENIR', 'ORIENTAR', 'PREPARAR'],
    schoolActions: [
      'Acompanhar comunicados oficiais da Defesa Civil e órgãos competentes;',
      'Manter atualizado o contato institucional com a DRE/SEDUC;',
      'Identificar áreas da escola vulneráveis à fumaça, calor extremo e redução da disponibilidade de água;',
      'Verificar condições de abastecimento e armazenamento de água potável;',
      'Orientar estudantes e profissionais sobre prevenção de queimadas e uso responsável da água;',
      'Desenvolver ações educativas sobre prevenção de incêndios e conservação ambiental;',
      'Registrar situações relevantes observadas no território escolar;',
      'Racionalizar o uso da água e orientar famílias sobre cuidados preventivos.',
    ],
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-800',
    badgeBorder: 'border-emerald-200',
    dotColor: '#10B981',
  },
  amarela: {
    level: 'amarela',
    title: 'Bandeira Amarela',
    subtitle: 'Atenção e Preparação',
    summary:
      'Presença ou aumento do risco associado às queimadas, estiagem ou chuvas intensas, com possibilidade de interferência na rotina escolar, exigindo medidas preventivas imediatas e envio do Anexo I à DRE.',
    flowSteps: [
      'IDENTIFICAR',
      'COMUNICAR',
      'INTENSIFICAR MONITORAMENTO',
      'ADOTAR MEDIDAS PREVENTIVAS',
    ],
    schoolActions: [
      'Comunicar a situação à DRE/SEDUC por meio de Memorando Oficial;',
      'Acompanhar diariamente a qualidade do ar e os alertas de calor pelos Boletins da Defesa Civil e da DRE;',
      'Reduzir ou adequar atividades externas e Educação Física quando as condições ambientais forem desfavoráveis;',
      'Reforçar orientações de proteção e hidratação diante de temperaturas elevadas;',
      'Verificar a disponibilidade de água para consumo, higiene e funcionamento da escola, racionalizando água e energia;',
      'Preparar a escola para eventual alteração temporária da rotina: confirmar contatos das famílias e organizar cadernos de atividades para estudantes com risco de isolamento;',
      'Avaliar flexibilização do calendário escolar, reorganização de horários de aula e criação de rotas alternativas para entrega de material impresso;',
      'Orientar a utilização do Protocolo de Apoio Psicossocial e fortalecer o vínculo com as famílias.',
    ],
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-800',
    badgeBorder: 'border-amber-300',
    dotColor: '#F59E0B',
  },
  vermelha: {
    level: 'vermelha',
    title: 'Bandeira Vermelha',
    subtitle: 'Resposta e Proteção',
    summary:
      'Situação crítica capaz de comprometer a segurança, a saúde, o abastecimento de água, a qualidade do ar ou o acesso à escola, demandando adoção imediata de medidas de proteção e possível suspensão temporária de aulas presenciais.',
    flowSteps: [
      'PROTEGER',
      'COMUNICAR',
      'RESPONDER',
      'ARTICULAR A REDE',
      'AVALIAR A COMUNIDADE',
    ],
    schoolActions: [
      'Comunicar imediatamente a DRE/SEDUC por Memorando Oficial e acionar órgãos competentes (Defesa Civil, Saúde, Bombeiros);',
      'Priorizar a integridade e proteção de estudantes, profissionais da educação e comunidade escolar;',
      'Suspender atividades externas e restringir áreas da escola afetadas por fumaça, fogo, calor extremo ou alagamento;',
      'Verificar condições de abastecimento de água e acionar imediatamente os serviços responsáveis quando houver comprometimento;',
      'Avaliar junto à SEDUC/DRE a necessidade de alteração excepcional da rotina ou suspensão temporária de aulas presenciais;',
      'Reorganizar o calendário escolar de reposição de aulas e manter contato regular com famílias e estudantes;',
      'Executar o Protocolo de Apoio Psicossocial para estudantes e profissionais afetados;',
      'Registrar formalmente a ocorrência, as providências adotadas e os impactos sobre as atividades pedagógicas.',
    ],
    dreActions: [
      'Atuar na coordenação, acompanhamento e articulação permanente com as unidades escolares afetadas e setores da SEDUC/PA;',
      'Articular-se com órgãos municipais e estaduais de Defesa Civil, saúde, meio ambiente e abastecimento de água;',
      'Mobilizar o Centro de Mídias da Educação Paraense (CEMEP) via programa "Aluno sem aula zero" para ensino remoto emergencial;',
      'Disponibilizar o banco de cadernos de atividades complementares da rede estadual e apoiar rotas alternativas para entrega de materiais;',
      'Disponibilizar equipamentos e recursos humanos para apoiar as escolas e monitorar a continuidade do atendimento educacional.',
    ],
    badgeBg: 'bg-red-50',
    badgeText: 'text-red-800',
    badgeBorder: 'border-red-300',
    dotColor: '#DC2626',
  },
};

export interface CompetenceMatrixRow {
  level: 'ESCOLA' | 'DRE' | 'SEDUC/PA';
  roleTitle: string;
  flowSummary: string;
  competencies: string[];
}

export const SEDUC_COMPETENCE_MATRIX: CompetenceMatrixRow[] = [
  {
    level: 'ESCOLA',
    roleTitle: 'Unidade Escolar (Equipe Gestora e Pedagógica)',
    flowSummary: 'Identifica, monitora, registra e comunica.',
    competencies: [
      'Monitorar as condições locais do entorno e qualidade do ar/água;',
      'Identificar situações de risco (queimadas, fumaça, calor extremo, estiagem ou alagamento);',
      'Adotar medidas preventivas e de proteção imediata à comunidade escolar;',
      'Comunicar ocorrências formalmente à DRE;',
      'Orientar estudantes, profissionais e famílias;',
      'Registrar as ações realizadas e adequar atividades e rotina escolar conforme orientações;',
      'Executar estratégias de continuidade pedagógica (cadernos de atividades / CEMEP) quando necessárias.',
    ],
  },
  {
    level: 'DRE',
    roleTitle: 'Diretoria Regional de Ensino (DRE)',
    flowSummary: 'Consolida, orienta, articula e comunica + Retorno à escola.',
    competencies: [
      'Receber e consolidar informações e memorandos das escolas sob sua jurisdição;',
      'Acompanhar a evolução dos riscos no território regional;',
      'Orientar e apoiar in loco as unidades escolares;',
      'Articular as escolas com os setores da SEDUC e órgãos municipais/estaduais (Defesa Civil, Saúde, Água);',
      'Acompanhar a implementação das medidas de resposta e identificar demandas extraordinárias;',
      'Mobilizar o CEMEP ("Aluno sem aula zero") e o banco de cadernos de atividades complementares.',
    ],
  },
  {
    level: 'SEDUC/PA',
    roleTitle: 'SEDUC/PA · Comitê de Crise para Gestão e Resposta aos Efeitos do El Niño',
    flowSummary: 'Coordena, apoia, define o bandeiramento e estabelece orientações gerais.',
    competencies: [
      'Coordenar a implementação do protocolo na rede estadual (em parceria com o BID e Nota Técnica nº 987/2026 CEMADEN);',
      'Definir oficialmente a bandeira (Verde, Amarela ou Vermelha) de cada escola ou território, com apoio das DREs;',
      'Acompanhar os indicadores e alertas oficiais sobre queimadas, estiagem e chuvas e comunicá-los às DREs e escolas;',
      'Mobilizar setores técnicos e pedagógicos e disponibilizar materiais e estratégias de continuidade do ensino;',
      'Articular-se institucionalmente com órgãos estaduais e demais parceiros;',
      'Avaliar e orientar medidas excepcionais (como suspensão temporária de aulas presenciais) que ultrapassem a competência das escolas e DREs.',
    ],
  },
];

/**
 * Gera a orientação imediata para uma escola segundo o Protocolo de Bandeiramento SEDUC/PA.
 */
export function getSchoolProtocolRecommendation(
  item: Pick<
    MunicipalityRisk,
    'tipoRisco' | 'bandeira' | 'tempMaximaC' | 'diasEstiagem' | 'pico24hMm' | 'chuvaAcumuladaMm'
  >
): string {
  const bandeira = classifyBandeira(item);

  if (bandeira === 'vermelha') {
    if (item.tipoRisco === 'termico') {
      return `Comunicar a DRE imediatamente, suspender atividades externas, restringir áreas com fumaça/calor (${(item.tempMaximaC ?? 0).toFixed(1).replace('.', ',')} °C · ${item.diasEstiagem ?? 0}d secos) e avaliar acionamento do CEMEP ("Aluno sem aula zero").`;
    }
    return `Comunicar a DRE imediatamente, proteger alunos/equipe, elevar equipamentos (pico ${item.pico24hMm ?? 0} mm/24h) e avaliar suspensão presencial via CEMEP ("Aluno sem aula zero") se houver risco no acesso.`;
  }

  if (bandeira === 'amarela') {
    if (item.tipoRisco === 'termico') {
      return `Comunicar a DRE, reduzir Educação Física/atividades ao ar livre (${(item.tempMaximaC ?? 0).toFixed(1).replace('.', ',')} °C), reforçar hidratação, monitorar ar/água e organizar cadernos de atividades.`;
    }
    return `Comunicar a DRE, inspecionar calhas/drenagem e rede elétrica (pico ${item.pico24hMm ?? 0} mm/24h), monitorar transporte escolar e preparar cadernos de atividades.`;
  }

  return 'Rotina normal mantida: verificar reservatórios de água potável, mapear áreas vulneráveis ao calor/fumaça e manter ações educativas de prevenção.';
}
