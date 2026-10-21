# Kipdayo

A browser script that gets Bilibili videos ready to play in VRChat.

## How it works

Bilibili page URLs don't work directly in VRChat video players. Kipdayo adds a **Parse & Copy** button to Bilibili video pages. Click it to resolve a playable URL and copy it to your clipboard, then paste it into your VRChat video player.

> **Tip:** You can do all of this without leaving VR. Use a desktop overlay app like OVR Toolkit to open your browser and click the button from inside your headset.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser.
2. **[Install Kipdayo](https://raw.githubusercontent.com/xn-sakina/kipdayo/main/tampermonkey/kipdayo.user.js)** and confirm the installation in Tampermonkey.

If the install link doesn't open Tampermonkey, install the script manually:

1. Open the [script source](https://github.com/xn-sakina/kipdayo/blob/main/tampermonkey/kipdayo.user.js) and copy the entire file.
2. Open the Tampermonkey dashboard and select **Create a new script**.
3. Replace the default template with the copied code and save.
4. Reload the Bilibili video page.

## Migrating from older versions

Kipdayo now runs entirely as a Tampermonkey script for a simpler, more reliable experience. If you're using the old desktop app (.exe) or an earlier script, switch to the current script linked above. Those older versions no longer work reliably.

## Disclaimer

This project is for educational and research purposes only. Use it only with content you are authorized to access, and comply with Bilibili's Terms of Service, applicable laws, and content creators' rights. Do not use it to bypass access restrictions or redistribute content without permission.

Kipdayo is not affiliated with or endorsed by Bilibili or VRChat. It is provided as is, without warranties or guarantees of availability or compatibility. You are responsible for your use of the script. To the extent permitted by law, the maintainers are not liable for misuse or any resulting loss or damage.
