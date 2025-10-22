# Tampermonkey Installation Guide

## Automatic installation (recommended)
1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension for your browser.
2. Open the following install link in a new tab: [`Install Kipdayo`](https://raw.githubusercontent.com/kipdayo/kipdayo/main/tampermonkey/kipdayo.user.js).
3. Tampermonkey should prompt you to review the script and then confirm installation. Accept the prompt to finish.

If the install page does not load because of network restrictions, fall back to the manual method below.

## Manual installation (fallback)
1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension for your browser.
2. Open Tampermonkey’s dashboard and click **“Create a new script…”**.
3. Delete the default template and copy the entire contents of `tampermonkey/kipdayo.user.js` into the editor.
4. (Optional) Only if you explicitly want to forward your Bilibili login state, change the `ENABLE_SESSDATA` flag at the top of the script to `true`. By default it remains `false` for safety.
5. Save the script and visit any `https://www.bilibili.com/video/BV...` page to use the floating Kipdayo control.

This script is provided solely for research and learning purposes.
