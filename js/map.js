// ============================================================
//  HUB LEADS — Mapa Leaflet & Heatmap
//  Consome tabela única de leads com pins coloridos por status
// ============================================================

const MAPA = {
  map: null,
  heatLayer: null,
  markersLayer: null,

  CORES: {
    pendente: '#0A5DA8',
    visitado: '#ff9f0a',
    convertido: '#34c759',
    descartado: '#8e8e93'
  },

  init(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    this.map = L.map(containerId, {
      zoomControl: false,
      attributionControl: false
    }).setView([-21.5942, -48.8078], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(this.map);

    L.control.zoom({ position: 'bottomleft' }).addTo(this.map);

    this.heatLayer = L.heatLayer([], {
      radius: 25, blur: 15, maxZoom: 17, max: 1.0,
      gradient: { 0.0: '#4FC3F7', 0.5: '#1E88C7', 1.0: '#0A5DA8' }
    }).addTo(this.map);

    this.markersLayer = L.layerGroup().addTo(this.map);
    this.carregarPontos();
  },

  async carregarPontos() {
    if (navigator.onLine) {
      await dbSyncLeads();
    }

    const leads = await dbGetLeadsComCoordenadas();

    // Heatmap: leads visitados e convertidos
    const heatPoints = [];
    leads
      .filter(l => l.status === 'convertido' || l.status === 'visitado')
      .forEach(l => {
        const lat = l.lat || l.latitude;
        const lng = l.lng || l.longitude;
        if (lat && lng) heatPoints.push([lat, lng, 0.6]);
      });
    this.heatLayer.setLatLngs(heatPoints);

    // Marcadores
    this.markersLayer.clearLayers();

    leads.forEach(l => {
      const lat = l.lat || l.latitude;
      const lng = l.lng || l.longitude;
      if (!lat || !lng) return;

      const cor = this.CORES[l.status] || this.CORES.pendente;
      const marker = L.circleMarker([lat, lng], {
        radius: l.status === 'convertido' ? 11 : 9,
        fillColor: cor,
        color: '#fff',
        weight: 2.5,
        opacity: 1,
        fillOpacity: 0.88
      });

      marker.bindPopup(this._popupHtml(l));
      this.markersLayer.addLayer(marker);
    });
  },

  _popupHtml(lead) {
    const statusLabel = {
      pendente: 'Pendente (Curadoria)',
      visitado: 'Visitado',
      convertido: 'Convertido (Sucesso)',
      descartado: 'Descartado'
    };

    const lat = lead.lat || lead.latitude;
    const lng = lead.lng || lead.longitude;
    const cor = this.CORES[lead.status] || this.CORES.pendente;
    const btnBase = 'width:100%;padding:7px 10px;border-radius:8px;border:none;cursor:pointer;font-size:12px;font-weight:600;margin-top:4px;display:flex;align-items:center;justify-content:center;gap:4px';

    return `
      <div style="min-width:180px;font-family:var(--font-family, sans-serif)">
        <strong style="font-size:14px;color:#1d1d1f">${esc(lead.empresa) || 'Empresa'}</strong><br>
        <span style="color:#6e6e73;font-size:12px">${esc(lead.endereco || lead.cidade || '')}</span>
        ${lead.cnae ? `<br><span style="color:#8e8e93;font-size:11px">CNAE: ${esc(lead.cnae)}</span>` : ''}
        ${lead.nomeContato ? `<br><span style="color:#1d1d1f;font-size:11px;font-weight:500">👤 ${esc(lead.nomeContato)} ${lead.zapContato ? '— ' + esc(lead.zapContato) : ''}</span>` : ''}
        <br>
        <span class="badge" style="display:inline-block;margin-top:6px;padding:3px 8px;border-radius:9999px;font-size:11px;font-weight:600;background:${cor}22;color:${cor}">
          ${statusLabel[lead.status] || lead.status}
        </span>
        <div style="margin-top:8px">
          <button onclick="SUGERIDOS.captarLead(${lead.id})" style="${btnBase};background:#0A5DA8;color:#fff">
            Captar / Visitar
          </button>
          ${lead.status === 'pendente' ? `<button onclick="MAPA.alterarStatus(${lead.id}, 'visitado')" style="${btnBase};background:#ff9f0a;color:#fff">Visitei</button>` : ''}
          ${lead.status !== 'convertido' && lead.status !== 'descartado' ? `<button onclick="MAPA.alterarStatus(${lead.id}, 'convertido')" style="${btnBase};background:#34c759;color:#fff">Convertido</button>` : ''}
          ${lead.status !== 'descartado' ? `<button onclick="MAPA.alterarStatus(${lead.id}, 'descartado')" style="${btnBase};background:#8e8e93;color:#fff">Descartar</button>` : ''}
           ${(lat != null && lng != null) ? `<button onclick="MAPA.navegarAte(${Number(lat)}, ${Number(lng)})" style="${btnBase};background:#f2f2f7;color:#1d1d1f">📍 Navegar (Google Maps)</button>` : ''}
          <button onclick="MAPA.enviarWhatsApp(${lead.id})" style="${btnBase};background:#25D366;color:#fff">💬 WhatsApp</button>
        </div>
      </div>
    `;
  },

  async alterarStatus(id, status) {
    await dbAtualizarStatusLead(id, status, { dataVisita: new Date().toISOString() });
    const labels = { pendente: 'Pendente', visitado: 'Visitado', convertido: 'Convertido', descartado: 'Descartado' };
    App.toast('Lead marcado como ' + (labels[status] || status), 'success');
    this.refresh();
    if (typeof SUGERIDOS !== 'undefined') SUGERIDOS.refresh();
  },

  async enviarWhatsApp(id) {
    const l = await dbGetLeadPorId(id);
    if (!l) return;
    API.enviarWhatsApp(l);
  },

  navegarAte(lat, lng) {
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
      App.toast('Localização indisponível para este lead', 'warning');
      return;
    }
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
  },

  _posicaoMarker: null,
  irParaLocalizacao() {
    if (!navigator.geolocation) {
      App.toast('Geolocalização não disponível', 'warning');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.map.setView([pos.coords.latitude, pos.coords.longitude], 16);
        if (this._posicaoMarker) this.map.removeLayer(this._posicaoMarker);
        this._posicaoMarker = L.circleMarker([pos.coords.latitude, pos.coords.longitude], {
          radius: 8, fillColor: '#007AFF', color: '#fff', weight: 3, opacity: 1, fillOpacity: 0.9
        }).addTo(this.map).bindPopup('Você está aqui').openPopup();
      },
      () => App.toast('Não foi possível obter localização', 'error'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  },

  getMap() { return this.map; },

  refresh() {
    if (this.map) {
      setTimeout(() => this.map.invalidateSize(), 250);
      this.carregarPontos();
    }
  }
};