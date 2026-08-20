// ============================================================
//  HUB LEADS — Custom PocketBase Hooks
//  Scraping sob demanda + geocoding + gestão de leads no mapa
//
//  Endpoints:
//    POST   /api/scrape/url           → adiciona lead de URL da Casa dos Dados
//    GET    /api/scrape/leads         → lista leads do mapa (com filtros)
//    PATCH  /api/scrape/leads/:id     → atualiza status/coords de um lead
//    GET    /api/scrape/geocode       → geocoding de um endereço (Nominatim)
// ============================================================

const SCRAPE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const GEO_USER_AGENT = 'HubLeads/1.0 (contato@hubsolucao.com.br)';

// ---------- helpers ----------
function extractNumber(str) {
  return (str || '').replace(/\D/g, '');
}

function cleanText(str) {
  return (str || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Busca um pattern e retorna o grupo, com fallback de lista de patterns
function matchFirst(html, patterns) {
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return m[1];
  }
  return '';
}

// Extrai dados do HTML da Casa dos Dados
function parseCompanyHtml(html) {
  const cnpjRaw = matchFirst(html, [
    /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/,
    /(\d{14})/,
    /CNPJ[^:\d]*[:>]?\s*([\d.\/\-]{14,18})/i
  ]);
  const cnpj = extractNumber(cnpjRaw);

  const razaoSocial = matchFirst(html, [
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
    /<title>([^<]+)<\/title>/i,
    /razao[sS]ocial[^:]*[:>]?\s*([^<\n]{3,120})/i
  ]);

  const endereco = matchFirst(html, [
    /<div[^>]*class="[^"]*(?:endereco|address)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /endereco[^:]*[:>]?\s*([^<\n]{5,160})/i,
    /(RUA|AV\.?|AVENIDA|AL\.?)[^<\n]{4,120}/i
  ]);

  const cnae = matchFirst(html, [
    /CNAE[^:\d]*[:>]?\s*([\d.]{4,8})/i,
    /(?:codigo|cod).{0,30}CNAE/i
  ]);

  const telefone = matchFirst(html, [
    /\(?(\d{2})\)?[\s.-]*(\d{4,5})[\s.-]*(\d{4})/g,
    /telefone[^:]*[:>]?\s*([^<\n]{8,30})/i
  ]).replace(/[^\d()\-+\s.]/g, '').trim();

  const cidade = matchFirst(html, [
    /(\w[\w\sÀ-ú-]{2,40})\s*-\s*([A-Z]{2})(?:\s|$|<\/)/,
    /municipio[^:]*[:>]?\s*([^<\n]{3,60})/i
  ]);

  return {
    cnpj,
    razaoSocial: cleanText(razaoSocial),
    endereco: cleanText(endereco),
    cnae,
    telefone,
    cidade: cleanText(cidade),
    urlOriginal: null
  };
}

// ---------- geocoding Nominatim ----------
async function geocodeAddress(endereco) {
  if (!endereco) return null;
  try {
    const resp = await $http.send({
      url: `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(endereco)}&format=json&limit=1&countrycodes=br`,
      method: 'GET',
      headers: { 'User-Agent': GEO_USER_AGENT },
      timeout: 15000
    });
    const data = JSON.parse(resp.raw);
    if (Array.isArray(data) && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) {
    $app.logger().error('Geocoding falhou', { error: e.message, endereco });
  }
  return null;
}

// ---------- validação de URL ----------
function isCasaDadosUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.includes('casadosdados.com.br') && u.pathname.includes('cnpj');
  } catch (e) {
    return false;
  }
}

// ============================================================
//  POST /api/scrape/url
// ============================================================
routerAdd('POST', '/api/scrape/url', async (c) => {
  const { url, hunterId } = c.body() || {};

  if (!url || !isCasaDadosUrl(url)) {
    return c.json(400, {
      error: 'URL inválida. Deve ser um link de empresa da Casa dos Dados (casadosdados.com.br/solucao/cnpj/...).'
    });
  }

  try {
    // 1. Buscar página
    const resp = await $http.send({
      url,
      method: 'GET',
      headers: {
        'User-Agent': SCRAPE_USER_AGENT,
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Accept': 'text/html,application/xhtml+xml'
      },
      timeout: 20000
    });

    const html = resp.raw;
    const dados = parseCompanyHtml(html);

    if (!dados.cnpj) {
      return c.json(400, {
        error: 'Não foi possível extrair o CNPJ da página. O site pode ter mudado — verifique a URL ou insira os dados manualmente.'
      });
    }

    // 2. Verificar se o CNPJ já existe
    const existente = $app.dao().findRecordsByExpr(
      'leads',
      $dbx.exp('cnpj = {:cnpj}', { cnpj: dados.cnpj })
    )[0];
    if (existente) {
      const out = existente.export();
      delete out['@collectionId'];
      delete out['@collectionName'];
      return c.json(200, { success: true, lead: out, duplicado: true });
    }

    // 3. Geocoding
    const coords = await geocodeAddress(dados.endereco + (dados.cidade ? ', ' + dados.cidade : ''));

    // 4. Salvar lead
    const lead = new Record($app.dao().findCollectionByNameOrId('leads'), {
      cnpj: dados.cnpj,
      empresa: dados.razaoSocial || 'Empresa ' + dados.cnpj,
      endereco: dados.endereco,
      cnae: dados.cnae,
      telefone: dados.telefone,
      cidade: dados.cidade,
      coords: coords,
      status: 'pendente',
      hunterId: hunterId || '',
      fonte: 'casa_dados',
      urlOriginal: url,
      dataAdicionado: new Date().toISOString()
    });
    $app.dao().saveRecord(lead);

    $app.logger().info('Lead adicionado via scraping', { cnpj: dados.cnpj, empresa: dados.razaoSocial });

    const out = lead.export();
    delete out['@collectionId'];
    delete out['@collectionName'];
    return c.json(200, { success: true, lead: out });
  } catch (error) {
    $app.logger().error('Scraping falhou', { error: error.message, url });
    return c.json(500, { error: 'Falha ao fazer scraping: ' + error.message });
  }
}, $apis.activityLogger($app));

// ============================================================
//  GET /api/scrape/leads?status=pendente&limit=100&page=1
// ============================================================
routerAdd('GET', '/api/scrape/leads', (c) => {
  const status = c.queryParam('status') || '';
  const limit = parseInt(c.queryParam('limit') || '100', 10);
  const page = parseInt(c.queryParam('page') || '1', 10);

  let query = $app.dao().findRecordsByFilter(
    'leads',
    status ? `status = {:status}` : '',
    '-dataAdicionado',
    limit,
    page,
    status ? { status } : {}
  );

  return c.json(200, query.map((l) => {
    const out = l.export();
    delete out['@collectionId'];
    delete out['@collectionName'];
    return out;
  }));
});

// ============================================================
//  PATCH /api/scrape/leads/:id
//  Body: { status, coords, hunterId, empresa, telefone }
// ============================================================
routerAdd('PATCH', '/api/scrape/leads/:id', (c) => {
  const id = c.pathParam('id');
  const body = c.body() || {};
  let lead;
  try {
    lead = $app.dao().findRecordById('leads', id);
  } catch (e) {
    return c.json(404, { error: 'Lead não encontrado' });
  }

  if (!lead) {
    return c.json(404, { error: 'Lead não encontrado' });
  }

  const allowed = ['pendente', 'visitado', 'convertido', 'descartado'];
  if (body.status && allowed.includes(body.status)) lead.set('status', body.status);
  if (body.coords) lead.set('coords', body.coords);
  if (body.hunterId !== undefined) lead.set('hunterId', body.hunterId);
  if (body.empresa) lead.set('empresa', body.empresa);
  if (body.telefone !== undefined) lead.set('telefone', body.telefone);

  $app.dao().saveRecord(lead);
  return c.json(200, { success: true, lead: lead.export() });
});

// ============================================================
//  GET /api/scrape/geocode?endereco=...
// ============================================================
routerAdd('GET', '/api/scrape/geocode', async (c) => {
  const endereco = c.queryParam('endereco') || '';
  if (!endereco) return c.json(400, { error: 'Parâmetro endereco obrigatório' });
  const coords = await geocodeAddress(endereco);
  return c.json(200, { success: true, coords });
});