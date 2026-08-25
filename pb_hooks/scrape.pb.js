// ============================================================
//  HUB LEADS — Custom PocketBase Hooks
//  Scraping sob demanda + BrasilAPI + Geocoding Nominatim
//
//  Endpoints:
//    POST   /api/scrape/url           → extrai CNPJ e adiciona lead via BrasilAPI + Geocode
//    GET    /api/scrape/cnpj/:cnpj    → consulta direta CNPJ na BrasilAPI (usado no form)
//    POST   /api/scrape/batch         → adiciona múltiplos CNPJs de uma vez
//    GET    /api/scrape/leads         → lista leads do mapa (com filtros)
//    PATCH  /api/scrape/leads/:id     → atualiza status/coords/dados de um lead
//    DELETE /api/scrape/leads/:id     → exclui um lead
//    GET    /api/scrape/geocode       → geocoding de um endereço (Nominatim)
// ============================================================

const GEO_USER_AGENT = 'HubLeads/2.0 (contato@hubsolucao.com.br)';
const BRASIL_API_BASE = 'https://brasilapi.com.br/api/cnpj/v1';

// ---------- helpers ----------
function extractCnpjs(str) {
  if (!str) return [];
  const matches = String(str).match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{14}/g) || [];
  const cleanList = matches.map(c => c.replace(/\D/g, '')).filter(c => c.length === 14);
  return Array.from(new Set(cleanList));
}

function cleanText(str) {
  return (str || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function getRequestBody(c) {
  try {
    if (typeof c.bind === 'function') {
      const data = {};
      c.bind(data);
      if (Object.keys(data).length > 0) return data;
    }
  } catch (e) {}
  try {
    const info = $apis.requestInfo(c);
    if (info && info.data) return info.data;
  } catch (e) {}
  try {
    const req = c.requestInfo ? c.requestInfo() : null;
    if (req && req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (req && req.data) return req.data;
  } catch (e) {}
  return {};
}

// ---------- consulta BrasilAPI ----------
async function fetchBrasilApiCnpj(cnpj) {
  const clean = String(cnpj).replace(/\D/g, '');
  if (clean.length !== 14) return null;

  try {
    const resp = await $http.send({
      url: `${BRASIL_API_BASE}/${clean}`,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': GEO_USER_AGENT
      },
      timeout: 15000
    });

    if (resp.statusCode !== 200) {
      return null;
    }

    const data = JSON.parse(resp.raw);
    const logradouroFull = [
      data.descricao_tipo_de_logradouro,
      data.logradouro,
      data.numero ? 'nº ' + data.numero : 'S/N',
      data.complemento
    ].filter(Boolean).join(' ');

    const endereco = [logradouroFull, data.bairro].filter(Boolean).join(' - ');
    const cidade = [data.municipio, data.uf].filter(Boolean).join(' - ');

    let tel = data.ddd_telefone_1 || data.ddd_telefone_2 || '';
    if (tel) {
      const numClean = tel.replace(/\D/g, '');
      if (numClean.length === 10) {
        tel = `(${numClean.slice(0, 2)}) ${numClean.slice(2, 6)}-${numClean.slice(6)}`;
      } else if (numClean.length === 11) {
        tel = `(${numClean.slice(0, 2)}) ${numClean.slice(2, 7)}-${numClean.slice(7)}`;
      }
    }

    return {
      cnpj: clean,
      razaoSocial: cleanText(data.razao_social || ''),
      nomeFantasia: cleanText(data.nome_fantasia || ''),
      empresa: cleanText(data.nome_fantasia || data.razao_social || 'Empresa ' + clean),
      cnae: data.cnae_fiscal ? `${data.cnae_fiscal}${data.cnae_fiscal_descricao ? ' - ' + data.cnae_fiscal_descricao : ''}` : '',
      telefone: tel,
      email: cleanText(data.email || ''),
      endereco: cleanText(endereco),
      cidade: cleanText(cidade),
      cep: cleanText(data.cep || ''),
      bairro: cleanText(data.bairro || ''),
      uf: cleanText(data.uf || '')
    };
  } catch (e) {
    $app.logger().error('Erro ao consultar BrasilAPI', { cnpj: clean, error: e.message });
    return null;
  }
}

// ---------- geocoding Nominatim ----------
async function geocodeAddress(endereco, cidade, cep) {
  const tentativas = [];
  if (endereco && cidade) tentativas.push(`${endereco}, ${cidade}, Brasil`);
  if (cep) tentativas.push(`${cep}, Brasil`);
  if (cidade) tentativas.push(`${cidade}, Brasil`);

  for (const q of tentativas) {
    try {
      const resp = await $http.send({
        url: `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=br`,
        method: 'GET',
        headers: { 'User-Agent': GEO_USER_AGENT },
        timeout: 10000
      });
      const data = JSON.parse(resp.raw);
      if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
    } catch (e) {
      // tenta a próxima consulta
    }
  }
  return null;
}

// ============================================================
//  GET /api/scrape/cnpj/:cnpj  (Consulta rápida no form)
// ============================================================
routerAdd('GET', '/api/scrape/cnpj/:cnpj', async (c) => {
  const cnpjParam = c.pathParam('cnpj');
  const clean = (cnpjParam || '').replace(/\D/g, '');
  if (clean.length !== 14) {
    return c.json(400, { error: 'CNPJ inválido. Forneça 14 dígitos.' });
  }

  const dados = await fetchBrasilApiCnpj(clean);
  if (!dados) {
    return c.json(404, { error: 'CNPJ não encontrado na base da Receita Federal.' });
  }

  const coords = await geocodeAddress(dados.endereco, dados.cidade, dados.cep);
  dados.coords = coords;

  return c.json(200, { success: true, lead: dados });
});

// ============================================================
//  POST /api/scrape/url  (Suporta URL ou CNPJ avulso)
// ============================================================
routerAdd('POST', '/api/scrape/url', async (c) => {
  const body = getRequestBody(c);
  const input = body.url || body.cnpj || body.input || '';
  const hunterId = body.hunterId || '';

  const cnpjs = extractCnpjs(input);
  if (cnpjs.length === 0) {
    return c.json(400, {
      error: 'Nenhum CNPJ válido encontrado. Cole o link da Casa dos Dados ou digite o CNPJ.'
    });
  }

  const cnpj = cnpjs[0];

  try {
    // 1. Verificar se o CNPJ já existe no PocketBase
    let existente = null;
    try {
      const records = $app.dao().findRecordsByExpr('leads', $dbx.exp('cnpj = {:cnpj}', { cnpj }));
      if (records && records.length > 0) existente = records[0];
    } catch (e) {}

    if (existente) {
      const out = existente.export();
      delete out['@collectionId'];
      delete out['@collectionName'];
      return c.json(200, { success: true, lead: out, duplicado: true });
    }

    // 2. Buscar dados oficiais na BrasilAPI
    const dados = await fetchBrasilApiCnpj(cnpj);
    if (!dados) {
      return c.json(404, {
        error: `Não foi possível localizar os dados do CNPJ ${cnpj} na Receita Federal.`
      });
    }

    // 3. Geocoding
    const coords = await geocodeAddress(dados.endereco, dados.cidade, dados.cep);

    // 4. Salvar lead no banco
    const col = $app.dao().findCollectionByNameOrId('leads');
    const lead = new Record(col, {
      cnpj: dados.cnpj,
      empresa: dados.empresa,
      razaoSocial: dados.razaoSocial,
      endereco: dados.endereco,
      cnae: dados.cnae,
      telefone: dados.telefone,
      email: dados.email,
      cidade: dados.cidade,
      cep: dados.cep,
      coords: coords,
      status: 'pendente',
      hunterId: hunterId || '',
      fonte: input.includes('casadosdados.com.br') ? 'casa_dados' : 'brasil_api',
      urlOriginal: input.startsWith('http') ? input : null,
      dataAdicionado: new Date().toISOString()
    });

    $app.dao().saveRecord(lead);
    $app.logger().info('Lead adicionado', { cnpj: dados.cnpj, empresa: dados.empresa });

    const out = lead.export();
    delete out['@collectionId'];
    delete out['@collectionName'];
    return c.json(200, { success: true, lead: out });
  } catch (error) {
    $app.logger().error('Falha ao adicionar lead', { error: error.message, input });
    return c.json(500, { error: 'Falha ao processar lead: ' + error.message });
  }
});

// ============================================================
//  POST /api/scrape/batch (Adiciona múltiplos CNPJs em lote)
// ============================================================
routerAdd('POST', '/api/scrape/batch', async (c) => {
  const body = getRequestBody(c);
  const text = body.text || body.cnpjs || '';
  const hunterId = body.hunterId || '';

  const cnpjs = extractCnpjs(text);
  if (cnpjs.length === 0) {
    return c.json(400, { error: 'Nenhum CNPJ válido encontrado no texto.' });
  }

  const resultados = [];
  const col = $app.dao().findCollectionByNameOrId('leads');

  for (const cnpj of cnpjs.slice(0, 20)) { // limite de 20 por lote p/ evitar timeout
    try {
      // Verifica se já existe
      const existente = $app.dao().findRecordsByExpr('leads', $dbx.exp('cnpj = {:cnpj}', { cnpj }))[0];
      if (existente) {
        resultados.push({ cnpj, status: 'duplicado', lead: existente.export() });
        continue;
      }

      const dados = await fetchBrasilApiCnpj(cnpj);
      if (!dados) {
        resultados.push({ cnpj, status: 'nao_encontrado' });
        continue;
      }

      const coords = await geocodeAddress(dados.endereco, dados.cidade, dados.cep);
      const lead = new Record(col, {
        cnpj: dados.cnpj,
        empresa: dados.empresa,
        razaoSocial: dados.razaoSocial,
        endereco: dados.endereco,
        cnae: dados.cnae,
        telefone: dados.telefone,
        email: dados.email,
        cidade: dados.cidade,
        coords: coords,
        status: 'pendente',
        hunterId: hunterId || '',
        fonte: 'brasil_api',
        dataAdicionado: new Date().toISOString()
      });

      $app.dao().saveRecord(lead);
      resultados.push({ cnpj, status: 'adicionado', lead: lead.export() });
    } catch (e) {
      resultados.push({ cnpj, status: 'erro', error: e.message });
    }
  }

  return c.json(200, { success: true, total: cnpjs.length, resultados });
});

// ============================================================
//  GET /api/scrape/leads?status=pendente&limit=500&page=1
// ============================================================
routerAdd('GET', '/api/scrape/leads', (c) => {
  const status = c.queryParam('status') || '';
  const limit = parseInt(c.queryParam('limit') || '500', 10);
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
// ============================================================
routerAdd('PATCH', '/api/scrape/leads/:id', (c) => {
  const id = c.pathParam('id');
  const body = getRequestBody(c);
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
  if (body.nomeContato !== undefined) lead.set('nomeContato', body.nomeContato);
  if (body.zapContato !== undefined) lead.set('zapContato', body.zapContato);
  if (body.segmento !== undefined) lead.set('segmento', body.segmento);
  if (body.email !== undefined) lead.set('email', body.email);

  $app.dao().saveRecord(lead);
  return c.json(200, { success: true, lead: lead.export() });
});

// ============================================================
//  DELETE /api/scrape/leads/:id
// ============================================================
routerAdd('DELETE', '/api/scrape/leads/:id', (c) => {
  const id = c.pathParam('id');
  let lead;
  try {
    lead = $app.dao().findRecordById('leads', id);
  } catch (e) {
    return c.json(404, { error: 'Lead não encontrado' });
  }

  if (!lead) {
    return c.json(404, { error: 'Lead não encontrado' });
  }

  $app.dao().deleteRecord(lead);
  $app.logger().info('Lead excluído', { id });
  return c.json(200, { success: true });
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