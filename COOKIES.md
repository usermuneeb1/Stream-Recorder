# 🍪 Setting up YouTube Cookies (5 minutes, one-time)

## Why you need this

The streamer's recent stream (`WOqZf9Myz_c` on 2026-06-27) was set to **sign-in-required**. The cookieless recorder hit `LOGIN_REQUIRED` on every method and bailed → no recording.

You can see the stream because you're logged into YouTube. The recorder isn't logged in → can't see it. **Cookies fix this** by giving the recorder a logged-in session.

## What "cookies" actually are

A small text file (`cookies.txt`) that contains your YouTube login session. Pasting it into a GitHub secret lets the recorder act as "logged in" temporarily.

⚠️ **Use a throwaway YouTube account if you can.** The cookies give the recorder full access to that account.

## Setup steps

### 1. Install the cookie exporter (Chrome/Brave/Edge)

Install this extension:
**Get cookies.txt LOCALLY** → <https://chrome.google.com/webstore/detail/get-cookies-txt-locally/cclelndahbckbenkjhflpdbgdldlbecc>

(or for Firefox: <https://addons.mozilla.org/en-US/firefox/addon/cookies-txt-one-click/>)

### 2. Export the cookies

1. Open **<https://www.youtube.com>** in the browser where you installed the extension.
2. Make sure you're **signed in**.
3. Click the extension icon in the toolbar.
4. Click **Export** (or **Get cookies.txt** depending on version).
5. A file named `youtube.com_cookies.txt` (or similar) downloads.
6. Open it in Notepad / TextEdit / VS Code.
7. Select **ALL** the text (Ctrl+A) → Copy (Ctrl+C).

The file should look like this at the top:
```
# Netscape HTTP Cookie File
# https://curl.se/docs/http-cookies.html
# ...
.youtube.com	TRUE	/	TRUE	1234567890	SID	abc123...
```

### 3. Paste into GitHub secret

1. Go to <https://github.com/usermuneeb1/Stream-Recorder/settings/secrets/actions>
2. Find the secret named **`YOUTUBE_COOKIES`**:
   - If it exists → click it → **Update**
   - If it doesn't exist → click **New repository secret** → name it `YOUTUBE_COOKIES`
3. Paste the entire text you copied (raw text, NOT base64-encoded).
4. Click **Add secret** / **Update secret**.

### 4. That's it

The very next recording run (within 5 min from the pinger) will use the cookies. No code change needed, no workflow trigger needed.

## How long cookies last

- YouTube session cookies typically last **30-60 days**.
- The system will Discord-alert you when they're getting old (in HYBRID mode the alert is throttled to once every 12h so it won't spam you).
- When you see the alert, repeat steps 1–3 to refresh.

## Verifying it worked

Open the next recorder run on the Actions tab:
- Look for the **🍪 Check Cookie Health** step
- Should say `COOKIE_STATUS=valid` (or `valid_unverified`)
- Methods A and B will then run during recording and catch any restricted streams

## Why not just always cookieless?

We tried that. It fails on:
- Sign-in-required streams (`LOGIN_REQUIRED`) ← yesterday's failure
- Age-restricted streams (`age_limit > 0`)
- Members-only streams
- Some "Made for kids" content

Cookieless catches ~95% of public streams. Cookies catch the other 5%. The **HYBRID** mode (now the default) tries cookieless first (safest, fastest) and falls back to cookies only if all cookieless methods fail.
