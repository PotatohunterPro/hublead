// ============================================================
//  HUB LEADS — Captura de fotos com compressão automática
//  Suporta 2 espaços: frente do cartão/fachada + verso (opcional)
//  (a análise IA roda após salvar o lead — ver app.js)
// ============================================================

const CAMERA = {
  slots: [], // [{ input, preview, blob, dataUrl }]
  maxFotos: 2,

  init() {
    this.slots = [];
    this._setupSlot('fotoInput', 'photoPreview');           // frente / fachada
    this._setupSlot('fotoInputVerso', 'photoPreviewVerso'); // verso (opcional)
  },

  _setupSlot(inputId, previewId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if (!input || !preview) return;
    const slot = { input, preview, blob: null, dataUrl: null };
    this.slots.push(slot);
    input.addEventListener('change', (e) => this.handleFile(e, slot));
    const removeBtn = preview.querySelector('.photo-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.limparSlot(slot);
      });
    }
    preview.addEventListener('click', () => input.click());
  },

  handleFile(e, slot) {
    const file = e.target.files[0];
    if (!file) return;
    this.comprimir(file, (blob, dataUrl) => {
      slot.blob = blob;
      slot.dataUrl = dataUrl;
      const img = slot.preview.querySelector('img') || document.createElement('img');
      img.src = dataUrl;
      img.alt = 'Foto do cartão';
      if (!slot.preview.contains(img)) {
        slot.preview.insertBefore(img, slot.preview.querySelector('.photo-remove'));
      }
      slot.preview.classList.add('has-image');
      const span = slot.preview.querySelector('span');
      const svg = slot.preview.querySelector('svg');
      if (svg) svg.style.display = 'none';
      if (span) span.style.display = 'none';
    });
  },

  comprimir(file, callback) {
    const MAX_WIDTH = 1280;
    const QUALIDADE = 0.8;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > MAX_WIDTH) {
        height = Math.round(height * MAX_WIDTH / width);
        width = MAX_WIDTH;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        callback(blob, canvas.toDataURL('image/jpeg', QUALIDADE));
      }, 'image/jpeg', QUALIDADE);
    };
    img.src = URL.createObjectURL(file);
  },

  // Fotos preenchidas, em ordem de slot (frente primeiro)
  getFotos() {
    return this.slots.filter((s) => s.blob).map((s) => ({ blob: s.blob, dataUrl: s.dataUrl }));
  },

  // Foto principal (1ª disponível) — usada como "Foto da Fachada" do lead
  getBlob() {
    const primeira = this.slots.find((s) => s.blob);
    return primeira ? primeira.blob : null;
  },

  temFoto() {
    return this.slots.some((s) => s.blob);
  },

  limparSlot(slot) {
    slot.blob = null;
    slot.dataUrl = null;
    slot.input.value = '';
    const img = slot.preview.querySelector('img');
    if (img) img.remove();
    slot.preview.classList.remove('has-image');
    const svg = slot.preview.querySelector('svg');
    const span = slot.preview.querySelector('span');
    if (svg) svg.style.display = '';
    if (span) span.style.display = '';
  },

  limpar() {
    this.slots.forEach((s) => this.limparSlot(s));
  }
};
