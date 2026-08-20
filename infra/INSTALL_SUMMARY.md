# 📋 INSTALL SUMMARY — HUB LEADS

> ⚠️ **Este arquivo é um TEMPLATE.** O `install.sh` gera a versão final em `/opt/hubleads/INSTALL_SUMMARY.md` com as credenciais reais. **Não preencha manualmente e não suba para o git.**

---

## 1. Acesso ao Servidor

| Item | Valor |
|------|-------|
| IP / Host | `<IP_ORACLE>` |
| Usuário SSH | `<USUARIO>` |
| Domínio | https://hublead.pradodacostasolucoes.com.br |
| Caminho do app | `/opt/hubleads` |
| Log de instalação | `/opt/hubleads/install.log` |

## 2. URLs do Sistema

| Serviço | URL |
|---------|-----|
| PWA (app) | https://hublead.pradodacostasolucoes.com.br/ |
| PocketBase Admin | https://hublead.pradodacostasolucoes.com.br/_/ |
| Evolution API | https://hublead.pradodacostasolucoes.com.br/evolution/ |

## 3. Credenciais

### PocketBase Admin
| Campo | Valor |
|-------|-------|
| E-mail | `admin@hubsolucao.com.br` |
| Senha | (definida no 1º acesso ao admin) |

### Evolution API
| Campo | Valor |
|-------|-------|
| API Key | `<EVOLUTION_API_KEY>` (no .env) |
| Instância | `hub_hunter` |

### PostgreSQL
| Campo | Valor |
|-------|-------|
| Banco | `hubleads` / `evolution` |
| Usuário | `postgres` |
| Senha | `<POSTGRES_PASSWORD>` (no .env) |

## 4. Comandos Úteis

```bash
cd /opt/hubleads
docker compose ps            # status
docker compose logs -f       # logs
sudo bash backup.sh          # backup manual
sudo bash restore.sh         # restaurar último backup
sudo bash doctor             # diagnóstico
```

## 5. Rotina de Backup

- Cron: **diariamente às 03:00**
- Retenção: **30 dias**
- Local: `/opt/hubleads/backups/`
