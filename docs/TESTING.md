# M1 test procedure

M1 exists to answer one question before speech recognition work begins:

> Can a Windows-local VS Code extension insert text into the OpenAI Codex composer while the active workspace is connected through Remote - WSL?

## Build

From a checkout of this repository:

```bash
npm install
npm run check
npm run package:vsix
```

This creates:

```text
universal-dictate-dev.vsix
```

## Install into a WSL-connected VS Code window

1. Open the normal Windows VS Code desktop application.
2. Connect the window to WSL and open any WSL workspace.
3. Open Extensions (`Ctrl+Shift+X`).
4. From the Extensions view `...` menu choose **Install from VSIX...**.
5. Select `universal-dictate-dev.vsix` and reload if requested.

## Verify execution location

Run:

```text
Universal Dictate: Show Diagnostics
```

Expected values include:

```text
platform=win32
remote=wsl
```

The exact remote string may identify the WSL remote more specifically. The critical result is `platform=win32` while the VS Code window is connected to WSL.

You can also run **Developer: Show Running Extensions** and verify that Universal Dictate is running locally rather than in the WSL extension host.

If `platform=linux`, stop. Do not proceed to microphone or ASR work until extension placement is corrected.

## Codex insertion test

1. Open the OpenAI Codex extension panel.
2. Click its composer so the caret is visibly blinking there.
3. Do not open the Command Palette because that intentionally changes focus.
4. Press:

```text
Ctrl+Alt+D
```

Expected result:

```text
[Universal Dictate probe]
```

appears at the Codex composer caret and is **not submitted**.

## Clipboard test

Before pressing the shortcut, copy a recognizable value such as:

```text
clipboard-sentinel
```

After probe insertion, paste somewhere else manually. The clipboard should still contain `clipboard-sentinel`.

## Failure classifications

### Probe appears in Codex

M1 passes. Proceed to native Windows input handling.

### Probe appears somewhere else

Focus is being lost between shortcut handling and synthetic paste. Investigate focus timing/input injection before proceeding.

### Nothing is inserted, but diagnostics show `platform=win32`

The extension is placed correctly. Investigate the temporary `SendKeys` mechanism or Codex control behavior.

### Diagnostics show `platform=linux`

The development/installation path put the extension in WSL. Correct extension placement first.

## Scope of this probe

The PowerShell `System.Windows.Forms.SendKeys` mechanism is disposable prototype code. Passing M1 does not make it the production insertion implementation. Production code should use a small native Windows helper and Win32 `SendInput` or an equivalent reviewed mechanism.
