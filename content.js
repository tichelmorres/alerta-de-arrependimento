// ═══════════════════════════════════════════════════════
//  ALERTA DE ARREPENDIMENTO — content.js
//  Camada: Apresentação + Lógica de Negócio (detecção)
//  Injetado em todas as páginas web monitoradas
// ═══════════════════════════════════════════════════════

'use strict';

// ── Módulo de Configuração (Dados) ──────────────────────
const Config = {
  defaults: {
    enabled: true,
    timerSeconds: 30,
    sites: ['amazon', 'mercadolivre', 'mercado livre', 'shopee', 'magalu', 'americanas', 'kabum']
  },
  current: null,

  async load() {
    return new Promise(resolve => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['enabled', 'timerSeconds', 'sites'], data => {
          this.current = {
            enabled:      data.enabled      ?? this.defaults.enabled,
            timerSeconds: data.timerSeconds ?? this.defaults.timerSeconds,
            sites:        data.sites        ?? this.defaults.sites,
          };
          resolve(this.current);
        });
      } else {
        this.current = { ...this.defaults };
        resolve(this.current);
      }
    });
  }
};

// ── Módulo de Detecção (Negócio) ────────────────────────
const Detector = {
  // Padrões de botões de checkout por regex
  CHECKOUT_PATTERNS: [
    /comprar agora/i, /buy now/i, /finalizar compra/i, /checkout/i,
    /confirmar pedido/i, /fazer pedido/i, /concluir compra/i,
    /realizar compra/i, /place order/i, /proceed to checkout/i,
    /pagar/i, /efetuar compra/i
  ],

  isCheckoutButton(element) {
    const text = (element.textContent || element.value || element.ariaLabel || '').trim();
    return this.CHECKOUT_PATTERNS.some(p => p.test(text));
  },

  isSiteMonitored(sites) {
    const hostname = window.location.hostname.toLowerCase();
    return sites.some(s => hostname.includes(s.toLowerCase().replace(/\s/g, '')));
  }
};

// ── Módulo de Log (Dados) ───────────────────────────────
const Logger = {
  async record(action) {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    chrome.storage.local.get(['stats', 'log'], data => {
      const stats = data.stats || { alerts: 0, abandoned: 0, bought: 0 };
      const log   = data.log   || [];
      if (action === 'alert')     stats.alerts++;
      if (action === 'abandoned') stats.abandoned++;
      if (action === 'bought')    stats.bought++;
      log.push({ site: window.location.hostname, action, timestamp: Date.now() });
      chrome.storage.local.set({ stats, log: log.slice(-100) });
    });
  }
};

// ── Módulo de Overlay UI (Apresentação) ────────────────
const Overlay = {
  active: false,
  timerInterval: null,

  create(timerSeconds, onAbort, onProceed) {
    if (this.active) return;
    this.active = true;

    const el = document.createElement('div');
    el.id = 'regret-overlay';
    el.innerHTML = `
      <div id="regret-card">
        <div id="regret-header">
          <div id="regret-icon">⏸</div>
          <div>
            <p id="regret-title">Momento de Reflexão</p>
            <p id="regret-subtitle">Alerta de Arrependimento</p>
          </div>
        </div>
        <div id="regret-body">
          <div id="regret-timer-wrap">
            <div id="regret-timer-ring">
              <svg id="regret-timer-svg" viewBox="0 0 80 80">
                <circle id="regret-ring-bg" cx="40" cy="40" r="35"/>
                <circle id="regret-ring-progress" cx="40" cy="40" r="35"/>
              </svg>
              <div id="regret-timer-count">${timerSeconds}</div>
            </div>
            <div id="regret-timer-label">segundos para refletir</div>
          </div>

          <div id="regret-questions">
            <div class="regret-q-title">Pergunte-se antes de comprar:</div>
            <div class="regret-q-item"><span class="regret-q-num">1</span>Você realmente precisa disso agora?</div>
            <div class="regret-q-item"><span class="regret-q-num">2</span>Isso cabe no seu orçamento mensal?</div>
            <div class="regret-q-item"><span class="regret-q-num">3</span>Você pesquisou o melhor preço disponível?</div>
            <div class="regret-q-item"><span class="regret-q-num">4</span>Você vai usar isso mais de 10 vezes?</div>
          </div>

          <div id="regret-actions">
            <button id="regret-btn-wait" disabled>✓ Aguardei, vou comprar (${timerSeconds}s)</button>
            <button id="regret-btn-continue">✕ Desistir da compra</button>
          </div>
          <span id="regret-dismiss-link">Ignorar este alerta (não recomendado)</span>
        </div>
      </div>`;

    document.body.appendChild(el);

    // Timer countdown
    let remaining = timerSeconds;
    const circumference = 2 * Math.PI * 35;
    const progressEl  = el.querySelector('#regret-ring-progress');
    const countEl     = el.querySelector('#regret-timer-count');
    const waitBtn     = el.querySelector('#regret-btn-wait');
    progressEl.style.strokeDasharray  = circumference;
    progressEl.style.strokeDashoffset = 0;

    this.timerInterval = setInterval(() => {
      remaining--;
      countEl.textContent = remaining;
      progressEl.style.strokeDashoffset = circumference * (1 - remaining / timerSeconds);
      if (remaining <= 0) {
        clearInterval(this.timerInterval);
        waitBtn.disabled = false;
        waitBtn.textContent = '✓ Continuar com a compra';
        countEl.textContent = '✓';
        progressEl.style.stroke = '#4a7c59';
      }
    }, 1000);

    // Buttons
    waitBtn.addEventListener('click', () => {
      if (waitBtn.disabled) return;
      this.destroy();
      onProceed();
    });
    el.querySelector('#regret-btn-continue').addEventListener('click', () => {
      this.destroy();
      onAbort();
    });
    el.querySelector('#regret-dismiss-link').addEventListener('click', () => {
      this.destroy();
      onProceed(true); // dismissed without waiting
    });
  },

  destroy() {
    clearInterval(this.timerInterval);
    const el = document.getElementById('regret-overlay');
    if (el) el.remove();
    this.active = false;
  }
};

// ── Controller Principal ────────────────────────────────
class RegretAlertController {
  constructor() {
    this.config = null;
    this.intercepted = new WeakSet();
    this.init();
  }

  async init() {
    this.config = await Config.load();
    this.listenForSettingsUpdate();

    // Verifica se esta aba está bloqueada (persistência após reload)
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'GET_TAB_BLOCK' }, response => {
        if (response && response.unblockAt && response.unblockAt > Date.now()) {
          this.showBlockScreen(response.unblockAt);
        }
      });
    }

    if (this.config.enabled && Detector.isSiteMonitored(this.config.sites)) {
      this.watchButtons();
      this.observeDOM();
    }
  }

  watchButtons() {
    document.querySelectorAll('button, input[type=submit], a').forEach(el => this.attach(el));
  }

  attach(el) {
    if (this.intercepted.has(el)) return;
    if (!Detector.isCheckoutButton(el)) return;
    this.intercepted.add(el);

    el.addEventListener('click', e => {
      if (!this.config.enabled) return;
      // Se a flag de bypass está ativa, deixa o clique passar normalmente
      if (el._regretBypass) {
        el._regretBypass = false;
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      Logger.record('alert');

      Overlay.create(
        this.config.timerSeconds,
        // Abort — bloqueia esta aba por 10 minutos
        () => {
          Logger.record('abandoned');
          this.blockCurrentTab();
        },
        // Proceed — usa flag para evitar re-interceptação
        (dismissed) => {
          Logger.record('bought');
          el._regretBypass = true;
          setTimeout(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })), 100);
        }
      );
    }, true);
  }

  blockCurrentTab() {
    const unblockAt = Date.now() + 10 * 60 * 1000; // 10 minutos

    // Salva o bloqueio keyed pelo tabId via background
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'BLOCK_TAB', unblockAt });
    }

    // Exibe tela de bloqueio imediatamente
    this.showBlockScreen(unblockAt);
  }

  showBlockScreen(unblockAt) {
    // Remove overlay existente se houver
    const existing = document.getElementById('regret-block-screen');
    if (existing) existing.remove();

    const screen = document.createElement('div');
    screen.id = 'regret-block-screen';
    screen.style.cssText = `
      position: fixed; inset: 0; z-index: 2147483647;
      background: #1a1014;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      font-family: 'DM Sans', 'Segoe UI', system-ui, sans-serif;
      color: white; text-align: center; padding: 40px;
    `;

    const updateTimer = () => {
      const remaining = Math.max(0, unblockAt - Date.now());
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      const pad = n => String(n).padStart(2, '0');

      screen.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 16px;">🛑</div>
        <div style="font-family: Georgia, serif; font-size: 26px; font-weight: 700; margin-bottom: 8px;">
          Acesso bloqueado
        </div>
        <div style="font-size: 14px; color: rgba(255,255,255,0.5); margin-bottom: 36px; max-width: 320px; line-height: 1.6;">
          Você desistiu da compra. Esta aba ficará bloqueada por 10 minutos para te ajudar a refletir.
        </div>
        <div style="
          background: rgba(212,160,23,0.15); border: 1px solid rgba(212,160,23,0.3);
          border-radius: 16px; padding: 24px 40px; margin-bottom: 32px;
        ">
          <div style="font-size: 11px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
            Libera em
          </div>
          <div style="font-family: Georgia, serif; font-size: 48px; font-weight: 700; color: #d4a017; letter-spacing: 4px;">
            ${pad(mins)}:${pad(secs)}
          </div>
        </div>
        <div style="font-size: 13px; color: rgba(255,255,255,0.35); max-width: 280px; line-height: 1.6;">
          Use este tempo para pensar se você realmente precisa deste produto.
        </div>
      `;

      if (remaining <= 0) {
        clearInterval(interval);
        screen.remove();

        // Limpa bloqueio no storage
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage({ type: 'UNBLOCK_TAB' });
        }
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    document.body.appendChild(screen);
  }

  observeDOM() {
    const obs = new MutationObserver(() => {
      document.querySelectorAll('button, input[type=submit], a').forEach(el => this.attach(el));
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  listenForSettingsUpdate() {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'SETTINGS_UPDATED') {
          this.config.enabled      = msg.enabled;
          this.config.timerSeconds = msg.timerSeconds;
          this.config.sites        = msg.sites;
        }
      });
    }
  }
}

// ── Boot ──────────────────────────────────────────────
new RegretAlertController();
