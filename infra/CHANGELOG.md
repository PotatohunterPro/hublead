# CHANGELOG — Hub Leads

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/) e [SemVer](https://semver.org/lang/pt-BR/).

## [1.0.0] — 2026-08-20

### Adicionado
- PWA Hub Leads (frontend vanilla JS) com 5 abas: Resumo, Sugeridos, Novo Lead, Mapa, Fila
- Design System Apple-Inspired 1.0 com tokens Hub (design-tokens.css + globals.css)
- Formulário de captação com validação, máscara BR, foto da fachada (compressão client-side)
- Captura automática de geolocalização no submit
- Mapa de calor (Leaflet + Leaflet.heat) com gradiente Hub e clusters
- Sugestão de leads (mock Casa dos Dados) com cruzamento por CNPJ no IndexedDB
- Fila offline (Dexie.js) com retry 3x e reenvio automático ao reconectar
- Envio Evolution API (text + media)
- Dashboard com métricas do dia e gráfico 7 dias
- Dark mode automático
- PWA: manifest.json, sw.js (cache-first), instalação em Android/iOS
- Onboarding simplificado (nome + celular do Hunter)
- Configurações avançadas (Evolution API, grupo, chaves) colapsáveis

### Infraestrutura
- `compose.yaml` (PostgreSQL 16 + PocketBase + Evolution API v2.3.7)
- `install.sh` idempotente com 16 fases, rollback e 5 modos
- `update.sh`, `backup.sh`, `restore.sh`, `doctor`, `uninstall.sh`
- Nginx reverse proxy com rotas `/`, `/api/`, `/evolution/` e SSL
- Systemd unit, cron de backup diário, retenção 30 dias

### Segurança
- Chaves armazenadas em `/opt/hubleads/.env` (modo 600)
- Portas 8080/8090 presas em 127.0.0.1
- UFW libera apenas 22, 80, 443
- HSTS + security headers no Nginx

## [0.9.0] — 2026-08-19

### Adicionado
- Documento Mestre (docs/DOCUMENTO_MESTRE.md)
- Renomeação do projeto para Hub Leads (pasta `hubleads/`)
- Correção de duplicação no bottom nav
- Aba Sugeridos com filtros cidade/segmento

### Notas
- Versão anterior (hub-hunter) deprecada, substituída por `hubleads/`
