# Hub Leads — Infraestrutura

PWA de captação de leads em campo da **Hub Solução**.

## Arquitetura

```
hublead.pradodacostasolucoes.com.br
  │
  ├── /           → PWA estático (frontend/)
  ├── /api/       → PocketBase (127.0.0.1:8090)
  └── /evolution/ → Evolution API (127.0.0.1:8080)
```

## Stack

| Componente | Versão | Porta Interna | Exposta? |
|-----------|--------|--------------|----------|
| Nginx | alpine | 80/443 | Sim |
| PostgreSQL | 16-alpine | 5432 | Não |
| PocketBase | latest | 8090 | Não (via Nginx) |
| Evolution API | v2.3.7 | 8080 | Não (via Nginx) |

## Quick Start

```bash
# Enviar arquivos para a VPS (a partir da pasta raiz do projeto)
scp -r . ubuntu@<IP_ORACLE>:~/hubleads

# Acessar a VPS
ssh ubuntu@<IP_ORACLE>
cd ~/hubleads/infra

# Instalar
sudo bash install.sh

# Acompanhar
tail -f /opt/hubleads/install.log
```

## Scripts

| Script | Função | Uso |
|--------|--------|-----|
| `install.sh` | Instalação completa | `sudo bash install.sh` |
| `update.sh` | Atualização | `sudo bash update.sh` |
| `backup.sh` | Backup diário | `sudo bash backup.sh` |
| `restore.sh` | Restaurar último backup | `sudo bash restore.sh` |
| `doctor` | Diagnóstico | `sudo bash doctor` |
| `uninstall.sh` | Desinstalação | `sudo bash uninstall.sh` |

## Modos do instalador

```bash
sudo bash install.sh            # interativo (menu se já instalado)
sudo bash install.sh --fresh    # força nova instalação
sudo bash install.sh --update   # atualiza mantendo dados
sudo bash install.sh --repair   # restaura compose + nginx
sudo bash install.sh --force    # reinstala preservando .env e volumes
sudo bash install.sh --selftest # apenas diagnóstico
```

## Segurança

- `.env` em `/opt/hubleads/.env` (modo 600)
- PostgreSQL e Evolution presos em `127.0.0.1`
- UFW: apenas 22, 80, 443
- HSTS + security headers
- SSL Let's Encrypt (certbot)

## Estrutura

```
infra/
├── compose.yaml                # Stack Docker
├── docker-compose.evolution.yml# Referência standalone Evolution
├── .env.example                # Template variáveis
├── install.sh / update.sh / backup.sh / restore.sh / doctor / uninstall.sh
├── nginx/
│   ├── nginx.conf
│   └── sites/hublead.conf
├── deploy/
│   ├── hubleads.service
│   └── install-summary-template.md
├── README.md
├── CHANGELOG.md
├── TODO.md
├── MASTER_PLAN.md
└── INSTALL_SUMMARY.md
```

## Referências

- Documento Mestre: `../docs/DOCUMENTO_MESTRE.md`
- Design Audit: `../docs/DESIGN_AUDIT.md`