# Hub Leads PWA (v2.0 Prática)

Captação de leads em campo para a **Hub Solução** — com curadoria inteligente (BrasilAPI / Casa dos Dados), mapa de calor, geolocalização e envio direto para o WhatsApp (`wa.me/`).

## 🎯 Curadoria Rápida & BrasilAPI

O **gestor faz a curadoria** pelo computador ou celular:

1. Cola a URL da empresa na Casa dos Dados (`https://casadosdados.com.br/solucao/cnpj/...`) OU apenas digita o **CNPJ** (avulso ou múltiplos em lote).
2. O sistema consulta dados oficiais da **Receita Federal via BrasilAPI** (Razão Social, Fantasia, CNAE, Endereço, Bairro, CEP, Telefone).
3. Geocodifica automaticamente (Nominatim/OpenStreetMap) e cria o lead com coordenadas GPS.
4. O lead aparece no mapa com pin azul 📍 para o hunter visitar.
5. Hunter clica no pin, navega até lá (Google Maps), realiza a abordagem e capta o lead.

### Cores dos pins no mapa

| Cor | Status | Significado |
|---|---|---|
| 🔵 Azul | `pendente` | Curadoria do gestor, hunter ainda não visitou |
| 🟡 Amarelo | `visitado` | Hunter visitou mas não fechou |
| 🟢 Verde | `convertido` | Fechou negócio / Aceitou demonstração |
| ⚪ Cinza | `descartado` | Sem interesse / Loja fechada |

## 🏗️ Arquitetura Enxuta

```
hublead.pradodacostasolucoes.com.br (HTTPS)
  ├── /            → PWA estático (Vanilla JS + Dexie.js + Leaflet)
  ├── /api/*       → PocketBase (proxy Nginx → 127.0.0.1:8090)
  └── /_/          → PocketBase Admin UI
```

**Stack na VPS Oracle (Always Free, Ubuntu 24.04):**
- `nginx:alpine` (reverse proxy + SSL Let's Encrypt)
- `ghcr.io/muchobien/pocketbase:latest` (backend com SQLite embutido + admin + hooks BrasilAPI)
- **Consumo total:** < 60 MB RAM (100% estável na VPS de 1GB).

## 📱 Funcionalidades

- **Formulário Express de 30s:** Campos essenciais na tela com botão de autopreenchimento por CNPJ.
- **Accordion de Detalhes:** Detalhes de sistema atual (mensalidade, suporte) organizados de forma recolhível.
- **Envio Direto via WhatsApp:** Abre `wa.me/` pré-formatado com emojis e cópia instantânea para a área de transferência.
- **Curadoria em Lote:** Cole múltiplos CNPJs para mapear bairros inteiros de uma vez.
- **Geolocalização em Background:** GPS obtido em segundo plano ao abrir a tela.
- **Mapa Leaflet & Heatmap:** Pins coloridos por status e mapa de calor por produtividade.
- **Offline-first:** Funciona 100% offline via IndexedDB (Dexie v4) + Service Worker (com cache de mapa).

## 🚀 Deploy na VPS

```bash
# 1. Enviar o projeto para a VPS
scp -r . ubuntu@163.176.145.29:~/hubleads

# 2. Acessar a VPS
ssh ubuntu@163.176.145.29
cd ~/hubleads/infra

# 3. Instalar
sudo bash install.sh

# 4. Diagnóstico de saúde
sudo bash doctor
```
