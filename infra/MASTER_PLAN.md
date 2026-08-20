# MASTER PLAN — Hub Leads

**Status:** Em execução | **Início:** 20/08/2026 | **Previsão:** 10 dias úteis

---

## Visão

PWA de captação de leads em campo para a **Hub Solução**, com foto, geolocalização, mapa de calor e envio automático para o WhatsApp comercial via Evolution API.

## Arquitetura

```
hublead.pradodacostasolucoes.com.br
  ├── /           → PWA estático (raiz do projeto)
  ├── /api/       → PocketBase (proxy Nginx → 127.0.0.1:8090)
  └── /evolution/ → Evolution API (proxy Nginx → 127.0.0.1:8080)
```

## Fases

### Fase 1 — Infraestrutura Oracle VPS (Dias 1-2)
- [x] Estrutura de diretórios e compose.yaml
- [x] Scripts de operação (install, update, backup, restore, doctor, uninstall)
- [x] Nginx reverse proxy + SSL
- [x] Apontar DNS `hublead.pradodacostasolucoes.com.br` para IP da Oracle
- [ ] Executar install.sh e validar
- [x] Configurar UFW

### Fase 2 — Backend (PocketBase) (Dia 3)
- [ ] Acessar admin em `/_/`
- [ ] Criar collection `leads` (campos: empresa, cnpj, empresa, endereco, coords, status, etc.)
- [ ] Criar collection `hunters` (nome, email, senha, celular, ativo)
- [ ] Configurar regras de acesso (RLS)
- [x] Criar endpoint proxy para Casa dos Dados

### Fase 3 — Integrações (Dias 4-5)
- [ ] Evolution API: conectar WhatsApp (QR Code)
- [x] Casa dos Dados: endpoint via PocketBase
- [ ] Testar envio de lead completo (texto + imagem)

### Fase 4 — Frontend PWA (Dias 6-9)
- [x] HTML/CSS/JS vanilla com design tokens
- [x] Formulário, câmera, geolocalização
- [x] Mapa de calor Leaflet
- [x] Fila offline (IndexedDB)
- [x] Ajustar URLs para `/api/` e `/evolution/` (relativas)
- [x] Integrar scraping sob demanda (URLs individuais)
- [ ] Tela de QR Code Evolution

### Fase 5 — Empacotamento e Testes (Dia 10)
- [ ] Gerar APK via PWABuilder
- [ ] Teste modo avião → lead → reconectar → enviar
- [ ] Teste de carga (50 leads)
- [ ] Teste de recovery (restore backup)
- [ ] Auditoria de segurança

## Stack

| Componente | Versão | Porta | Exposta? |
|-----------|--------|-------|---------|
| Nginx | alpine | 80/443 | Sim (pública) |
| PostgreSQL | 16-alpine | 5432 | Não (127.0.0.1) |
| PocketBase | latest | 8090 | Não (via Nginx) |
| Evolution API | v2.3.7 | 8080 | Não (via Nginx) |

## Entregáveis

- [x] Código frontend (SPA vanilla)
- [x] Docker Compose stack
- [x] Scripts de operação
- [x] Nginx + SSL
- [ ] Deploy funcional na Oracle VPS
- [ ] APK Android
- [ ] Documentação de usuário final