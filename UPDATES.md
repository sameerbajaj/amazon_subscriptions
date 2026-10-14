# Amazon Subscription Canceler — Release History

## v1.4.0: Live Active Subscription Counter Badge (Favicon & Toolbar)
- **Dual Live Badging**:
  - **Chrome Toolbar Extension Icon Badge**: Automatically displays the active subscription count directly on top of the extension icon in Chrome's toolbar (e.g. `12`) using Amazon Amber/Coral `#E11D48` notification styling.
  - **Amazon Browser Tab Favicon Badge**: Dynamically badges the open Amazon tab's `<link rel="icon">` in the browser tab bar with the active subscription count, making the tab recognizable even with dozens of tabs open.
- **Real-Time Live Decrement**:
  - Automatically updates and counts down in real-time as each item is canceled (in bulk or individually).
  - Cleanly clears and restores the original favicon and clears toolbar badge when all subscriptions are canceled (0 active).
- **Zero Extra Permissions**:
  - Runs on-demand when the popup opens and scans, utilizing existing `activeTab` and `scripting` capabilities.

## v1.3.1: Premium App Icon & Brand Redesign
- **High-End Apple / Chrome Pro Icon**:
  - Redesigned the entire extension icon from scratch with a radiant Amazon Amber-to-Sunset squircle (`#FFB300` → `#FF7D00` → `#E23800`), Apple-grade specular glass rim, and warm volumetric drop shadow.
  - Eliminated visual clutter (clunky badges, low-contrast inner box) in favor of a bold, mathematically symmetric Subscribe & Save cycle ring in porcelain white paired with a deep obsidian center cancel emblem.
  - Pixel-perfect legibility down to 16×16 px in the Chrome browser toolbar on both Light and Dark OS themes.
  - Exported crisp, 32-bit RGBA raster assets at 16×16, 32×32, 48×48, and 128×128 resolutions directly from the vector master [`icon.svg`](icon.svg).
- **Unified Popup Header**:
  - Synchronized popup header branding to render the high-res 32×32 px icon with matching border-radius and amber glow.

## v1.3.0: Accurate Scraper, Auto-Navigation to `subscriptionList`, & Delivery Sorting

### 1. 🎯 Fixed "All Cancellations Failed" Bug (Root Cause Resolved)
- **The Problem**: When navigating to `https://www.amazon.com/auto-deliveries`, Amazon defaults to the **"Upcoming delivery days"** calendar tab (shown in the screenshot). On that tab, cards represent delivery bundles and thumbnails contain ASINs (`B0...`), NOT subscription IDs. The old scraper fell back to ASINs and container IDs, which Amazon's `/ajax/cancelSubscription` endpoint rejected because ASINs are not valid subscription IDs!
- **The Fix**:
  1. The extension now automatically routes the active Amazon tab directly to **`https://www.amazon.com/auto-deliveries/subscriptionList`** (the actual "Your Subscriptions" tab where real contracts live).
  2. The in-page scraper now performs a background fetch of `https://www.amazon.com/auto-deliveries/subscriptionList` if on the delivery calendar page.
  3. Added strict ID validation that rejects ASINs (`B0...`) and non-subscription tokens.
  4. Form submission now includes Amazon's required cancellation reason dropdown (`sns-cancellation-dropdown: SnS_MYD_SnsCancelReason_sns_cancel_reason_other`).

### 2. 📅 New Sorting Feature: "Most Recent" & Upcoming Delivery
- **Sort by Delivery Date**:
  - Automatically extracts the upcoming delivery date (e.g. `Mon, Oct 19`, `Thu, Nov 19`, `Sat, Dec 19`, `Tue, Jan 19`).
  - Added a dedicated sort dropdown:
    - 📅 **Sort: Upcoming Delivery (Soonest)** *(Default)* — Puts the subscription delivering/billing soonest at the very top.
    - 🕒 **Sort: Latest Delivery (Farthest)**
    - 🔤 **Sort: Product Name (A → Z)**
    - 🔤 **Sort: Product Name (Z → A)**
- **Visual Delivery Date Badges**: Each subscription item card now displays a prominent amber badge showing its next delivery date (e.g., `📅 Mon, Oct 19`).

---

## v1.2.0: Redesign & Polish

### 1. 🎨 Beautiful, Modern UI Overhaul
- **Native Typography Stack**: Replaced external Google Fonts web requests with Apple's SF Pro system font stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display"`). Zero network latency, instant 0ms load, and crisp rendering on macOS.
- **Polished Command Center Aesthetic**: Clean dark obsidian design (`#0B0C10` base, `#13161F` surface cards, subtle 1px border `rgba(255, 255, 255, 0.06)`).
- **Refined Information Architecture**:
  - Compact brand header with high-contrast Amazon Amber logo mark, app title ("Unsub"), and live active status badge.
  - Subscriptions cards featuring clean 2-line title clamps, metadata pills (`📦 1 unit`, `⏱ Every 1 month`), and inline quick actions.
  - Smooth progress bar with active item status and live checkmark feed.
  - Celebratory completion view with summary stats and checkmarked list of canceled items.

### 2. ⚡ Reduced Unnecessary Steps & Friction
- **Seamless 1-Click Navigation**:
  - Previous behavior: If not on the Subscribe & Save dashboard, showed a "Wrong Page" error and forced opening a new tab, which immediately dismissed the extension popup.
  - New behavior: Automatically detects if the current tab is an Amazon page. Shows a single, friendly "Go to Subscriptions Dashboard" prompt that navigates the *current tab directly* and immediately scans once loaded—zero re-opening required.
- **Eliminated Competing Buttons & Confusion**:
  - Removed the confusing "Test One" button that competed directly with "Cancel Selected".
  - Cleaned up the primary action into a single, confident button: `Cancel All (N)` when all items are selected, or `Cancel Selected (N)` when filtering.
  - Individual items can be canceled in 1 click using the inline trash icon on each card.
- **Smart Adaptive Toolbar**:
  - Search bar automatically hides when there are 3 or fewer items, eliminating vertical clutter on short lists.
- **Fast, Non-Intrusive Confirmations**:
  - Clear modal confirmation card with blurred backdrop, explicit item counts, and single-click confirmation.

### 3. 🖼️ Real Extension Icons Added
- Previously, `icon16.png`, `icon48.png`, and `icon128.png` were placeholder SVG files renamed to `.png` (which Chrome failed to render properly).
- Created brand-new, pixel-perfect raster RGBA PNG icons across all required resolutions:
  - `icon16.png` (16×16 px)
  - `icon32.png` (32×32 px — Retina toolbar)
  - `icon48.png` (48×48 px)
  - `icon128.png` (128×128 px — Chrome Web Store / Extension manager)
- Custom design: Amazon-style delivery parcel encircled by Subscribe & Save circular arrows, featuring a crisp coral unsubscribe indicator.
- Updated `manifest.json` to v1.2.0 with all icon sizes declared.

### 4. 🛠️ Critical Bug Fixes
- Fixed a fatal `SyntaxError: Unexpected end of input` in `popup.js` caused by an unclosed `escapeHtml` function, which previously prevented the popup script from executing.
- Added graceful offline / local development preview fallback when testing outside of the extension runtime.
