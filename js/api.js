const API = {
  CONFIG_KEY: 'hubleads_config',
  HUNTER_KEY: 'hubleads_hunter',

  getConfig() {
    return JSON.parse(localStorage.getItem(this.CONFIG_KEY) || '{}');
  },

  setConfig(cfg) {
    localStorage.setItem(this.CONFIG_KEY, JSON.stringify(cfg));
  },

  getHunter() {
    return JSON.parse(localStorage.getItem(this.HUNTER_KEY) || '{}');
  },

  setHunter(hunter) {
    localStorage.setItem(this.HUNTER_KEY, JSON.stringify(hunter));
  },

  getHunterNome() {
    return this.getHunter().nome || 'Hunter';
  },

  getHunterCelular() {
    return this.getHunter().celular || '';
  },

  temPerfil() {
    const h = this.getHunter();
    return !!(h.nome && h.celular);
  },

  formatarMensagem(d) {
    let msg = `🏢 *${d.empresa}* — ${d.segmento || '-'}\n`;
    msg += `📍 ${d.cidadeBairro || '-'}\n\n`;
    msg += `💻 *Sistema*: ${d.qualSistema || '-'} | R$ ${d.mensalidade || '-'}\n`;
    msg += `🔧 Suporte: ${d.suporteBom || '-'}\n`;
    msg += `💬 *Dor*: ${d.faltas || '-'}\n\n`;
    msg += `👤 *${d.nomeContato}* (${d.cargo || '-'}) — ${d.zapContato}\n`;
    msg += `📸 *Troca atendimento?* ${d.trocaAtendimento || '-'} | *Valor?* ${d.trocaValor || '-'}\n`;
    msg += `📅 Demo: ${d.demo || '-'}\n\n`;
    msg += `📅 ${d.dataCadastro} | 🎯 ${d.hunter}${d.hunterCelular ? ' (' + d.hunterCelular + ')' : ''}`;
    return msg;
  },

  async enviarParaAPI(mensagem) {
    const cfg = this.getConfig();
    if (!cfg.apiUrl || !cfg.apiKey || !cfg.grupoId) {
      throw new Error('API não configurada');
    }
    const baseUrl = cfg.apiUrl.replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/message/sendText/${cfg.grupoId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.apiKey
      },
      body: JSON.stringify({
        number: cfg.grupoId,
        text: mensagem,
        linkPreview: false
      })
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error('Erro API: ' + err);
    }
    return response.json();
  },

  async enviarFotoParaAPI(fotoBlob, legenda) {
    const cfg = this.getConfig();
    if (!cfg.apiUrl || !cfg.apiKey || !cfg.grupoId) {
      throw new Error('API não configurada');
    }
    const baseUrl = cfg.apiUrl.replace(/\/+$/, '');
    const formData = new FormData();
    formData.append('file', fotoBlob, 'fachada.jpg');
    formData.append('number', cfg.grupoId);
    formData.append('caption', legenda);
    const response = await fetch(`${baseUrl}/message/sendMedia/${cfg.grupoId}`, {
      method: 'POST',
      headers: { 'apikey': cfg.apiKey },
      body: formData
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error('Erro API media: ' + err);
    }
    return response.json();
  },

  async processarFila() {
    const fila = await dbGetFila();
    if (fila.length === 0) return 0;
    let enviados = 0;
    for (const item of fila) {
      if (item.tentativas >= 3) {
        await dbRemoverDaFila(item.id);
        continue;
      }
      try {
        const msg = this.formatarMensagem(item.leadData);
        if (item.fotoBlob) {
          const blob = await (await fetch(item.fotoBlob)).blob();
          await this.enviarFotoParaAPI(blob, msg);
        } else {
          await this.enviarParaAPI(msg);
        }
        await dbSalvarNoHistorico(item.leadData);
        await dbRemoverDaFila(item.id);
        enviados++;
      } catch (e) {
        await dbAtualizarTentativaFila(item.id);
      }
    }
    return enviados;
  }
};