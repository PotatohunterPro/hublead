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
    // Sincroniza com PocketBase se online
    if (navigator.onLine) {
      await dbSyncLeadsMapa();
    }

    const leadsMapa = await dbGetLeadsMapaComCoords();
    const leadsCaptados = await dbGetLeadsComCoordenadas();

    // Heatmap: leads convertidos + leads captados enviados
    const heatPoints = [];
    leadsMapa
      .filter(l => l.status === 'convertido' || l.status === 'visitado')
      .forEach(l => heatPoints.push([l.lat, l.lng, 0.6]));
    leadsCaptados
      .filter(l => l.status === 'enviado')
      .forEach(l => heatPoints.push([l.latitude, l.longitude, 0.6]));
    this.heatLayer.setLatLngs(heatPoints);

    // Marcadores
    this.markersLayer.clearLayers();

    leadsMapa.forEach(l => {
      if (!l.lat || !l.lng) return;
      const cor = this.CORES[l.status] || this.CORES.pendente;
      const marker = L.circleMarker([l.lat, l.lng], {
        radius: 10, fillColor: cor, color: '#fff', weight: 2.5, opacity: 1, fillOpacity: 0.85
      });
      marker.bindPopup(this._popupHtml(l.id, l.empresa, l.endereco, l.lat, l.lng, l.status, l.cnae));
      this.markersLayer.addLayer(marker);
    });

    leadsCaptados.forEach(l => {
      if (!l.latitude || !l.longitude) return;
      const marker = L.circleMarker([l.latitude, l.longitude], {
        radius: 8, fillColor: '#34c759', color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.8
      });
      marker.bindPopup(`
        <strong style="font-size:14px">${l.empresa}</strong><br>
        <span style="color:#6e6e73">${l.segmento || ''}</span><br>
        <span style="font-size:12px">${l.nomeContato} — ${l.zapContato}</span><br>
        <button onclick="MAPA.navegarAte(${l.latitude}, ${l.longitude})" style="margin-top:6px;padding:6px 14px;border-radius:8px;border:none;background:#0A5DA8;color:#fff;cursor:pointer;font-size:13px;font-weight:600">
          Navegar ate
        </button>
        <span style="color:#6e6e73;font-size:10px;display:block;margin-top:4px">${l.dataCadastro || ''}</span>
      `);
      this.markersLayer.addLayer(marker);
    });
  },

  _popupHtml(id, empresa, endereco, lat, lng, status, cnae) {
    const statusLabel = {
      pendente: 'Pendente', visitado: 'Visitado', convertido: 'Convertido', descartado: 'Descartado'
    };
    const btnBase = 'width:100%;padding:8px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:600;margin-top:4px';
    return `
      <div style="min-width:170px">
        <strong style="font-size:14px">${empresa || 'Empresa'}</strong><br>
        <span style="color:#6e6e73;font-size:12px">${endereco || ''}</span>
        ${cnae ? `<br><span style="color:#6e6e73;font-size:11px">CNAE: ${cnae}</span>` : ''}
        <br>
        <span class="badge" style="display:inline-block;margin-top:6px;padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:600;background:${this.CORES[status] || this.CORES.pendente}22;color:${this.CORES[status] || this.CORES.pendente}">
          ${statusLabel[status] || status}
        </span>
        <br>
        <button onclick="SUGERIDOS.captarLead(${id})" style="${btnBase};background:#0A5DA8;color:#fff">
          Captar
        </button>
        ${status === 'pendente' ? `<button onclick="MAPA.alterarStatus(${id}, 'visitado')" style="${btnBase};background:#ff9f0a;color:#fff">Visitei</button>` : ''}
        ${status !== 'convertido' && status !== 'descartado' ? `<button onclick="MAPA.alterarStatus(${id}, 'convertido')" style="${btnBase};background:#34c759;color:#fff">Convertido</button>` : ''}
        ${status !== 'descartado' ? `<button onclick="MAPA.alterarStatus(${id}, 'descartado')" style="${btnBase};background:#8e8e93;color:#fff">Descartar</button>` : ''}
        <button onclick="MAPA.navegarAte(${lat}, ${lng})" style="${btnBase};background:#0A5DA8;color:#fff">
          Navegar ate
        </button>
      </div>
    `;
  },

  async alterarStatus(id, status) {
    await dbAtualizarStatusLeadMapa(id, status, { dataVisita: new Date().toISOString() });
    const labels = { pendente: 'Pendente', visitado: 'Visitado', convertido: 'Convertido', descartado: 'Descartado' };
    App.toast('Lead marcado como ' + (labels[status] || status), 'success');
    this.refresh();
    if (typeof SUGERIDOS !== 'undefined') SUGERIDOS.refresh();
  },

  navegarAte(lat, lng) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
  },

  irParaLocalizacao() {
    if (!navigator.geolocation) { App.toast('Geolocalização não disponível', 'warning'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => this.map.setView([pos.coords.latitude, pos.coords.longitude], 16),
      () => App.toast('Não foi possível obter localização', 'error'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  },

  getMap() { return this.map; },

  refresh() {
    if (this.map) {
      setTimeout(() => this.map.invalidateSize(), 300);
      this.carregarPontos();
    }
  }
};