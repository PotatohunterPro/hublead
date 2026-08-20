# Hub Leads PWA

Captação de leads em campo para a **Hub Solução** — com scraping sob demanda (Casa dos Dados), mapa de calor, geolocalização e envio automático para o WhatsApp via Evolution API.

## 🎯 Nova estratégia: Scraping sob demanda

Em vez de buscar empresas em massa (frágil, rate limit), o **gestor faz a curadoria**:

1. Abre a Casa dos Dados no computador e encontra empresas interessantes
2. Copia a URL da empresa: `https://casadosdados.com.br/solucao/cnpj/...`
3. Cola no Hub Leads → botão **"Adicionar ao Mapa"**
4. O sistema extrai os dados, faz geocoding (Nominatim/OpenStreetMap) e cria o lead com GPS
5. O lead aparece no mapa com pin azul 📍 para o hunter visitar
6. Hunter navega até lá (Google Maps), capta e o lead muda de cor

### Cores dos pins no mapa

| Cor | Status | Significado |
|---|---|---|
| 🔵 Azul | `pendente` | Gestor adicionou, hunter ainda não visitou |
| 🟡 Amarelo | `visitado` | Hunter visitou mas não fechou |
| 🟢 Verde | `convertido` | Fechou negócio (sistema/maquininha/contador) |
| ⚪ Cinza | `descartado` | Sem interesse / loja fechada |

## 🏗️ Arquitetura

```
hublead.pradodacostasolucoes.com.br (HTTPS)
  ├── /            → PWA estático (Vanilla JS + Dexie.js + Leaflet)
  ├── /api/*       → PocketBase (proxy Nginx → 127.0.0.1:8090)
  ├── /_/          → PocketBase Admin UI
  └── /evolution/* → Evolution API (proxy Nginx → 127.0.0.1:8080)
```

**Stack na VPS Oracle (Always Free, Ubuntu 24.04):**
- `nginx:alpine` (reverse proxy + SSL Let's Encrypt)
- `postgres:16-alpine` (banco compartilhado)
- `ghcr.io/muchobien/pocketbase:latest` (backend + admin + scraping hooks)
- `evoapicloud/evolution-api:v2.3.7` (WhatsApp API)

## 📱 Funcionalidades

- Formulário guiado de captação com validação e máscara BR
- Captura de foto da fachada com compressão automática (JPEG 80%, máx 1280px)
- Geolocalização automática no submit (GPS → fallback geocode)
- **Scraping sob demanda**: cola URL da Casa dos Dados → lead com coords GPS
- Mapa de calor com pins coloridos por status (Leaflet + OpenStreetMap)
- Ações por lead: Captar, Visitei, Convertido, Descartar, Navegar até
- Envio automático para grupo do WhatsApp via Evolution API (texto + foto)
- Fila offline com retry (até 3 tentativas) + sincronização automática ao reconectar
- Dashboard com métricas do dia e gráfico de 7 dias
- Dark mode automático
- PWA instalável (offline-first)

## 🚀 Deploy na VPS

### Pré-requisitos
- DNS já apontado: `hublead.pradodacostasolucoes.com.br` → `163.176.145.29`
- Acesso SSH à VPS Oracle

### Passos

```bash
# 1. Enviar o projeto para a VPS
scp -r . ubuntu@163.176.145.29:~/hubleads

# 2. Acessar a VPS
ssh ubuntu@163.176.145.29
cd ~/hubleads/infra

# 3. Instalar (16 fases: Docker, Postgres, PocketBase, Evolution, Nginx, SSL, UFW, backup)
sudo bash install.sh

# 4. Acompanhar
tail -f /opt/hubleads/install.log
```

### Configurar PocketBase (1ª vez)
1. Acesse https://hublead.pradodacostasolucoes.com.br/_/
2. Crie a collection `hunters` (nome, email, senha, celular, ativo)
3. Crie a collection `leads` conforme `docs/POCKETBASE_SCHEMA.md`
4. Os hooks de scraping já vêm montados em `/pb_hooks` no container
5. Adicione ao menos 1 hunter manualmente para testar

## 🛠️ Operação

| Comando | Função |
|---|---|
| `sudo bash /opt/hubleads/doctor` | Diagnóstico completo |
| `sudo bash /opt/hubleads/backup.sh` | Backup manual (cron diário 03:00) |
| `sudo bash /opt/hubleads/restore.sh` | Restaurar último backup |
| `cd /opt/hubleads && docker compose ps` | Status dos containers |

## 📁 Estrutura

```
hubleads/
├── index.html              # SPA (5 abas: Resumo, Sugeridos, Novo, Mapa, Fila)
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker (cache-first)
├── css/
│   ├── design-tokens.css   # Design tokens Hub
│   └── globals.css         # Componentes
├── js/
│   ├── db.js               # IndexedDB (Dexie.js) + sync PocketBase
│   ├── api.js              # Evolution API + fila
│   ├── map.js              # Leaflet + heatmap + ações
│   ├── camera.js           # Captura/compressão de foto
│   ├── form.js             # Validação, GPS e submit
│   ├── sugeridos.js        # Scraping sob demanda (Casa dos Dados)
│   └── app.js              # App controller
├── pb_hooks/
│   └── scrape.pb.js        # Endpoints: /api/scrape/url, /leads, /geocode
├── infra/                  # Deploy na VPS (compose, nginx, scripts)
└── docs/                   # Documentação técnica
```

## 📚 Documentação

- `docs/DOCUMENTO_MESTRE.md` — documento mestre do projeto
- `docs/POCKETBASE_SCHEMA.md` — schema das collections
- `docs/DESIGN_AUDIT.md` — auditoria de design
- `infra/MASTER_PLAN.md` — plano de execução

## 🧪 Teste local

Abra o `index.html` no navegador do celular (ou `npx serve`). Funciona offline com dados locais; o scraping e a sincronização exigem o backend na VPS.
