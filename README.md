# SmackChat
A Deadlock mod that sends a random hero-specific line in All Chat after a kill. Currently supports Solomon and Billy.

## Build on Windows
1. Clone this repo or pull the latest changes.
2. Install Reduced CSDK 13 (https://deadlockmodding.pages.dev/modding-tools/csdk-13?utm_source=chatgpt.com) & extract the Windows x64 release of Source 2 Viewer CLI (https://github.com/ValveResourceFormat/ValveResourceFormat/releases).
3. Open PowerShell in the folder containing `build.ps1`. Run the command below with your own paths.

```powershell
.\build.ps1 `
  -CsdkRoot 'C:\path\to\Reduced_CSDK_13' `
  -ResourceCompiler 'C:\path\to\Reduced_CSDK_13\game\bin\win64\resourcecompiler.exe' `
  -Source2ViewerCli 'C:\path\to\Source2Viewer-CLI.exe'
```

Use the CSDK folder that contains `content` & `game`. If PowerShell blocks the script, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned` in the same window & retry.

## Install
Add `dist\SmackChat.vpk` with the Mod Manager as normal.
