# Known degradations

- eac-core-bridge reports disconnected and stops calls when no extension host is available.
- file-drop-eac shows an explicit unsupported message for directory drops; normal files remain bounded by size and path authorization.
- The skin plugin (`ui-skin-loader`) is temporarily unavailable in this beta delivery and must not be enabled or counted as passed.
- Plugin protection (`plugin-shield`) is temporarily unavailable in this beta delivery; its checks, backups, and restore actions are not part of the supported acceptance surface.
- client-file-changes only restores a single test-workspace file and refuses to overwrite changed content.
- Native open-in-default-program actions depend on official Desktop support; missing actions are disabled with an explanation.
