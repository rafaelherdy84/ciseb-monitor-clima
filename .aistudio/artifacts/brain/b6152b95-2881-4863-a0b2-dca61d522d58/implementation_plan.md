# Plano de Implementação: Integração Google Maps Platform & Maps Grounding (SEDUC-PA)

## 1. Visão Geral e Objetivos
Integrar a base oficial do **Google Maps Platform** e o **Gemini Maps Grounding (`gemini-3.8-flash` com `googleMaps`)** ao sistema de monitoramento climático e Defesa Civil Escolar da SEDUC-PA, cobrindo os **144 municípios do Pará**:
1. **Mapa Interativo Google Maps**: Substituir o mapa vetorial estático por um mapa interativo real do Google Maps centrado no Estado do Pará, exibindo marcadores coloridos por nível de risco (Vermelho, Laranja, Azul Claro, Azul Escuro e Neutro), camada de calor/manchas térmicas e pluviométricas, além de janela de inspeção ao clicar em qualquer município.
2. **Imagem PNG via Google Maps Static API para o Telegram**: Gerar automaticamente a imagem oficial do mapa do Pará via **Google Maps Static API** com marcadores coloridos dos municípios em alerta crítico e legenda, exibindo-a na prévia do boletim do Telegram com opções para copiar a imagem (`Ctrl+V`) ou baixar em `.png`.
3. **Análise Territorial via Gemini Maps Grounding (`gemini-3.8-flash`)**: Ao selecionar um município ou gerar a análise de risco, consultar o modelo `gemini-3.8-flash` com a ferramenta `{ googleMaps: {} }` e `retrievalConfig.latLng` para obter:
   - Escolas estaduais e pontos de apoio/abrigo próximos;
   - Condições de acesso e rotas rodoviárias/fluviais (rios, rodovias estaduais/federais e áreas de várzea);
   - Links oficiais verificados do Google Maps (`groundingChunks.maps.uri`) exibidos diretamente na interface.

---

## 2. Arquitetura e Fluxo de Dados

### A. Provisionamento da Chave Google Maps Platform
- Executar o fluxo oficial de provisionamento de chave do Google Maps Platform no AI Studio (`CheckMapsDemoKeyEligibilityAndTos` → `show_aistudio_ui` com `google_maps_setup` → `ProvisionMaps...`), armazenando a chave de forma segura para uso no cliente (Maps JavaScript API) e no servidor (proxy `/api/maps/static-para` para a Google Maps Static API, sem expor chaves sensíveis).

### B. Backend (`server.ts`)
1. **Rota `GET /api/maps/static-para`**:
   - Recebe os municípios em alerta (ou consulta o cache atual dos 144 municípios) e monta a requisição para a **Google Maps Static API** (`https://maps.googleapis.com/maps/api/staticmap`) centrada no Pará (`center=-4.2,-52.5`, `zoom=5`, `size=800x600`, `scale=2`, `maptype=roadmap`).
   - Adiciona marcadores coloridos (`color:red`, `color:orange`, `color:blue`, `color:0x38BDF8`) para os municípios em risco hídrico e térmico, retornando a imagem PNG diretamente para o frontend exibir na prévia do Telegram e permitir download/cópia.
2. **Rota `POST /api/maps/grounding`**:
   - Recebe `{ municipio, dre, lat, lon, tipoRisco, tempMaximaC, chuvaAcumuladaMm, pico24hMm }`.
   - Chama `ai.models.generateContent` com `model: 'gemini-3.8-flash'`, `tools: [{ googleMaps: {} }]` e `toolConfig: { retrievalConfig: { latLng: { latitude: lat, longitude: lon } } }` (sem `responseMimeType` ou `responseSchema`, conforme especificação do Maps Grounding).
   - Extrai o texto Markdown da análise territorial (escolas estaduais, pontos de apoio da Defesa Civil, rotas rodoviárias/fluviais e áreas de risco próximas) e os links oficiais `groundingChunks` (`maps.uri` e `maps.title`).

### C. Frontend (`src/components/ParaRiskMap.tsx`, `src/components/TelegramPreview.tsx`, `src/App.tsx`)
1. **`ParaRiskMap.tsx`**:
   - Carregar a **Google Maps JavaScript API** (`@googlemaps/js-api-loader`) com a chave provisionada.
   - Renderizar o mapa interativo do Pará com `AdvancedMarkerElement` / marcadores customizados nas 4 cores de risco (Vermelho, Laranja, Azul Claro, Azul Escuro) + camada `HeatmapLayer` (biblioteca `visualization`) para as manchas térmicas e pluviométricas.
   - Manter os filtros rápidos (`Todos`, `Enchentes`, `Queimadas`) e o inspetor do município selecionado.
2. **Painel de Inteligência Territorial (Maps Grounding)**:
   - Ao clicar em um município no mapa ou na tabela, exibir um painel dedicado com os dados reais do Google Maps Grounding: escolas estaduais próximas, rotas rodoviárias/fluviais, pontos de apoio e links clicáveis do Google Maps (`groundingChunks`).
3. **`TelegramPreview.tsx`**:
   - Exibir a imagem PNG gerada pela **Google Maps Static API** (`/api/maps/static-para`) no topo do card da mensagem do Telegram, mantendo os botões **Copiar Mapa**, **Baixar Mapa (.png)**, **Copiar Texto** e **Baixar .txt**.

---

## 3. Etapas de Execução
1. Provisionar a chave do Google Maps Platform via fluxo oficial do AI Studio.
2. Instalar `@googlemaps/js-api-loader` (e `@types/google.maps` se necessário).
3. Implementar `/api/maps/static-para` e `/api/maps/grounding` no `server.ts`.
4. Atualizar `ParaRiskMap.tsx` para usar Google Maps interativo + HeatmapLayer + marcadores de risco.
5. Integrar a imagem da Google Maps Static API no `TelegramPreview.tsx` e o painel de Maps Grounding no `App.tsx`.
6. Compilar (`compile_applet`), validar tipos (`lint_applet`) e reiniciar o servidor (`restart_dev_server`).
