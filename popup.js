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

// Initialize
async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Check if on Amazon subscriptions page
    if (!tab.url || !tab.url.includes('amazon.com')) {
      showError('Not on Amazon', 'Please navigate to your Amazon Subscribe & Save page first.');
      return;
    }

    if (!tab.url.includes('subscribe-and-save') && !tab.url.includes('auto-deliveries')) {
      showError('Wrong Page', 'Please go to: Amazon.com → Account & Lists → Subscribe & Save');
      return;
    }

    // Detect subscriptions
    await detectSubscriptions(tab.id);

  } catch (error) {
    showError('Error', error.message);
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
          const text = card.textContent;
          const titleMatch = text.match(/([A-Z].{20,200}?)\s+Next delivery/);
          const title = titleMatch ? titleMatch[1].trim() : 'Unknown Product';
          const frequencyMatch = text.match(/(\d+)\s+units?\s+every\s+(\d+\s+\w+)/i);
          const quantity = frequencyMatch ? frequencyMatch[1] : '1';
          const frequency = frequencyMatch ? frequencyMatch[2] : 'Unknown';

          subs.push({ subscriptionId, title, quantity, frequency });
        });

        return subs;
      }
    });

    subscriptions = results[0].result;

    if (subscriptions.length === 0) {
      showWarning('No Subscriptions', 'No subscriptions found on this page. Make sure you\'re on the subscriptions list page.');
      return;
    }

    showSubscriptions();

  } catch (error) {
    showError('Detection Failed', error.message);
  }
}

// Show subscriptions in UI
function showSubscriptions() {
  statusSection.style.display = 'none';
  subscriptionsSection.style.display = 'block';
  actionButtons.style.display = 'flex';

  countBadge.textContent = subscriptions.length;

  subscriptionsList.innerHTML = subscriptions.map((sub, index) => `
    <div class="subscription-item" data-index="${index}">
      <div class="subscription-title">${escapeHtml(sub.title.substring(0, 80))}${sub.title.length > 80 ? '...' : ''}</div>
      <div class="subscription-meta">${sub.quantity} × ${sub.frequency}</div>
    </div>
  `).join('');
}

// Show different status messages
function showError(title, message) {
  const card = statusSection.querySelector('.status-card');
  card.className = 'status-card error';
  statusIcon.textContent = '❌';
  statusTitle.textContent = title;
  statusMessage.textContent = message;
}

function showWarning(title, message) {
  const card = statusSection.querySelector('.status-card');
  card.className = 'status-card warning';
  statusIcon.textContent = '⚠️';
  statusTitle.textContent = title;
  statusMessage.textContent = message;
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
  await cancelSubscriptions(tab.id, subscriptions, false);
});

// Cancel subscriptions
async function cancelSubscriptions(tabId, subsToCancel, isTest) {
  progressSection.style.display = 'block';
  progressLog.innerHTML = '';

  let successfulCancels = 0;
  let failedCancels = 0;

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

  // Show summary
  progressSection.style.display = 'none';
  summarySection.style.display = 'block';
  successCount.textContent = successfulCancels;
  failedCount.textContent = failedCancels;
}

// Function to execute in the page context to cancel a subscription
// Improved version using form-based approach (inspired by GitHub script)
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
