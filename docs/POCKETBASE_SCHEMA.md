# PocketBase Collections — Hub Leads

Schema das coleções usado pelo sistema.  
Criar via Admin UI em `https://hublead.pradodacostasolucoes.com.br/_/`.

---

## Collection: `leads`

Armazena leads adicionados pelo gestor (scraping da Casa dos Dados).

| Campo | Tipo | Regras | Descrição |
|-------|------|--------|-----------|
| `cnpj` | Text (14) | único | CNPJ sem formatação |
| `empresa` | Text (200) | obrigatório | Razão social / nome fantasia |
| `endereco` | Text (300) | opcional | Endereço completo |
| `cnae` | Text (10) | opcional | Código CNAE |
| `telefone` | Text (20) | opcional | Telefone extraído |
| `cidade` | Text (100) | opcional | Cidade/Estado |
| `coords` | JSON | opcional | `{ "lat": -21.4, "lng": -48.3 }` |
| `status` | Select | padrão: `pendente` | `pendente`, `visitado`, `convertido`, `descartado` |
| `hunterId` | Relation → hunters | opcional | Hunter que visitou |
| `fonte` | Text (50) | padrão: `casa_dados` | Origem do lead |
| `urlOriginal` | URL (500) | opcional | Link original da Casa dos Dados |
| `dataAdicionado` | Datetime | automático | Quando foi adicionado |

**Permissões (RLS):**
- List: qualquer user autenticado
- View: qualquer user autenticado
- Create: qualquer user autenticado (via `/api/scrape/url`)
- Update: admin ou hunter owner
- Delete: apenas admin

---

## Collection: `hunters`

Cadastro dos hunters da equipe.

| Campo | Tipo | Regras | Descrição |
|-------|------|--------|-----------|
| `nome` | Text (100) | obrigatório | Nome do hunter |
| `email` | Email | único | E-mail de login |
| `senha` | Text | — | (hash gerado pelo PocketBase) |
| `celular` | Text (20) | opcional | WhatsApp do hunter |
| `ativo` | Bool | padrão: true | Se está ativo na equipe |

---

## Endpoints Custom (em `pb_hooks/scrape.pb.js`)

### POST `/api/scrape/url`
Adiciona lead via URL da Casa dos Dados.

**Body:** `{ "url": "...", "hunterId": "..." }`  
**Resposta:** `{ "success": true, "lead": {...} }`  
**Fluxo:** scraping → extração → geocoding Nominatim → salvar lead

### GET `/api/scrape/leads?status=&limit=&page=`
Lista leads com filtro opcional por status.

### PATCH `/api/scrape/leads/:id`
Atualiza status/coords de um lead.

**Body:** `{ "status": "visitado" }`

### GET `/api/scrape/geocode?endereco=...`
Geocoding de endereço via Nominatim (OpenStreetMap).

---

## Criar no Admin

1. Acessar `/_/`
2. Criar collection `hunters` com os campos acima
3. Criar collection `leads` com os campos acima
4. Habilitar API rules conforme tabela de permissões
5. Upload de `pb_hooks/scrape.pb.js` via admin ou volume Docker
   - Se usar volume: montar em `/pb_hooks/` no container
   - Reiniciar PocketBase
6. Adicionar ao menos 1 hunter manualmente (admin) para testar o fluxo