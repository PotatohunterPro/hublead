const db = new Dexie('HubLeadsDB');

// Versões declaradas em ordem crescente (upgrade path do Dexie)
db.version(2).stores({
  leads: '++id, empresa, segmento, cnpj, nomeContato, zapContato, dataCadastro, status, latitude, longitude',
  fila: '++id, criadoEm, tentativas, ultimaTentativa',
  fotos: '++id, leadId, blob',
  historico: '++id, empresa, segmento, nomeContato, enviadoEm, hunter'
});

db.version(3).stores({
  leads: '++id, empresa, segmento, cnpj, nomeContato, zapContato, dataCadastro, status, latitude, longitude',
  fila: '++id, criadoEm, tentativas, ultimaTentativa',
  fotos: '++id, leadId, blob',
  historico: '++id, empresa, segmento, nomeContato, enviadoEm, hunter',
  leadsMapa: '++id, pbId, cnpj, empresa, status, fonte, dataAdicionado'
});

db.leads.mapToClass({
  constructor() {
    this.empresa = '';
    this.segmento = '';
    this.cnpj = '';
    this.telefoneLoja = '';
    this.email = '';
    this.temSistema = '';
    this.qualSistema = '';
    this.mensalidade = '';
    this.temSuporte = '';
    this.suporteBom = '';
    this.usoSistema = '';
    this.trocaAtendimento = '';
    this.trocaValor = '';
    this.faltas = '';
    this.nomeContato = '';
    this.cargo = '';
    this.zapContato = '';
    this.demo = '';
    this.dataCadastro = '';
    this.hunter = '';
    this.status = 'pendente';
    this.latitude = null;
    this.longitude = null;
    this.criadoEm = new Date().toISOString();
  }
});

async function dbSalvarLead(leadData, fotoBlob) {
  leadData.criadoEm = new Date().toISOString();
  leadData.dataCadastro = new Date().toLocaleString('pt-BR');
  const id = await db.leads.add(leadData);
  if (fotoBlob) {
    await db.fotos.add({ leadId: id, blob: fotoBlob });
  }
  return id;
}

async function dbSalvarNaFila(leadData, fotoBlob) {
  const id = await db.fila.add({
    leadData,
    fotoBlob: fotoBlob ? await blobToBase64(fotoBlob) : null,
    criadoEm: new Date().toISOString(),
    tentativas: 0,
    ultimaTentativa: null
  });
  return id;
}

async function dbGetLeads(filtro = {}) {
  let collection = db.leads.orderBy('criadoEm').reverse();
  if (filtro.status) collection = collection.filter(l => l.status === filtro.status);
  if (filtro.segmento) collection = collection.filter(l => l.segmento === filtro.segmento);
  return collection.toArray();
}

async function dbGetLeadsDoDia() {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const todos = await db.leads.toArray();
  return todos.filter(l => l.dataCadastro && l.dataCadastro.includes(hoje));
}

async function dbGetLeadsPorDia(dias = 7) {
  const todos = await db.leads.orderBy('criadoEm').toArray();
  const agrupado = {};
  const hoje = new Date();
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i);
    const chave = d.toLocaleDateString('pt-BR');
    agrupado[chave] = 0;
  }
  todos.forEach(l => {
    if (l.dataCadastro && agrupado[l.dataCadastro] !== undefined) {
      agrupado[l.dataCadastro]++;
    }
  });
  return agrupado;
}

async function dbGetFila() {
  return db.fila.toArray();
}

async function dbRemoverDaFila(id) {
  return db.fila.delete(id);
}

async function dbAtualizarTentativaFila(id) {
  const item = await db.fila.get(id);
  if (item) {
    item.tentativas++;
    item.ultimaTentativa = new Date().toISOString();
    await db.fila.put(item);
  }
}

async function dbGetFoto(leadId) {
  return db.fotos.where('leadId').equals(leadId).first();
}

async function dbGetHistorico(limite = 50) {
  return db.historico.orderBy('enviadoEm').reverse().limit(limite).toArray();
}

async function dbSalvarNoHistorico(leadData) {
  return db.historico.add({
    empresa: leadData.empresa,
    segmento: leadData.segmento,
    nomeContato: leadData.nomeContato,
    zapContato: leadData.zapContato,
    enviadoEm: new Date().toLocaleString('pt-BR'),
    hunter: leadData.hunter || 'Hunter'
  });
}

async function dbAtualizarStatusLead(id, status) {
  return db.leads.update(id, { status });
}

async function dbGetLeadsComCoordenadas() {
  return db.leads.filter(l => l.latitude && l.longitude).toArray();
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ----- leadsMapa (cache local de leads do mapa) -----
async function dbSalvarLeadMapa(lead) {
  lead.syncStatus = 'synced';
  return db.leadsMapa.put(lead);
}

async function dbGetLeadsMapa(filtroStatus) {
  let col = db.leadsMapa.orderBy('dataAdicionado').reverse();
  if (filtroStatus) col = col.filter(l => l.status === filtroStatus);
  return col.toArray();
}

async function dbGetLeadsMapaComCoords() {
  const todos = await db.leadsMapa.toArray();
  return todos.filter(l => l.lat && l.lng);
}

const dbGetLeadMapaPorCnpj = async (cnpj) => db.leadsMapa.where('cnpj').equals(cnpj).first();

async function dbSyncLeadsMapa() {
  try {
    const resp = await fetch('/api/scrape/leads?limit=500');
    if (!resp.ok) return 0;
    const leads = await resp.json();
    for (const pbLead of leads) {
      const existente = await db.leadsMapa.where('pbId').equals(pbLead.id).first();
      if (existente) {
        // Se há mudança local pendente (PATCH falhou), preserva o status local
        const patch = existente.syncStatus === 'pending'
          ? {}
          : { status: pbLead.status || 'pendente' };
        await db.leadsMapa.update(existente.id, {
          ...patch,
          empresa: pbLead.empresa || '',
          endereco: pbLead.endereco || '',
          cnae: pbLead.cnae || '',
          telefone: pbLead.telefone || '',
          cidade: pbLead.cidade || '',
          lat: pbLead.coords?.lat || null,
          lng: pbLead.coords?.lng || null,
          hunterId: pbLead.hunterId || '',
          syncStatus: existente.syncStatus || 'synced'
        });
      } else {
        await db.leadsMapa.add({
          pbId: pbLead.id,
          cnpj: pbLead.cnpj || '',
          empresa: pbLead.empresa || '',
          endereco: pbLead.endereco || '',
          cnae: pbLead.cnae || '',
          telefone: pbLead.telefone || '',
          cidade: pbLead.cidade || '',
          lat: pbLead.coords?.lat || null,
          lng: pbLead.coords?.lng || null,
          status: pbLead.status || 'pendente',
          hunterId: pbLead.hunterId || '',
          fonte: pbLead.fonte || 'casa_dados',
          urlOriginal: pbLead.urlOriginal || '',
          dataAdicionado: pbLead.dataAdicionado || new Date().toISOString(),
          syncStatus: 'synced'
        });
      }
    }
    return leads.length;
  } catch (e) {
    return 0;
  }
}
// ----- status de leads do mapa (local + PocketBase) -----
async function dbAtualizarStatusLeadMapa(id, status, extra = {}) {
  const lead = await db.leadsMapa.get(id);
  if (!lead) return null;
  lead.status = status;
  lead.syncStatus = 'synced';
  if (extra.empresa) lead.empresa = extra.empresa;
  if (extra.endereco) lead.endereco = extra.endereco;
  if (extra.lat !== undefined) lead.lat = extra.lat;
  if (extra.lng !== undefined) lead.lng = extra.lng;
  if (extra.dataVisita) lead.dataVisita = extra.dataVisita;
  await db.leadsMapa.put(lead);

  // Envia PATCH ao PocketBase se tiver pbId e estiver online
  if (lead.pbId && navigator.onLine) {
    try {
      await fetch('/api/scrape/leads/' + lead.pbId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...extra })
      });
    } catch (e) {
      lead.syncStatus = 'pending';
      await db.leadsMapa.put(lead);
    }
  }
  return lead;
}

// Envia leads do mapa salvos offline (sem pbId) para o PocketBase
// e reenvia mudanças de status locais pendentes (PATCH que falhou)
async function dbFlushLeadsMapaPendentes() {
  if (!navigator.onLine) return 0;
  let enviados = 0;

  // 1) Leads locais sem pbId → criar no servidor via /api/scrape/url
  const semServidor = await db.leadsMapa.filter(l => !l.pbId).toArray();
  for (const l of semServidor) {
    if (!l.urlOriginal) continue;
    try {
      const resp = await fetch('/api/scrape/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: l.urlOriginal })
      });
      const data = await resp.json();
      if (data.success) {
        await db.leadsMapa.update(l.id, {
          pbId: data.lead.id,
          cnpj: data.lead.cnpj || l.cnpj || '',
          empresa: data.lead.empresa || l.empresa || '',
          endereco: data.lead.endereco || l.endereco || '',
          cnae: data.lead.cnae || '',
          telefone: data.lead.telefone || '',
          cidade: data.lead.cidade || '',
          lat: data.lead.coords?.lat || l.lat || null,
          lng: data.lead.coords?.lng || l.lng || null,
          status: data.lead.status || 'pendente',
          syncStatus: 'synced'
        });
        enviados++;
      }
    } catch (e) { /* mantém pendente */ }
  }

  // 2) Leads com pbId mas syncStatus pending → reenvia o status local
  const comPendencia = await db.leadsMapa.filter(l => l.pbId && l.syncStatus === 'pending').toArray();
  for (const l of comPendencia) {
    try {
      const resp = await fetch('/api/scrape/leads/' + l.pbId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: l.status })
      });
      if (resp.ok) {
        await db.leadsMapa.update(l.id, { syncStatus: 'synced' });
        enviados++;
      }
    } catch (e) { /* mantém pendente */ }
  }

  return enviados;
}
