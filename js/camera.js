const CAMERA = {
  input: null,
  preview: null,
  currentBlob: null,

  init(inputId, previewId) {
    this.input = document.getElementById(inputId);
    this.preview = document.getElementById(previewId);
    if (!this.input || !this.preview) return;
    this.input.addEventListener('change', (e) => this.handleFile(e));
    const removeBtn = this.preview.querySelector('.photo-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.limpar();
      });
    }
    this.preview.addEventListener('click', () => this.input.click());
  },

  handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    this.comprimir(file, (blob, dataUrl) => {
      this.currentBlob = blob;
      const img = this.preview.querySelector('img') || document.createElement('img');
      img.src = dataUrl;
      img.alt = 'Foto da fachada';
      if (!this.preview.contains(img)) {
        this.preview.insertBefore(img, this.preview.querySelector('.photo-remove'));
      }
      this.preview.classList.add('has-image');
      const span = this.preview.querySelector('span');
      const svg = this.preview.querySelector('svg');
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

  getBlob() {
    return this.currentBlob;
  },

  limpar() {
    this.currentBlob = null;
    this.input.value = '';
    const img = this.preview.querySelector('img');
    if (img) img.remove();
    this.preview.classList.remove('has-image');
    const svg = this.preview.querySelector('svg');
    const span = this.preview.querySelector('span');
    if (svg) svg.style.display = '';
    if (span) span.style.display = '';
  },

  temFoto() {
    return this.currentBlob !== null;
  }
};