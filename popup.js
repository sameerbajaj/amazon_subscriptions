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

// Check whether current URL is Amazon S&S
function isSubscribeAndSaveUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('auto-deliveries') ||
         lower.includes('subscribe-and-save') ||
         lower.includes('/sns') ||
         lower.includes('/hz/subscription');
}

// Check whether current URL is any Amazon page
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
        'Open Amazon',
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

    // Case 2: On Amazon, but not on S&S dashboard
    if (!isSubscribeAndSaveUrl(tab.url)) {
      showNavPrompt(
        'Go to Subscriptions Dashboard',
        'You are on Amazon! Jump directly to your Subscribe & Save manager in one click.',
        'Go to Subscriptions',
        true
      );
      return;
    }

    // Case 3: Already on S&S page -> Scan subscriptions immediately!
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

      await chrome.tabs.update(activeTabId, { url: 'https://www.amazon.com/auto-deliveries' });

      // Listen for tab load completion
      const onUpdated = (tabId, info) => {
        if (tabId === activeTabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          setTimeout(() => startDetection(activeTabId), 1000);
        }
      };
      chrome.tabs.onUpdated.addListener(onUpdated);

      // Fallback timeout in case onUpdated was missed
      setTimeout(() => startDetection(activeTabId), 4000);
    } else {
      chrome.tabs.create({ url: 'https://www.amazon.com/auto-deliveries' });
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

    filteredSubscriptions = subscriptions.slice();
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

  // Only show search bar if there are more than 3 subscriptions
  if (subscriptions.length > 3) {
    searchWrap.style.display = 'block';
  } else {
    searchWrap.style.display = 'none';
  }

  renderItemList();
  updateActionButtons();
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

    return `
      <div class="sub-item ${isSelected ? 'selected' : ''}" data-id="${escapeHtml(sub.subscriptionId)}">
        <input type="checkbox" class="sub-item-check" data-id="${escapeHtml(sub.subscriptionId)}" ${isSelected ? 'checked' : ''}>
        <div class="sub-item-body">
          <div class="sub-item-title">${cleanTitle}</div>
          <div class="sub-item-meta">
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

// Search Filter Input
if (searchFilter) {
  searchFilter.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    filteredSubscriptions = subscriptions.filter(sub =>
      sub.title.toLowerCase().includes(q) ||
      (sub.frequency && sub.frequency.toLowerCase().includes(q))
    );
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
        addProgressRow(`✗ Failed: ${sub.title.substring(0, 34)}`, 'error');
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
function scanAmazonPageForSubscriptions() {
  const found = [];
  const seenIds = new Set();

  // Comprehensive selectors covering Amazon S&S desktop variants
  const cards = document.querySelectorAll(`
    [data-subscription-id],
    .al-subscription-card,
    [id*="subscriptionCard"],
    .subscription-card,
    [data-asin],
    .delivery-item,
    [data-csa-c-item-id]
  `);

  cards.forEach(card => {
    let subId = card.getAttribute('data-subscription-id') ||
                card.getAttribute('data-asin') ||
                card.getAttribute('data-csa-c-item-id') ||
                '';

    if (!subId && card.id && (card.id.includes('sub') || card.id.includes('delivery'))) {
      subId = card.id;
    }

    // Fallback: check child links containing subscriptionId=
    if (!subId) {
      const link = card.querySelector('a[href*="subscriptionId="], a[href*="subscriptionId%3D"]');
      if (link) {
        const m = link.href.match(/subscriptionId(?:=|%3D)([^&]+)/i);
        if (m) subId = decodeURIComponent(m[1]);
      }
    }

    if (!subId || seenIds.has(subId)) return;
    seenIds.add(subId);

    // Title Extraction
    let title = 'Amazon Subscription Item';
    const img = card.querySelector('img[alt]');
    if (img && img.alt && img.alt.trim().length > 6) {
      title = img.alt.trim();
    } else {
      const titleElem = card.querySelector('.product-title, [id*="product-title"], .a-size-base-plus, .a-text-bold, h2, h3, a.a-link-normal');
      if (titleElem && titleElem.textContent.trim().length > 6) {
        title = titleElem.textContent.trim();
      }
    }

    // Clean title string
    title = title.replace(/\s+/g, ' ').trim();

    // Quantity and Frequency Extraction
    const textContent = card.textContent.replace(/\s+/g, ' ').trim();
    let quantity = '1';
    let frequency = 'Auto-Delivery';

    const qtyMatch = textContent.match(/(\d+)\s*(?:unit|item|pack|count|bottle|box)s?/i) ||
                     textContent.match(/qty[:\s]+(\d+)/i);
    if (qtyMatch) quantity = qtyMatch[1];

    const freqMatch = textContent.match(/deliver(?:y|ed|ies)?\s+(?:every\s+)?(\d+\s+(?:month|week|day)s?)/i) ||
                      textContent.match(/every\s+(\d+\s+(?:month|week|day)s?)/i) ||
                      textContent.match(/(\d+\s+(?:month|week|day)s?)/i);
    if (freqMatch) frequency = freqMatch[1];

    found.push({
      subscriptionId: subId,
      title: title,
      quantity: quantity,
      frequency: frequency
    });
  });

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
      subscriptionId: 'sub-mock-1',
      title: 'Bounty Quick-Size Paper Towels, White, 16 Family Rolls = 40 Regular Rolls',
      quantity: '1',
      frequency: 'Every 1 month'
    },
    {
      subscriptionId: 'sub-mock-2',
      title: 'Cascade Platinum Plus ActionPacs Dishwasher Detergent, Fresh Scent, 52 Count',
      quantity: '1',
      frequency: 'Every 2 months'
    },
    {
      subscriptionId: 'sub-mock-3',
      title: 'Tide PODS Free & Gentle Liquid Laundry Detergent Pacs, 81 Count',
      quantity: '1',
      frequency: 'Every 3 months'
    }
  ];
  filteredSubscriptions = subscriptions.slice();
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
