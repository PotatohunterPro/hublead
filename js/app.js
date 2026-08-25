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

    CAMERA.init('fotoInput', 'photoPreview');
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
      try {
        const sincronizados = await dbFlushLeadsPendentes();
        if (sincronizados > 0) {
          this.toast(`${sincronizados} lead(s) sincronizado(s)!`, 'success');
          if (typeof SUGERIDOS !== 'undefined') SUGERIDOS.refresh();
          if (typeof MAPA !== 'undefined') MAPA.refresh();
        }
      } catch (e) {
        console.warn('Sync automático falhou:', e);
      }

      API.processarFila().then(enviados => {
        if (enviados > 0) {
          this.atualizarBadge();
          this.atualizarDashboard();
        }
      });
    });
  },

  iniciarPollingFila() {
    setInterval(async () => {
      if (navigator.onLine) {
        const fila = await dbGetFila();
        if (fila.length > 0) {
          await API.processarFila();
          this.atualizarBadge();
          this.atualizarDashboard();
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

    const totalCaptados = todos.length;
    const convertidos = todos.filter(l => l.status === 'convertido' || l.demo === 'Sim').length;
    const pendentes = todos.filter(l => l.status === 'pendente').length;
    const taxaConversao = totalCaptados > 0 ? Math.round((convertidos / totalCaptados) * 100) : 0;

    const elHoje = document.getElementById('metricLeadsHoje');
    const elPendentes = document.getElementById('metricPendentes');
    const elConversao = document.getElementById('metricConversao');
    const elTotal = document.getElementById('metricTotal');

    if (elHoje) elHoje.textContent = hojeLeads.length;
    if (elPendentes) elPendentes.textContent = pendentes + fila.length;
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
          <div class="lead-item-title">${esc(item.leadData?.empresa) || 'Lead'}</div>
          <div class="lead-item-subtitle">${esc(item.leadData?.nomeContato) || '-'} — ${esc(item.leadData?.zapContato) || '-'}</div>
          <div class="lead-item-meta">
            <span class="badge badge-warning">Pendente de envio</span>
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
          <div class="lead-item-title">${esc(item.empresa) || 'Lead'}</div>
          <div class="lead-item-subtitle">${esc(item.nomeContato) || '-'} — ${esc(item.zapContato) || '-'}</div>
          <div class="lead-item-meta">
            <span class="badge badge-success">Salvo & Enviado</span>
            <span style="font-size:11px;color:var(--color-text-tertiary)">${item.enviadoEm || '-'}</span>
          </div>
        </div>
      </div>
    `).join('');
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