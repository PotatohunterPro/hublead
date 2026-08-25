// ============================================================
//  HUB LEADS — Custom PocketBase Hook
//  Extrator Multi-Imagem de Cartão de Visita (frente/verso)
//  via Ollama Vision (local)
//
//  Endpoint:
//    POST /api/extract-card → recebe { images: ["<base64>", ...] }
//    (ou { image: "<base64>" } único), analisa todas as imagens
//    simultaneamente no Ollama e consolida tudo em um único JSON.
//
//  Requisito na VPS (Ollama no host, porta 11434):
//    curl -fsSL https://ollama.com/install.sh | sh
//    ollama pull hf.co/LiquidAI/LFM2.5-VL-450M-GGUF:Q8_0
// ============================================================

const OLLAMA_MODEL = 'hf.co/LiquidAI/LFM2.5-VL-450M-GGUF:Q8_0';
// 127.0.0.1 cobre PB rodando direto no host;
// host.docker.internal cobre PB em container (compose.yaml com extra_hosts)
const OLLAMA_URLS = [
  'http://127.0.0.1:11434',
  'http://host.docker.internal:11434'
];
const OLLAMA_TIMEOUT = 20; // segundos por tentativa (total max 40s < proxy 60s)
const MAX_IMAGENS = 2;
const MAX_BASE64_LEN = 4000000; // ~3MB por imagem (evita OOM 56MB)

const CHAVES_CARTAO = [
  'nome_empresa', 'nome_contato', 'telefone', 'whatsapp', 'email',
  'site', 'endereco', 'cidade', 'ramo_atividade', 'redes_sociais'
];

const OLLAMA_PROMPT = 'Examine todas as imagens fornecidas (que representam a frente e/ou o verso de um cartão de visita) e consolide todos os dados em um único JSON estrito, sem nenhum texto introdutório ou explicações. Use exatamente as chaves em minúsculo: "nome_empresa", "nome_contato", "telefone", "whatsapp", "email", "site", "endereco", "cidade", "ramo_atividade", "redes_sociais". Se algum dado não for encontrado, deixe a string vazia.';

// ---------- helpers ----------
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

// Aceita array "images" ou string única "image"; remove prefixo
// Data URL e espaços, mantendo só o base64 puro
function limparImagens(data) {
  let raw = [];
  if (data && Array.isArray(data.images) && data.images.length > 0) {
    raw = data.images;
  } else if (data && data.image) {
    raw = [data.image];
  }
  return raw
    .map((img) => String(img || '').replace(/^data:image\/[\w\+]+;base64,/, '').replace(/\s+/g, ''))
    .filter((img) => img.length > 0)
    .slice(0, MAX_IMAGENS);
}

// Tenta JSON.parse direto; se falhar, extrai o primeiro objeto {...}
// (lida com blocos markdown ```json ... ``` e texto ao redor)
function extrairJsonTexto(texto) {
  if (!texto) return null;
  const t = String(texto).replace(/```json/gi, '```').replace(/```/g, '').trim();
  try { return JSON.parse(t); } catch (e) {}
  const m = t.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch (e) {}
  }
  return null;
}

// Garante todas as chaves como string ("" quando ausentes)
function normalizarDadosCartao(obj) {
  const out = {};
  CHAVES_CARTAO.forEach((k) => {
    const v = obj ? obj[k] : '';
    out[k] = typeof v === 'string' ? v.trim() : (v === null || v === undefined ? '' : String(v).trim());
  });
  return out;
}

// Chama o Ollama com todas as imagens de uma vez, testando as URLs em ordem
async function chamarOllama(imagens) {
  let ultimoErro = '';
  for (const base of OLLAMA_URLS) {
    try {
      const resp = await $http.send({
        url: base + '/api/generate',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt: OLLAMA_PROMPT,
          images: imagens,
          stream: false,
          options: { temperature: 0.1 }
        }),
        timeout: OLLAMA_TIMEOUT
      });
      if (resp.statusCode && resp.statusCode !== 200) {
        ultimoErro = 'Ollama respondeu HTTP ' + resp.statusCode;
        continue;
      }
      const data = JSON.parse(resp.raw);
      return { texto: data.response || '', erro: '' };
    } catch (e) {
      ultimoErro = (e && e.message) ? e.message : String(e);
    }
  }
  return { texto: '', erro: ultimoErro };
}

// ============================================================
//  POST /api/extract-card
//  Body: { "images": ["<base64>", ...] }  ou  { "image": "<base64>" }
//  Resposta: 200 { success: true, data: {...} }
//            400/422/500 { success: false, error: "..." }
// ============================================================
routerAdd('POST', '/api/extract-card', async (c) => {
  const body = getRequestBody(c);
  const imagens = limparImagens(body);

  if (imagens.length === 0) {
    return c.json(400, { success: false, error: 'Nenhuma imagem foi fornecida.' });
  }
  for (const img of imagens) {
    if (img.length < 100) {
      return c.json(400, { success: false, error: 'Uma das imagens é inválida ou está vazia.' });
    }
    if (img.length > MAX_BASE64_LEN) {
      return c.json(400, { success: false, error: 'Imagem muito grande (máx. ~10MB cada).' });
    }
  }

  const { texto, erro } = await chamarOllama(imagens);
  if (erro) {
    $app.logger().error('OCR cartão: Ollama inacessível', { error: erro });
    return c.json(500, { success: false, error: 'Serviço de análise (Ollama) indisponível no servidor.' });
  }

  const obj = extrairJsonTexto(texto);
  if (!obj) {
    $app.logger().info('OCR cartão: resposta fora do formato esperado', { resposta: String(texto).slice(0, 300) });
    return c.json(422, { success: false, error: 'Falha ao estruturar o JSON retornado pela IA.', data: normalizarDadosCartao(null) });
  }

  return c.json(200, { success: true, data: normalizarDadosCartao(obj) });
});
