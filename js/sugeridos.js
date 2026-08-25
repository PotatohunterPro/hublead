// ============================================================
//  HUB LEADS — Sugeridos & Curadoria de Leads
//  Adição avulsa ou em lote via URL Casa dos Dados / CNPJs
// ============================================================

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
    const texto = this.inputUrl.value.trim();
    if (!texto) {
      App.toast('Cole o link da Casa dos Dados ou digite os CNPJs', 'error');
      return;
    }

    // Extrai todos os CNPJs do texto digitado
    const cnpjsEncontrados = (texto.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{14}/g) || [])
      .map(c => c.replace(/\D/g, ''))
      .filter(c => c.length === 14);

    const cnpjsUnicos = Array.from(new Set(cnpjsEncontrados));

    if (cnpjsUnicos.length === 0 && !texto.includes('casadosdados.com.br')) {
      App.toast('Nenhum CNPJ ou link válido encontrado', 'error');
      return;
    }

    this.btnAdicionar.disabled = true;
    this.btnAdicionar.innerHTML = '<span class="skeleton-circle" style="display:inline-block;width:18px;height:18px;border-radius:50%;vertical-align:middle;margin-right:8px"></span> Consultando dados...';

    let adicionados = 0;

    try {
      // 1) Se tiver backend PocketBase online
      if (navigator.onLine) {
        if (cnpjsUnicos.length > 1) {
          // Processamento em lote
          const resp = await fetch('/api/scrape/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: texto, hunterId: API.getHunterNome() })
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data.success && data.resultados) {
              for (const r of data.resultados) {
                if (r.lead) {
                  await dbSalvarLead({
                    pbId: r.lead.id,
                    cnpj: r.lead.cnpj,
                    empresa: r.lead.empresa,
                    razaoSocial: r.lead.razaoSocial,
                    endereco: r.lead.endereco,
                    cnae: r.lead.cnae,
                    telefone: r.lead.telefone,
                    cidade: r.lead.cidade,
                    lat: r.lead.coords?.lat || null,
                    lng: r.lead.coords?.lng || null,
                    status: 'pendente',
                    fonte: 'brasil_api',
                    syncStatus: 'synced'
                  });
                  adicionados++;
                }
              }
            }
          }
        } else {
          // Processamento individual
          const resp = await fetch('/api/scrape/url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: texto, cnpj: cnpjsUnicos[0] || '', hunterId: API.getHunterNome() })
          });
          const data = await resp.json();
          if (data.success && data.lead) {
            const l = data.lead;
            await dbSalvarLead({
              pbId: l.id,
              cnpj: l.cnpj,
              empresa: l.empresa,
              razaoSocial: l.razaoSocial,
              endereco: l.endereco,
              cnae: l.cnae,
              telefone: l.telefone,
              cidade: l.cidade,
              lat: l.coords?.lat || null,
              lng: l.coords?.lng || null,
              status: l.status || 'pendente',
              fonte: l.fonte || 'brasil_api',
              urlOriginal: l.urlOriginal || texto,
              syncStatus: 'synced'
            });
            adicionados++;
          }
        }
      }

      // 2) Fallback local no cliente se backend offline ou se faltou algum
      if (adicionados === 0 && cnpjsUnicos.length > 0) {
        for (const cnpj of cnpjsUnicos) {
          try {
            const leadData = await API.consultarCnpj(cnpj);
            await dbSalvarLead({
              cnpj: leadData.cnpj,
              empresa: leadData.empresa,
              razaoSocial: leadData.razaoSocial,
              endereco: leadData.endereco,
              cnae: leadData.cnae,
              telefone: leadData.telefone,
              email: leadData.email,
              cidade: leadData.cidade,
              status: 'pendente',
              fonte: 'brasil_api',
              syncStatus: 'pending'
            });
            adicionados++;
          } catch (e) {}
        }
      }

      if (adicionados > 0) {
        App.toast(`${adicionados} lead(s) adicionado(s) ao mapa!`, 'success');
        this.inputUrl.value = '';
        await this.carregarLeads();
        if (typeof MAPA !== 'undefined') MAPA.refresh();
      } else {
        App.toast('Não foi possível obter os dados dos CNPJs informados.', 'error');
      }

    } catch (err) {
      console.error('Falha ao adicionar:', err);
      App.toast('Erro ao processar. Tente novamente.', 'error');
    }

    this.btnAdicionar.disabled = false;
    this.btnAdicionar.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Adicionar ao Mapa';
  },

  async carregarLeads() {
    if (navigator.onLine) {
      await dbSyncLeads();
    }
    const leads = await dbGetLeads();
    const empty = document.getElementById('emptySugeridos');

    if (leads.length === 0) {
      this.lista.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    this.lista.innerHTML = leads.map(l => `
      <div class="card" style="display:flex;gap:var(--space-3);align-items:flex-start;margin-bottom:var(--space-3)">
        <div class="lead-item-icon" style="background:${this.corStatus(l.status)}22">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${this.corStatus(l.status)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>
        <div style="flex:1;min-width:0">
          <div class="lead-item-title">${esc(l.empresa) || 'Empresa'}</div>
          <div class="lead-item-subtitle">${esc(l.endereco) || esc(l.cidade) || esc(l.cnpj) || ''}</div>
          <div class="lead-item-meta" style="margin-top:4px">
            <span class="badge" style="background:${this.corStatus(l.status)}22;color:${this.corStatus(l.status)}">${this.labelStatus(l.status)}</span>
            ${l.telefone ? `<span style="font-size:11px;color:var(--color-text-secondary)">📞 ${esc(l.telefone)}</span>` : ''}
            <span style="font-size:11px;color:var(--color-text-tertiary)">${l.criadoEm ? new Date(l.criadoEm).toLocaleDateString('pt-BR') : '-'}</span>
          </div>
          <div style="display:flex;gap:var(--space-1);margin-top:var(--space-2);flex-wrap:wrap">
            <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;color:var(--color-accent)" onclick="SUGERIDOS.captarLead(${l.id})">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2z"/></svg>Captar
            </button>
            ${l.status === 'pendente' ? `<button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;color:#ff9f0a" onclick="SUGERIDOS.alterarStatus(${l.id}, 'visitado')">Visitei</button>` : ''}
            ${l.status !== 'convertido' && l.status !== 'descartado' ? `<button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;color:#34c759" onclick="SUGERIDOS.alterarStatus(${l.id}, 'convertido')">Convertido</button>` : ''}
            ${l.status !== 'descartado' ? `<button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;color:#8e8e93" onclick="SUGERIDOS.alterarStatus(${l.id}, 'descartado')">Descartar</button>` : ''}
            ${(l.lat && l.lng) ? `<button class="btn btn-ghost" style="padding:4px 10px;font-size:12px" onclick="SUGERIDOS.navegarAte(${l.lat}, ${l.lng})">Navegar</button>` : ''}
            <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;color:#25D366" onclick="SUGERIDOS.enviarWhatsApp(${l.id})">WhatsApp</button>
          </div>
        </div>
      </div>
    `).join('');
  },

  async alterarStatus(id, status) {
    const labels = { pendente: 'Pendente', visitado: 'Visitado', convertido: 'Convertido', descartado: 'Descartado' };
    const lead = await dbGetLeadPorId(id);
    if (!lead) return;
    if (status === 'descartado' && !confirm('Descartar este lead?')) return;
    await dbAtualizarStatusLead(id, status, { dataVisita: new Date().toISOString() });
    App.toast('Lead marcado como ' + (labels[status] || status), 'success');
    this.carregarLeads();
    if (typeof MAPA !== 'undefined') MAPA.refresh();
  },

  async captarLead(id) {
    const l = await dbGetLeadPorId(id);
    if (!l) return;
    const preencher = (el, valor) => {
      const campo = document.getElementById(el);
      if (campo) campo.value = valor || '';
    };
    preencher('inputEmpresa', l.empresa);
    preencher('inputCnpj', l.cnpj || '');
    preencher('inputTelLoja', l.telefone || '');
    preencher('inputCidadeBairro', l.cidade || l.endereco || '');
    if (l.nomeContato) preencher('inputNomeContato', l.nomeContato);
    if (l.zapContato) preencher('inputZap', l.zapContato);

    document.querySelectorAll('.btn-option').forEach(b => b.classList.remove('active'));
    const demoSim = document.querySelector('.btn-option-group[data-field="demo"] .btn-option[data-value="Sim"]');
    if (demoSim) demoSim.classList.add('active');

    App.mudarTab('lead');
    App.toast('Dados da empresa preenchidos — complete a visita', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  async enviarWhatsApp(id) {
    const l = await dbGetLeadPorId(id);
    if (!l) return;
    API.enviarWhatsApp(l);
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