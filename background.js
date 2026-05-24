// ═══════════════════════════════════════════════════════
//  ALERTA DE ARREPENDIMENTO — background.js
//  Service Worker (Manifest V3)
//  Camada: Controle / Infraestrutura
// ═══════════════════════════════════════════════════════

'use strict';

// ── Inicialização ──────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.local.set({
      enabled: true,
      timerSeconds: 30,
      sites: ['Amazon', 'Mercado Livre', 'Shopee', 'Magalu', 'Americanas', 'KaBuM'],
      stats: { alerts: 0, abandoned: 0, bought: 0 },
      log: []
    });
    console.log('[Regret Alert] Extensão instalada com sucesso.');
  }
});

// ── Relay de Mensagens entre Popup ↔ Content ──────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATS') {
    chrome.storage.local.get(['stats'], data => {
      sendResponse(data.stats || { alerts: 0, abandoned: 0, bought: 0 });
    });
    return true;
  }

  // Retorna o estado de bloqueio da aba atual
  if (message.type === 'GET_TAB_BLOCK' && sender.tab) {
    const tabId = sender.tab.id;
    chrome.storage.local.get(['blockedTabs'], data => {
      const blockedTabs = data.blockedTabs || {};
      sendResponse({ unblockAt: blockedTabs[tabId] || null });
    });
    return true;
  }

  // Bloqueia a aba que enviou a mensagem
  if (message.type === 'BLOCK_TAB' && sender.tab) {
    const tabId = sender.tab.id;
    chrome.storage.local.get(['blockedTabs'], data => {
      const blockedTabs = data.blockedTabs || {};
      blockedTabs[tabId] = message.unblockAt;
      chrome.storage.local.set({ blockedTabs });
    });
    sendResponse({ ok: true });
    return true;
  }

  // Desbloqueia a aba
  if (message.type === 'UNBLOCK_TAB' && sender.tab) {
    const tabId = sender.tab.id;
    chrome.storage.local.get(['blockedTabs'], data => {
      const blockedTabs = data.blockedTabs || {};
      delete blockedTabs[tabId];
      chrome.storage.local.set({ blockedTabs });
    });
    sendResponse({ ok: true });
    return true;
  }
});
