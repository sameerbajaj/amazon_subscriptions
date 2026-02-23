// State management
let subscriptions = [];
let isProcessing = false;

// DOM Elements
const statusSection = document.getElementById('statusSection');
const statusIcon = document.getElementById('statusIcon');
const statusTitle = document.getElementById('statusTitle');
const statusMessage = document.getElementById('statusMessage');
const subscriptionsSection = document.getElementById('subscriptionsSection');
const subscriptionsList = document.getElementById('subscriptionsList');
const countBadge = document.getElementById('countBadge');
const actionButtons = document.getElementById('actionButtons');
const testBtn = document.getElementById('testBtn');
const cancelAllBtn = document.getElementById('cancelAllBtn');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const progressLog = document.getElementById('progressLog');
const summarySection = document.getElementById('summarySection');
const successCount = document.getElementById('successCount');
const failedCount = document.getElementById('failedCount');
const resetBtn = document.getElementById('resetBtn');
const openPageBtn = document.getElementById('openPageBtn');

// Initialize
async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Check if on Amazon subscriptions page
    if (!tab.url || !tab.url.includes('amazon.com')) {
      showError(
        'Not on Amazon',
        'Please navigate to Amazon first, then click the button below.',
        true
      );
      return;
    }

    if (!tab.url.includes('subscribe-and-save') && !tab.url.includes('auto-deliveries')) {
      showError(
        'Wrong Page',
        'You need to be on the Subscribe & Save page. Click below to open it.',
        true
      );
      return;
    }

    // Detect subscriptions
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
        const cards = document.querySelectorAll('[data-subscription-id]');
        const subs = [];

        cards.forEach(card => {
          const subscriptionId = card.getAttribute('data-subscription-id');
          // Normalize whitespace in text for better matching
          const text = card.textContent.replace(/\s+/g, ' ').trim();

          // Try multiple methods to get the product title
          let title = 'Unknown Product';

          // Method 1: Look for img alt text (often has product name)
          const img = card.querySelector('img[alt]');
          if (img && img.alt.length > 20) {
            title = img.alt;
          }

          // Method 2: Look for product title element (but filter out short text)
          if (title === 'Unknown Product') {
            const titleElements = card.querySelectorAll('.product-title, [id*="product-title"], .a-size-base-plus, .a-text-bold, a');
            for (const el of titleElements) {
              const elText = el.textContent.trim();
              // Must be longer than 20 chars and not contain certain keywords
              if (elText.length > 20 &&
                !elText.includes('Saving') &&
                !elText.includes('Edit') &&
                !elText.includes('Cancel') &&
                !elText.includes('Next delivery')) {
                title = elText;
                break;
              }
            }
          }

          // Method 3: Extract from text using "Next delivery" marker
          if (title === 'Unknown Product') {
            const match = text.match(/([A-Z].{20,250}?)\s+Next delivery/);
            if (match) {
              title = match[1].trim();
            }
          }

          // Extract quantity and frequency
          let quantity = '1';
          let frequency = 'Unknown';

          // Try multiple patterns for frequency
          // Pattern 1: "1 x 6 months" or "2 x 3 months"
          let match = text.match(/(\d+)\s*x\s*(\d+\s+\w+)/i);
          if (match) {
            quantity = match[1];
            frequency = match[2];
          }

          // Pattern 2: "1 unit every 6 months" or "2 units every 3 months"
          if (frequency === 'Unknown') {
            match = text.match(/(\d+)\s+units?\s+every\s+(\d+\s+\w+)/i);
            if (match) {
              quantity = match[1];
              frequency = match[2];
            }
          }

          // Pattern 3: Just "6 months" or "3 months" (quantity defaults to 1)
          if (frequency === 'Unknown') {
            match = text.match(/(\d+\s+(?:month|week|day)s?)/i);
            if (match) {
              frequency = match[1];
            }
          }

          subs.push({ subscriptionId, title, quantity, frequency });
        });

        return subs;
      }
    });

    subscriptions = results[0].result;

    if (subscriptions.length === 0) {
      showSuccess();
      return;
    }

    showSubscriptions();

  } catch (error) {
    showError('Detection Failed', error.message, false);
  }
}

// Show subscriptions in UI
function showSubscriptions() {
  statusSection.style.display = 'none';
  subscriptionsSection.style.display = 'block';
  actionButtons.style.display = 'flex';

  // Remove duplicates based on subscriptionId
  const uniqueSubs = [];
  const seenIds = new Set();

  subscriptions.forEach(sub => {
    if (!seenIds.has(sub.subscriptionId)) {
      seenIds.add(sub.subscriptionId);
      uniqueSubs.push(sub);
    }
  });

  subscriptions = uniqueSubs;
  countBadge.textContent = subscriptions.length;

  subscriptionsList.innerHTML = subscriptions.map((sub, index) => {
    // Clean the title - remove any HTML tags and extra whitespace
    const cleanTitle = sub.title
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ')     // Normalize whitespace
      .trim();

    const displayTitle = cleanTitle.substring(0, 80) + (cleanTitle.length > 80 ? '...' : '');

    return `
      <div class="subscription-item" data-index="${index}" data-sub-id="${escapeHtml(sub.subscriptionId)}">
        <div class="subscription-content">
          <div class="subscription-title">${escapeHtml(displayTitle)}</div>
          <div class="subscription-meta">${escapeHtml(sub.quantity)} × ${escapeHtml(sub.frequency)}</div>
        </div>
        <div class="subscription-actions">
          <button class="btn-small btn-cancel" data-index="${index}">Cancel</button>
        </div>
      </div>
    `;
  }).join('');

  // Add event listeners to individual cancel buttons
  document.querySelectorAll('.btn-cancel').forEach(btn => {
    btn.addEventListener('click', handleIndividualCancel);
  });
}

// Show different status messages
function showError(title, message, showButton) {
  const card = statusSection.querySelector('.status-card');
  card.className = 'status-card error';
  statusIcon.textContent = '❌';
  statusTitle.textContent = title;
  statusMessage.textContent = message;
  openPageBtn.style.display = showButton ? 'block' : 'none';
}

function showWarning(title, message) {
  const card = statusSection.querySelector('.status-card');
  card.className = 'status-card warning';
  statusIcon.textContent = '⚠️';
  statusTitle.textContent = title;
  statusMessage.textContent = message;
  openPageBtn.style.display = 'none';
}

function showSuccess() {
  const card = statusSection.querySelector('.status-card');
  card.className = 'status-card success';
  statusIcon.textContent = '🎉';
  statusTitle.textContent = 'No Active Subscriptions!';
  statusMessage.textContent = 'You don\'t have any active Subscribe & Save subscriptions. You\'re all set!';
  openPageBtn.style.display = 'none';
}

// Open subscriptions page button
openPageBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: 'https://www.amazon.com/auto-deliveries/subscriptionList'
  });
});

// Handle individual cancel button click
async function handleIndividualCancel(event) {
  const btn = event.target;
  const index = parseInt(btn.getAttribute('data-index'));
  const sub = subscriptions[index];

  if (!sub || isProcessing) return;

  // Show confirmation
  if (!confirm(`Cancel this subscription?\n\n${sub.title.substring(0, 100)}${sub.title.length > 100 ? '...' : ''}`)) {
    return;
  }

  // Disable button and mark as canceling
  btn.disabled = true;
  btn.textContent = 'Canceling...';
  const item = document.querySelector(`[data-index="${index}"]`);
  if (item) item.classList.add('canceling');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: cancelSingleSubscription,
      args: [sub.subscriptionId]
    });

    if (result[0].result.success) {
      // Mark as canceled with animation
      if (item) {
        item.classList.remove('canceling');
        item.classList.add('canceled');
      }

      // Show brief success message
      btn.textContent = '✓ Canceled';

      // Wait 1 second, then reload Amazon page and re-detect
      setTimeout(async () => {
        // Reload the Amazon page to get fresh data
        await chrome.tabs.reload(tab.id);

        // Wait for page to load
        setTimeout(async () => {
          // Re-detect subscriptions
          statusSection.style.display = 'block';
          subscriptionsSection.style.display = 'none';
          actionButtons.style.display = 'none';

          statusIcon.textContent = '⏳';
          statusTitle.textContent = 'Refreshing...';
          statusMessage.textContent = 'Checking for remaining subscriptions...';

          await detectSubscriptions(tab.id);
        }, 1500); // Wait 1.5 seconds for page to reload
      }, 1000);

    } else {
      // Failed - revert UI
      btn.disabled = false;
      btn.textContent = 'Cancel';
      if (item) item.classList.remove('canceling');
      alert('Failed to cancel subscription. Please try again.');
    }
  } catch (error) {
    btn.disabled = false;
    btn.textContent = 'Cancel';
    if (item) item.classList.remove('canceling');
    alert('Error: ' + error.message);
  }
}

// Test cancel one subscription
testBtn.addEventListener('click', async () => {
  if (isProcessing || subscriptions.length === 0) return;

  if (!confirm('This will cancel 1 subscription as a test. Continue?')) return;

  isProcessing = true;
  testBtn.disabled = true;
  cancelAllBtn.disabled = true;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await cancelSubscriptions(tab.id, [subscriptions[0]], true);
});

// Cancel all subscriptions
cancelAllBtn.addEventListener('click', async () => {
  if (isProcessing || subscriptions.length === 0) return;

  if (!confirm(`This will cancel ALL ${subscriptions.length} subscriptions. Are you sure?`)) return;

  isProcessing = true;
  actionButtons.style.display = 'none';
  subscriptionsSection.style.display = 'none';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await cancelSubscriptions(tab.id, subscriptions.slice(), false);
});

// Cancel subscriptions
async function cancelSubscriptions(tabId, subsToCancel, isTest) {
  progressSection.style.display = 'block';
  progressLog.innerHTML = '';

  let successfulCancels = 0;
  let failedCancels = 0;
  const canceledItems = [];

  for (let i = 0; i < subsToCancel.length; i++) {
    const sub = subsToCancel[i];
    const progress = ((i + 1) / subsToCancel.length) * 100;

    progressFill.style.width = `${progress}%`;
    progressText.textContent = `${i + 1} / ${subsToCancel.length}`;

    addLog(`Canceling: ${sub.title.substring(0, 50)}...`, 'pending');

    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: cancelSingleSubscription,
        args: [sub.subscriptionId]
      });

      if (result[0].result.success) {
        successfulCancels++;
        canceledItems.push(sub);
        addLog(`✓ ${sub.title.substring(0, 50)}`, 'success');

        // Mark as canceled in list
        const item = subscriptionsList.querySelector(`[data-index="${subscriptions.indexOf(sub)}"]`);
        if (item) item.classList.add('canceled');
      } else {
        failedCancels++;
        addLog(`✗ Failed: ${sub.title.substring(0, 40)}`, 'error');
      }
    } catch (error) {
      failedCancels++;
      addLog(`✗ Error: ${sub.title.substring(0, 40)}`, 'error');
    }

    // Wait 1 second between cancellations
    if (i < subsToCancel.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Show summary with canceled items
  showSummary(successfulCancels, failedCancels, canceledItems);

  // Auto-refresh Amazon page after showing summary briefly
  if (successfulCancels > 0) {
    setTimeout(async () => {
      // Reload the Amazon page
      await chrome.tabs.reload(tabId);

      // Wait for page to load, then re-detect
      setTimeout(async () => {
        progressSection.style.display = 'none';
        summarySection.style.display = 'none';
        statusSection.style.display = 'block';

        statusIcon.textContent = '⏳';
        statusTitle.textContent = 'Refreshing...';
        statusMessage.textContent = 'Checking for remaining subscriptions...';

        await detectSubscriptions(tabId);
        isProcessing = false;
      }, 1500); // Wait 1.5 seconds for page reload
    }, 2500); // Show summary for 2.5 seconds
  } else {
    isProcessing = false;
  }
}

// Show summary with list of canceled items
function showSummary(successful, failed, canceledItems) {
  progressSection.style.display = 'none';
  summarySection.style.display = 'block';
  successCount.textContent = successful;
  failedCount.textContent = failed;

  // Add list of canceled items to summary
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

// Function to execute in the page context to cancel a subscription
// 
// CREDITS: Form-based cancellation approach inspired by and borrowed from:
// https://gist.github.com/L422Y/53b75be4bb8afd5cd6143e74150cc142
// by @L422Y (https://github.com/L422Y)
//
// Key improvements from the original script:
// 1. Uses actual <form> element instead of manual HTML parsing
// 2. FormData API automatically captures all fields (CSRF token, hidden fields)
// 3. Submits form data exactly as Amazon expects
//
// Our additions: UI, progress tracking, individual cancel, error handling, auto-refresh
async function cancelSingleSubscription(subscriptionId) {
  try {
    // Fetch the cancel modal
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

    // Parse the HTML to find the form
    const div = document.createElement('div');
    div.innerHTML = cancelPanel;
    div.style.display = 'none';
    document.body.appendChild(div);

    // Find the cancel form
    const form = div.querySelector("form[name='cancelForm']");

    if (!form) {
      div.remove();
      return { success: false, reason: 'no_form_found' };
    }

    // Extract all form data (this automatically gets CSRF token and all fields)
    const formData = new FormData(form);
    const formEntries = Object.fromEntries(formData.entries());

    // Submit the cancellation
    const cancelResponse = await fetch(form.action, {
      method: form.method || 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(formEntries),
      redirect: 'manual'
    });

    // Clean up
    div.remove();

    // Check if successful (302 redirect or 200 OK)
    if (cancelResponse.status === 0 || cancelResponse.status === 302 || cancelResponse.status === 200) {
      return { success: true };
    }

    return { success: false, status: cancelResponse.status };

  } catch (error) {
    // CORS/redirect errors often indicate success
    if (error.message && (error.message.includes('redirect') || error.message.includes('CORS'))) {
      return { success: true };
    }
    return { success: false, error: error.message };
  }
}

// Add log entry
function addLog(message, type = 'pending') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = message;
  progressLog.appendChild(entry);
  progressLog.scrollTop = progressLog.scrollHeight;
}

// Reset button
resetBtn.addEventListener('click', () => {
  summarySection.style.display = 'none';
  subscriptionsSection.style.display = 'none';
  statusSection.style.display = 'block';
  isProcessing = false;
  init();
});

// Utility function
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Start
init();
