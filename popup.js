// ═══════════════════════════════════════════════════════
//  ALERTA DE ARREPENDIMENTO — popup.js
//  Camada de Apresentação / Controle
// ═══════════════════════════════════════════════════════

'use strict';

// ── Módulo de Estado (Camada de Dados) ──────────────────
const Storage = {
  async get(keys) {
    return new Promise(resolve => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(keys, resolve);
      } else {
        const result = {};
        keys.forEach(k => {
          const v = localStorage.getItem(k);
          result[k] = v ? JSON.parse(v) : undefined;
        });
        resolve(result);
      }
    });
  },
  async set(obj) {
    return new Promise(resolve => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set(obj, resolve);
      } else {
        Object.entries(obj).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
        resolve();
      }
    });
  }
};

// ── Estado Padrão (Camada de Negócio) ──────────────────
const DEFAULT_STATE = {
  enabled: true,
  timerSeconds: 30,
  sites: ['Amazon', 'Mercado Livre', 'Shopee', 'Magalu'],
  stats: { alerts: 0, abandoned: 0, bought: 0 },
  log: []
};

// ── Controller Principal ────────────────────────────────
class PopupController {
  constructor() {
    this.state = { ...DEFAULT_STATE };
    this.init();
  }

  async init() {
    await this.loadState();
    this.bindUI();
    this.render();
  }

  async loadState() {
    const saved = await Storage.get(['enabled', 'timerSeconds', 'sites', 'stats', 'log']);
    this.state = {
      enabled:      saved.enabled      ?? DEFAULT_STATE.enabled,
      timerSeconds: saved.timerSeconds ?? DEFAULT_STATE.timerSeconds,
      sites:        saved.sites        ?? DEFAULT_STATE.sites,
      stats:        saved.stats        ?? DEFAULT_STATE.stats,
      log:          saved.log          ?? DEFAULT_STATE.log,
    };
  }

  async saveState() {
    await Storage.set(this.state);
  }

  // ── Renderização ──────────────────────────────────────
  render() {
    // Toggle
    document.getElementById('masterToggle').checked = this.state.enabled;
    document.querySelector('.status-label').innerHTML =
      `<div class="status-dot" style="background:${this.state.enabled ? '#4a7c59' : '#c0392b'}"></div>
       ${this.state.enabled ? 'Proteção ativa' : 'Proteção pausada'}`;

    // Timer
    const range = document.getElementById('timerRange');
    const display = document.getElementById('timerDisplay');
    range.value = this.state.timerSeconds;
    display.textContent = this.state.timerSeconds >= 60
      ? `${Math.floor(this.state.timerSeconds / 60)}m${this.state.timerSeconds % 60 > 0 ? this.state.timerSeconds % 60 + 's' : ''}`
      : `${this.state.timerSeconds}s`;
    const pct = ((this.state.timerSeconds - 5) / (120 - 5)) * 100;
    range.style.setProperty('--pct', pct + '%');

    // Stats
    document.getElementById('statSaved').textContent    = this.state.stats.alerts;
    document.getElementById('statAbandoned').textContent = this.state.stats.abandoned;
    document.getElementById('statBought').textContent   = this.state.stats.bought;

    // Tags
    this.renderTags();

    // Log
    this.renderLog();
  }

  renderTags() {
    const wrap = document.getElementById('tagsWrap');
    wrap.innerHTML = this.state.sites.map(site => `
      <div class="tag">${this.escapeHTML(site)}
        <span class="rm" data-tag="${this.escapeHTML(site)}">×</span>
      </div>`).join('');
    wrap.querySelectorAll('.rm').forEach(btn => {
      btn.addEventListener('click', () => this.removeTag(btn.dataset.tag));
    });
  }

  renderLog() {
    const list = document.getElementById('logList');
    if (!this.state.log.length) {
      list.innerHTML = '<div style="font-size:11px;color:#8a7f78;text-align:center;padding:8px">Sem registros ainda</div>';
      return;
    }
    list.innerHTML = [...this.state.log].reverse().slice(0, 5).map(entry => `
      <div class="log-item">
        <div class="log-dot ${entry.action === 'abandoned' ? 'saved' : 'bought'}"></div>
        <span class="log-site">${this.escapeHTML(entry.site)}</span>
        <span class="log-action">${entry.action === 'abandoned' ? 'Desistiu' : 'Comprou'}</span>
        <span class="log-time">${this.timeAgo(entry.timestamp)}</span>
      </div>`).join('');
  }

  // ── Binding de Eventos ────────────────────────────────
  bindUI() {
    // Toggle Master
    document.getElementById('masterToggle').addEventListener('change', async e => {
      this.state.enabled = e.target.checked;
      await this.saveState();
      this.render();
      this.notifyContent();
    });

    // Timer slider
    document.getElementById('timerRange').addEventListener('input', async e => {
      this.state.timerSeconds = parseInt(e.target.value);
      await this.saveState();
      this.render();
    });

    // Adicionar tag
    document.getElementById('addTagBtn').addEventListener('click', () => this.addTag());
    document.getElementById('tagInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.addTag();
    });

    // Reset stats
    document.getElementById('resetBtn').addEventListener('click', async () => {
      if (confirm('Resetar todas as estatísticas?')) {
        this.state.stats = { alerts: 0, abandoned: 0, bought: 0 };
        this.state.log = [];
        await this.saveState();
        this.render();
      }
    });

    // Export log
    document.getElementById('exportBtn').addEventListener('click', () => this.exportLog());
  }

  async addTag() {
    const input = document.getElementById('tagInput');
    const val = input.value.trim();
    if (!val || this.state.sites.includes(val)) return;
    this.state.sites.push(val);
    input.value = '';
    await this.saveState();
    this.renderTags();
  }

  async removeTag(tag) {
    this.state.sites = this.state.sites.filter(s => s !== tag);
    await this.saveState();
    this.renderTags();
  }

  exportLog() {
    const text = this.state.log.map(e =>
      `[${new Date(e.timestamp).toLocaleString('pt-BR')}] ${e.site} — ${e.action === 'abandoned' ? 'Desistiu' : 'Comprou'}`
    ).join('\n') || 'Nenhum registro.';
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'historico-compras.txt'; a.click();
    URL.revokeObjectURL(url);
  }

  notifyContent() {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'SETTINGS_UPDATED',
            enabled: this.state.enabled,
            timerSeconds: this.state.timerSeconds,
            sites: this.state.sites
          });
        }
      });
    }
  }

  // ── Utilitários ───────────────────────────────────────
  escapeHTML(str) {
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  timeAgo(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'agora';
    if (m < 60) return `há ${m}min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `há ${h}h`;
    return `há ${Math.floor(h / 24)}d`;
  }
}

// ── Boot ──────────────────────────────────────────────
new PopupController();
