import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  FileText,
  Flag,
  Mail,
  Printer,
  X,
} from 'lucide-react';
import { BandeiraLevel } from '../types/bulletin';
import { classifyBandeira, SEDUC_BANDEIRA_PROTOCOLS } from '../utils/protocolSeduc';
import type { MonitoredSchool } from './StateSchoolsView';

interface AnexoIMemorandumModalProps {
  school: MonitoredSchool;
  onClose: () => void;
}

export const AnexoIMemorandumModal: React.FC<AnexoIMemorandumModalProps> = ({
  school,
  onClose,
}) => {
  const bandeira: BandeiraLevel = useMemo(
    () =>
      classifyBandeira({
        tipoRisco: school.tipoRisco,
        bandeira: school.bandeira,
        tempMaximaC: school.tempMaximaC,
        diasEstiagem: school.diasEstiagem,
        pico24hMm: school.pico24hMm,
        chuvaAcumuladaMm: school.chuvaAcumuladaMm,
        anomaliaTempC: school.anomaliaTempC,
      }),
    [school]
  );

  const todayBr = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString('pt-BR');
  }, []);

  const currentYear = new Date().getFullYear();

  const [memoNumber, setMemoNumber] = useState(`001/${currentYear}`);
  const [dataOcorrencia, setDataOcorrencia] = useState(todayBr);
  const [diretorNome, setDiretorNome] = useState('');
  const [contatoInstitucional, setContatoInstitucional] = useState('');

  // Official Anexo I threat checkboxes
  const [threatQueimadasFumaca, setThreatQueimadasFumaca] = useState(
    school.tipoRisco === 'termico'
  );
  const [threatEstiagemAgua, setThreatEstiagemAgua] = useState(
    school.tipoRisco === 'termico' && (school.diasEstiagem ?? 0) >= 7
  );
  const [threatOutra, setThreatOutra] = useState(school.tipoRisco === 'hidrico');
  const [threatOutraTexto, setThreatOutraTexto] = useState(
    school.tipoRisco === 'hidrico'
      ? `Chuvas intensas / risco de alagamento e enxurrada (pico previsto de ${school.pico24hMm ?? 0} mm/24h e acumulado de ${school.chuvaAcumuladaMm ?? 0} mm)`
      : ''
  );

  const defaultDescricao = useMemo(() => {
    if (school.tipoRisco === 'termico') {
      const anom =
        school.anomaliaTempC && school.anomaliaTempC > 0
          ? ` (+${school.anomaliaTempC.toFixed(1).replace('.', ',')} °C acima da média histórica de 5 anos)`
          : '';
      return `Identificação de condições climáticas severas associadas aos efeitos do El Niño no território escolar de ${school.municipio}, com previsão de temperatura máxima de ${(school.tempMaximaC ?? 0).toFixed(1).replace('.', ',')} °C${anom} e ${school.diasEstiagem ?? 0} dias consecutivos de estiagem, gerando risco de exposição ao calor extremo, presença de fumaça de queimadas e pressão sobre o abastecimento hídrico da unidade (${SEDUC_BANDEIRA_PROTOCOLS[bandeira].title}).`;
    }
    if (school.tipoRisco === 'hidrico') {
      return `Identificação de evento meteorológico severo no município de ${school.municipio}, com previsão de acumulado de ${school.chuvaAcumuladaMm ?? 0} mm em 7 dias e pico de ${school.pico24hMm ?? 0} mm em 24h, com risco de alagamento no entorno, sobrecarga de drenagem e dificuldade de mobilidade no transporte escolar (${SEDUC_BANDEIRA_PROTOCOLS[bandeira].title}).`;
    }
    return `Monitoramento preventivo realizado na unidade escolar em ${school.municipio} (${SEDUC_BANDEIRA_PROTOCOLS[bandeira].title}), registrando temperatura máxima prevista de ${(school.tempMaximaC ?? 0).toFixed(1).replace('.', ',')} °C e ${school.diasEstiagem ?? 0} dias secos.`;
  }, [school, bandeira]);

  const defaultImpactos = useMemo(() => {
    if (bandeira === 'vermelha') {
      return school.tipoRisco === 'termico'
        ? 'Desconforto térmico acentuado em salas de aula, risco à saúde respiratória de estudantes e servidores devido à baixa qualidade do ar/fumaça, necessidade de suspensão de atividades ao ar livre e risco de comprometimento do reservatório de água e da frequência escolar.'
        : 'Risco de alagamento nas vias de acesso à unidade escolar, comprometimento de rotas do transporte escolar terrestre/fluvial e necessidade de proteção preventiva de equipamentos e prontuários.';
    }
    if (bandeira === 'amarela') {
      return 'Necessidade de restrição de atividades físicas e recreativas ao ar livre nos horários críticos (10h às 16h), aumento da demanda por pontos de hidratação, monitoramento de alunos vulneráveis à fumaça/calor e preparação preventiva para estudantes com risco de dificuldade de acesso.';
    }
    return 'Rotina escolar mantida dentro da normalidade, com acompanhamento preventivo da disponibilidade de água e orientação educativa à comunidade escolar.';
  }, [bandeira, school.tipoRisco]);

  const defaultMedidas = useMemo(() => {
    if (bandeira === 'vermelha') {
      return [
        'Suspensão imediata de atividades externas e restrição de áreas afetadas por calor extremo, fumaça ou alagamento',
        'Verificação dos reservatórios de água potável e racionalização do consumo na unidade',
        'Comunicação às famílias e confirmação de contatos para eventual reorganização da rotina escolar',
        'Acolhimento inicial e atenção ao Protocolo de Apoio Psicossocial para estudantes e profissionais afetados',
      ].join('; ') + '.';
    }
    return [
      'Intensificação do monitoramento dos Boletins da Defesa Civil e da DRE',
      'Adequação/redução de aulas de Educação Física e atividades externas nos horários de maior insolação',
      'Reforço dos pontos de hidratação e uso racional de água e energia elétrica',
      'Levantamento de estudantes com risco de isolamento para organização preventiva de cadernos de atividades',
    ].join('; ') + '.';
  }, [bandeira]);

  const defaultApoioDre = useMemo(() => {
    if (bandeira === 'vermelha') {
      return 'Avaliação conjunta com a DRE e o Comitê de Crise da SEDUC/PA sobre eventual flexibilização excepcional da rotina presencial, mobilização do Centro de Mídias da Educação Paraense (CEMEP) via programa "Aluno sem aula zero", disponibilização do banco de cadernos de atividades complementares e articulação com Defesa Civil/Saúde/Abastecimento de Água.';
    }
    return 'Acompanhamento técnico da DRE, envio de orientações atualizadas do Comitê de Crise SEDUC/PA, disponibilização preventiva de cadernos de atividades complementares e articulação com os órgãos municipais de Defesa Civil e abastecimento de água.';
  }, [bandeira]);

  const [descricao, setDescricao] = useState(defaultDescricao);
  const [impactos, setImpactos] = useState(defaultImpactos);
  const [medidas, setMedidas] = useState(defaultMedidas);
  const [apoioDre, setApoioDre] = useState(defaultApoioDre);
  const [copied, setCopied] = useState(false);

  const formattedMemorandumText = useMemo(() => {
    const dreClean = school.dre.replace(/^DRE\s+/i, '');
    return [
      'GOVERNO DO ESTADO DO PARÁ',
      'SECRETARIA DE ESTADO DE EDUCAÇÃO (SEDUC/PA)',
      'PROTOCOLO DE GESTÃO E RESPOSTA AOS EFEITOS DO EL NIÑO NAS ESCOLAS PÚBLICAS DO ESTADO DO PARÁ',
      '',
      `MEMORANDO Nº ${memoNumber} - ${school.nome.toUpperCase()}`,
      '',
      'À Sua Senhoria, o(a) Senhor(a)',
      `Diretor(a) da Diretoria Regional de Ensino – DRE ${dreClean}`,
      '',
      'Assunto: Comunicação de ocorrência e impactos relacionados aos efeitos do El Niño na unidade escolar.',
      `Classificação de Risco Atual: ${SEDUC_BANDEIRA_PROTOCOLS[bandeira].title.toUpperCase()} (${SEDUC_BANDEIRA_PROTOCOLS[bandeira].subtitle})`,
      '',
      'Senhor(a) Diretor(a),',
      '',
      `Por meio deste memorando, comunicamos a ocorrência de situação relacionada aos efeitos do El Niño na Escola ${school.nome}${school.codigoMec ? ` (Código INEP/MEC: ${school.codigoMec})` : ''}, localizada em ${school.endereco || `Zona Urbana/Rural de ${school.municipio}`}, no município de ${school.municipio} - PA.`,
      '',
      `Data da ocorrência ou da identificação dos impactos: ${dataOcorrencia}`,
      '',
      'Descrição da ocorrência e dos impactos identificados:',
      descricao,
      '',
      'Principais impactos sobre a comunidade escolar e as atividades pedagógicas:',
      impactos,
      '',
      'Medidas adotadas pela unidade escolar:',
      medidas,
      '',
      'Necessidade de apoio ou providências da DRE:',
      apoioDre,
      '',
      'Informamos que a situação relatada está relacionada à seguinte ameaça:',
      `(${threatQueimadasFumaca ? 'X' : ' '}) Queimadas e fumaça.`,
      `(${threatEstiagemAgua ? 'X' : ' '}) Estiagem e escassez de água.`,
      `(${threatOutra ? 'X' : ' '}) Outra situação associada aos efeitos do El Niño: ${threatOutra ? threatOutraTexto : '_________________________________________'}.`,
      '',
      'Ressaltamos que a presente comunicação tem como objetivo subsidiar o monitoramento da situação pela Diretoria Regional de Ensino, viabilizar os encaminhamentos necessários e apoiar a adoção de medidas de prevenção, proteção e resposta. Destacamos, ainda, a importância de garantir a continuidade pedagógica e o direito à educação dos estudantes, considerando as condições de segurança e saúde da comunidade escolar e as orientações dos órgãos competentes e da SEDUC/PA.',
      '',
      'Sem mais para o momento, colocamo-nos à disposição para prestar informações complementares.',
      '',
      'Atenciosamente,',
      '',
      `${diretorNome.trim() || '___________________________________________'}`,
      'Cargo: Diretor(a) Escolar',
      `Escola: ${school.nome}`,
      `Município: ${school.municipio} - PA`,
      `Data: ${dataOcorrencia}`,
      `Contato institucional: ${contatoInstitucional.trim() || '______________________________'}`,
    ].join('\n');
  }, [
    memoNumber,
    school,
    bandeira,
    dataOcorrencia,
    descricao,
    impactos,
    medidas,
    apoioDre,
    threatQueimadasFumaca,
    threatEstiagemAgua,
    threatOutra,
    threatOutraTexto,
    diretorNome,
    contatoInstitucional,
  ]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formattedMemorandumText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = formattedMemorandumText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const handlePrint = () => {
    const printWin = window.open('', '_blank', 'width=860,height=920');
    if (!printWin) return;
    const escaped = formattedMemorandumText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    printWin.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Anexo I - Memorando ${school.nome}</title>
  <style>
    body {
      font-family: "Times New Roman", Georgia, serif;
      color: #111827;
      margin: 36px 48px;
      line-height: 1.55;
      font-size: 12pt;
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #003585;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .header h1 {
      font-size: 13pt;
      margin: 0;
      color: #002661;
      text-transform: uppercase;
    }
    .header p {
      font-size: 10pt;
      margin: 4px 0 0;
      color: #374151;
    }
    pre {
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: "Times New Roman", Georgia, serif;
      font-size: 11.5pt;
      line-height: 1.55;
    }
    @media print {
      body { margin: 20mm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Governo do Estado do Pará · Secretaria de Estado de Educação (SEDUC/PA)</h1>
    <p>Memorando Oficial de Comunicação dos Efeitos do El Niño à Diretoria Regional de Ensino (DRE)</p>
  </div>
  <pre>${escaped}</pre>
  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`);
    printWin.document.close();
  };

  const gmailUrl = useMemo(() => {
    const subject = `MEMORANDO Nº ${memoNumber} - Comunicação de Ocorrência El Niño (${SEDUC_BANDEIRA_PROTOCOLS[bandeira].title}) - ${school.nome}`;
    return `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(formattedMemorandumText)}`;
  }, [memoNumber, bandeira, school.nome, formattedMemorandumText]);

  const protocolSpec = SEDUC_BANDEIRA_PROTOCOLS[bandeira];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="anexo-i-modal-title"
    >
      <div className="bg-white border border-[#D5E2F4] rounded-2xl shadow-xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#F8FAFE] border-b border-[#E3ECF8] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0046AD] text-white flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="anexo-i-modal-title"
                  className="text-base font-bold text-[#002661]"
                >
                  Memorando Oficial de Comunicação à DRE
                </h2>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-semibold rounded-full border ${protocolSpec.badgeBg} ${protocolSpec.badgeText} ${protocolSpec.badgeBorder}`}
                >
                  <Flag className="w-3 h-3" />
                  <span>
                    {protocolSpec.title} ({protocolSpec.subtitle})
                  </span>
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Protocolo de Gestão e Resposta aos Efeitos do El Niño nas Escolas Públicas do Estado do Pará
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700">
          {/* School & DRE Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-[#F4F7FB] border border-[#D5E2F4] rounded-xl">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase">
                Unidade Escolar
              </span>
              <p className="font-bold text-[#002661] mt-0.5">{school.nome}</p>
              {school.codigoMec && (
                <p className="text-[11px] font-mono text-slate-500">
                  Código MEC: {school.codigoMec}
                </p>
              )}
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase">
                Município / Destinatário
              </span>
              <p className="font-bold text-[#002661] mt-0.5">{school.municipio} - PA</p>
              <p className="text-[11px] text-slate-600">Diretoria: {school.dre}</p>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase">
                Métricas Meteorológicas (7d)
              </span>
              <p className="font-mono font-semibold text-slate-900 mt-0.5">
                Máx: {(school.tempMaximaC ?? 0).toFixed(1).replace('.', ',')} °C ·{' '}
                {school.diasEstiagem ?? 0}d secos
              </p>
              <p className="text-[11px] font-mono text-slate-600">
                Chuva: {school.chuvaAcumuladaMm ?? 0} mm (pico {school.pico24hMm ?? 0} mm/24h)
              </p>
            </div>
          </div>

          {/* Metadata Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Memorando Nº
              </label>
              <input
                type="text"
                value={memoNumber}
                onChange={(e) => setMemoNumber(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0046AD]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Data da Ocorrência
              </label>
              <input
                type="text"
                value={dataOcorrencia}
                onChange={(e) => setDataOcorrencia(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0046AD]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Nome do(a) Diretor(a) da Escola
              </label>
              <input
                type="text"
                placeholder="Ex.: Maria de Nazaré Silva"
                value={diretorNome}
                onChange={(e) => setDiretorNome(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0046AD]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Contato Institucional (E-mail / Tel)
              </label>
              <input
                type="text"
                placeholder="Ex.: (91) 98888-0000 / escola@seduc.pa.gov.br"
                value={contatoInstitucional}
                onChange={(e) => setContatoInstitucional(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0046AD]"
              />
            </div>
          </div>

          {/* Threat Classification Checkboxes */}
          <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-2.5">
            <p className="font-semibold text-slate-800">
              Ameaça Relacionada:
            </p>
            <div className="flex flex-wrap items-center gap-6">
              <label className="inline-flex items-center gap-2 cursor-pointer font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={threatQueimadasFumaca}
                  onChange={(e) => setThreatQueimadasFumaca(e.target.checked)}
                  className="rounded border-slate-300 text-[#0046AD] focus:ring-[#0046AD]"
                />
                <span>( ) Queimadas e fumaça</span>
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={threatEstiagemAgua}
                  onChange={(e) => setThreatEstiagemAgua(e.target.checked)}
                  className="rounded border-slate-300 text-[#0046AD] focus:ring-[#0046AD]"
                />
                <span>( ) Estiagem e escassez de água</span>
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={threatOutra}
                  onChange={(e) => setThreatOutra(e.target.checked)}
                  className="rounded border-slate-300 text-[#0046AD] focus:ring-[#0046AD]"
                />
                <span>( ) Outra situação associada aos efeitos do El Niño</span>
              </label>
            </div>

            {threatOutra && (
              <input
                type="text"
                value={threatOutraTexto}
                onChange={(e) => setThreatOutraTexto(e.target.value)}
                placeholder="Especifique outra situação (ex.: Calor extremo / Alagamento / Interrupção de transporte escolar)"
                className="w-full px-3 py-1.5 text-xs bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0046AD]"
              />
            )}
          </div>

          {/* Structured Textareas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                1. Descrição da ocorrência e dos impactos identificados
              </label>
              <textarea
                rows={4}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0046AD] leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                2. Principais impactos sobre a comunidade escolar e atividades pedagógicas
              </label>
              <textarea
                rows={4}
                value={impactos}
                onChange={(e) => setImpactos(e.target.value)}
                className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0046AD] leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                3. Medidas adotadas pela unidade escolar
              </label>
              <textarea
                rows={4}
                value={medidas}
                onChange={(e) => setMedidas(e.target.value)}
                className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0046AD] leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                4. Necessidade de apoio ou providências da DRE (CEMEP / Cadernos / Água)
              </label>
              <textarea
                rows={4}
                value={apoioDre}
                onChange={(e) => setApoioDre(e.target.value)}
                className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0046AD] leading-relaxed"
              />
            </div>
          </div>

          {/* Live Preview of Full Formatted Document */}
          <div>
            <span className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Pré-visualização Integral do Memorando Oficial
            </span>
            <pre className="p-4 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px] text-slate-800 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
              {formattedMemorandumText}
            </pre>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-[#F8FAFE] border-t border-[#E3ECF8] flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Fechar
          </button>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#003585] bg-[#EBF2FC] border border-[#C5D9F7] rounded-lg hover:bg-[#DCE8FA] transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Memorando Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Texto do Memorando</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <Printer className="w-3.5 h-3.5 text-[#0046AD]" />
              <span>Imprimir / Salvar PDF</span>
            </button>

            <a
              href={gmailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0046AD] rounded-lg hover:bg-[#003585] shadow-xs transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Enviar à {school.dre} via Gmail</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
