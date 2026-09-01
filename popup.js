// State management
let subscriptions = [];
let filteredSubscriptions = [];
let selectedSubIds = new Set();
let isProcessing = false;

// DOM Elements
const statusSection = document.getElementById('statusSection');
const statusIcon = document.getElementById('statusIcon');
const statusTitle = document.getElementById('statusTitle');
const statusMessage = document.getElementById('statusMessage');
const subscriptionsSection = document.getElementById('subscriptionsSection');
const subscriptionsList = document.getElementById('subscriptionsList');
const countBadge = document.getElementById('countBadge');
const selectAllCheckbox = document.getElementById('selectAllCheckbox');
const searchFilter = document.getElementById('searchFilter');
const actionButtons = document.getElementById('actionButtons');
const testBtn = document.getElementById('testBtn');
const cancelSelectedBtn = document.getElementById('cancelSelectedBtn');
const cancelBtnText = document.getElementById('cancelBtnText');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const progressLog = document.getElementById('progressLog');
const summarySection = document.getElementById('summarySection');
const successCount = document.getElementById('successCount');
const failedCount = document.getElementById('failedCount');
const resetBtn = document.getElementById('resetBtn');
const openPageBtn = document.getElementById('openPageBtn');

// Modal Elements
const confirmModal = document.getElementById('confirmModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');

// Initialize
async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes('amazon.com')) {
      showError(
        'Not on Amazon',
        'Please navigate to Amazon Subscribe & Save first.',
        true
      );
      return;
    }

    if (!tab.url.includes('subscribe-and-save') && !tab.url.includes('auto-deliveries')) {
      showError(
        'Wrong Page',
        'You need to be on the Subscribe & Save dashboard. Click below to open it.',
        true
      );
      return;
    }

    // Detect subscriptions on the page
    await detectSubscriptions(tab.id);

  } catch (error) {
    showError('Error', error.message, false);
  }
}

// Detect subscriptions on the page
async function detectSubscriptions(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const subs = [];
        const seen = new Set();

        // Target all possible subscription card selectors
        const cards = document.querySelectorAll('[data-subscription-id], .al-subscription-card, [id*="subscriptionCard"], .subscription-card, [data-asin]');

        cards.forEach(card => {
          let subscriptionId = card.getAttribute('data-subscription-id') ||
                               card.getAttribute('data-asin') ||
                               card.id ||
                               '';

          // If no direct ID, check internal links
          if (!subscriptionId) {
            const editLink = card.querySelector('a[href*="subscriptionId="]');
            if (editLink) {
              const match = editLink.href.match(/subscriptionId=([^&]+)/);
              if (match) subscriptionId = match[1];
            }
          }

          if (!subscriptionId || seen.has(subscriptionId)) return;
          seen.add(subscriptionId);

          const text = card.textContent.replace(/\s+/g, ' ').trim();

          // Title extraction with multiple fallbacks
          let title = 'Amazon Subscription Product';
          const img = card.querySelector('img[alt]');
          if (img && img.alt.length > 10) {
            title = img.alt;
          } else {
            const titleEl = card.querySelector('.product-title, [id*="product-title"], .a-size-base-plus, .a-text-bold, h2, h3, a');
            if (titleEl && titleEl.textContent.trim().length > 10) {
              title = titleEl.textContent.trim();
            }
          }

          // Quantity and frequency extraction
          let quantity = '1';
          let frequency = 'Subscription';

          let match = text.match(/(\d+)\s*x\s*(\d+\s+\w+)/i) ||
                      text.match(/(\d+)\s+units?\s+every\s+(\d+\s+\w+)/i);
          if (match) {
            quantity = match[1];
            frequency = match[2];
          } else {
            let freqMatch = text.match(/(\d+\s+(?:month|week|day)s?)/i);
            if (freqMatch) frequency = freqMatch[1];
          }

          subs.push({ subscriptionId, title, quantity, frequency });
        });

        return subs;
      }
    });

    subscriptions = results && results[0] ? results[0].result : [];

    if (!subscriptions || subscriptions.length === 0) {
      showSuccess();
      return;
    }

    filteredSubscriptions = subscriptions.slice();
    selectedSubIds = new Set(subscriptions.map(s => s.subscriptionId));

    showSubscriptions();

  } catch (error) {
    showError('Detection Failed', error.message, false);
  }
}

// Render Subscriptions List
function showSubscriptions() {
  statusSection.style.display = 'none';
  subscriptionsSection.style.display = 'block';
  actionButtons.style.display = 'flex';

  renderList();
  updateCancelButtonText();
}

// Render items into DOM based on filter
function renderList() {
  countBadge.textContent = filteredSubscriptions.length;

  if (filteredSubscriptions.length === 0) {
    subscriptionsList.innerHTML = '<div style="text-align: center; padding: 24px; color: var(--text-secondary); font-size: 13px;">No subscriptions match your search.</div>';
    return;
  }

  subscriptionsList.innerHTML = filteredSubscriptions.map((sub, index) => {
    const isChecked = selectedSubIds.has(sub.subscriptionId);
    const cleanTitle = sub.title.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    const displayTitle = cleanTitle.substring(0, 75) + (cleanTitle.length > 75 ? '...' : '');

    return `
      <div class="subscription-item ${isChecked ? 'selected' : ''}" data-sub-id="${escapeHtml(sub.subscriptionId)}">
        <input type="checkbox" class="sub-checkbox" data-sub-id="${escapeHtml(sub.subscriptionId)}" ${isChecked ? 'checked' : ''}>
        <div class="subscription-content">
          <div class="subscription-title">${escapeHtml(displayTitle)}</div>
          <div class="subscription-meta">${escapeHtml(sub.quantity)} unit · ${escapeHtml(sub.frequency)}</div>
        </div>
        <div class="subscription-actions">
          <button class="btn-small btn-cancel" data-sub-id="${escapeHtml(sub.subscriptionId)}">Cancel</button>
        </div>
      </div>
    `;
  }).join('');

  // Checkbox event listeners
  document.querySelectorAll('.sub-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.target.getAttribute('data-sub-id');
      if (e.target.checked) {
        selectedSubIds.add(id);
      } else {
        selectedSubIds.delete(id);
      }
      updateCancelButtonText();
      updateSelectAllState();
    });
  });

  // Individual cancel button listeners
  document.querySelectorAll('.btn-cancel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-sub-id');
      const targetSub = subscriptions.find(s => s.subscriptionId === id);
      if (targetSub) {
        promptCancelModal([targetSub]);
      }
    });
  });
}

// Select All Handler
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
    renderList();
    updateCancelButtonText();
  });
}

function updateSelectAllState() {
  if (!selectAllCheckbox) return;
  const allFilteredSelected = filteredSubscriptions.length > 0 &&
    filteredSubscriptions.every(sub => selectedSubIds.has(sub.subscriptionId));
  selectAllCheckbox.checked = allFilteredSelected;
}

// Search Filter Handler
if (searchFilter) {
  searchFilter.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    filteredSubscriptions = subscriptions.filter(sub =>
      sub.title.toLowerCase().includes(query) ||
      sub.frequency.toLowerCase().includes(query)
    );
    renderList();
    updateSelectAllState();
  });
}

function updateCancelButtonText() {
  const count = selectedSubIds.size;
  if (cancelBtnText) {
    cancelBtnText.textContent = count === subscriptions.length ?
      `Cancel All (${count})` :
      `Cancel Selected (${count})`;
  }
  if (cancelSelectedBtn) {
    cancelSelectedBtn.disabled = count === 0 || isProcessing;
  }
}

// Open Amazon Subscriptions Page
openPageBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: 'https://www.amazon.com/auto-deliveries'
  });
});

// Modal Confirmation Helper
function promptCancelModal(subsToCancel) {
  if (isProcessing || subsToCancel.length === 0) return;

  modalTitle.textContent = `Cancel ${subsToCancel.length} ${subsToCancel.length === 1 ? 'Subscription' : 'Subscriptions'}?`;
  modalBody.textContent = subsToCancel.length === 1 ?
    `This will permanently cancel "${subsToCancel[0].title.substring(0, 60)}...".` :
    `This will automatically process and confirm cancellations for ${subsToCancel.length} selected Amazon subscriptions.`;

  confirmModal.style.display = 'flex';

  modalCancelBtn.onclick = () => {
    confirmModal.style.display = 'none';
  };

  modalConfirmBtn.onclick = async () => {
    confirmModal.style.display = 'none';
    isProcessing = true;
    actionButtons.style.display = 'none';
    subscriptionsSection.style.display = 'none';

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await cancelSubscriptions(tab.id, subsToCancel);
  };
}

// Cancel Selected Button
if (cancelSelectedBtn) {
  cancelSelectedBtn.addEventListener('click', () => {
    const selected = subscriptions.filter(s => selectedSubIds.has(s.subscriptionId));
    promptCancelModal(selected);
  });
}

// Test One Button
if (testBtn) {
  testBtn.addEventListener('click', () => {
    if (subscriptions.length > 0) {
      promptCancelModal([subscriptions[0]]);
    }
  });
}

// Core Batch Cancellation Execution
async function cancelSubscriptions(tabId, subsToCancel) {
  progressSection.style.display = 'block';
  progressLog.innerHTML = '';

  let successfulCancels = 0;
  let failedCancels = 0;
  const canceledItems = [];

  for (let i = 0; i < subsToCancel.length; i++) {
    const sub = subsToCancel[i];
    const progress = Math.round(((i + 1) / subsToCancel.length) * 100);

    progressFill.style.width = `${progress}%`;
    progressText.textContent = `${i + 1} / ${subsToCancel.length}`;

    addLog(`Canceling: ${sub.title.substring(0, 45)}...`, 'pending');

    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: cancelSingleSubscription,
        args: [sub.subscriptionId]
      });

      if (result && result[0] && result[0].result && result[0].result.success) {
        successfulCancels++;
        canceledItems.push(sub);
        addLog(`✓ Canceled: ${sub.title.substring(0, 40)}`, 'success');
      } else {
        failedCancels++;
        addLog(`✗ Failed: ${sub.title.substring(0, 40)}`, 'error');
      }
    } catch (error) {
      failedCancels++;
      addLog(`✗ Error: ${sub.title.substring(0, 40)}`, 'error');
    }

    // Rate-limiting delay (900ms) between cancellations to prevent rate limiting
    if (i < subsToCancel.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 900));
    }
  }

  // Show summary
  showSummary(successfulCancels, failedCancels, canceledItems);

  // Auto-refresh Amazon tab after success
  if (successfulCancels > 0) {
    setTimeout(async () => {
      await chrome.tabs.reload(tabId);
    }, 2000);
  }
  isProcessing = false;
}

// Show Summary Screen
function showSummary(successful, failed, canceledItems) {
  progressSection.style.display = 'none';
  summarySection.style.display = 'block';
  successCount.textContent = successful;
  failedCount.textContent = failed;

  const existingList = summarySection.querySelector('.canceled-list');
  if (existingList) existingList.remove();

  if (canceledItems.length > 0) {
    const listDiv = document.createElement('div');
    listDiv.className = 'canceled-list';
    listDiv.innerHTML = `
      <h3 class="canceled-list-heading">Canceled Items</h3>
      <div class="canceled-list-scroll">
        ${canceledItems.map(item => `
          <div class="canceled-list-item">
            ✓ ${escapeHtml(item.title.substring(0, 60))}${item.title.length > 60 ? '...' : ''}
          </div>
        `).join('')}
      </div>
    `;
    summarySection.insertBefore(listDiv, summarySection.querySelector('.btn'));
  }
}

// Function executed inside Amazon page context to automate cancellation
async function cancelSingleSubscription(subscriptionId) {
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

    const cancelPanel = await res.text();
    const div = document.createElement('div');
    div.innerHTML = cancelPanel;
    div.style.display = 'none';
    document.body.appendChild(div);

    const form = div.querySelector("form[name='cancelForm']") || div.querySelector("form[action*='cancel']");
    if (!form) {
      div.remove();
      return { success: false, reason: 'no_form_found' };
    }

    const formData = new FormData(form);
    const formEntries = Object.fromEntries(formData.entries());

    const cancelResponse = await fetch(form.action, {
      method: form.method || 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(formEntries),
      redirect: 'manual'
    });

    div.remove();

    if (cancelResponse.status === 0 || cancelResponse.status === 302 || cancelResponse.status === 200) {
      return { success: true };
    }

    return { success: false, status: cancelResponse.status };

  } catch (error) {
    if (error.message && (error.message.includes('redirect') || error.message.includes('CORS'))) {
      return { success: true };
    }
    return { success: false, error: error.message };
  }
}

// UI Status Helpers
function showError(title, message, showButton) {
  const card = statusSection.querySelector('.status-card');
  card.className = 'status-card error';
  statusIcon.textContent = '❌';
  statusTitle.textContent = title;
  statusMessage.textContent = message;
  openPageBtn.style.display = showButton ? 'block' : 'none';
}

function showSuccess() {
  const card = statusSection.querySelector('.status-card');
  card.className = 'status-card success';
  statusIcon.textContent = '🎉';
  statusTitle.textContent = 'No Active Subscriptions!';
  statusMessage.textContent = 'You don\'t have any active Subscribe & Save subscriptions. All clear!';
  openPageBtn.style.display = 'none';
}

function addLog(message, type = 'pending') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = message;
  progressLog.appendChild(entry);
  progressLog.scrollTop = progressLog.scrollHeight;
}

resetBtn.addEventListener('click', () => {
  summarySection.style.display = 'none';
  statusSection.style.display = 'block';
  isProcessing = false;
  init();
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
// Start
init();
