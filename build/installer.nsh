; Netpals installer extras. electron-builder pulls this in through build.nsis.include in package.json.

; A Start menu shortcut for a forgotten password: it starts Netpals with --reset-password.
!macro customInstall
  CreateShortCut "$SMPROGRAMS\Reset Netpals password.lnk" "$INSTDIR\Netpals.exe" "--reset-password"
!macroend
!macro customUnInstall
  Delete "$SMPROGRAMS\Reset Netpals password.lnk"
!macroend

; The wizard's words: defined before the pages are made, so they shape the Welcome, License and Finish pages.
!macro customHeader
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Netpals Setup"
  !define MUI_WELCOMEPAGE_TEXT "This wizard will put Netpals on your computer: a 2003-style buddy list where the buddies are AI personas who IM you through the day.$\r$\n$\r$\nIt runs on your computer and talks to a model on your computer when it can. No account, no cloud, no ads.$\r$\n$\r$\nClick Next to continue."
  !define MUI_LICENSEPAGE_TEXT_TOP "The short version: the free version is free, a Plus key is one per person, your chats stay on your computer."
  !define MUI_FINISHPAGE_TITLE "You've got buddies"
  !define MUI_FINISHPAGE_TEXT "Netpals is installed. Your buddies are warming up the modem.$\r$\n$\r$\nFirst launch is a quick setup: a screen name, five questions, then Sign On."
!macroend
