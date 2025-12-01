# Amazon Subscription Canceler

A Chrome extension to easily view and cancel your Amazon Subscribe & Save subscriptions.

## Features

- 🔍 **Automatic Detection** - Instantly detects all your Amazon subscriptions
- 📋 **Clean Interface** - Beautiful popup showing all your subscriptions
- 🧪 **Test Mode** - Test by canceling just one subscription first
- 🗑️ **Bulk Cancel** - Cancel all subscriptions with one click
- 📊 **Progress Tracking** - Real-time progress and detailed logs
- ✅ **Summary Report** - See exactly what was canceled
- ⚡ **Improved Algorithm** - Uses form-based submission for better reliability

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the extension folder

## Usage

1. Go to your Amazon Subscribe & Save page:
   - Amazon.com → Account & Lists → Subscribe & Save
   - Or visit: `https://www.amazon.com/gp/subscribe-and-save/manager/viewsubscriptions`

2. Click the extension icon in your browser toolbar

3. The popup will show:
   - ✅ Number of subscriptions detected
   - 📋 List of all your subscriptions
   - 🧪 "Test Cancel One" button - Cancel just the first subscription as a test
   - 🗑️ "Cancel All Subscriptions" button - Cancel everything

4. Choose your action:
   - **Test first** (recommended): Click "Test Cancel One" to verify it works
   - **Bulk cancel**: Click "Cancel All Subscriptions" to cancel everything

5. Watch the progress in real-time

6. Review the summary when complete

## How It Works

The extension uses an improved cancellation method:

1. **Scans** the Amazon page for subscription data
2. **Fetches** the cancellation modal for each subscription
3. **Extracts** the actual HTML form element (including CSRF token and all hidden fields)
4. **Submits** the form data to Amazon's cancellation endpoint
5. **Waits** 1 second between each cancellation to avoid rate limiting
6. **Reports** the results with success/failure counts

This approach is more reliable than manually parsing HTML because it uses Amazon's actual form structure.

## Privacy & Security

- ✅ **No data collection** - Everything runs locally in your browser
- ✅ **No external servers** - Communicates only with Amazon
- ✅ **No credentials stored** - Uses your existing Amazon session
- ✅ **Open source** - You can review all the code
- ✅ **Form-based submission** - Uses Amazon's native cancellation forms

## Important Notes

⚠️ **This permanently cancels subscriptions** - There's no undo button!

- Test with one subscription first before bulk canceling
- Make sure you're on the correct Amazon account
- The extension only works on Amazon.com (US)
- You must be logged into Amazon
- Cancellations are processed sequentially (1 per second) to avoid rate limiting

## Troubleshooting

**"Not on Amazon" error**
- Make sure you're on amazon.com

**"Wrong Page" error**
- Navigate to: Account & Lists → Subscribe & Save → Manage Subscriptions

**"No Subscriptions" found**
- Refresh the Amazon page
- Make sure you have active subscriptions

**Cancellation failed**
- Try refreshing the page and running again
- Check that you're still logged in
- Some subscriptions may require manual cancellation
- Check your email for cancellation confirmations

## Technical Details

- **Manifest Version**: 3
- **Permissions**: activeTab, scripting
- **Host Permissions**: https://www.amazon.com/*
- **Cancellation Method**: Form-based submission (more reliable)
- **No background scripts** - Runs only when you click the icon

## Comparison with Console Script

This extension improves upon the simple console script approach:

**Console Script:**
- ✅ Simple and fast (parallel execution)
- ❌ No UI or progress tracking
- ❌ Requires pasting code into DevTools
- ❌ Hard to share with non-technical users

**This Extension:**
- ✅ Beautiful, user-friendly interface
- ✅ Real-time progress tracking
- ✅ Test mode for safety
- ✅ Error handling and reporting
- ✅ Easy to install and share
- ✅ Uses the same reliable form-based approach

## License

MIT License - Feel free to use and modify

## Disclaimer

This extension is not affiliated with or endorsed by Amazon. Use at your own risk.

## Credits

Inspired by community scripts for Amazon subscription management. Improved with a user-friendly interface and better error handling.

---

Made with ❤️ for people tired of managing subscriptions manually
