# Install and uninstall

Target: official DSH Desktop / kernel 0.1.7-rc.2.

SHA256: 7A328030E4BA8472BC5F53E439BD969F8212F6AFFE73F339865CC9C95023D187

1. In the official Electron Desktop, select this file in the built-in plugin
   manager. The managed `desktop` profile is intentionally GUI-only; the
   official CLI rejects direct changes to that profile.

2. Let the official manager install the package and restart Desktop. Do not copy member packages or append member insert rows to the profile patch.
3. Uninstall only @dsh-eac/desktop-pack. Do not delete DSH_HOME, sessions, credentials, or workspace files.
4. Reinstall is expected to be idempotent. Restart twice and follow ACCEPTANCE.md.

This beta package does not provide the skin plugin (`ui-skin-loader`) or plugin
protection (`plugin-shield`). Do not enable either entry or treat it as
available; both are deferred to a follow-up delivery.
