# 📦 Amazon Subscribe & Save Canceler (`Unsub`) — Agent Guide

## 🚨 PRIMARY REFERENCE & SOURCE OF TRUTH
> [!IMPORTANT]
> **IF CANCELLATIONS OR SCRAPING BREAK, CHECK THIS GIST FIRST:**
> **Gist Reference**: [`https://gist.github.com/L422Y/53b75be4bb8afd5cd6143e74150cc142`](https://gist.github.com/L422Y/53b75be4bb8afd5cd6143e74150cc142) by [@L422Y](https://github.com/L422Y)
> 
> Amazon frequently updates their internal Subscribe & Save markup, endpoints, and cancellation form validations. The gist above is the primary community reference that tracks Amazon's frontend breaking changes. Always diff current scraping and AJAX payload logic against the latest revisions of this gist.

---

## 🏗️ Architecture & Critical Invariants

### 1. Canonical Target URL
- **Subscriptions Page (Correct)**: `https://www.amazon.com/auto-deliveries/subscriptionList` (where active contract cards live).
- **Calendar Deliveries Page (Do NOT scrape directly for IDs)**: `https://www.amazon.com/auto-deliveries` (shows "Upcoming delivery days" calendar bundles).
- **Invariant**: Subscriptions can ONLY be inspected and canceled from `subscriptionList`. If the active tab is on `/auto-deliveries`, the extension must route the tab to `https://www.amazon.com/auto-deliveries/subscriptionList` or perform a background authenticated fetch of that page.

### 2. Subscription ID Discovery Rules
- **Amazon Redesign Deprecation**: The legacy `[data-subscription-id]` attribute was completely deprecated and removed by Amazon.
- **Where IDs Live Now**:
  1. `[data-edit-url]`: `el.getAttribute('data-edit-url').match(/subscriptionId=([\w-]+)/)`
  2. Edit links: `a[href*="subscriptionId="]`, `a[href*="subscriptionId%3D"]`
  3. Global HTML regex fallback: `const re = /subscriptionId=([\w-]+)/g;` over `document.documentElement.innerHTML`.
- **ASIN Rejection Guard**:
  - Never accept ASINs (`/^B0[A-Z0-9]{8}$/i`) or container IDs (`csa-`, `delivery-`) as subscription IDs. ASINs are product catalog numbers and will always cause `cancelSubscription` to fail with 404 or `no_cancel_form_found`.

### 3. Cancellation Form Submission & Validation
- **Endpoint**:
  `https://www.amazon.com/auto-deliveries/ajax/cancelSubscription?deviceType=desktop&deviceContext=web&subscriptionId=${subscriptionId}`
- **Form Parsing**:
  - Fetch the cancel modal HTML and locate `form[name='cancelForm']`.
- **Mandatory Reason Payload**:
  - Always inject Amazon's required cancellation dropdown parameter:
    ```javascript
    formData.set('sns-cancellation-dropdown', 'SnS_MYD_SnsCancelReason_sns_cancel_reason_other');
    ```
    Omitting this field can cause Amazon's server-side validation to reject the POST request.
- **Verification**:
  - Amazon deletes the cancellation form once an item is successfully cancelled.
  - Verify by refetching `cancelSubscription?subscriptionId=${subscriptionId}`. If `form[name='cancelForm']` is no longer present in the response, cancellation is 100% verified.

### 4. Sorting & UI Delivery Dates
- Extracted delivery dates (e.g. `Next delivery: Nov 19` or `Arriving Mon, Oct 19`) are parsed into timestamps via `parseDateToTimestamp()`.
- Default sort is **Upcoming Delivery (Soonest First)** so users can immediately target and cancel the subscriptions scheduled to ship and charge soonest.

---

## 🛠️ Key Files
- [`manifest.json`](file:///Users/sameerbajaj/PARA/Projects/dev/small%20utilities/amazon_subscriptions/manifest.json): MV3 manifest with 16, 32, 48, 128px PNG icons.
- [`popup.html`](file:///Users/sameerbajaj/PARA/Projects/dev/small%20utilities/amazon_subscriptions/popup.html): Popup structure with sticky toolbar, sort controls, and confirmation sheets.
- [`popup.css`](file:///Users/sameerbajaj/PARA/Projects/dev/small%20utilities/amazon_subscriptions/popup.css): Linear/macOS dark command center styling.
- [`popup.js`](file:///Users/sameerbajaj/PARA/Projects/dev/small%20utilities/amazon_subscriptions/popup.js): Scraper, sorter, and verified form cancellation execution.
