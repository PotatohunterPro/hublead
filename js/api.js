// ============================================================
//  HUB LEADS — Comunicação Direta via WhatsApp (wa.me) & Config
//  100% confiável, sem dependência de containers pesados
// ============================================================

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

  getCasaDadosApiKey() {
    return this.getConfig().casaDadosApiKey || '';
  },

  // Formatação de mensagem profissional com emojis para o WhatsApp
  formatarMensagem(d) {
    const linhas = [];

    // Cabeçalho
    const titulo = d.segmento ? `🏢 *${d.empresa}* — ${d.segmento}` : `🏢 *${d.empresa}*`;
    linhas.push(titulo);

    if (d.cnpj) {
      const c = String(d.cnpj).replace(/\D/g, '');
      const cnpjFmt = c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
      linhas.push(`📄 CNPJ: ${cnpjFmt}`);
    }

    if (d.cidadeBairro || d.endereco || d.cidade) {
      linhas.push(`📍 ${d.cidadeBairro || d.endereco || d.cidade}`);
    }
    linhas.push('');

    // Contato Principal
    const contato = [];
    if (d.nomeContato) contato.push(`*${d.nomeContato}*`);
    if (d.cargo) contato.push(d.cargo);
    if (d.zapContato) contato.push(d.zapContato);
    if (contato.length) {
      linhas.push(`👤 ${contato.join(' — ')}`);
    }

    if (d.telefoneLoja && d.telefoneLoja !== d.zapContato) {
      linhas.push(`📞 Loja: ${d.telefoneLoja}`);
    }

    // Demonstração / Interesse
    if (d.demo) {
      linhas.push(`🎯 *Aceita Demo?*: ${d.demo}`);
    }

    // Dor Principal / Anotações
    if (d.faltas || d.dorPrincipal || d.anotacoes) {
      const dor = d.faltas || d.dorPrincipal || d.anotacoes;
      linhas.push(`💬 *Dor / Anotação*: ${dor}`);
    }
    linhas.push('');

    // Detalhes do Sistema Atual (se preenchido)
    const detalhesSist = [];
    if (d.temSistema && d.temSistema !== 'Não') {
      detalhesSist.push(`Possui: ${d.temSistema}`);
    }
    if (d.qualSistema) detalhesSist.push(`Qual: *${d.qualSistema}*`);
    if (d.mensalidade) detalhesSist.push(`Mensalidade: R$ ${d.mensalidade}`);
    if (d.suporteBom) detalhesSist.push(`Suporte: ${d.suporteBom}`);
    if (d.trocaAtendimento && d.trocaAtendimento !== 'Não') detalhesSist.push(`Trocaria por atendimento: ${d.trocaAtendimento}`);
    if (d.trocaValor && d.trocaValor !== 'Não') detalhesSist.push(`Trocaria por valor: ${d.trocaValor}`);

    if (detalhesSist.length > 0) {
      linhas.push(`💻 *Sistema Atual:*`);
      detalhesSist.forEach(item => linhas.push(`  • ${item}`));
      linhas.push('');
    } else if (d.temSistema === 'Não') {
      linhas.push(`💻 *Sistema Atual:* Sem sistema atualmente (manual)\n`);
    }

    // Rodapé
    const rodape = [];
    if (d.dataCadastro) rodape.push(d.dataCadastro);
    rodape.push(`🎯 Hunter: ${d.hunter || this.getHunterNome()}`);
    linhas.push(rodape.join(' | '));

    return linhas.join('\n').trim();
  },

  // Número de destino: Prioriza "WhatsApp de Envio" fixo das configurações,
  // senão celular do Hunter, senão contato do Lead
  numeroDestino(dados) {
    const fixo = String(this.getConfig().numeroEnvio || '').replace(/\D/g, '');
    const hunter = String(this.getHunterCelular() || '').replace(/\D/g, '');
    const lead = String((dados && dados.zapContato) || '').replace(/\D/g, '');
    let destino = fixo || hunter || lead;

    if (destino && destino.length >= 10 && destino.length <= 11 && !destino.startsWith('55')) {
      destino = '55' + destino;
    } else if (destino && destino.length === 12 && destino.startsWith('55')) {
      // já com DDI, mantém
    } else if (destino && destino.length === 13 && destino.startsWith('55')) {
      // ex: 55 + 11 dígitos (celular com 9), mantém
    }
    return destino;
  },

  // Copia texto para a área de transferência com fallback
  copiarParaClipboard(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(texto).catch(() => {});
    } else {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      return Promise.resolve();
    }
  },

  // Envio Direto via WhatsApp (Abre wa.me e copia texto)
  enviarWhatsApp(dados) {
    const msg = this.formatarMensagem(dados);
    this.copiarParaClipboard(msg);

    const destino = this.numeroDestino(dados);
    const waUrl = destino ? `https://wa.me/${destino}` : 'https://wa.me/';
    const linkCompleto = `${waUrl}?text=${encodeURIComponent(msg)}`;

    window.open(linkCompleto, '_blank');
    return msg;
  },

  // Consulta CNPJ na BrasilAPI (direto do frontend ou via proxy)
  async consultarCnpj(cnpj) {
    const clean = String(cnpj).replace(/\D/g, '');
    if (clean.length !== 14) throw new Error('CNPJ inválido (deve ter 14 dígitos)');

    // 1) Tenta via backend se online
    if (navigator.onLine) {
      try {
        const resp = await fetch(`/api/scrape/cnpj/${clean}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.success && data.lead) return data.lead;
        }
      } catch (e) {}

      // 2) Fallback: Consulta direta BrasilAPI no cliente
      try {
        const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
        if (resp.ok) {
          const data = await resp.json();
          const logradouroFull = [
            data.descricao_tipo_de_logradouro,
            data.logradouro,
            data.numero ? 'nº ' + data.numero : 'S/N',
            data.complemento
          ].filter(Boolean).join(' ');

          const endereco = [logradouroFull, data.bairro].filter(Boolean).join(' - ');
          const cidade = [data.municipio, data.uf].filter(Boolean).join(' - ');

          let tel = data.ddd_telefone_1 || data.ddd_telefone_2 || '';
          if (tel) {
            const numClean = tel.replace(/\D/g, '');
            if (numClean.length === 10) tel = `(${numClean.slice(0, 2)}) ${numClean.slice(2, 6)}-${numClean.slice(6)}`;
            else if (numClean.length === 11) tel = `(${numClean.slice(0, 2)}) ${numClean.slice(2, 7)}-${numClean.slice(7)}`;
          }

          return {
            cnpj: clean,
            empresa: data.nome_fantasia || data.razao_social || '',
            razaoSocial: data.razao_social || '',
            cnae: data.cnae_fiscal ? `${data.cnae_fiscal}${data.cnae_fiscal_descricao ? ' - ' + data.cnae_fiscal_descricao : ''}` : '',
            telefone: tel,
            email: data.email || '',
            endereco: endereco,
            cidade: cidade,
            cep: data.cep || '',
            bairro: data.bairro || ''
          };
        }
      } catch (e) {}
    }

    throw new Error('Não foi possível buscar os dados do CNPJ online');
  },

  // Scanner de cartão de visita: OCR via IA no backend (hook /api/extract-card → Ollama).
  // Aceita múltiplas imagens (frente/verso) — consolidadas numa única leitura.
  // Nenhuma URL/credencial do Ollama fica exposta — tudo roda no servidor.
  async extrairDadosCartao(imagesArray) {
    const images = (Array.isArray(imagesArray) ? imagesArray : [imagesArray])
      .map((img) => String(img || '').replace(/^data:image\/[\w\+]+;base64,/, ''))
      .filter(Boolean);

    const response = await fetch('/api/extract-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images })
    });

    if (!response.ok) {
      let detalhe = '';
      try {
        const err = await response.json();
        detalhe = err.error || err.message || '';
      } catch (e) {
        try { detalhe = await response.text(); } catch (e2) {}
      }
      throw new Error(detalhe ? `Falha IA: ${detalhe} (${response.status})` : `Falha ao processar as imagens do cartão (${response.status})`);
    }

    return await response.json();
  },

  // Processa a fila offline reenviando ou sincronizando
  async processarFila() {
    const fila = await dbGetFila();
    if (fila.length === 0) return 0;
    let processados = 0;

    for (const item of fila) {
      try {
        await dbSalvarNoHistorico(item.leadData);
        await dbRemoverDaFila(item.id);
        processados++;
      } catch (e) {
        await dbAtualizarTentativaFila(item.id);
      }
    }

    if (navigator.onLine) {
      await dbFlushLeadsPendentes();
    }

    return processados;
  }
};
