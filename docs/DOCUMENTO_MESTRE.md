# 📄 DOCUMENTO MESTRE: HUB LEADS PWA
**Versão:** 2.0 | **Status:** Em execução
**Projeto:** Aplicativo de Captação de Leads em Campo (Hunter)
**Infraestrutura:** Oracle VPS (Always Free, Ubuntu 24.04, 1GB RAM)
**Domínio:** `hublead.pradodacostasolucoes.com.br` (DNS já apontado → 163.176.145.29)

---

## 1. VISÃO GERAL E OBJETIVO

PWA de captação de leads em campo para a **Hub Solução**. O gestor faz a curadoria de empresas (scraping sob demanda da Casa dos Dados), o hunter visita as lojas no mapa e capta os leads — com foto da fachada, GPS, e envio automático formatado para o grupo comercial via WhatsApp.

## 2. ESTRATÉGIA: SCRAPING SOB DEMANDA

**Abandonado:** scraping em massa por CNAE/cidade (frágil, rate limit, leads ruins).

**Adotado:** o gestor cola a **URL individual** de uma empresa da Casa dos Dados:

```
URL: https://casadosdados.com.br/solucao/cnpj/68672122-hemilim-...
  ↓ POST /api/scrape/url (PocketBase hook)
  ↓ scraping + extração (razão social, endereço, CNAE, telefone)
  ↓ geocoding Nominatim (OpenStreetMap, gratuito, 1 req/s)
  ↓ lead salvo com coords GPS no PocketBase
  ↓ aparece no mapa como pin azul (pendente)
```

**Fluxo do usuário:**

### Gestor (computador)
1. Filtra empresas na Casa dos Dados
2. Copia a URL → cola no Hub Leads → **"Adicionar ao Mapa"**
3. Lead aparece no mapa com pin azul

### Hunter (celular)
1. Abre a aba **Mapa** → vê pins azuis (pré-qualificadas)
2. Clica no pin → dados da empresa + botão **"Navegar até"** (Google Maps)
3. Visita a loja → aba **Captação** → preenche dados reais (foto, contato, sistema atual)
4. Lead muda de cor (azul → amarelo/verde conforme resultado)

## 3. STATUS VISUAL DOS LEADS

| Cor | Status | Significado |
|---|---|---|
| 🔵 Azul | `pendente` | Gestor adicionou, hunter ainda não visitou |
| 🟡 Amarelo | `visitado` | Hunter visitou mas não fechou |
| 🟢 Verde | `convertido` | Fechou negócio (sistema/maquininha/contador) |
| ⚪ Cinza | `descartado` | Sem interesse / loja fechada |

**Mapa de calor:** áreas com muitos pins azuis = região de oportunidades; verdes = região produtiva.

## 4. ARQUITETURA TÉCNICA

```
hublead.pradodacostasolucoes.com.br (HTTPS)
  ├── /            → PWA estático (Vanilla JS + Dexie.js + Leaflet)
  ├── /api/*       → PocketBase (proxy Nginx → 127.0.0.1:8090)
  ├── /_/          → PocketBase Admin UI
  └── /evolution/* → Evolution API (proxy Nginx → 127.0.0.1:8080)
```

| Componente | Versão | Porta Interna | Exposta? |
|-----------|--------|--------------|----------|
| Nginx | alpine | 80/443 | Sim |
| PostgreSQL | 16-alpine | 5432 | Não |
| PocketBase | latest | 8090 | Não (via Nginx) |
| Evolution API | v2.3.7 | 8080 | Não (via Nginx) |

## 5. ENDPOINTS CUSTOM (pb_hooks/scrape.pb.js)

| Rota | Método | Função |
|------|--------|--------|
| `/api/scrape/url` | POST | Recebe URL da Casa dos Dados → scraping → geocode → salva lead |
| `/api/scrape/leads` | GET | Lista leads do mapa (filtro por status) |
| `/api/scrape/leads/:id` | PATCH | Atualiza status/coords/hunterId |
| `/api/scrape/geocode` | GET | Geocoding de endereço via Nominatim |

**Geocoding:** Nominatim (OpenStreetMap) — gratuito, sem API key, 1 req/s, precisão 10-50m.
**API oficial Casa dos Dados (futuro):** campo "API Key" na Config → habilita busca em massa; vazio → apenas scraping de URLs (grátis).

## 6. FUNCIONALIDADES POR ABA

| Aba | Função |
|-----|--------|
| **Resumo** | Métricas do dia, conversão, gráfico 7 dias |
| **Sugeridos** | Input de URL da Casa dos Dados + lista de leads com ações (Captar, Visitei, Convertido, Descartar, Navegar) |
| **Novo** | Formulário de captação (empresa, sistema atual, interesse, contato, foto da fachada, GPS) |
| **Mapa** | Leaflet com pins coloridos + heatmap + popup com ações |
| **Fila** | Pendentes (retry 3x) e histórico de envios |

## 7. CRITÉRIOS DE ACEITE

1. [x] Gestor cola URL da Casa dos Dados → lead criado com coords GPS
2. [x] Lead aparece no mapa como pin azul (pendente)
3. [x] Hunter clica no pin → vê dados → botão "Navegar até" (Google Maps)
4. [x] Hunter visita → aba Captação → lead muda de cor (visitado/convertido)
5. [x] Mapa de calor mostra densidade de visitas
6. [x] Fila offline (modo avião → captar → reconectar → enviar)
7. [x] `install.sh` idempotente (pode rodar múltiplas vezes)
8. [ ] Deploy validado na VPS Oracle
9. [ ] APK via PWABuilder
10. [ ] Teste completo do fluxo ponta a ponta

## 8. ESTADO DA IMPLEMENTAÇÃO

### ✅ Concluído
- Frontend PWA completo (5 abas, offline-first, dark mode)
- Scraping sob demanda + geocoding (pb_hooks)
- Fila offline com retry + envio Evolution API (texto + foto)
- Mapa Leaflet com pins coloridos, heatmap e ações por popup
- Geolocalização automática no submit (GPS → fallback geocode)
- Sync de leads do mapa (criar/atualizar status no PocketBase)
- Infra: compose.yaml, install.sh (16 fases, rollback), update/backup/restore/doctor/uninstall
- Nginx reverse proxy + SSL Let's Encrypt + UFW + HSTS
- DNS apontado: `hublead.pradodacostasolucoes.com.br` → `163.176.145.29`

### ⏳ Pendente (manual na VPS)
- Executar `sudo bash install.sh` na VPS
- Criar collections `leads` e `hunters` no admin PocketBase (schema em `POCKETBASE_SCHEMA.md`)
- Conectar WhatsApp na Evolution API (QR Code)
- Teste ponta a ponta (URL → lead → mapa → visita → captação → WhatsApp)
- APK via PWABuilder (Fase 5)

## 9. PRÓXIMOS PASSOS

1. Enviar projeto para a VPS (`scp -r . ubuntu@163.176.145.29:~/hubleads`)
2. Rodar `sudo bash install.sh` (dentro de `infra/`)
3. Criar collections no PocketBase Admin
4. Conectar WhatsApp (Evolution API)
5. Testar fluxo completo
6. Gerar APK via PWABuilder
