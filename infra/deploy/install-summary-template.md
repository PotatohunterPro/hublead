# 📋 INSTALL SUMMARY — HUB LEADS

> Gerado automaticamente pelo `install.sh` em `<data>`.  
> ⚠️ **Contém credenciais sensíveis. Não compartilhe.**

---

## 1. Acesso ao Servidor

| Item | Valor |
|------|-------|
| IP / Host | `<IP_ORACLE>` |
| Usuário | `<USUARIO_SSH>` |
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
| E-mail | `<POCKETBASE_ADMIN_EMAIL>` |
| Senha | `<POCKETBASE_ADMIN_PASSWORD>` |

### Evolution API
| Campo | Valor |
|-------|-------|
| API Key | `<EVOLUTION_API_KEY>` |
| Instância | `<EVOLUTION_INSTANCE_NAME>` |

### PostgreSQL
| Campo | Valor |
|-------|-------|
| Banco | `hubleads` / `evolution` |
| Usuário | `postgres` |
| Senha | `<POSTGRES_PASSWORD>` |

## 4. Comandos Úteis

```bash
# Ver status da stack
cd /opt/hubleads && docker compose ps

# Ver logs
docker compose logs -f --tail 100

# Backup manual
sudo bash /opt/hubleads/backup.sh

# Restaurar último backup
sudo bash /opt/hubleads/restore.sh

# Diagnóstico
sudo bash /opt/hubleads/doctor

# Atualizar
sudo bash /opt/hubleads/update.sh
```

## 5. Rotina de Backup

- Cron: **diariamente às 03:00**
- Retenção: **30 dias**
- Local: `/opt/hubleads/backups/`

## 6. Notas

- UFW ativo: portas 22, 80, 443
- PostgreSQL e Evolution **não** expostos publicamente (127.0.0.1)
- SSL Let's Encrypt com renovação automática (certbot)
