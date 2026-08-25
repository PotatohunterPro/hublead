// ============================================================
//  HUB LEADS — Versionamento (GitHub)
//  Exibe versão local (version.json) e verifica release no GitHub
// ============================================================

const VERSION = {
  repo: 'PotatohunterPro/hublead',
  local: null,

  async init() {
    const els = {
      header: document.getElementById('appVersion'),
      config: document.getElementById('configVersion'),
      splash: document.getElementById('splashVersion')
    };

    try {
      const res = await fetch('version.json', { cache: 'no-store' });
      if (res.ok) this.local = await res.json();
    } catch (e) {}

    const v = this.local?.version ? `v${this.local.version}` : 'v3.0.0';
    const build = this.local?.build ? ` · ${this.local.build}` : '';
    const label = v + build;

    if (els.header) els.header.textContent = label;
    if (els.config) els.config.textContent = label + (this.local?.commit ? ` · ${this.local.commit}` : '');
    if (els.splash) els.splash.textContent = label;

    // verifica release no GitHub (não bloqueia)
    if (navigator.onLine) this.verificarGithub(els);
  },

  async verificarGithub(els) {
    try {
      const res = await fetch(`https://api.github.com/repos/${this.repo}/releases/latest`, {
        headers: { 'Accept': 'application/vnd.github+json' }
      });
      if (!res.ok) return; // silencia 404 quando não há releases
      const data = await res.json();
      const tag = (data.tag_name || '').replace(/^v/, '');
      const localVer = (this.local?.version || '').replace(/^v/, '');
      if (tag && localVer && tag !== localVer) {
        const aviso = ` · atualização disponível: v${tag}`;
        if (els.header) els.header.textContent += aviso;
        if (els.config) {
          const a = document.createElement('a');
          a.href = data.html_url || `https://github.com/${this.repo}/releases`;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = `Atualização v${tag} disponível`;
          a.style.cssText = 'display:block;margin-top:6px;font-size:11px;color:var(--color-accent);';
          els.config.appendChild(a);
        }
      }
    } catch (e) {
      // silencia erro de rede/GitHub privado sem sujar o console
    }
  }
};

document.addEventListener('DOMContentLoaded', () => VERSION.init());
