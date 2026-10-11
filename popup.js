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
  let doc = document;

  // Check if real subscription cards exist on current DOM
  let cards = doc.querySelectorAll('[data-subscription-id], .al-subscription-card, [id*="subscriptionCard"], .subscription-card');

  // If on the upcoming deliveries calendar page (/auto-deliveries) or no cards found,
  // fetch the official subscriptionList HTML directly in the background with user credentials!
  if (!cards || cards.length === 0) {
    try {
      const res = await fetch('https://www.amazon.com/auto-deliveries/subscriptionList', {
        credentials: 'include',
        headers: {
          'Accept': 'text/html,application/xhtml+xml',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      if (res.ok) {
        const text = await res.text();
        const parser = new DOMParser();
        doc = parser.parseFromString(text, 'text/html');
        cards = doc.querySelectorAll('[data-subscription-id], .al-subscription-card, [id*="subscriptionCard"], .subscription-card');
      }
    } catch (e) {
      console.warn('Direct fetch of subscriptionList failed:', e);
    }
  }

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
    // ASIN pattern: starts with B0 and 10 alphanumeric chars
    if (/^B0[A-Z0-9]{8}$/i.test(id)) return true;
    if (id.startsWith('csa-') || id.startsWith('delivery-')) return true;
    return false;
  }

  if (cards && cards.length > 0) {
    cards.forEach(card => {
      let subId = card.getAttribute('data-subscription-id');

      // Check links inside card
      if (!subId) {
        const link = card.querySelector('a[href*="subscriptionId="], a[href*="subscriptionId%3D"]');
        if (link) {
          const m = link.href.match(/subscriptionId(?:=|%3D)([\w-]+)/i);
          if (m) subId = decodeURIComponent(m[1]);
        }
      }

      // Check card ID attribute
      if (!subId && card.id && card.id.includes('subscription')) {
        const m = card.id.match(/subscription[-_]?([\w-]+)/i);
        if (m) subId = m[1];
      }

      if (isInvalidSubId(subId) || seenIds.has(subId)) return;
      seenIds.add(subId);

      // Title Extraction
      let title = '';
      const img = card.querySelector('img[alt]');
      if (img && img.alt && img.alt.trim().length > 6) {
        title = img.alt.trim();
      } else {
        const titleElem = card.querySelector('.product-title, [id*="product-title"], .a-size-medium, .a-size-base-plus, .a-text-bold, h2, h3, a.a-link-normal');
        if (titleElem && titleElem.textContent.trim().length > 6) {
          title = titleElem.textContent.trim();
        }
      }
      if (!title || title.length < 5) title = 'Amazon Subscription Item';
      title = title.replace(/\s+/g, ' ').trim();

      // Delivery Date / Next Delivery extraction
      const fullText = card.textContent.replace(/\s+/g, ' ').trim();
      let deliveryDate = '';

      const dateMatch = fullText.match(/(?:arriving|next delivery|last day to edit|delivery date)[:\s]+([A-Za-z]+,?\s+[A-Za-z]+\s+\d+(?:,\s*\d{4})?)/i) ||
                        fullText.match(/arriving\s+([A-Za-z]+,?\s+[A-Za-z]+\s+\d+)/i) ||
                        fullText.match(/arriving\s+([A-Za-z]+\s+\d+)/i) ||
                        fullText.match(/(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,?\s*\d{4})?/i);
      if (dateMatch) {
        deliveryDate = dateMatch[1] || dateMatch[0];
        deliveryDate = deliveryDate.replace(/^(arriving|next delivery)[:\s]*/i, '').trim();
      }

      // Quantity and Frequency Extraction
      let quantity = '1';
      let frequency = 'Auto-Delivery';

      const qtyMatch = fullText.match(/(\d+)\s*(?:unit|item|pack|count|bottle|box)s?/i) ||
                       fullText.match(/qty[:\s]+(\d+)/i);
      if (qtyMatch) quantity = qtyMatch[1];

      const freqMatch = fullText.match(/deliver(?:y|ed|ies)?\s+(?:every\s+)?(\d+\s+(?:month|week|day)s?)/i) ||
                        fullText.match(/every\s+(\d+\s+(?:month|week|day)s?)/i) ||
                        fullText.match(/(\d+\s+(?:month|week|day)s?)/i);
      if (freqMatch) frequency = freqMatch[1];

      found.push({
        subscriptionId: subId,
        title: title,
        quantity: quantity,
        frequency: frequency,
        deliveryDate: deliveryDate,
        dateTimestamp: parseDateToTimestamp(deliveryDate)
      });
    });
  }

  // Fallback: If no cards found but page has subscription links
  if (found.length === 0) {
    const subLinks = doc.querySelectorAll('a[href*="subscriptionId="], a[href*="subscriptionId%3D"]');
    subLinks.forEach(link => {
      const m = link.href.match(/subscriptionId(?:=|%3D)([\w-]+)/i);
      if (m) {
        const subId = decodeURIComponent(m[1]);
        if (isInvalidSubId(subId) || seenIds.has(subId)) return;
        seenIds.add(subId);

        let title = link.textContent.trim();
        const parentBox = link.closest('.a-box, div[class*="subscription"]') || link.parentElement;
        if ((!title || title.length < 5) && parentBox) {
          const img = parentBox.querySelector('img[alt]');
          if (img && img.alt) title = img.alt.trim();
        }
        if (!title || title.length < 5) title = 'Amazon Subscription Item';

        found.push({
          subscriptionId: subId,
          title: title.replace(/\s+/g, ' ').trim(),
          quantity: '1',
          frequency: 'Auto-Delivery',
          deliveryDate: '',
          dateTimestamp: Infinity
        });
      }
    });
  }

  return found;
}

// In-tab function to cancel single subscription via Amazon's internal AJAX form
async function cancelSingleSubscriptionOnAmazon(subscriptionId) {
  try {
    const res = await fetch(
      `https://www.amazon.com/auto-deliveries/ajax/cancelSubscription?deviceType=desktop&deviceContext=web&subscriptionId=${subscriptionId}&sourcePage=subscriptionList`,
      {
        credentials: 'include',
        headers: {
          'Accept': 'text/html, */*',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }
    );

    const htmlText = await res.text();
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = htmlText;
    tempContainer.style.display = 'none';
    document.body.appendChild(tempContainer);

    const form = tempContainer.querySelector("form[name='cancelForm']") ||
                 tempContainer.querySelector("form[action*='cancel']");

    if (!form) {
      tempContainer.remove();
      return { success: false, error: 'no_cancel_form_found' };
    }

    const formData = new FormData(form);

    // Provide cancellation reason dropdown value to satisfy Amazon validation
    if (!formData.has('sns-cancellation-dropdown') || !formData.get('sns-cancellation-dropdown')) {
      formData.set('sns-cancellation-dropdown', 'SnS_MYD_SnsCancelReason_sns_cancel_reason_other');
    }

    const formParams = new URLSearchParams(formData);

    const submitResponse = await fetch(form.action, {
      method: form.method || 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formParams,
      redirect: 'manual'
    });

    tempContainer.remove();

    if (submitResponse.status === 0 || submitResponse.status === 302 || submitResponse.status === 200) {
      return { success: true };
    }

    return { success: false, status: submitResponse.status };

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
      subscriptionId: 'sub-stacys-1',
      title: 'Stacys Snacks Sea Salt Pita Chips, 16 OZ',
      quantity: '1',
      frequency: 'Every 1 month',
      deliveryDate: 'Mon, Oct 19',
      dateTimestamp: 1792393200000
    },
    {
      subscriptionId: 'sub-moroccanoil-2',
      title: 'Moroccanoil Extra Volume Shampoo, 16.9 Fl Oz',
      quantity: '1',
      frequency: 'Every 2 months',
      deliveryDate: 'Thu, Nov 19',
      dateTimestamp: 1795075200000
    },
    {
      subscriptionId: 'sub-dreft-3',
      title: 'Dreft Baby Liquid Laundry Detergent, 128 Fl Oz',
      quantity: '1',
      frequency: 'Every 2 months',
      deliveryDate: 'Thu, Nov 19',
      dateTimestamp: 1795075200000
    },
    {
      subscriptionId: 'sub-cashews-4',
      title: '365 by Whole Foods Market, Cashews Unsalted Roasted, 16 Oz',
      quantity: '1',
      frequency: 'Every 3 months',
      deliveryDate: 'Sat, Dec 19',
      dateTimestamp: 1797667200000
    },
    {
      subscriptionId: 'sub-desenex-5',
      title: 'Desenex Anti-Fungal Foot Powder, Athletes Foot Treatment',
      quantity: '1',
      frequency: 'Every 4 months',
      deliveryDate: 'Tue, Jan 19',
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
