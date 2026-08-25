// ============================================================
//  HUB LEADS — IndexedDB (Dexie.js) + Sincronização
//  Tabela única unificada de Leads (Campo + Curadoria do Gestor)
// ============================================================

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

// Versão 4: Tabela Única de Leads
db.version(4).stores({
  leads: '++id, pbId, cnpj, empresa, segmento, nomeContato, zapContato, status, fonte, lat, lng, criadoEm, dataCadastro, syncStatus',
  fila: '++id, criadoEm, tentativas, ultimaTentativa',
  fotos: '++id, leadId, blob',
  historico: '++id, empresa, segmento, nomeContato, enviadoEm, hunter',
  leadsMapa: null // Remove tabela duplicada
}).upgrade(async (trans) => {
  try {
    const mapaLeads = await trans.table('leadsMapa').toArray();
    if (mapaLeads && mapaLeads.length > 0) {
      for (const ml of mapaLeads) {
        await trans.table('leads').put({
          pbId: ml.pbId || '',
          cnpj: ml.cnpj || '',
          empresa: ml.empresa || '',
          endereco: ml.endereco || '',
          cnae: ml.cnae || '',
          telefone: ml.telefone || '',
          cidade: ml.cidade || '',
          lat: ml.lat || null,
          lng: ml.lng || null,
          status: ml.status || 'pendente',
          fonte: ml.fonte || 'casa_dados',
          urlOriginal: ml.urlOriginal || '',
          criadoEm: ml.dataAdicionado || new Date().toISOString(),
          dataCadastro: ml.dataAdicionado ? new Date(ml.dataAdicionado).toLocaleString('pt-BR') : '',
          syncStatus: 'synced'
        });
      }
    }
  } catch (e) {
    console.warn('Migração v4 Dexie finalizada:', e);
  }
});

// Helper de normalização de coordenadas
function normalizarCoords(lead) {
  if (!lead) return lead;
  if (lead.lat === undefined && lead.latitude !== undefined) lead.lat = lead.latitude;
  if (lead.lng === undefined && lead.longitude !== undefined) lead.lng = lead.longitude;
  if (lead.latitude === undefined && lead.lat !== undefined) lead.latitude = lead.lat;
  if (lead.longitude === undefined && lead.lng !== undefined) lead.longitude = lead.lng;
  return lead;
}

// ----- Salvar Lead -----
async function dbSalvarLead(leadData, fotoBlob) {
  leadData.criadoEm = leadData.criadoEm || new Date().toISOString();
  leadData.dataCadastro = leadData.dataCadastro || new Date().toLocaleString('pt-BR');
  leadData.status = leadData.status || 'pendente';
  leadData.syncStatus = leadData.syncStatus || 'pending';
  normalizarCoords(leadData);

  let id;
  if (leadData.id) {
    await db.leads.put(leadData);
    id = leadData.id;
  } else if (leadData.cnpj) {
    const limpo = String(leadData.cnpj).replace(/\D/g, '');
    const existente = await db.leads.where('cnpj').equals(limpo).first();
    if (existente) {
      Object.assign(existente, leadData);
      await db.leads.put(existente);
      id = existente.id;
    } else {
      id = await db.leads.add(leadData);
    }
  } else {
    id = await db.leads.add(leadData);
  }

  if (fotoBlob) {
    await db.fotos.add({ leadId: id, blob: fotoBlob });
  }

  // Se online e tem backend PocketBase, envia atualização
  if (navigator.onLine) {
    dbFlushLeadsPendentes().catch(() => {});
  }

  return id;
}

// ----- Salvar na Fila Offline -----
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

// ----- Consultar Leads -----
async function dbGetLeads(filtro = {}) {
  let collection = db.leads.orderBy('criadoEm').reverse();
  if (filtro.status) collection = collection.filter(l => l.status === filtro.status);
  if (filtro.segmento) collection = collection.filter(l => l.segmento === filtro.segmento);
  if (filtro.fonte) collection = collection.filter(l => l.fonte === filtro.fonte);
  const leads = await collection.toArray();
  return leads.map(normalizarCoords);
}

async function dbGetLeadPorId(id) {
  const lead = await db.leads.get(Number(id));
  return normalizarCoords(lead);
}

async function dbGetLeadPorCnpj(cnpj) {
  if (!cnpj) return null;
  const limpo = String(cnpj).replace(/\D/g, '');
  const lead = await db.leads.where('cnpj').equals(limpo).first();
  return normalizarCoords(lead);
}

async function dbGetLeadsComCoordenadas() {
  const todos = await db.leads.toArray();
  return todos.map(normalizarCoords).filter(l => l.lat && l.lng);
}

// Alias para compatibilidade com código existente
const dbGetLeadsMapa = dbGetLeads;
const dbGetLeadsMapaComCoords = dbGetLeadsComCoordenadas;
const dbGetLeadMapaPorCnpj = dbGetLeadPorCnpj;
const dbSalvarLeadMapa = dbSalvarLead;

// ----- Métricas e Dashboard -----
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
    if (l.dataCadastro) {
      const dataStr = l.dataCadastro.split(' ')[0];
      if (agrupado[dataStr] !== undefined) {
        agrupado[dataStr]++;
      }
    }
  });
  return agrupado;
}

// ----- Fila e Histórico -----
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
    hunter: leadData.hunter || API.getHunterNome()
  });
}

// ----- Atualização de Status -----
async function dbAtualizarStatusLead(id, status, extra = {}) {
  const lead = await db.leads.get(Number(id));
  if (!lead) return null;
  lead.status = status;
  lead.syncStatus = 'synced';
  if (extra.empresa) lead.empresa = extra.empresa;
  if (extra.endereco) lead.endereco = extra.endereco;
  if (extra.lat !== undefined) lead.lat = extra.lat;
  if (extra.lng !== undefined) lead.lng = extra.lng;
  if (extra.dataVisita) lead.dataVisita = extra.dataVisita;
  if (extra.nomeContato) lead.nomeContato = extra.nomeContato;
  if (extra.zapContato) lead.zapContato = extra.zapContato;
  normalizarCoords(lead);
  await db.leads.put(lead);

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
      await db.leads.put(lead);
    }
  }
  return lead;
}

const dbAtualizarStatusLeadMapa = dbAtualizarStatusLead;

// ----- Sincronização com o PocketBase -----
async function dbSyncLeads() {
  try {
    const resp = await fetch('/api/scrape/leads?limit=500');
    if (!resp.ok) return 0;
    const leads = await resp.json();
    for (const pbLead of leads) {
      const existente = await db.leads.where('pbId').equals(pbLead.id).first() ||
                        (pbLead.cnpj ? await db.leads.where('cnpj').equals(pbLead.cnpj).first() : null);

      if (existente) {
        const patch = existente.syncStatus === 'pending'
          ? {}
          : { status: pbLead.status || 'pendente' };

        await db.leads.update(existente.id, {
          ...patch,
          pbId: pbLead.id,
          empresa: pbLead.empresa || existente.empresa || '',
          endereco: pbLead.endereco || existente.endereco || '',
          cnae: pbLead.cnae || existente.cnae || '',
          telefone: pbLead.telefone || existente.telefone || '',
          cidade: pbLead.cidade || existente.cidade || '',
          lat: pbLead.coords?.lat || existente.lat || null,
          lng: pbLead.coords?.lng || existente.lng || null,
          hunterId: pbLead.hunterId || existente.hunterId || '',
          syncStatus: existente.syncStatus || 'synced'
        });
      } else {
        await db.leads.add({
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
          fonte: pbLead.fonte || 'brasil_api',
          urlOriginal: pbLead.urlOriginal || '',
          criadoEm: pbLead.dataAdicionado || new Date().toISOString(),
          dataCadastro: pbLead.dataAdicionado ? new Date(pbLead.dataAdicionado).toLocaleString('pt-BR') : '',
          syncStatus: 'synced'
        });
      }
    }
    return leads.length;
  } catch (e) {
    return 0;
  }
}

const dbSyncLeadsMapa = dbSyncLeads;

// Envia leads locais offline para o servidor PocketBase
async function dbFlushLeadsPendentes() {
  if (!navigator.onLine) return 0;
  let sincronizados = 0;

  // 1) Leads sem pbId que possuem CNPJ ou urlOriginal
  const semServidor = await db.leads.filter(l => !l.pbId && (l.cnpj || l.urlOriginal)).toArray();
  for (const l of semServidor) {
    try {
      const resp = await fetch('/api/scrape/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: l.cnpj, url: l.urlOriginal, hunterId: l.hunterId })
      });
      const data = await resp.json();
      if (data.success && data.lead) {
        await db.leads.update(l.id, {
          pbId: data.lead.id,
          cnpj: data.lead.cnpj || l.cnpj || '',
          empresa: data.lead.empresa || l.empresa || '',
          endereco: data.lead.endereco || l.endereco || '',
          lat: data.lead.coords?.lat || l.lat || null,
          lng: data.lead.coords?.lng || l.lng || null,
          syncStatus: 'synced'
        });
        sincronizados++;
      }
    } catch (e) {}
  }

  // 2) Leads com pbId mas com syncStatus pending (PATCH que falhou)
  const comPendencia = await db.leads.filter(l => l.pbId && l.syncStatus === 'pending').toArray();
  for (const l of comPendencia) {
    try {
      const resp = await fetch('/api/scrape/leads/' + l.pbId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: l.status,
          empresa: l.empresa,
          telefone: l.telefone || l.telefoneLoja,
          nomeContato: l.nomeContato,
          zapContato: l.zapContato
        })
      });
      if (resp.ok) {
        await db.leads.update(l.id, { syncStatus: 'synced' });
        sincronizados++;
      }
    } catch (e) {}
  }

  return sincronizados;
}

const dbFlushLeadsMapaPendentes = dbFlushLeadsPendentes;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
