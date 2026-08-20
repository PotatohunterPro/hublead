const App = {
  currentTab: 'resumo',
  tabs: {},
  sheets: {},

  init() {
    this.initSplash();
    this.initTheme();
    this.initTabs();
    this.initConfig();
    this.initOfflineBar();
    this.initOnlineListener();
    CAMERA.init('fotoInput', 'photoPreview');
    FORM.init('leadForm', 'btnSalvarLead');
    MAPA.init('mapContainer');
    this.atualizarBadge();
    this.atualizarDashboard();
    this.carregarFila();
    this.carregarHistorico();
    this.iniciarPolling();
    setTimeout(() => {
      if (this.map) MAPA.refresh();
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
    }, pronto ? 1500 : 2200);
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
    if (tab === 'mapa') MAPA.refresh();
    if (tab === 'fila') { this.carregarFila(); this.carregarHistorico(); }
    if (tab === 'resumo') this.atualizarDashboard();
    if (tab === 'sugeridos') SUGERIDOS.refresh();
  },

  initConfig() {
    const btnConfig = document.getElementById('btnConfigurar');
    const btnSalvar = document.getElementById('btnSalvarConfig');
    const overlay = document.getElementById('configOverlay');
    const closeBtn = document.getElementById('btnFecharConfig');
    if (btnConfig) btnConfig.addEventListener('click', () => this.abrirConfig());
    if (btnSalvar) btnSalvar.addEventListener('click', () => this.salvarConfig());
    if (closeBtn) closeBtn.addEventListener('click', () => this.fecharConfig());
    const btnQr = document.getElementById('btnRefreshQr');
    if (btnQr) btnQr.addEventListener('click', () => this.carregarQrCode());
    if (overlay) overlay.addEventListener('click', (e) => {
      if (e.target === overlay && !overlay.dataset.required) this.fecharConfig();
    });

    const btnToggle = document.getElementById('btnToggleAvancadas');
    const avancadas = document.getElementById('configAvancadas');
    if (btnToggle && avancadas) {
      btnToggle.addEventListener('click', () => {
        const open = avancadas.style.display === 'block';
        avancadas.style.display = open ? 'none' : 'block';
        btnToggle.innerHTML = open
          ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg> Configurações avançadas'
          : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg> Ocultar';
      });
    }
  },

  abrirConfig(required = false) {
    const overlay = document.getElementById('configOverlay');
    if (!overlay) return;
    const cfg = API.getConfig();
    const hunter = API.getHunter();
    document.getElementById('configApiUrl').value = cfg.apiUrl || '';
    document.getElementById('configApiKey').value = cfg.apiKey || '';
    document.getElementById('configGrupoId').value = cfg.grupoId || '';
    document.getElementById('configHunterNome').value = hunter.nome || '';
    document.getElementById('configHunterCelular').value = hunter.celular || '';
    const title = document.getElementById('configModalTitle');
    if (title) title.textContent = required ? 'Bem-vindo ao Hub Leads' : 'Configurações';
    const cancelBtn = document.getElementById('btnFecharConfig');
    if (cancelBtn) cancelBtn.style.display = required ? 'none' : '';

    const avancadas = document.getElementById('configAvancadas');
    if (avancadas) avancadas.style.display = 'none';
    const btnToggle = document.getElementById('btnToggleAvancadas');
    if (btnToggle) btnToggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg> Configurações avançadas';

    overlay.classList.add('visible');
    if (required) overlay.dataset.required = 'true';
    // Checa status do WhatsApp e mostra QR se precisar
    this.verificarWhatsApp();
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
      this.toast('Preencha nome e celular do Hunter', 'error');
      return;
    }
    API.setHunter({ nome, celular });
    const apiUrl = document.getElementById('configApiUrl').value.trim();
    const apiKey = document.getElementById('configApiKey').value.trim();
    const grupoId = document.getElementById('configGrupoId').value.trim();
    API.setConfig({ apiUrl, apiKey, grupoId });
    this.toast('Configuração salva!', 'success');
    this.fecharConfig();
    this.atualizarDashboard();
  },

  async verificarWhatsApp() {
    const dot = document.getElementById('whatsappStatusDot');
    const txt = document.getElementById('whatsappStatusText');
    const qr = document.getElementById('qrcodeContainer');
    if (!dot || !txt) return;
    dot.style.background = 'var(--color-warning)';
    txt.textContent = 'Verificando conexão...';
    qr.style.display = 'none';
    const estado = await API.estadoConexao();
    if (estado === 'open') {
      dot.style.background = '#34c759';
      txt.textContent = 'Conectado ao WhatsApp ✓';
      qr.style.display = 'none';
    } else {
      dot.style.background = 'var(--color-warning)';
      txt.textContent = 'Conecte o WhatsApp (escaneie o QR abaixo)';
      qr.style.display = 'block';
      this.carregarQrCode();
    }
  },

  async carregarQrCode() {
    const img = document.getElementById('qrcodeImg');
    const qr = document.getElementById('qrcodeContainer');
    const dot = document.getElementById('whatsappStatusDot');
    const txt = document.getElementById('whatsappStatusText');
    if (!img) return;
    const dados = await API.garantirInstancia();
    const base64 = dados?.qrcode?.base64 || dados?.base64 || null;
    if (base64) {
      img.src = 'data:image/png;base64,' + base64;
      qr.style.display = 'block';
      dot.style.background = 'var(--color-warning)';
      txt.textContent = 'Escaneie o QR Code para conectar';
      // Poll até conectar
      this.pollConexao();
    } else {
      qr.style.display = 'block';
      img.style.display = 'none';
      txt.textContent = 'Não foi possível obter o QR Code. Verifique se a Evolution API está no ar em /evolution.';
    }
  },

  pollConexao() {
    clearTimeout(this._pollQr);
    this._pollQr = setTimeout(async () => {
      const estado = await API.estadoConexao();
      if (estado === 'open') {
        const dot = document.getElementById('whatsappStatusDot');
        const txt = document.getElementById('whatsappStatusText');
        const qr = document.getElementById('qrcodeContainer');
        if (dot) dot.style.background = '#34c759';
        if (txt) txt.textContent = 'Conectado ao WhatsApp ✓';
        if (qr) qr.style.display = 'none';
      } else if (document.getElementById('configOverlay')?.classList.contains('visible')) {
        this.pollConexao();
      }
    }, 4000);
  },

  initOfflineBar() {
    const bar = document.getElementById('offlineBar');
    if (!bar) return;
    const update = () => {
      bar.classList.toggle('visible', !navigator.onLine);
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  },

  initOnlineListener() {
    window.addEventListener('online', async () => {
      // Reenvia leads do mapa salvos offline + sincroniza status
      try {
        const flushed = await dbFlushLeadsMapaPendentes();
        if (flushed > 0) {
          this.toast(flushed + ' lead(s) sincronizado(s) com o mapa!', 'success');
          SUGERIDOS.refresh();
          MAPA.refresh();
        }
      } catch (e) { /* tenta de novo depois */ }
      API.processarFila().then(enviados => {
        if (enviados > 0) {
          this.toast(enviados + ' lead(s) enviados da fila!', 'success');
          this.atualizarBadge();
          this.atualizarDashboard();
        }
      });
    });
  },

  iniciarPolling() {
    setInterval(async () => {
      const fila = await dbGetFila();
      if (fila.length > 0 && navigator.onLine) {
        const enviados = await API.processarFila();
        if (enviados > 0) {
          this.atualizarBadge();
          this.atualizarDashboard();
          this.carregarFila();
        }
      }
    }, 30000);
  },

  async atualizarBadge() {
    const badgeHeader = document.getElementById('headerBadge');
    const navBadge = document.querySelector('.bottom-nav-item[data-tab="fila"] .nav-badge');
    const fila = await dbGetFila();
    const total = fila.length;
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
    const fila = await dbGetFila();
    const historico = await dbGetHistorico(9999);
    const totalEnviados = historico.length;
    const comDemo = todos.filter(l => l.demo === 'Sim').length;
    const taxaConversao = totalEnviados > 0 ? Math.round((comDemo / totalEnviados) * 100) : 0;
    const elHoje = document.getElementById('metricLeadsHoje');
    const elPendentes = document.getElementById('metricPendentes');
    const elConversao = document.getElementById('metricConversao');
    const elTotal = document.getElementById('metricTotal');
    if (elHoje) elHoje.textContent = hojeLeads.length;
    if (elPendentes) elPendentes.textContent = fila.length;
    if (elConversao) elConversao.textContent = `${taxaConversao}%`;
    if (elTotal) elTotal.textContent = totalEnviados;
    await this.renderizarGrafico();
    const empty = document.getElementById('emptyDashboard');
    if (empty) {
      empty.style.display = totalEnviados === 0 ? 'block' : 'none';
    }
  },

  async renderizarGrafico() {
    const container = document.getElementById('chartBars');
    if (!container) return;
    const dias = await dbGetLeadsPorDia(7);
    const max = Math.max(...Object.values(dias), 1);
    container.innerHTML = '';
    Object.entries(dias).forEach(([label, valor]) => {
      const alt = Math.max((valor / max) * 100, valor > 0 ? 8 : 4);
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

  async carregarFila() {
    const container = document.getElementById('filaList');
    if (!container) return;
    const fila = await dbGetFila();
    const empty = document.getElementById('emptyFila');
    if (fila.length === 0) {
      container.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    container.innerHTML = fila.map(item => `
      <div class="lead-item">
        <div class="lead-item-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2z"/></svg>
        </div>
        <div class="lead-item-info">
          <div class="lead-item-title">${item.leadData?.empresa || 'Lead'}</div>
          <div class="lead-item-subtitle">${item.leadData?.nomeContato || '-'} — ${item.leadData?.zapContato || '-'}</div>
          <div class="lead-item-meta">
            <span class="badge badge-warning">${item.tentativas}/3 tentativas</span>
            <span style="font-size:11px;color:var(--color-text-tertiary)">${new Date(item.criadoEm).toLocaleString('pt-BR')}</span>
          </div>
        </div>
      </div>
    `).join('');
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
          <div class="lead-item-title">${item.empresa || 'Lead'}</div>
          <div class="lead-item-subtitle">${item.nomeContato || '-'} — ${item.zapContato || '-'}</div>
          <div class="lead-item-meta">
            <span class="badge badge-success">Enviado</span>
            <span style="font-size:11px;color:var(--color-text-tertiary)">${item.enviadoEm || '-'}</span>
          </div>
        </div>
      </div>
    `).join('');
  },

  abrirSheet(id) {
    const sheet = document.getElementById(id);
    const overlay = document.getElementById(`${id}Overlay`);
    if (sheet) sheet.classList.add('visible');
    if (overlay) overlay.classList.add('visible');
  },

  fecharSheet(id) {
    const sheet = document.getElementById(id);
    const overlay = document.getElementById(`${id}Overlay`);
    if (sheet) sheet.classList.remove('visible');
    if (overlay) overlay.classList.remove('visible');
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