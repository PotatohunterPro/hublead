const API = {
  CONFIG_KEY: 'hubleads_config',
  HUNTER_KEY: 'hubleads_hunter',
  // Instância criada na Evolution API (configurada no .env / EVOLUTION_INSTANCE_NAME)
  INSTANCE: 'hub_hunter',

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

  // URL base da Evolution API.
  // Padrão: mesma origem via proxy Nginx (/evolution) — sem configurar nada.
  // Permite override manual (avançado) se quiser apontar para outro servidor.
  baseUrl() {
    const cfg = this.getConfig();
    if (cfg.apiUrl) return cfg.apiUrl.replace(/\/+$/, '');
    return '/evolution';
  },

  // Garante que a instância exista na Evolution API (idempotente).
  async garantirInstancia() {
    const base = this.baseUrl();
    const cfg = this.getConfig();
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers['apikey'] = cfg.apiKey;
    // Tenta conectar (gera QR se desconectada / já existe)
    try {
      const resp = await fetch(base + '/instance/connect/' + this.INSTANCE, { headers });
      if (resp.ok) return resp.json();
      // 404 -> instância não existe; cria e tenta conectar
      if (resp.status === 404) {
        const create = await fetch(base + '/instance/create', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            instanceName: this.INSTANCE,
            integration: 'WHATSAPP-BAILEYS',
            qrcode: true
          })
        });
        await create.json();
        const connect = await fetch(base + '/instance/connect/' + this.INSTANCE, { headers });
        return connect.json();
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  // Estado da conexão: 'open' | 'connecting' | 'close' | 'qrcode'
  async estadoConexao() {
    const base = this.baseUrl();
    const cfg = this.getConfig();
    const headers = {};
    if (cfg.apiKey) headers['apikey'] = cfg.apiKey;
    try {
      const resp = await fetch(base + '/instance/connectionState/' + this.INSTANCE, { headers });
      if (!resp.ok) return 'close';
      const data = await resp.json();
      const state = data?.instance?.state || 'close';
      if (state === 'open') return 'open';
      if (state === 'close') return 'qrcode';
      return 'connecting';
    } catch (e) {
      return 'close';
    }
  },

  formatarMensagem(d) {
    const linhas = [];
    // Cabeçalho: empresa + segmento (se houver)
    const titulo = d.segmento ? `🏢 *${d.empresa}* — ${d.segmento}` : `🏢 *${d.empresa}*`;
    linhas.push(titulo);
    if (d.cidadeBairro) linhas.push(`📍 ${d.cidadeBairro}`);
    linhas.push('');
    // Sistema atual (só se preenchido)
    const sist = [];
    if (d.qualSistema) sist.push(`*${d.qualSistema}*`);
    if (d.mensalidade) sist.push(`R$ ${d.mensalidade}`);
    if (sist.length) linhas.push(`💻 Sistema: ${sist.join(' · ')}`);
    if (d.temSistema === 'Não') linhas.push('💻 Sem sistema atualmente');
    if (d.suporteBom) linhas.push(`🔧 Suporte: ${d.suporteBom}`);
    if (d.faltas) linhas.push(`💬 Dor: ${d.faltas}`);
    linhas.push('');
    // Contato
    const contato = [];
    if (d.nomeContato) contato.push(`*${d.nomeContato}*`);
    if (d.cargo) contato.push(d.cargo);
    if (d.zapContato) contato.push(d.zapContato);
    if (contato.length) linhas.push(`👤 ${contato.join(' — ')}`);
    // Interesse (só o que foi preenchido)
    const interesse = [];
    if (d.trocaAtendimento && d.trocaAtendimento !== 'Não') interesse.push(`Troca atendimento: ${d.trocaAtendimento}`);
    if (d.trocaValor && d.trocaValor !== 'Não') interesse.push(`Troca valor: ${d.trocaValor}`);
    if (d.demo) interesse.push(`Demo: ${d.demo}`);
    if (interesse.length) linhas.push(`📌 ${interesse.join(' · ')}`);
    linhas.push('');
    // Rodapé
    const rodape = [];
    if (d.dataCadastro) rodape.push(d.dataCadastro);
    rodape.push(`🎯 ${d.hunter || 'Hunter'}`);
    linhas.push(rodape.join(' | '));
    return linhas.join('\n').trim();
  },

  async enviarParaAPI(mensagem) {
    const cfg = this.getConfig();
    if (!cfg.grupoId) {
      throw new Error('ID do grupo não configurado');
    }
    const base = this.baseUrl();
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers['apikey'] = cfg.apiKey;
    const response = await fetch(base + '/message/sendText/' + this.INSTANCE, {
      method: 'POST',
      headers,
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
    if (!cfg.grupoId) {
      throw new Error('ID do grupo não configurado');
    }
    const base = this.baseUrl();
    const headers = {};
    if (cfg.apiKey) headers['apikey'] = cfg.apiKey;
    const formData = new FormData();
    formData.append('file', fotoBlob, 'fachada.jpg');
    formData.append('number', cfg.grupoId);
    formData.append('caption', legenda);
    const response = await fetch(base + '/message/sendMedia/' + this.INSTANCE, {
      method: 'POST',
      headers,
      body: formData
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error('Erro API media: ' + err);
    }
    return response.json();
  },

  // ---- MODO MANUAL: envia via WhatsApp do celular (sem Evolution) ----
  // Gera a mensagem, copia para o clipboard e abre o WhatsApp.
  // Destinatário: número fixo de envio (se configurado), senão o contato do lead.
  abrirManual(dados) {
    const msg = this.formatarMensagem(dados);
    const cfg = this.getConfig();
    // 1) Copia a mensagem formatada para a área de transferência
    const copiar = () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(msg).catch(() => {});
      } else {
        const ta = document.createElement('textarea');
        ta.value = msg;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
      }
    };
    copiar();
    // 2) Escolhe o destinatário: número fixo de envio tem prioridade
    const numeroFixo = String(cfg.numeroEnvio || '').replace(/\D/g, '');
    const numeroLead = String(dados.zapContato || '').replace(/\D/g, '');
    const destino = numeroFixo || numeroLead;
    const waUrl = destino ? 'https://wa.me/' + destino : 'https://wa.me/';
    window.open(waUrl + '?text=' + encodeURIComponent(msg), '_blank');
    return msg;
  },

  // Determina se a Evolution está configurada e alcançável
  async modoDisponivel() {
    const cfg = this.getConfig();
    if (!cfg.grupoId) return 'manual'; // sem grupo configurado -> usa manual
    try {
      const estado = await this.estadoConexao();
      return estado === 'open' ? 'api' : 'manual';
    } catch (e) {
      return 'manual';
    }
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
