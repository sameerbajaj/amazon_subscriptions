/**
 * UNSUB — Amazon Subscribe & Save Canceler
 * Lightweight, fast, and automated subscription manager.
 */

// Application State
let activeTabId = null;
let subscriptions = [];
let filteredSubscriptions = [];
let selectedSubIds = new Set();
let isProcessing = false;
let currentSortMode = 'date-asc'; // Default sort: upcoming/soonest delivery first

// DOM Elements
const headerBadge = document.getElementById('headerBadge');

// Panels
const navSection = document.getElementById('navSection');
const navIcon = document.getElementById('navIcon');
const navTitle = document.getElementById('navTitle');
const navMessage = document.getElementById('navMessage');
const navActionBtn = document.getElementById('navActionBtn');
const navActionBtnText = document.getElementById('navActionBtnText');

const loadingSection = document.getElementById('loadingSection');
const loadingTitle = document.getElementById('loadingTitle');
const loadingSubtitle = document.getElementById('loadingSubtitle');

const emptySection = document.getElementById('emptySection');
const emptyRefreshBtn = document.getElementById('emptyRefreshBtn');

const subscriptionsSection = document.getElementById('subscriptionsSection');
const countBadge = document.getElementById('countBadge');
const selectAllCheckbox = document.getElementById('selectAllCheckbox');
const sortSelect = document.getElementById('sortSelect');
const searchWrap = document.getElementById('searchWrap');
const searchFilter = document.getElementById('searchFilter');
const subscriptionsList = document.getElementById('subscriptionsList');
const cancelSelectedBtn = document.getElementById('cancelSelectedBtn');
const cancelBtnText = document.getElementById('cancelBtnText');

const progressSection = document.getElementById('progressSection');
const progressText = document.getElementById('progressText');
const progressFill = document.getElementById('progressFill');
const progressCurrent = document.getElementById('progressCurrent');
const progressLog = document.getElementById('progressLog');

const summarySection = document.getElementById('summarySection');
const successCount = document.getElementById('successCount');
const failedCount = document.getElementById('failedCount');
const failedStatBox = document.getElementById('failedStatBox');
const canceledBreakdown = document.getElementById('canceledBreakdown');
const summaryDoneBtn = document.getElementById('summaryDoneBtn');

const confirmModal = document.getElementById('confirmModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');

// Helper to switch view panels cleanly
function showView(viewId) {
  const views = [
    navSection,
    loadingSection,
    emptySection,
    subscriptionsSection,
    progressSection,
    summarySection
  ];
  views.forEach(v => {
    if (v) v.style.display = (v.id === viewId) ? 'block' : 'none';
  });
}

// Check whether current URL is Amazon
function isAmazonUrl(url) {
  if (!url) return false;
  return url.toLowerCase().includes('amazon.com');
}

// Initialize Extension
async function init() {
  // Graceful fallback for local development or preview without chrome.tabs
  if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) {
    loadMockPreviewData();
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url) {
      showNavPrompt(
        'Open Amazon',
        'Navigate to Amazon to view your Subscribe & Save deliveries.',
        'Open Amazon S&S',
        false
      );
      return;
    }

    activeTabId = tab.id;

    // Case 1: Not on Amazon at all
    if (!isAmazonUrl(tab.url)) {
      showNavPrompt(
        'Open Amazon Subscriptions',
        'You are not currently on Amazon. Click below to open your Subscribe & Save manager.',
        'Open Amazon S&S',
        false
      );
      return;
    }

    // Case 2: On Amazon, but not on the actual subscriptionList tab
    if (!tab.url.toLowerCase().includes('subscriptionlist')) {
      showView('loadingSection');
      loadingTitle.textContent = 'Opening Your Subscriptions...';
      loadingSubtitle.textContent = 'Navigating to the active subscriptions dashboard';
      headerBadge.textContent = 'Loading';

      await chrome.tabs.update(activeTabId, {
        url: 'https://www.amazon.com/auto-deliveries/subscriptionList'
      });

      let navigated = false;
      const onUpdated = (tabId, info) => {
        if (tabId === activeTabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          navigated = true;
          setTimeout(() => startDetection(activeTabId), 900);
        }
      };
      chrome.tabs.onUpdated.addListener(onUpdated);

      // Fallback timeout in case onUpdated listener doesn't trigger
      setTimeout(() => {
        if (!navigated) startDetection(activeTabId);
      }, 3500);
      return;
    }

    // Case 3: Already on subscriptionList page -> Scan subscriptions immediately!
    await startDetection(tab.id);

  } catch (err) {
    console.error('Initialization error:', err);
    showNavPrompt(
      'Unable to Read Page',
      err.message || 'Please reload the tab and try again.',
      'Retry',
      true
    );
  }
}

// Display Navigation prompt
function showNavPrompt(title, message, btnText, isCurrentTabNav) {
  showView('navSection');
  navTitle.textContent = title;
  navMessage.textContent = message;
  navActionBtnText.textContent = btnText;
  headerBadge.textContent = 'Setup';
  headerBadge.classList.remove('active');

  navActionBtn.onclick = async () => {
    if (isCurrentTabNav && activeTabId) {
      showView('loadingSection');
      loadingTitle.textContent = 'Navigating...';
      loadingSubtitle.textContent = 'Loading your Subscribe & Save dashboard';

      await chrome.tabs.update(activeTabId, {
        url: 'https://www.amazon.com/auto-deliveries/subscriptionList'
      });

      const onUpdated = (tabId, info) => {
        if (tabId === activeTabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          setTimeout(() => startDetection(activeTabId), 900);
        }
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
      setTimeout(() => startDetection(activeTabId), 3500);
    } else {
      chrome.tabs.create({ url: 'https://www.amazon.com/auto-deliveries/subscriptionList' });
      window.close();
    }
  };
}

// Start detecting subscriptions on the active tab
async function startDetection(tabId) {
  showView('loadingSection');
  loadingTitle.textContent = 'Scanning Subscriptions...';
  loadingSubtitle.textContent = 'Detecting active Subscribe & Save items on Amazon';
  headerBadge.textContent = 'Scanning';
  headerBadge.classList.remove('active');

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: scanAmazonPageForSubscriptions
    });

    subscriptions = (results && results[0] && results[0].result) ? results[0].result : [];

    if (!subscriptions || subscriptions.length === 0) {
      showEmptyState();
      return;
    }

    applyFilterAndSort();
    selectedSubIds = new Set(subscriptions.map(s => s.subscriptionId));

    renderSubscriptionsView();

  } catch (err) {
    console.error('Detection error:', err);
    showNavPrompt(
      'Detection Notice',
      'Make sure you are logged into your Amazon account and viewing your subscriptions.',
      'Open Subscriptions',
      true
    );
  }
}

// Empty State Display
function showEmptyState() {
  showView('emptySection');
  headerBadge.textContent = '0 Active';
  headerBadge.classList.remove('active');
}

// Show Subscriptions List
function renderSubscriptionsView() {
  showView('subscriptionsSection');
  headerBadge.textContent = `${subscriptions.length} Active`;
  headerBadge.classList.add('active');

  // Show search bar if there are more than 3 subscriptions
  if (subscriptions.length > 3) {
    searchWrap.style.display = 'block';
  } else {
    searchWrap.style.display = 'none';
  }

  renderItemList();
  updateActionButtons();
}

// Helper: Sort list by currentSortMode
function sortSubscriptionsList(list, mode) {
  const sorted = [...list];
  switch (mode) {
    case 'date-asc':
      // Soonest delivery first (e.g. Oct 19 before Nov 19)
      sorted.sort((a, b) => (a.dateTimestamp || Infinity) - (b.dateTimestamp || Infinity));
      break;
    case 'date-desc':
      // Farthest delivery first
      sorted.sort((a, b) => (b.dateTimestamp || 0) - (a.dateTimestamp || 0));
      break;
    case 'title-asc':
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case 'title-desc':
      sorted.sort((a, b) => b.title.localeCompare(a.title));
      break;
    default:
      break;
  }
  return sorted;
}

// Apply Search Filter and Sort Order
function applyFilterAndSort() {
  const query = searchFilter ? searchFilter.value.toLowerCase().trim() : '';

  let list = subscriptions;
  if (query) {
    list = subscriptions.filter(sub =>
      sub.title.toLowerCase().includes(query) ||
      (sub.frequency && sub.frequency.toLowerCase().includes(query)) ||
      (sub.deliveryDate && sub.deliveryDate.toLowerCase().includes(query))
    );
  }

  filteredSubscriptions = sortSubscriptionsList(list, currentSortMode);
}

// Render subscription items into DOM
function renderItemList() {
  countBadge.textContent = filteredSubscriptions.length;

  if (filteredSubscriptions.length === 0) {
    subscriptionsList.innerHTML = `
      <div style="text-align: center; padding: 28px 12px; color: var(--text-tertiary); font-size: 12.5px;">
        No subscriptions match your search.
      </div>
    `;
    return;
  }

  subscriptionsList.innerHTML = filteredSubscriptions.map(sub => {
    const isSelected = selectedSubIds.has(sub.subscriptionId);
    const cleanTitle = escapeHtml(sub.title);
    const cleanFrequency = escapeHtml(sub.frequency || 'Auto-Delivery');
    const cleanQuantity = escapeHtml(sub.quantity || '1');
    const cleanDate = sub.deliveryDate ? escapeHtml(sub.deliveryDate) : '';

    return `
      <div class="sub-item ${isSelected ? 'selected' : ''}" data-id="${escapeHtml(sub.subscriptionId)}">
        <input type="checkbox" class="sub-item-check" data-id="${escapeHtml(sub.subscriptionId)}" ${isSelected ? 'checked' : ''}>
        <div class="sub-item-body">
          <div class="sub-item-title">${cleanTitle}</div>
          <div class="sub-item-meta">
            ${cleanDate ? `<span class="sub-meta-pill sub-meta-date">📅 ${cleanDate}</span>` : ''}
            <span class="sub-meta-pill">📦 ${cleanQuantity} unit</span>
            <span class="sub-meta-pill">⏱ ${cleanFrequency}</span>
          </div>
        </div>
        <div class="sub-item-actions">
          <button class="btn-icon-trash" data-id="${escapeHtml(sub.subscriptionId)}" title="Cancel this item only">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Row selection toggle (clicking body toggles checkbox)
  subscriptionsList.querySelectorAll('.sub-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.sub-item-actions') || e.target.classList.contains('sub-item-check')) return;
      const checkbox = item.querySelector('.sub-item-check');
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change'));
    });
  });

  // Checkbox event listeners
  subscriptionsList.querySelectorAll('.sub-item-check').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.target.getAttribute('data-id');
      const itemRow = e.target.closest('.sub-item');
      if (e.target.checked) {
        selectedSubIds.add(id);
        itemRow.classList.add('selected');
      } else {
        selectedSubIds.delete(id);
        itemRow.classList.remove('selected');
      }
      updateActionButtons();
      updateSelectAllCheckbox();
    });
  });

  // Single Item Cancel Button
  subscriptionsList.querySelectorAll('.btn-icon-trash').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const targetSub = subscriptions.find(s => s.subscriptionId === id);
      if (targetSub) {
        promptConfirmation([targetSub]);
      }
    });
  });
}

// Select All Toggle
if (selectAllCheckbox) {
  selectAllCheckbox.addEventListener('change', (e) => {
    const checked = e.target.checked;
    filteredSubscriptions.forEach(sub => {
      if (checked) {
        selectedSubIds.add(sub.subscriptionId);
      } else {
        selectedSubIds.delete(sub.subscriptionId);
      }
    });
    renderItemList();
    updateActionButtons();
  });
}

function updateSelectAllCheckbox() {
  if (!selectAllCheckbox) return;
  const allSelected = filteredSubscriptions.length > 0 &&
    filteredSubscriptions.every(s => selectedSubIds.has(s.subscriptionId));
  selectAllCheckbox.checked = allSelected;
}

// Sort Selection Change Listener
if (sortSelect) {
  sortSelect.addEventListener('change', (e) => {
    currentSortMode = e.target.value;
    applyFilterAndSort();
    renderItemList();
    updateSelectAllCheckbox();
  });
}

// Search Filter Input
if (searchFilter) {
  searchFilter.addEventListener('input', () => {
    applyFilterAndSort();
    renderItemList();
    updateSelectAllCheckbox();
  });
}

// Action Button State
function updateActionButtons() {
  const count = selectedSubIds.size;
  if (cancelBtnText) {
    if (count === 0) {
      cancelBtnText.textContent = 'Select Subscriptions';
      cancelSelectedBtn.disabled = true;
    } else if (count === subscriptions.length) {
      cancelBtnText.textContent = `Cancel All (${count})`;
      cancelSelectedBtn.disabled = false;
    } else {
      cancelBtnText.textContent = `Cancel Selected (${count})`;
      cancelSelectedBtn.disabled = false;
    }
  }
}

// Confirmation Modal Prompt
function promptConfirmation(itemsToCancel) {
  if (isProcessing || !itemsToCancel || itemsToCancel.length === 0) return;

  const count = itemsToCancel.length;
  modalTitle.textContent = `Cancel ${count} ${count === 1 ? 'Subscription' : 'Subscriptions'}?`;
  modalBody.textContent = count === 1
    ? `Are you sure you want to cancel "${itemsToCancel[0].title.substring(0, 50)}..."?`
    : `This will safely automate cancellation of ${count} selected subscriptions directly on Amazon.`;

  confirmModal.style.display = 'flex';

  modalCancelBtn.onclick = () => {
    confirmModal.style.display = 'none';
  };

  modalConfirmBtn.onclick = async () => {
    confirmModal.style.display = 'none';
    await executeCancellation(itemsToCancel);
  };
}

// Cancel Selected Trigger
if (cancelSelectedBtn) {
  cancelSelectedBtn.addEventListener('click', () => {
    const selected = subscriptions.filter(s => selectedSubIds.has(s.subscriptionId));
    promptConfirmation(selected);
  });
}

// Re-scan trigger on empty state
if (emptyRefreshBtn) {
  emptyRefreshBtn.addEventListener('click', () => {
    if (activeTabId) startDetection(activeTabId);
  });
}

// Execute Cancellation Workflow
async function executeCancellation(itemsToCancel) {
  if (isProcessing || !itemsToCancel || itemsToCancel.length === 0) return;
  isProcessing = true;

  showView('progressSection');
  progressLog.innerHTML = '';
  progressFill.style.width = '0%';
  progressText.textContent = `0 / ${itemsToCancel.length}`;

  let successCountNum = 0;
  let failedCountNum = 0;
  const canceledList = [];

  for (let i = 0; i < itemsToCancel.length; i++) {
    const sub = itemsToCancel[i];
    const progressPercent = Math.round(((i + 1) / itemsToCancel.length) * 100);

    progressFill.style.width = `${progressPercent}%`;
    progressText.textContent = `${i + 1} / ${itemsToCancel.length}`;
    progressCurrent.textContent = `Canceling: ${sub.title}`;

    addProgressRow(`Canceling: ${sub.title.substring(0, 36)}...`, 'pending');

    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        func: cancelSingleSubscriptionOnAmazon,
        args: [sub.subscriptionId]
      });

      const res = (result && result[0] && result[0].result) ? result[0].result : null;

      if (res && res.success) {
        successCountNum++;
        canceledList.push(sub);
        addProgressRow(`✓ Canceled: ${sub.title.substring(0, 34)}`, 'success');

        // Remove from local memory state
        subscriptions = subscriptions.filter(s => s.subscriptionId !== sub.subscriptionId);
        selectedSubIds.delete(sub.subscriptionId);
      } else {
        failedCountNum++;
        const failReason = res && res.error ? ` (${res.error})` : '';
        addProgressRow(`✗ Failed: ${sub.title.substring(0, 30)}${failReason}`, 'error');
      }
    } catch (err) {
      console.error('Cancellation error for item:', sub.subscriptionId, err);
      failedCountNum++;
      addProgressRow(`✗ Error: ${sub.title.substring(0, 34)}`, 'error');
    }

    // Anti-rate-limiting pacing (800ms)
    if (i < itemsToCancel.length - 1) {
      await new Promise(r => setTimeout(r, 800));
    }
  }

  isProcessing = false;
  showSummaryView(successCountNum, failedCountNum, canceledList);
}

// Append a row to the live progress log
function addProgressRow(message, status) {
  const row = document.createElement('div');
  row.className = `stream-row ${status}`;
  row.textContent = message;
  progressLog.appendChild(row);
  progressLog.scrollTop = progressLog.scrollHeight;
}

// Summary View
function showSummaryView(successCountTotal, failedCountTotal, canceledItems) {
  showView('summarySection');
  headerBadge.textContent = 'Completed';
  headerBadge.classList.remove('active');

  successCount.textContent = successCountTotal;
  failedCount.textContent = failedCountTotal;

  if (failedCountTotal > 0) {
    failedStatBox.style.display = 'block';
  } else {
    failedStatBox.style.display = 'none';
  }

  if (canceledItems && canceledItems.length > 0) {
    canceledBreakdown.innerHTML = canceledItems.map(item => `
      <div class="canceled-item-row" title="${escapeHtml(item.title)}">
        ✓ ${escapeHtml(item.title)}
      </div>
    `).join('');
    canceledBreakdown.style.display = 'block';
  } else {
    canceledBreakdown.style.display = 'none';
  }

  summaryDoneBtn.onclick = async () => {
    if (activeTabId) {
      try {
        await chrome.tabs.reload(activeTabId);
      } catch (e) {
        console.warn('Tab reload:', e);
      }
    }
    window.close();
  };
}

// Scraper function executed within Amazon page context
async function scanAmazonPageForSubscriptions() {
  const found = [];
  const seenIds = new Set();

  function parseDateToTimestamp(dateStr) {
    if (!dateStr) return Infinity;
    try {
      const clean = dateStr
        .replace(/^(arriving|next delivery|last day to edit|delivery date)[:\s]*/i, '')
        .replace(/^[A-Za-z]+,\s*/, '')
        .trim();
      const curYear = new Date().getFullYear();
      let ts = Date.parse(`${clean} ${curYear}`);
      if (isNaN(ts)) ts = Date.parse(clean);
      if (!isNaN(ts) && ts < Date.now() - 60 * 24 * 3600 * 1000) {
        ts = Date.parse(`${clean} ${curYear + 1}`);
      }
      return isNaN(ts) ? Infinity : ts;
    } catch (e) {
      return Infinity;
    }
  }

  // Helper: check if ID is an ASIN or invalid token
  function isInvalidSubId(id) {
    if (!id) return true;
    if (/^B0[A-Z0-9]{8}$/i.test(id)) return true;
    if (id.startsWith('csa-') || id.startsWith('delivery-')) return true;
    return false;
  }

  // 1. Primary Strategy: Amazon's new layout puts subscription IDs in [data-edit-url] and Edit links
  const candidateElements = document.querySelectorAll(`
    [data-edit-url],
    a[href*="subscriptionId="],
    a[href*="subscriptionId%3D"],
    [data-subscription-id]
  `);

  candidateElements.forEach(el => {
    let subId = '';
    const editUrl = el.getAttribute('data-edit-url') || '';
    if (editUrl) {
      const m = editUrl.match(/subscriptionId=([\w-]+)/i);
      if (m) subId = m[1];
    }

    if (!subId && el.href) {
      const m = el.href.match(/subscriptionId(?:=|%3D)([\w-]+)/i);
      if (m) subId = decodeURIComponent(m[1]);
    }

    if (!subId) {
      subId = el.getAttribute('data-subscription-id') || '';
    }

    if (isInvalidSubId(subId) || seenIds.has(subId)) return;
    seenIds.add(subId);

    // Locate the enclosing card container in the grid
    let card = el.closest('[data-edit-url]') || el.closest('.a-box, [class*="subscription"], [class*="card"], [class*="item"]');
    if (!card || !card.querySelector('img')) {
      let curr = el;
      while (curr && curr !== document.body) {
        if (curr.querySelector('img') && (curr.textContent.includes('Next delivery') || curr.textContent.includes('unit') || curr.textContent.includes('Edit'))) {
          card = curr;
          break;
        }
        curr = curr.parentElement;
      }
    }

    // Product Title
    let title = '';
    if (card) {
      const img = card.querySelector('img[alt]');
      if (img && img.alt && img.alt.trim().length > 3) {
        title = img.alt.trim();
      } else {
        const heading = card.querySelector('h2, h3, h4, .a-size-base-plus, .a-text-bold, a[href*="/dp/"]');
        if (heading && heading.textContent.trim().length > 3) {
          title = heading.textContent.trim();
        }
      }
    }
    if (!title && el.textContent && el.textContent.trim().length > 4 && !el.textContent.includes('Edit')) {
      title = el.textContent.trim();
    }
    if (!title || title.length < 3) title = 'Amazon Subscription Item';
    title = title.replace(/\s+/g, ' ').trim();

    // Next Delivery Date
    let deliveryDate = '';
    const cardText = card ? card.textContent.replace(/\s+/g, ' ').trim() : '';

    const dateMatch = cardText.match(/Next delivery:?\s*([A-Za-z]+ \d{1,2}(?:, \d{4})?)/i) ||
                      cardText.match(/Arriving:?\s*([A-Za-z]+,?\s+[A-Za-z]+ \d{1,2})/i) ||
                      cardText.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,?\s*\d{4})?/i);
    if (dateMatch) {
      deliveryDate = dateMatch[1] || dateMatch[0];
      deliveryDate = deliveryDate.replace(/^(Next delivery|Arriving)[:\s]*/i, '').trim();
    }

    // Quantity & Frequency
    let quantity = '1';
    let frequency = 'Auto-Delivery';

    const qtyFreqMatch = cardText.match(/(\d+)\s+units?\s+every\s+(\d+\s+(?:month|week|day)s?)/i);
    if (qtyFreqMatch) {
      quantity = qtyFreqMatch[1];
      frequency = `Every ${qtyFreqMatch[2]}`;
    } else {
      const qtyMatch = cardText.match(/(\d+)\s+units?/i) || cardText.match(/qty[:\s]+(\d+)/i);
      if (qtyMatch) quantity = qtyMatch[1];

      const freqMatch = cardText.match(/every\s+(\d+\s+(?:month|week|day)s?)/i) ||
                        cardText.match(/(\d+\s+(?:month|week|day)s?)/i);
      if (freqMatch) frequency = `Every ${freqMatch[1]}`;
    }

    found.push({
      subscriptionId: subId,
      title: title,
      quantity: quantity,
      frequency: frequency,
      deliveryDate: deliveryDate,
      dateTimestamp: parseDateToTimestamp(deliveryDate)
    });
  });

  // 2. Global Document HTML Regex (The Gist Discovery Method)
  // Ensures any subscription IDs on the page are detected even if DOM elements differ
  const globalRe = /subscriptionId=([\w-]+)/g;
  let gm;
  const html = document.documentElement.innerHTML;
  while ((gm = globalRe.exec(html))) {
    const subId = gm[1];
    if (isInvalidSubId(subId) || seenIds.has(subId)) continue;
    seenIds.add(subId);

    // Try finding element in DOM for this subscription
    const refEl = document.querySelector(`[data-edit-url*="${subId}"], a[href*="${subId}"]`);
    let title = 'Amazon Subscription Item';
    let deliveryDate = '';
    let quantity = '1';
    let frequency = 'Auto-Delivery';

    if (refEl) {
      const refCard = refEl.closest('div[class*="card"], div[class*="item"], .a-box') || refEl.parentElement?.parentElement;
      if (refCard) {
        const img = refCard.querySelector('img[alt]');
        if (img && img.alt && img.alt.length > 3) title = img.alt.trim();
        const cardText = refCard.textContent.replace(/\s+/g, ' ');
        const dMatch = cardText.match(/Next delivery:?\s*([A-Za-z]+ \d{1,2})/i);
        if (dMatch) deliveryDate = dMatch[1];
        const fMatch = cardText.match(/(\d+)\s+units?\s+every\s+(\d+\s+\w+)/i);
        if (fMatch) {
          quantity = fMatch[1];
          frequency = `Every ${fMatch[2]}`;
        }
      }
    }

    found.push({
      subscriptionId: subId,
      title: title.replace(/\s+/g, ' ').trim(),
      quantity: quantity,
      frequency: frequency,
      deliveryDate: deliveryDate,
      dateTimestamp: parseDateToTimestamp(deliveryDate)
    });
  }

  return found;
}

// In-tab function to cancel single subscription via Amazon's internal AJAX form
async function cancelSingleSubscriptionOnAmazon(subscriptionId) {
  function panelHasCancelForm(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return !!div.querySelector("form[name='cancelForm']");
  }

  try {
    // 1. Fetch cancel modal
    const res = await fetch(
      `https://www.amazon.com/auto-deliveries/ajax/cancelSubscription?deviceType=desktop&deviceContext=web&subscriptionId=${subscriptionId}`
    );
    const panelHtml = await res.text();
    if (!panelHasCancelForm(panelHtml)) {
      return { success: false, error: 'no_cancel_form_found' };
    }

    // 2. Parse form & prepare cancellation data
    const div = document.createElement('div');
    div.innerHTML = panelHtml;
    const form = div.querySelector("form[name='cancelForm']");
    const formData = new FormData(form);

    // Provide cancellation reason dropdown value to satisfy Amazon validation
    formData.set('sns-cancellation-dropdown', 'SnS_MYD_SnsCancelReason_sns_cancel_reason_other');

    // 3. Submit cancellation request
    await fetch(form.action, {
      method: form.method || 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(formData)
    });

    // 4. Verification: cancelled subscriptions stop returning the form
    const check = await fetch(
      `https://www.amazon.com/auto-deliveries/ajax/cancelSubscription?deviceType=desktop&deviceContext=web&subscriptionId=${subscriptionId}`
    );
    const checkHtml = await check.text();
    const stillActive = panelHasCancelForm(checkHtml);

    return {
      success: !stillActive,
      error: stillActive ? 'still_active_after_submit' : undefined
    };

  } catch (error) {
    if (error && error.message && (error.message.includes('redirect') || error.message.includes('CORS'))) {
      return { success: true };
    }
    return { success: false, error: error ? error.message : 'Unknown error' };
  }
}

// Development Mock Preview Loader
function loadMockPreviewData() {
  subscriptions = [
    {
      subscriptionId: 'sub-glide-1',
      title: 'Glide Comfort Plus Mint Floss, 3 Pack',
      quantity: '1',
      frequency: 'Every 5 months',
      deliveryDate: 'Nov 19',
      dateTimestamp: 1795075200000
    },
    {
      subscriptionId: 'sub-ouai-2',
      title: 'OUAI Detox Shampoo, 32 Fl Oz Refill',
      quantity: '1',
      frequency: 'Every 6 months',
      deliveryDate: 'Nov 19',
      dateTimestamp: 1795075200000
    },
    {
      subscriptionId: 'sub-dove-3',
      title: 'Dove 5Liter PRO Body Wash Pump',
      quantity: '1',
      frequency: 'Every 6 months',
      deliveryDate: 'Nov 19',
      dateTimestamp: 1795075200000
    },
    {
      subscriptionId: 'sub-trash-4',
      title: '105 Count Small Trash Bags, 4 Gallon',
      quantity: '1',
      frequency: 'Every 6 months',
      deliveryDate: 'Nov 19',
      dateTimestamp: 1795075200000
    },
    {
      subscriptionId: 'sub-quilted-5',
      title: 'Quilted Northern Toilet Paper Ultra Plush',
      quantity: '1',
      frequency: 'Every 6 months',
      deliveryDate: 'Nov 19',
      dateTimestamp: 1795075200000
    },
    {
      subscriptionId: 'sub-aquacool-6',
      title: "Dr. Brown's AquaCool Water Teether, Apple & Pineapple",
      quantity: '1',
      frequency: 'Every 6 months',
      deliveryDate: 'Dec 19',
      dateTimestamp: 1797667200000
    },
    {
      subscriptionId: 'sub-quilted-7',
      title: 'Quilted Northern Toilet Paper Ultra Plush (Jan batch)',
      quantity: '1',
      frequency: 'Every 6 months',
      deliveryDate: 'Jan 19',
      dateTimestamp: 1800345600000
    }
  ];
  applyFilterAndSort();
  selectedSubIds = new Set(subscriptions.map(s => s.subscriptionId));
  renderSubscriptionsView();
}

// Utility: HTML Escaping
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);
