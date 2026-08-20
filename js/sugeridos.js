const SUGERIDOS = {
  btnAdicionar: null,
  inputUrl: null,
  lista: null,

  init() {
    this.btnAdicionar = document.getElementById('btnAdicionarLead');
    this.inputUrl = document.getElementById('urlCasaDados');
    this.lista = document.getElementById('sugeridosList');
    if (!this.btnAdicionar || !this.inputUrl) return;
    this.btnAdicionar.addEventListener('click', () => this.adicionarUrl());
    this.carregarLeads();
  },

  async adicionarUrl() {
    const url = this.inputUrl.value.trim();
    if (!url) {
      App.toast('Cole a URL da empresa na Casa dos Dados', 'error');
      return;
    }
    if (!url.includes('casadosdados.com.br') || !url.includes('cnpj')) {
      App.toast('URL inválida. Use o link completo da Casa dos Dados', 'error');
      return;
    }

    this.btnAdicionar.disabled = true;
    this.btnAdicionar.innerHTML = '<span class="skeleton-circle" style="display:inline-block;width:18px;height:18px;border-radius:50%;vertical-align:middle;margin-right:8px"></span> Extraindo...';

    try {
      const resp = await fetch('/api/scrape/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await resp.json();
      if (data.success) {
        const l = data.lead;
        App.toast(data.duplicado ? 'Lead já existente no mapa' : 'Lead adicionado ao mapa!', 'success');
        await db.leadsMapa.put({
          pbId: l.id,
          cnpj: l.cnpj || '',
          empresa: l.empresa || '',
          endereco: l.endereco || '',
          cnae: l.cnae || '',
          telefone: l.telefone || '',
          cidade: l.cidade || '',
          lat: l.coords?.lat || null,
          lng: l.coords?.lng || null,
          status: l.status || 'pendente',
          fonte: l.fonte || 'casa_dados',
          urlOriginal: l.urlOriginal || url,
          dataAdicionado: l.dataAdicionado || new Date().toISOString(),
          syncStatus: 'synced'
        });
        this.inputUrl.value = '';
        await this.carregarLeads();
        MAPA.refresh();
      } else {
        App.toast(data.error || 'Erro ao extrair dados', 'error');
      }
    } catch (err) {
      App.toast('Sem conexão. Salve o link e tente depois.', 'warning');
      await db.leadsMapa.put({
        empresa: 'Aguardando scraping...',
        urlOriginal: url,
        status: 'pendente',
        cnpj: '',
        fonte: 'casa_dados',
        dataAdicionado: new Date().toISOString(),
        syncStatus: 'pending'
      });
      this.inputUrl.value = '';
      await this.carregarLeads();
    }

    this.btnAdicionar.disabled = false;
    this.btnAdicionar.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Adicionar ao Mapa';
  },

  async carregarLeads() {
    if (navigator.onLine) {
      await dbFlushLeadsMapaPendentes();
      await dbSyncLeadsMapa();
    }
    const leads = await dbGetLeadsMapa();
    const empty = document.getElementById('emptySugeridos');
    if (leads.length === 0) {
      this.lista.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    this.lista.innerHTML = leads.map(l => `
      <div class="card" style="display:flex;gap:var(--space-3);align-items:flex-start">
        <div class="lead-item-icon" style="background:${this.corStatus(l.status)}22">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${this.corStatus(l.status)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>
        <div style="flex:1;min-width:0">
          <div class="lead-item-title">${l.empresa || 'Aguardando dados...'}</div>
          <div class="lead-item-subtitle">${l.endereco || l.cidade || l.cnpj || ''}</div>
          <div class="lead-item-meta">
            <span class="badge" style="background:${this.corStatus(l.status)}22;color:${this.corStatus(l.status)}">${this.labelStatus(l.status)}</span>
            ${l.syncStatus === 'pending' ? '<span class="badge badge-warning">Pendente de scraping</span>' : ''}
            <span style="font-size:11px;color:var(--color-text-tertiary)">${l.dataAdicionado ? new Date(l.dataAdicionado).toLocaleDateString('pt-BR') : '-'}</span>
          </div>
          <div style="display:flex;gap:var(--space-1);margin-top:var(--space-2);flex-wrap:wrap">
            <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px" onclick="SUGERIDOS.captarLead(${l.id})">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2z"/></svg>Captar
            </button>
            ${l.status === 'pendente' ? `<button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;color:#ff9f0a" onclick="SUGERIDOS.alterarStatus(${l.id}, 'visitado')">Visitei</button>` : ''}
            ${l.status !== 'convertido' && l.status !== 'descartado' ? `<button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;color:#34c759" onclick="SUGERIDOS.alterarStatus(${l.id}, 'convertido')">Convertido</button>` : ''}
            ${l.status !== 'descartado' ? `<button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;color:#8e8e93" onclick="SUGERIDOS.alterarStatus(${l.id}, 'descartado')">Descartar</button>` : ''}
            ${l.lat && l.lng ? `<button class="btn btn-ghost" style="padding:4px 10px;font-size:12px" onclick="SUGERIDOS.navegarAte(${l.lat}, ${l.lng})">Navegar</button>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  },

  async alterarStatus(id, status) {
    const labels = { pendente: 'Pendente', visitado: 'Visitado', convertido: 'Convertido', descartado: 'Descartado' };
    const lead = await db.leadsMapa.get(id);
    if (!lead) return;
    if (status === 'descartado' && !confirm('Descartar este lead?')) return;
    await dbAtualizarStatusLeadMapa(id, status, { dataVisita: new Date().toISOString() });
    App.toast('Lead marcado como ' + (labels[status] || status), 'success');
    this.carregarLeads();
    if (typeof MAPA !== 'undefined') MAPA.refresh();
  },

  async captarLead(id) {
    const l = await db.leadsMapa.get(id);
    if (!l) return;
    const preencher = (el, valor) => {
      const campo = document.getElementById(el);
      if (campo) campo.value = valor || '';
    };
    preencher('inputEmpresa', l.empresa);
    preencher('inputCnpj', l.cnpj || '');
    preencher('inputTelLoja', l.telefone || '');
    preencher('inputCidadeBairro', l.cidade || (l.endereco || ''));
    document.querySelectorAll('.btn-option').forEach(b => b.classList.remove('active'));
    App.mudarTab('lead');
    App.toast('Dados da empresa preenchidos — complete a captação', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  corStatus(status) {
    switch (status) {
      case 'pendente': return '#0A5DA8';
      case 'visitado': return '#ff9f0a';
      case 'convertido': return '#34c759';
      case 'descartado': return '#8e8e93';
      default: return '#0A5DA8';
    }
  },

  labelStatus(status) {
    switch (status) {
      case 'pendente': return 'Pendente';
      case 'visitado': return 'Visitado';
      case 'convertido': return 'Convertido';
      case 'descartado': return 'Descartado';
      default: return status;
    }
  },

  navegarAte(lat, lng) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
  },

  refresh() {
    this.carregarLeads();
  }
};

document.addEventListener('DOMContentLoaded', () => SUGERIDOS.init());