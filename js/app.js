// ============================================================
//  HUB LEADS — App Controller
//  Controle de navegação, temas, configurações e métricas
// ============================================================

const App = {
  currentTab: 'resumo',

  init() {
    this.initSplash();
    this.initTheme();
    this.initTabs();
    this.initConfig();
    this.initOfflineBar();
    this.initOnlineListener();

    CAMERA.init();
    FORM.init('leadForm', 'btnSalvarLead');
    MAPA.init('mapContainer');

    this.atualizarBadge();
    this.atualizarDashboard();
    this.carregarFila();
    this.carregarHistorico();
    this.iniciarPollingFila();

    setTimeout(() => {
      if (typeof MAPA !== 'undefined') MAPA.refresh();
    }, 500);
  },

  initSplash() {
    const splash = document.getElementById('splash');
    if (!splash) return;
    const pronto = API.temPerfil();
    setTimeout(() => {
      splash.classList.add('hidden');
      setTimeout(() => splash.remove(), 300);
      if (!pronto) this.abrirConfig(true);
    }, pronto ? 1200 : 2000);
  },

  initTheme() {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
    }
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      document.documentElement.classList.toggle('dark', e.matches);
    });
  },

  initTabs() {
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.dataset.tab;
        if (tab) this.mudarTab(tab);
      });
    });
  },

  mudarTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.bottom-nav-item').forEach(i => i.classList.toggle('active', i.dataset.tab === tab));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.id === `tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`));

    if (tab === 'lead') {
      if (typeof FORM !== 'undefined') FORM.prepararGeolocalizacao();
    }
    if (tab === 'mapa') {
      if (typeof MAPA !== 'undefined') MAPA.refresh();
    }
    if (tab === 'fila') {
      this.carregarFila();
      this.carregarHistorico();
      this.processarAnalisesPendentes();
    }
    if (tab === 'resumo') {
      this.atualizarDashboard();
    }
    if (tab === 'sugeridos') {
      if (typeof SUGERIDOS !== 'undefined') SUGERIDOS.refresh();
    }
  },

  initConfig() {
    const btnConfig = document.getElementById('btnConfigurar');
    const btnSalvar = document.getElementById('btnSalvarConfig');
    const overlay = document.getElementById('configOverlay');
    const closeBtn = document.getElementById('btnFecharConfig');

    if (btnConfig) btnConfig.addEventListener('click', () => this.abrirConfig());
    if (btnSalvar) btnSalvar.addEventListener('click', () => this.salvarConfig());
    if (closeBtn) closeBtn.addEventListener('click', () => this.fecharConfig());

    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay && !overlay.dataset.required) this.fecharConfig();
      });
    }
  },

  abrirConfig(required = false) {
    const overlay = document.getElementById('configOverlay');
    if (!overlay) return;

    const cfg = API.getConfig();
    const hunter = API.getHunter();

    document.getElementById('configHunterNome').value = hunter.nome || '';
    document.getElementById('configHunterCelular').value = hunter.celular || '';
    document.getElementById('configNumeroEnvio').value = cfg.numeroEnvio || '';
    document.getElementById('configCasaDadosApiKey').value = cfg.casaDadosApiKey || '';

    const title = document.getElementById('configModalTitle');
    if (title) title.textContent = required ? 'Bem-vindo ao Hub Leads' : 'Configurações';
    const cancelBtn = document.getElementById('btnFecharConfig');
    if (cancelBtn) cancelBtn.style.display = required ? 'none' : '';

    overlay.classList.add('visible');
    if (required) overlay.dataset.required = 'true';
  },

  fecharConfig() {
    const overlay = document.getElementById('configOverlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    delete overlay.dataset.required;
  },

  salvarConfig() {
    const nome = document.getElementById('configHunterNome').value.trim();
    const celular = document.getElementById('configHunterCelular').value.trim();

    if (!nome || !celular) {
      this.toast('Preencha seu nome e celular (WhatsApp)', 'error');
      return;
    }

    API.setHunter({ nome, celular });

    const numeroEnvio = document.getElementById('configNumeroEnvio')?.value.trim() || '';
    const casaDadosApiKey = document.getElementById('configCasaDadosApiKey')?.value.trim() || '';

    API.setConfig({ numeroEnvio, casaDadosApiKey });

    this.toast('Configurações salvas!', 'success');
    this.fecharConfig();
    this.atualizarDashboard();
  },

  initOfflineBar() {
    const bar = document.getElementById('offlineBar');
    if (!bar) return;

    const update = () => {
      const offline = !navigator.onLine;
      bar.classList.toggle('visible', offline);
    };

    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  },

  initOnlineListener() {
    window.addEventListener('online', async () => {
      // Sincroniza leads com o servidor e roda as análises IA pendentes
      await this.processarAnalisesPendentes();
    });
  },

  iniciarPollingFila() {
    setInterval(async () => {
      if (!navigator.onLine) return;
      const pendentes = await db.leads.filter((l) => l.iaStatus === 'analisando').toArray();
      if (pendentes.length > 0) await this.processarAnalisesPendentes();
    }, 30000);
  },

  // ============================================================
  //  Pipeline Salvar → Servidor → IA (Ollama) → Fila verde
  // ============================================================
  async processarAnalisesPendentes() {
    if (!navigator.onLine || this._iaEmLote) return;
    this._iaEmLote = true;
    try {
      // 1) Sincroniza leads com o PocketBase (cria/patch pendentes)
      await dbFlushLeadsPendentes();
      // 2) Roda a análise IA de quem ainda está aguardando
      const pendentes = await db.leads.filter((l) => l.iaStatus === 'analisando').toArray();
      for (const lead of pendentes) {
        await this.analisarLeadIA(lead.id);
      }
    } catch (e) {
      console.warn('Processamento de análises falhou:', e);
    } finally {
      this._iaEmLote = false;
    }
    this.carregarFila();
    this.atualizarBadge();
  },

  // Analisa um lead: sincroniza com o servidor, envia as fotos do cartão
  // ao Ollama e consolida os dados extraídos no registro
  async analisarLeadIA(leadId) {
    const lead = await dbGetLeadPorId(leadId);
    if (!lead || lead.iaStatus === 'pronto') return lead;
    try {
      if (!navigator.onLine) throw new Error('offline');

      // 1) Cadastro no servidor (BrasilAPI enriquece endereço/coords)
      if (!lead.pbId && lead.cnpj) {
        try {
          const resp = await fetch('/api/scrape/url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cnpj: lead.cnpj, hunterId: lead.hunterId })
          });
          const data = await resp.json();
          if (data.success && data.lead) {
            lead.pbId = data.lead.id;
            lead.endereco = lead.endereco || data.lead.endereco || '';
            lead.cidade = lead.cidade || data.lead.cidade || '';
            if (data.lead.coords) {
              lead.lat = lead.lat || data.lead.coords.lat;
              lead.lng = lead.lng || data.lead.coords.lng;
            }
          }
        } catch (e) {}
      }

      // 2) IA: frente + verso do cartão numa única análise
      const fotos = await dbGetFotosDoLead(lead.id);
      if (fotos.length) {
        const imagens = [];
        for (const f of fotos) {
          imagens.push(await blobToBase64(f.blob));
        }
        const res = await API.extrairDadosCartao(imagens);
        const ia = res && (res.data || res.dados);
        if (res && res.success && ia) {
          // Complementa apenas o que o hunter não preencheu
          if (ia.nome_empresa && !lead.empresa) lead.empresa = ia.nome_empresa;
          if (ia.nome_contato && !lead.nomeContato) lead.nomeContato = ia.nome_contato;
          if (ia.telefone && !lead.telefoneLoja) lead.telefoneLoja = ia.telefone;
          const zapIA = ia.whatsapp || ia.telefone;
          if (zapIA && !lead.zapContato) lead.zapContato = zapIA;
          if (ia.email && !lead.email) lead.email = ia.email;
          const endIA = [ia.endereco, ia.cidade].filter(Boolean).join(' - ');
          if (endIA && !lead.cidadeBairro) lead.cidadeBairro = endIA;
          if (ia.ramo_atividade && !lead.segmento) lead.segmento = this.resolverSegmento(ia.ramo_atividade);
          const extras = [
            ia.site ? 'Site: ' + ia.site : '',
            ia.redes_sociais ? 'Redes: ' + ia.redes_sociais : ''
          ].filter(Boolean).join(' | ');
          if (extras && !lead.faltas) lead.faltas = extras;
        }
      }

      lead.iaStatus = 'pronto';
      await db.leads.put(lead);

      // 3) Reflete os dados completos no PocketBase
      if (lead.pbId) {
        try {
          await fetch('/api/scrape/leads/' + lead.pbId, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: lead.status,
              empresa: lead.empresa,
              telefone: lead.telefoneLoja || lead.telefone,
              nomeContato: lead.nomeContato,
              zapContato: lead.zapContato,
              segmento: lead.segmento,
              email: lead.email
            })
          });
        } catch (e) {}
      }
    } catch (e) {
      // offline/rede → segue 'analisando' (retry automático); erro real → 'erro'
      const msg = String(e && e.message || e || '').toLowerCase();
      const ehRede = msg.includes('offline') || msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed') || e.name === 'AbortError';
      lead.iaStatus = ehRede ? 'analisando' : 'erro';
      await db.leads.put(lead);
    }
    return lead;
  },

  // Encaixa o ramo detectado pela IA nas opções do select de segmento
  resolverSegmento(ramo) {
    const opcoes = [
      'Enxoval / Cama, Mesa e Banho', 'Confecção / Roupas', 'Bordado',
      'Boutique / Calçados', 'Alimentação / Mercado', 'Decoração / Móveis',
      'Serviços', 'Outro'
    ];
    const alvo = String(ramo || '').toLowerCase().trim();
    if (!alvo) return '';
    const opcao = opcoes.find((o) => o.toLowerCase().split('/').map((p) => p.trim())
      .some((p) => p && (alvo.includes(p) || p.includes(alvo))));
    return opcao || '';
  },

  async reprocessarAnalise(leadId) {
    const lead = await dbGetLeadPorId(leadId);
    if (!lead) return;
    lead.iaStatus = 'analisando';
    await db.leads.put(lead);
    this.carregarFila();
    this.toast('Reanalisando cartão com IA...', 'success');
    await this.analisarLeadIA(leadId);
    const atualizado = await dbGetLeadPorId(leadId);
    this.carregarFila();
    if (atualizado && atualizado.iaStatus === 'pronto') {
      this.toast('Análise concluída — pronto para enviar!', 'success');
    } else {
      this.toast('Análise falhou — verifique a conexão ou o Ollama no servidor', 'error');
    }
  },

  // Envia o lead da fila para o WhatsApp (só habilitado quando 'pronto')
  async enviarLeadWhatsApp(leadId) {
    const lead = await dbGetLeadPorId(leadId);
    if (!lead) return;
    if (lead.iaStatus === 'analisando') {
      this.toast('Aguarde — a IA ainda está analisando o cartão', 'warning');
      return;
    }
    try {
      API.enviarWhatsApp(lead);
      await dbMarcarEnviado(lead.id);
      await dbSalvarNoHistorico(lead);
      this.toast('Lead enviado no WhatsApp!', 'success');
      this.carregarFila();
      this.carregarHistorico();
      this.atualizarBadge();
      this.atualizarDashboard();
    } catch (err) {
      console.error('Erro ao enviar lead:', err);
      this.toast('Erro ao enviar: ' + err.message, 'error');
    }
  },

  async editarLeadDaFila(leadId) {
    const lead = await dbGetLeadPorId(leadId);
    if (!lead) return;
    if (typeof FORM !== 'undefined') FORM.editarLead(lead);
  },

  async excluirLeadDaFila(leadId) {
    const lead = await dbGetLeadPorId(leadId);
    if (!lead) return;
    if (!confirm(`Excluir o lead "${lead.empresa || 'Lead'}"? Essa ação não pode ser desfeita.`)) return;
    try {
      await dbExcluirLead(lead.id);
      this.toast('Lead excluído.', 'success');
      this.carregarFila();
      this.carregarHistorico();
      this.atualizarBadge();
      this.atualizarDashboard();
      if (typeof MAPA !== 'undefined') MAPA.refresh();
      if (typeof SUGERIDOS !== 'undefined') SUGERIDOS.refresh();
    } catch (err) {
      console.error('Erro ao excluir lead:', err);
      this.toast('Erro ao excluir: ' + err.message, 'error');
    }
  },

  async atualizarBadge() {
    const badgeHeader = document.getElementById('headerBadge');
    const navBadge = document.querySelector('.bottom-nav-item[data-tab="fila"] .nav-badge');
    const todos = await db.leads.toArray();
    const total = todos.filter((l) => !l.enviado && l.fonte !== 'casa_dados' && l.fonte !== 'brasil_api').length;

    if (badgeHeader) {
      badgeHeader.textContent = total > 0 ? `${total} pendente${total > 1 ? 's' : ''}` : '';
      badgeHeader.classList.toggle('visible', total > 0);
    }
    if (navBadge) {
      navBadge.textContent = total > 0 ? total : '';
      navBadge.style.display = total > 0 ? 'flex' : 'none';
    }
  },

  async atualizarDashboard() {
    const tab = document.getElementById('tabResumo');
    if (!tab) return;

    const todos = await dbGetLeads();
    const hojeLeads = await dbGetLeadsDoDia();
    const historico = await dbGetHistorico(9999);

    const totalCaptados = todos.length;
    const convertidos = todos.filter(l => l.status === 'convertido' || l.demo === 'Sim').length;
    const naFila = todos.filter(l => !l.enviado && l.fonte !== 'casa_dados' && l.fonte !== 'brasil_api').length;
    const taxaConversao = totalCaptados > 0 ? Math.round((convertidos / totalCaptados) * 100) : 0;

    const elHoje = document.getElementById('metricLeadsHoje');
    const elPendentes = document.getElementById('metricPendentes');
    const elConversao = document.getElementById('metricConversao');
    const elTotal = document.getElementById('metricTotal');

    if (elHoje) elHoje.textContent = hojeLeads.length;
    if (elPendentes) elPendentes.textContent = naFila;
    if (elConversao) elConversao.textContent = `${taxaConversao}%`;
    if (elTotal) elTotal.textContent = totalCaptados;

    await this.renderizarGrafico();

    const empty = document.getElementById('emptyDashboard');
    if (empty) {
      empty.style.display = totalCaptados === 0 ? 'block' : 'none';
    }
  },

  async renderizarGrafico() {
    const container = document.getElementById('chartBars');
    if (!container) return;

    const dias = await dbGetLeadsPorDia(7);
    const max = Math.max(...Object.values(dias), 1);
    container.innerHTML = '';

    Object.entries(dias).forEach(([label, valor]) => {
      const alt = Math.max((valor / max) * 100, valor > 0 ? 10 : 4);
      const diaSem = new Date().toLocaleDateString('pt-BR') === label ? 'Hoje' : label.slice(0, 5);

      container.innerHTML += `
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
          <div class="chart-bar" style="height:${alt}%">
            ${valor > 0 ? `<span class="chart-bar-value">${valor}</span>` : ''}
          </div>
          <div class="chart-bar-label">${diaSem}</div>
        </div>
      `;
    });
  },

  // Fila de envio: leads salvos aguardando IA → WhatsApp.
  // Laranja = analisando com IA · Vermelho = falha · Verde = pronto p/ envio
  async carregarFila() {
    const container = document.getElementById('filaList');
    if (!container) return;

    const leads = await dbGetLeadsNaFila();
    const empty = document.getElementById('emptyFila');

    if (leads.length === 0) {
      container.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    const iconeCheck = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2z"/></svg>';
    const iconeAlerta = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    const iconeEditar = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    const iconeExcluir = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

    container.innerHTML = leads.map((lead) => {
      const analisando = lead.iaStatus === 'analisando';
      const erro = lead.iaStatus === 'erro';

      const badge = analisando
        ? '<span class="badge badge-warning">Analisando com IA...</span>'
        : erro
          ? '<span class="badge badge-danger">Falha na análise IA</span>'
          : '<span class="badge badge-success">Pronto para enviar</span>';

      const icone = analisando
        ? '<span class="ocr-spinner"></span>'
        : erro
          ? iconeAlerta
          : iconeCheck;
      const corIcone = erro ? 'var(--color-danger)' : 'var(--color-success)';

      let acoes = '';
      if (analisando) {
        acoes = '';
      } else if (erro) {
        acoes = `
          <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px" onclick="App.reprocessarAnalise(${lead.id})">Tentar novamente</button>
          <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="App.enviarLeadWhatsApp(${lead.id})">Enviar mesmo assim</button>
        `;
      } else {
        acoes = `
          <button class="btn btn-primary" style="padding:6px 12px;font-size:12px" onclick="App.enviarLeadWhatsApp(${lead.id})">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2z"/></svg>Enviar no WhatsApp
          </button>
        `;
      }

      return `
        <div class="lead-item">
          <div class="lead-item-icon" style="background:${erro ? 'var(--color-danger-subtle)' : 'var(--color-success-subtle)'};${analisando ? 'background:var(--color-accent-subtle)' : ''}">
            <span style="color:${corIcone};display:flex;align-items:center;justify-content:center">${icone}</span>
          </div>
          <div class="lead-item-info">
            <div class="lead-item-title">${esc(lead.empresa) || 'Lead'}</div>
            <div class="lead-item-subtitle">${esc(lead.nomeContato) || '-'} — ${esc(lead.zapContato) || '-'}</div>
            <div class="lead-item-meta">
              ${badge}
              <span style="font-size:11px;color:var(--color-text-tertiary)">${lead.dataCadastro || ''}</span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:var(--space-1);flex-shrink:0">
            ${acoes}
            <div style="display:flex;gap:var(--space-1)">
              <button class="btn btn-ghost" style="padding:6px;border-radius:var(--radius-sm)" title="Editar lead" aria-label="Editar lead" onclick="App.editarLeadDaFila(${lead.id})">${iconeEditar}</button>
              <button class="btn btn-ghost" style="padding:6px;border-radius:var(--radius-sm);color:var(--color-danger)" title="Excluir lead" aria-label="Excluir lead" onclick="App.excluirLeadDaFila(${lead.id})">${iconeExcluir}</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  async carregarHistorico() {
    const container = document.getElementById('historicoList');
    if (!container) return;

    const historico = await dbGetHistorico(30);
    const empty = document.getElementById('emptyHistorico');

    if (historico.length === 0) {
      container.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    container.innerHTML = historico.map(item => `
      <div class="lead-item">
        <div class="lead-item-icon" style="background:var(--color-success-subtle)">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-success)"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="lead-item-info">
          <div class="lead-item-title">${esc(item.empresa) || 'Lead'}</div>
          <div class="lead-item-subtitle">${esc(item.nomeContato) || '-'} — ${esc(item.zapContato) || '-'}</div>
          <div class="lead-item-meta">
            <span class="badge badge-success">Salvo & Enviado</span>
            <span style="font-size:11px;color:var(--color-text-tertiary)">${item.enviadoEm || '-'}</span>
          </div>
        </div>
        <div style="display:flex;gap:var(--space-1);flex-shrink:0">
          <button class="btn btn-ghost" style="padding:6px;border-radius:var(--radius-sm)" title="Editar lead" aria-label="Editar lead" onclick="App.editarLeadEnviado(${item.id})">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn btn-ghost" style="padding:6px;border-radius:var(--radius-sm);color:var(--color-danger)" title="Excluir lead" aria-label="Excluir lead" onclick="App.excluirLeadEnviado(${item.id})">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');
  },

  // Localiza o lead (db.leads) vinculado a uma entrada do histórico.
  // Novos registros têm leadId; antigos tentam casar por empresa + zap.
  async resolverLeadDoHistorico(item) {
    if (!item) return null;
    if (item.leadId) {
      const lead = await dbGetLeadPorId(item.leadId);
      if (lead) return lead;
    }
    const todos = await db.leads.toArray();
    const norm = (s) => String(s || '').trim().toLowerCase();
    return todos.find((l) =>
      norm(l.empresa) === norm(item.empresa) &&
      (!item.zapContato || norm(l.zapContato) === norm(item.zapContato))
    ) || null;
  },

  async editarLeadEnviado(historicoId) {
    const item = await db.historico.get(Number(historicoId));
    if (!item) return;
    const lead = await this.resolverLeadDoHistorico(item);
    if (!lead) {
      this.toast('Registro antigo sem lead vinculado — não é possível editar', 'warning');
      return;
    }
    if (typeof FORM !== 'undefined') FORM.editarLead(lead);
  },

  async excluirLeadEnviado(historicoId) {
    const hid = Number(historicoId);
    const item = await db.historico.get(hid);
    if (!item) return;

    if (!confirm(`Excluir o lead "${item.empresa || 'Lead'}"? Essa ação não pode ser desfeita.`)) return;

    try {
      const lead = await this.resolverLeadDoHistorico(item);
      if (lead) await dbExcluirLead(lead.id);
      await db.historico.delete(hid);

      this.toast('Lead excluído.', 'success');
      this.carregarHistorico();
      this.carregarFila();
      this.atualizarBadge();
      this.atualizarDashboard();
      if (typeof MAPA !== 'undefined') MAPA.refresh();
      if (typeof SUGERIDOS !== 'undefined') SUGERIDOS.refresh();
    } catch (err) {
      console.error('Erro ao excluir lead:', err);
      this.toast('Erro ao excluir: ' + err.message, 'error');
    }
  },

  toast(mensagem, tipo = 'success') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = mensagem;
    el.className = `toast toast-${tipo} visible`;
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => el.classList.remove('visible'), 3000);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());