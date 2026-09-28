; Picked up automatically by electron-builder (buildResources/installer.nsh).

; Uninstalling from Settings > Installed apps must not show an OK/Cancel prompt.
; electron-builder's one-click uninstaller always asks "Are you sure you want to
; uninstall PawOS?" unless it is run with /S, and has no option to turn that off,
; so the regular UninstallString is registered with /S (same as
; QuietUninstallString). In silent mode a running PawOS is still closed
; automatically before files are removed (CHECK_APP_RUNNING answers IDOK).
; Runs after registryAddInstallInfo, so it overrides the default value.
!macro customInstall
  ${if} $installMode == "all"
    StrCpy $0 "/allusers"
  ${else}
    StrCpy $0 "/currentuser"
  ${endIf}
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString '"$INSTDIR\${UNINSTALL_FILENAME}" $0 /S'
!macroend
