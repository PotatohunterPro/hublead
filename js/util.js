// ============================================================
//  HUB LEADS — Utilitários compartilhados
//  escapeHTML (XSS), helpers de DOM e constantes
// ============================================================

// Escapa caracteres HTML para evitar XSS em innerHTML
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Atalho: escapa se não for undefined/null
function esc(v) {
  return escapeHTML(v);
}

// Get element por id, retorna null se não existir (evita quebrar a app)
function $id(id) {
  return document.getElementById(id);
}
