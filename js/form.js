// ============================================================
//  HUB LEADS — Formulário de Campo Express (30 Segundos)
//  Autopreenchimento por CNPJ + GPS em background + WhatsApp direto
// ============================================================

const FORM = {
  form: null,
  btnSubmit: null,
  btnBuscarCnpj: null,
  btnToggleDetalhes: null,
  _cachedCoords: null,
  _editandoLeadId: null,
  _leadEmEdicao: null,

  init(formId, btnId) {
    this.form = document.getElementById(formId);
    this.btnSubmit = document.getElementById(btnId);
    this.btnBuscarCnpj = document.getElementById('btnBuscarCnpj');
    this.btnToggleDetalhes = document.getElementById('btnToggleDetalhes');

    if (!this.form) return;

    // Opções clicáveis rápidas
    document.querySelectorAll('.btn-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.closest('.btn-option-group');
        group.querySelectorAll('.btn-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (navigator.vibrate) navigator.vibrate(10);
      });
    });

    // Accordion de detalhes opcionais
    if (this.btnToggleDetalhes) {
      this.btnToggleDetalhes.addEventListener('click', () => {
        const conteudo = document.getElementById('detalhesSistema');
        const icone = document.getElementById('iconToggleDetalhes');
        if (!conteudo) return;
        const visivel = conteudo.classList.toggle('visible');
        if (icone) {
          icone.style.transform = visivel ? 'rotate(180deg)' : 'rotate(0deg)';
        }
      });
    }

    // Botão de busca rápida por CNPJ
    if (this.btnBuscarCnpj) {
      this.btnBuscarCnpj.addEventListener('click', () => this.buscarCnpj());
    }

    // Cancelar edição de lead
    const btnCancelEdicao = document.getElementById('btnCancelarEdicao');
    if (btnCancelEdicao) {
      btnCancelEdicao.addEventListener('click', () => this.cancelarEdicao());
    }

    this.form.addEventListener('submit', (e) => this.submit(e));
  },

  // ===== Edição de Lead Enviado =====
  editarLead(lead) {
    if (!lead) return;
    this._editandoLeadId = lead.id;
    this._leadEmEdicao = lead;

    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el && v !== undefined && v !== null) el.value = v;
    };
    const setOption = (field, v) => {
      if (!v) return;
      const btn = document.querySelector(`.btn-option-group[data-field="${field}"] .btn-option[data-value="${v}"]`);
      if (!btn) return;
      btn.closest('.btn-option-group').querySelectorAll('.btn-option').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    };

    setVal('inputEmpresa', lead.empresa);
    setVal('inputCnpj', lead.cnpj);
    setVal('inputCidadeBairro', lead.cidadeBairro || [lead.endereco, lead.cidade].filter(Boolean).join(' - '));
    setVal('inputNomeContato', lead.nomeContato);
    setVal('selectCargo', lead.cargo);
    setVal('inputZap', lead.zapContato);
    setVal('textareaFaltas', lead.faltas || lead.dorPrincipal || '');
    setVal('selectSegmento', lead.segmento);
    setVal('inputTelLoja', lead.telefoneLoja);
    setVal('inputEmail', lead.email);
    setVal('inputQualSistema', lead.qualSistema);
    setVal('inputMensalidade', lead.mensalidade);
    setOption('demo', lead.demo);
    setOption('temSistema', lead.temSistema);
    setOption('suporteBom', lead.suporteBom);
    setOption('trocaAtendimento', lead.trocaAtendimento);
    setOption('trocaValor', lead.trocaValor);

    // Abre o accordion de detalhes se houver dados neles
    const temDetalhes = !!(lead.segmento || lead.telefoneLoja || lead.email || lead.qualSistema || lead.mensalidade || lead.temSistema || lead.suporteBom || lead.trocaAtendimento || lead.trocaValor);
    const detalhes = document.getElementById('detalhesSistema');
    const icone = document.getElementById('iconToggleDetalhes');
    if (detalhes) detalhes.classList.toggle('visible', !!temDetalhes);
    if (icone) icone.style.transform = temDetalhes ? 'rotate(180deg)' : 'rotate(0deg)';

    // Banner de edição
    const banner = document.getElementById('editandoBanner');
    const nomeEl = document.getElementById('editandoNome');
    if (banner) banner.style.display = 'flex';
    if (nomeEl) nomeEl.textContent = lead.empresa || 'Lead';

    if (this.btnSubmit) {
      this.btnSubmit.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Atualizar Lead';
    }

    App.mudarTab('lead');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    App.toast('Editando lead — faça as alterações e salve', 'success');
  },

  cancelarEdicao() {
    this._editandoLeadId = null;
    this._leadEmEdicao = null;
    const banner = document.getElementById('editandoBanner');
    if (banner) banner.style.display = 'none';
    this.limpar();
    if (this.btnSubmit) this.btnSubmit.innerHTML = this._btnSubmitText();
    App.toast('Edição cancelada', 'warning');
  },

  // Pré-carrega o GPS em background assim que a aba "Novo" é selecionada
  prepararGeolocalizacao() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this._cachedCoords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          timestamp: Date.now()
        };
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  },

  async buscarCnpj() {
    const input = document.getElementById('inputCnpj');
    const cnpj = input ? input.value.trim() : '';
    if (!cnpj) {
      App.toast('Digite o CNPJ para buscar', 'warning');
      return;
    }

    const btn = this.btnBuscarCnpj;
    const txtOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="skeleton-circle" style="display:inline-block;width:14px;height:14px;border-radius:50%;vertical-align:middle"></span>';

    try {
      const dados = await API.consultarCnpj(cnpj);
      if (dados) {
        if (dados.empresa) document.getElementById('inputEmpresa').value = dados.empresa;
        if (dados.endereco || dados.cidade) {
          document.getElementById('inputCidadeBairro').value = [dados.endereco, dados.cidade].filter(Boolean).join(' - ');
        }
        if (dados.telefone) {
          const telLoja = document.getElementById('inputTelLoja');
          if (telLoja) telLoja.value = dados.telefone;
        }
        if (dados.email) {
          const email = document.getElementById('inputEmail');
          if (email) email.value = dados.email;
        }
        if (dados.coords) {
          this._cachedCoords = {
            latitude: dados.coords.lat,
            longitude: dados.coords.lng,
            timestamp: Date.now()
          };
        }
        App.toast('Dados da empresa preenchidos!', 'success');
      }
    } catch (err) {
      App.toast(err.message || 'CNPJ não encontrado', 'error');
    }

    btn.disabled = false;
    btn.innerHTML = txtOriginal;
  },

  getSelected(field) {
    const group = document.querySelector(`.btn-option-group[data-field="${field}"]`);
    if (!group) return '';
    const active = group.querySelector('.btn-option.active');
    return active ? active.dataset.value : '';
  },

  coletarDados() {
    return {
      empresa: document.getElementById('inputEmpresa')?.value.trim() || '',
      cnpj: document.getElementById('inputCnpj')?.value.trim() || '',
      cidadeBairro: document.getElementById('inputCidadeBairro')?.value.trim() || '',
      nomeContato: document.getElementById('inputNomeContato')?.value.trim() || '',
      cargo: document.getElementById('selectCargo')?.value || '',
      zapContato: document.getElementById('inputZap')?.value.trim() || '',
      demo: this.getSelected('demo'),
      dorPrincipal: document.getElementById('textareaFaltas')?.value.trim() || '',
      faltas: document.getElementById('textareaFaltas')?.value.trim() || '',
      // Campos opcionais de sistema
      segmento: document.getElementById('selectSegmento')?.value || '',
      telefoneLoja: document.getElementById('inputTelLoja')?.value.trim() || '',
      email: document.getElementById('inputEmail')?.value.trim() || '',
      temSistema: this.getSelected('temSistema'),
      qualSistema: document.getElementById('inputQualSistema')?.value.trim() || '',
      mensalidade: document.getElementById('inputMensalidade')?.value.trim() || '',
      suporteBom: this.getSelected('suporteBom'),
      trocaAtendimento: this.getSelected('trocaAtendimento'),
      trocaValor: this.getSelected('trocaValor'),
      // Metadados
      hunter: API.getHunterNome(),
      hunterCelular: API.getHunterCelular(),
      fonte: 'captacao_campo',
      dataCadastro: new Date().toLocaleString('pt-BR'),
      criadoEm: new Date().toISOString()
    };
  },

  validar(dados) {
    const erros = [];
    if (!dados.empresa) erros.push('Nome da empresa/loja é obrigatório');
    if (!dados.nomeContato) erros.push('Nome do contato é obrigatório');
    const zap = dados.zapContato.replace(/\D/g, '');
    if (zap.length < 10) erros.push('WhatsApp do contato inválido (mín. 10 dígitos)');
    else if (/^(\d)\1{9,}$/.test(zap)) erros.push('WhatsApp inválido');
    if (dados.cnpj) {
      const c = dados.cnpj.replace(/\D/g, '');
      if (c.length !== 14) erros.push('CNPJ deve ter 14 dígitos');
      else if (/^(\d)\1{13}$/.test(c)) erros.push('CNPJ inválido');
    }
    if (dados.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) erros.push('E-mail inválido');
    return erros;
  },

  async obterCoordenadas(dados) {
    // 1) Se já temos coordenadas em cache recentes (< 3 minutos)
    if (this._cachedCoords && (Date.now() - this._cachedCoords.timestamp < 180000)) {
      return { latitude: this._cachedCoords.latitude, longitude: this._cachedCoords.longitude };
    }

    // 2) Tenta GPS do dispositivo (rápido, 3s)
    if (navigator.geolocation) {
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true, timeout: 3500, maximumAge: 60000
          });
        });
        return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      } catch (e) {}
    }

    // 3) Fallback: geocode via endereço (timeout curto p/ nunca travar o submit)
    const endereco = [dados.cidadeBairro, dados.empresa].filter(Boolean).join(', ');
    if (endereco && navigator.onLine) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 5000);
        const resp = await fetch('/api/scrape/geocode?endereco=' + encodeURIComponent(endereco), { signal: controller.signal });
        clearTimeout(t);
        const data = await resp.json();
        if (data.success && data.coords) {
          return { latitude: data.coords.lat, longitude: data.coords.lng };
        }
      } catch (e) {}
    }

    return null;
  },

  async submit(e) {
    e.preventDefault();
    if (!this.form) return;

    this.btnSubmit.disabled = true;
    this.btnSubmit.innerHTML = '<span class="skeleton-circle" style="display:inline-block;width:18px;height:18px;margin-right:8px;vertical-align:middle"></span> Salvando...';

    let dados = this.coletarDados();
    const erros = this.validar(dados);

    if (erros.length > 0) {
      App.toast(erros.join('. '), 'error');
      this.btnSubmit.disabled = false;
      this.btnSubmit.innerHTML = this._btnSubmitText();
      return;
    }

    const editando = !!(this._editandoLeadId && this._leadEmEdicao);
    if (editando) {
      // Preserva campos que não estão no formulário (pbId, fonte, endereço do CNPJ...)
      dados = Object.assign({}, this._leadEmEdicao, dados);
      dados.id = this._editandoLeadId;
      dados.criadoEm = this._leadEmEdicao.criadoEm || dados.criadoEm;
      dados.dataCadastro = this._leadEmEdicao.dataCadastro || dados.dataCadastro;
      dados.fonte = this._leadEmEdicao.fonte || dados.fonte;
      dados.syncStatus = 'pending'; // força re-sincronização com o PocketBase
    }

    // aguarda compressão em andamento para não salvar sem foto
    const fotosPendentes = CAMERA.slots.filter(s => s.input.files.length > 0 && !s.blob);
    if (fotosPendentes.length) {
      await new Promise(r => setTimeout(r, 900));
    }
    const fotos = CAMERA.getFotos();
    const fotoBlob = fotos.length ? fotos[0].blob : null;
    const fotoVersoBlob = fotos.length > 1 ? fotos[1].blob : null;

    try {
      // Coordenadas (só na criação — edição preserva a localização original)
      if (!editando) {
        const coords = await this.obterCoordenadas(dados);
        if (coords) {
          dados.lat = coords.latitude;
          dados.lng = coords.longitude;
          dados.latitude = coords.latitude;
          dados.longitude = coords.longitude;
        }
        // Com foto de cartão, o lead entra na fila aguardando a análise IA
        dados.iaStatus = fotos.length ? 'analisando' : 'pronto';
      }
      if (!dados.iaStatus) dados.iaStatus = 'pronto';
      if (dados.enviado === undefined) dados.enviado = false;

      // Status
      dados.status = dados.demo === 'Sim' ? 'convertido' : 'visitado';

      // 1) Salvar no banco local (frente = foto da fachada; verso salvo à parte)
      const leadId = await dbSalvarLead(dados, fotoBlob);
      if (fotoVersoBlob) await dbSalvarFoto(leadId, fotoVersoBlob);

      if (editando) {
        // 2) Atualiza a entrada do histórico (sem duplicar)
        await dbAtualizarHistoricoPorLead(leadId, dados);
        App.toast('Lead atualizado!', 'success');
      } else {
        App.toast(dados.iaStatus === 'analisando'
          ? 'Lead salvo! IA analisando o cartão...'
          : 'Lead salvo! Pronto para enviar.', 'success');
      }

      this.limpar();
      App.atualizarBadge();
      App.atualizarDashboard();
      App.carregarFila();
      App.carregarHistorico();
      // Vai para a fila: item laranja (analisando) → verde (pronto p/ envio)
      App.mudarTab('fila');
      if (!editando) App.processarAnalisesPendentes();
      if (typeof MAPA !== 'undefined') MAPA.refresh();
      if (typeof SUGERIDOS !== 'undefined') SUGERIDOS.refresh();

    } catch (err) {
      console.error('Erro ao salvar lead:', err);
      App.toast('Erro ao salvar: ' + err.message, 'error');
    }

    this.btnSubmit.disabled = false;
    this.btnSubmit.innerHTML = this._btnSubmitText();
  },

  limpar() {
    this.form.reset();
    document.querySelectorAll('.btn-option').forEach(b => b.classList.remove('active'));
    // Deixa padrão "Sim" em demonstração
    const demoSim = document.querySelector('.btn-option-group[data-field="demo"] .btn-option[data-value="Sim"]');
    if (demoSim) demoSim.classList.add('active');

    document.querySelectorAll('.form-error').forEach(e => e.classList.remove('visible'));
    document.querySelectorAll('.form-input.error, .form-select.error, .form-textarea.error').forEach(e => e.classList.remove('error'));

    const detalhes = document.getElementById('detalhesSistema');
    if (detalhes) detalhes.classList.remove('visible');
    const icone = document.getElementById('iconToggleDetalhes');
    if (icone) icone.style.transform = 'rotate(0deg)';

    CAMERA.limpar();
    this._cachedCoords = null;
    this._editandoLeadId = null;
    this._leadEmEdicao = null;
    const banner = document.getElementById('editandoBanner');
    if (banner) banner.style.display = 'none';
  },

  _btnSubmitText() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2z"/></svg> Salvar Lead';
  }
};