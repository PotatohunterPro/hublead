# 📄 DOCUMENTO MESTRE: HUB LEADS PWA
**Versão:** 3.1 | **Status:** Em execução
**Projeto:** Aplicativo de Captação de Leads em Campo (Hunter)
**Infraestrutura:** Oracle VPS (Always Free, Ubuntu 24.04, 1GB RAM)
**Domínio:** `hublead.pradodacostasolucoes.com.br` (DNS apontado → 163.176.145.29)

---

## 1. VISÃO GERAL E OBJETIVO

PWA de captação de leads em campo para a **Hub Solução**. O hunter fotografa o cartão de visita do cliente (frente e verso), preenche um formulário express de 30 segundos e toca em **Salvar Lead**. O sistema envia ao servidor, que enriquece o cadastro (BrasilAPI) e roda a **IA de visão (Ollama)** sobre as fotos do cartão. O lead entra na **Fila de Envio** — fica **laranja** enquanto a IA analisa e fica **verde** quando está pronto para ser enviado ao gestor via **WhatsApp**.

## 2. FLUXO DO HUNTER (CAPTAÇÃO EM CAMPO)

```
1. Aba "Novo" → busca por CNPJ (opcional, autopreenche Receita Federal)
2. Fotografa o cartão de visita: frente + verso (2 espaços de foto)
3. Preenche contato e observações rápidas
4. Toca em "Salvar Lead"
      ↓
5. Lead salvo local (IndexedDB) e enviado ao servidor
      ↓ PocketBase enriquece via BrasilAPI
      ↓ Ollama Vision analisa frente+verso e consolida os dados
6. Aba "Fila": item 🟠 "Analisando com IA..." → 🟢 "Pronto para enviar"
      ↓
7. Hunter toca em "Enviar no WhatsApp"
      ↓ mensagem formatada abre no wa.me (destino: nº cadastrado)
8. Lead sai da fila e entra no "Histórico de Envios"
```

### Regras do fluxo
- O envio no WhatsApp **só fica disponível após a análise IA** concluir (item verde)
- Falha na análise → item **vermelho** com "Tentar novamente" e "Enviar mesmo assim"
- A IA **complementa** os dados (empresa, contato, telefone, e-mail, endereço, segmento, site, redes) **sem sobrescrever** o que o hunter digitou
- Offline: o lead é salvo localmente e a análise roda automaticamente ao reconectar (retry a cada 30s + evento online)

## 3. SCANNER DE CARTÕES (IA VISION)

- **Modelo:** `hf.co/LiquidAI/LFM2.5-VL-450M-GGUF:Q8_0` no **Ollama local** da VPS (`127.0.0.1:11434`)
- **Multi-imagem:** frente + verso vão **juntos** numa única chamada; o modelo consolida tudo num único JSON
- **Endpoint:** `POST /api/extract-card` (hook `pb_hooks/ocr.pb.js`)
- **Chaves extraídas:** `nome_empresa`, `nome_contato`, `telefone`, `whatsapp`, `email`, `site`, `endereco`, `cidade`, `ramo_atividade`, `redes_sociais`
- `site` e `redes_sociais` (sem campo próprio no form) são guardados nas **Anotações** do lead
- Nenhuma URL/credencial do Ollama fica exposta no frontend — acesso interno ao servidor

## 4. STATUS DOS LEADS NO MAPA

| Cor | Status | Significado |
|---|---|---|
| 🔵 Azul | `pendente` | Gestor adicionou (curadoria), hunter ainda não visitou |
| 🟡 Amarelo | `visitado` | Hunter visitou mas não fechou |
| 🟢 Verde | `convertido` | Fechou negócio (sistema/maquininha/contador) |
| ⚪ Cinza | `descartado` | Sem interesse / loja fechada |

**Fila de Envio (aba Fila):** 🟠 analisando IA · 🔴 falha na análise · 🟢 pronto para enviar

## 5. ARQUITETURA TÉCNICA

```
hublead.pradodacostasolucoes.com.br (HTTPS)
  ├── /            → PWA estático (Vanilla JS + Dexie.js + Leaflet)
  ├── /api/*       → PocketBase (proxy Nginx → 127.0.0.1:8090)
  ├── /_/          → PocketBase Admin UI
  └── /evolution/* → Evolution API (proxy Nginx → 127.0.0.1:8080)

VPS (host): Ollama em 127.0.0.1:11434
  (container do PocketBase acessa via host.docker.internal — extra_hosts no compose)
```

| Componente | Versão | Porta Interna | Exposta? |
|-----------|--------|--------------|----------|
| Nginx | alpine | 80/443 | Sim |
| PostgreSQL | 16-alpine | 5432 | Não |
| PocketBase | latest | 8090 | Não (via Nginx) |
| Evolution API | v2.3.7 | 8080 | Não (via Nginx) |
| Ollama + LFM2.5-VL Q8_0 | hf.co/LiquidAI/LFM2.5-VL-450M-GGUF:Q8_0 | 11434 | Não (host only) |

## 6. ENDPOINTS CUSTOM (pb_hooks)

| Rota | Método | Função |
|------|--------|--------|
| `/api/scrape/url` | POST | Cria/atualiza lead por CNPJ ou URL (BrasilAPI + geocode) |
| `/api/scrape/cnpj/:cnpj` | GET | Consulta CNPJ na BrasilAPI (autopreenchimento do form) |
| `/api/scrape/batch` | POST | Adiciona múltiplos CNPJs em lote (máx. 20) |
| `/api/scrape/leads` | GET | Lista leads (filtros status/limit/page) |
| `/api/scrape/leads/:id` | PATCH | Atualiza status/empresa/contatos/segmento/email |
| `/api/scrape/leads/:id` | DELETE | Exclui um lead do servidor |
| `/api/scrape/geocode` | GET | Geocoding de endereço (Nominatim) |
| `/api/extract-card` | POST | OCR multi-imagem do cartão via Ollama Vision → JSON |

## 7. FUNCIONALIDADES POR ABA

| Aba | Função |
|-----|--------|
| **Resumo** | Métricas do dia, pendências, conversão, gráfico de 7 dias |
| **Sugeridos** | Curadoria do gestor: cola URL/CNPJs da Casa dos Dados → pin no mapa |
| **Novo** | Form express: CNPJ (autopreenche), fotos frente/verso do cartão, contato, detalhes do sistema (accordion) |
| **Mapa** | Leaflet com pins coloridos por status + heatmap + navegação GPS |
| **Fila** | **Fila de Envio** (🟠 analisando → 🟢 pronto → botão WhatsApp) e **Histórico** (enviados) — ambos com **editar/excluir** |

### Edição e exclusão
- Leads da Fila e do Histórico podem ser **editados** (formulário recarrega todos os dados; alterações re-sincronizam com o servidor) ou **excluídos** (remove lead + fotos + histórico local **e** o registro do PocketBase)
- Registros antigos do histórico sem vínculo tentam casar por empresa + WhatsApp

## 8. DADOS (IndexedDB — Dexie v5)

Tabela única `leads` com os campos do formulário +:
- `pbId` — registro correspondente no PocketBase
- `fonte` — `captacao_campo` / `casa_dados` / `brasil_api`
- `iaStatus` — `analisando` / `pronto` / `erro`
- `enviado` + `enviadoEm` — controle da fila de envio WhatsApp
- `syncStatus` — `synced` / `pending` (re-sincronização)

Tabelas auxiliares: `fotos` (frente+verso por leadId), `historico` (leads enviados, com `leadId`), `fila` (legado).

## 9. ENVIO WHATSAPP

- Saída via **wa.me** (100% confiável, sem dependência de containers): abre o WhatsApp com a mensagem formatada + copia o texto para o clipboard
- **Destino (prioridade):** "WhatsApp de envio" (config) → celular do Hunter (cadastro inicial) → contato do lead (último recurso). Sempre com prefixo +55
- Evolution API segue disponível em `/evolution/*` para uso futuro

## 10. SERVICE WORKER / ATUALIZAÇÕES

- Assets do próprio app (js/css/html): **network-first** — o celular sempre recebe a versão nova após deploy; cache serve apenas offline
- CDNs (Dexie/Leaflet): cache-first (versões fixas)
- Tiles do OpenStreetMap: cache-first com storage próprio (`-tiles`)
- API (`/api/*`): sempre rede

## 11. INSTALAÇÃO VPS (resumo)

```bash
# 1. Enviar o projeto
scp -r . ubuntu@163.176.145.29:~/hubleads

# 2. Infra (Docker, Postgres, PocketBase, Evolution, Nginx, SSL)
ssh ubuntu@163.176.145.29
cd ~/hubleads/infra && sudo bash install.sh

# 3. Ollama + modelo de visão (host)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull hf.co/LiquidAI/LFM2.5-VL-450M-GGUF:Q8_0

# 4. Recriar o PocketBase (carrega pb_hooks + extra_hosts do Ollama)
cd ~/hubleads/infra && docker compose up -d --force-recreate pocketbase

# 5. Frontend → /var/www/hublead (nginx serve o PWA)
```

### Operação
| Comando | Função |
|---|---|
| `sudo bash /opt/hubleads/doctor` | Diagnóstico completo |
| `sudo bash /opt/hubleads/backup.sh` | Backup manual (cron 03:00) |
| `docker compose ps` (em `/opt/hubleads`) | Status dos containers |

## 12. ESTRUTURA DO PROJETO

```
hubleads/
├── index.html              # SPA (5 abas)
├── manifest.json           # PWA
├── sw.js                   # Service Worker (network-first p/ app assets)
├── css/                    # design tokens + componentes
├── js/
│   ├── db.js               # IndexedDB (Dexie v5) + sync PocketBase + fila
│   ├── api.js              # wa.me, CNPJ (BrasilAPI), extrairDadosCartao (IA)
│   ├── camera.js           # 2 slots de foto (frente/verso) + compressão
│   ├── form.js             # form express, edição de leads, submit → fila
│   ├── map.js              # Leaflet + heatmap
│   ├── sugeridos.js        # curadoria do gestor (URL/CNPJs)
│   └── app.js              # controller: fila de envio, pipeline IA, dashboard
├── pb_hooks/
│   ├── scrape.pb.js        # leads: CRUD + BrasilAPI + geocode
│   └── ocr.pb.js           # /api/extract-card (Ollama Vision multi-imagem)
├── infra/                  # compose, nginx, install/backup/doctor
└── docs/                   # este documento + schemas
```

## 13. ESTADO DA IMPLEMENTAÇÃO

### ✅ Concluído
- Form express com autopreenchimento CNPJ (BrasilAPI) e GPS em background
- Scanner de cartões frente/verso via Ollama Vision (multi-imagem consolidada)
- Fluxo Salvar → Servidor → IA → Fila (🟠→🟢) → WhatsApp → Histórico
- Edição e exclusão de leads (fila + histórico, com sync no servidor)
- Mapa com pins/heatmap; curadoria do gestor (Casa dos Dados / lote CNPJs)
- SW network-first (sem mix de versões no celular)
- Infra completa (compose, nginx, SSL, backup, doctor) + Ollama no host

### ⏳ Pendente (manual na VPS)
- Instalar Ollama + modelo na VPS (`ollama pull hf.co/LiquidAI/LFM2.5-VL-450M-GGUF:Q8_0`)
- Recriar container do PocketBase após atualizar `pb_hooks/`
- Deploy do frontend em `/var/www/hublead`
- Teste ponta a ponta (foto → salvar → IA → fila verde → WhatsApp)
- Criar collections `leads`/`hunters` no admin PocketBase (ver POCKETBASE_SCHEMA.md)
