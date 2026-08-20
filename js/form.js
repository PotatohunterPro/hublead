const FORM = {
  form: null,
  btnSubmit: null,

  init(formId, btnId) {
    this.form = document.getElementById(formId);
    this.btnSubmit = document.getElementById(btnId);
    if (!this.form || !this.btnSubmit) return;
    document.querySelectorAll('.btn-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.closest('.btn-option-group');
        group.querySelectorAll('.btn-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (navigator.vibrate) navigator.vibrate(10);
      });
    });
    this.form.addEventListener('submit', (e) => this.submit(e));
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
      segmento: document.getElementById('selectSegmento')?.value || '',
      telefoneLoja: document.getElementById('inputTelLoja')?.value.trim() || '',
      email: document.getElementById('inputEmail')?.value.trim() || '',
      temSistema: this.getSelected('temSistema'),
      qualSistema: document.getElementById('inputQualSistema')?.value.trim() || '',
      mensalidade: document.getElementById('inputMensalidade')?.value.trim() || '',
      temSuporte: this.getSelected('temSuporte'),
      suporteBom: this.getSelected('suporteBom'),
      usoSistema: document.getElementById('inputUsoSistema')?.value.trim() || '',
      trocaAtendimento: this.getSelected('trocaAtendimento'),
      trocaValor: this.getSelected('trocaValor'),
      faltas: document.getElementById('textareaFaltas')?.value.trim() || '',
      nomeContato: document.getElementById('inputNomeContato')?.value.trim() || '',
      cargo: document.getElementById('selectCargo')?.value || '',
      zapContato: document.getElementById('inputZap')?.value.trim() || '',
      demo: this.getSelected('demo'),
      cidadeBairro: document.getElementById('inputCidadeBairro')?.value.trim() || '',
      hunter: API.getHunterNome(),
      hunterCelular: API.getHunterCelular(),
      dataCadastro: new Date().toLocaleString('pt-BR')
    };
  },

  validar(dados) {
    const erros = [];
    if (!dados.empresa) erros.push('Nome da empresa é obrigatório');
    if (!dados.nomeContato) erros.push('Nome do contato é obrigatório');
    const zap = dados.zapContato.replace(/\D/g, '');
    if (zap.length < 10) erros.push('WhatsApp do contato inválido');
    return erros;
  },

  async obterCoordenadas(dados) {
    // 1) GPS do dispositivo (rápido, com timeout)
    if (navigator.geolocation) {
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true, timeout: 6000, maximumAge: 300000
          });
        });
        return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      } catch (e) { /* cai no fallback */ }
    }
    // 2) Fallback: geocode do endereço via servidor (se online)
    const endereco = [dados.cidadeBairro, dados.empresa].filter(Boolean).join(', ');
    if (endereco && navigator.onLine) {
      try {
        const resp = await fetch('/api/scrape/geocode?endereco=' + encodeURIComponent(endereco));
        const data = await resp.json();
        if (data.success && data.coords) {
          return { latitude: data.coords.lat, longitude: data.coords.lng };
        }
      } catch (e) { /* sem coords */ }
    }
    return null;
  },

  async submit(e) {
    e.preventDefault();
    if (!this.form) return;
    this.btnSubmit.disabled = true;
    this.btnSubmit.innerHTML = '<span class="skeleton-circle" style="display:inline-block;width:20px;height:20px;margin-right:8px;vertical-align:middle"></span> Enviando...';
    const dados = this.coletarDados();
    const erros = this.validar(dados);
    if (erros.length > 0) {
      App.toast(erros.join('. '), 'error');
      this.btnSubmit.disabled = false;
      this.btnSubmit.innerHTML = this._btnSubmitText();
      return;
    }
    const fotoBlob = CAMERA.getBlob();
    try {
      // Geolocalização automática (GPS → fallback geocode)
      const coords = await this.obterCoordenadas(dados);
      if (coords) {
        dados.latitude = coords.latitude;
        dados.longitude = coords.longitude;
      }
      const leadId = await dbSalvarLead(dados, fotoBlob);
      if (fotoBlob) {
        dados.fotoLeadId = leadId;
      }
      const msg = API.formatarMensagem(dados);
      const online = navigator.onLine;
      if (online) {
        try {
          if (fotoBlob) {
            await API.enviarFotoParaAPI(fotoBlob, msg);
          } else {
            await API.enviarParaAPI(msg);
          }
          await dbSalvarNoHistorico(dados);
          await dbAtualizarStatusLead(leadId, 'enviado');
          App.toast('Lead enviado com sucesso!', 'success');
          API.processarFila();
        } catch (err) {
          await dbSalvarNaFila(dados, fotoBlob);
          App.toast('Sem conexão. Salvo na fila.', 'warning');
        }
      } else {
        await dbSalvarNaFila(dados, fotoBlob);
        App.toast('Offline. Salvo na fila.', 'warning');
      }
      this.limpar();
      App.atualizarBadge();
      App.atualizarDashboard();
      // Se o CNPJ pertence a um lead do mapa, marca como visitado/convertido
      if (dados.cnpj) {
        const mapaLead = await dbGetLeadMapaPorCnpj(dados.cnpj.replace(/\D/g, ''));
        if (mapaLead) {
          const novoStatus = dados.demo === 'Sim' ? 'convertido' : 'visitado';
          await dbAtualizarStatusLeadMapa(mapaLead.id, novoStatus, { dataVisita: new Date().toISOString() });
          if (typeof MAPA !== 'undefined') MAPA.refresh();
          if (typeof SUGERIDOS !== 'undefined') SUGERIDOS.refresh();
        }
      }
    } catch (err) {
      App.toast('Erro ao salvar: ' + err.message, 'error');
    }
    this.btnSubmit.disabled = false;
    this.btnSubmit.innerHTML = this._btnSubmitText();
  },

  limpar() {
    this.form.reset();
    document.querySelectorAll('.btn-option.active').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.form-error').forEach(e => e.classList.remove('visible'));
    document.querySelectorAll('.form-input.error, .form-select.error, .form-textarea.error').forEach(e => e.classList.remove('error'));
    CAMERA.limpar();
  },

  _btnSubmitText() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2z"/></svg> Salvar Lead';
  }
};