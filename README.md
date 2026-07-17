# Quick Logcat

浏览器里看 Android logcat 日志的轻量工具，用来替代 Android Studio 自带的 Logcat 面板——不用为了看几行日志打开整个 IDE，省内存、省磁盘、开得快。本地起一个 Node server，通过 adb 拉取日志，网页端实时展示、过滤、搜索。

## 运行

### 方式一：npx（推荐）

```bash
npx quick-logcat
```

需要本机已装 Node.js ≥ 18（用你系统自己的 Node，这个包本身不到 60KB，不再打包任何运行时）。首次运行会自动打开浏览器，再次运行如果已经在跑就直接复用、打开浏览器。

### 方式二：macOS 独立包

如果你拿到的是打包好的文件夹（不走 npm）：

```bash
./start.command   # 或 ./start.sh
```

这种方式会调用一份独立打包的 node 运行时（按 arm64/x64 区分），同样无需自行安装 Node。

两种方式跑的是同一份 server 代码，adb 的探测/安装逻辑完全一致。

## adb（Android Debug Bridge）

**不随包分发**，需要你本机已安装 Android SDK Platform Tools。这是 Android 开发者机器上通常已有的工具（装过 Android Studio 或做过真机调试的话大概率已经装了）。没有的话参考下面的安装指引。

server 启动时会自动检测 adb：

- 优先看 PATH 里有没有可用的 `adb`；
- 找不到的话，再检查常见的 Android SDK 默认安装目录（`$ANDROID_HOME`、`$ANDROID_SDK_ROOT`，以及 macOS 的 `~/Library/Android/sdk`、Linux 的 `~/Android/Sdk`、Windows 的 `%LOCALAPPDATA%\Android\Sdk`）；
- 两者都找不到时，服务照常启动，但设备列表接口会返回清晰的安装提示，终端里也会打印同样的提示。

如果你想手动指定 adb 路径，设置环境变量 `ADB_PATH` 即可覆盖以上探测逻辑，例如：

```bash
ADB_PATH=/path/to/adb npx quick-logcat
```

## 没有安装 adb？

不管走 `npx quick-logcat` 还是 `start.command` / `start.sh`，macOS / Linux 下启动时都会自动调用 [`install-adb.sh`](install-adb.sh) 做检测：找配置好的位置 → PATH → 常见 SDK 默认目录，都找不到就会在终端里询问是否现在从 Google 官方地址自动下载安装（装到默认 SDK 目录，无需手动配置 PATH）。Windows 下这个脚本跑不了，会走下面的手动 / AI 安装步骤。也可以单独手动跑：

```bash
./install-adb.sh
```

不想用这个脚本的话，也可以自己前往官方页面下载：https://developer.android.com/tools/releases/platform-tools，装完确保 `adb` 在 PATH 中，或者把解压出来的 `platform-tools` 目录放进上面提到的某个默认 SDK 目录。

### 交给 AI 自动安装

如果你在用 Claude Code / Cursor 之类有终端权限的 AI 编程工具，可以直接把下面这段提示词发给它，让它帮你端到端地检测、下载、安装 adb（macOS / Linux 优先用仓库自带的 `install-adb.sh`，跑不了的场景再走手动步骤）：

```
请帮我检测并安装 Android Debug Bridge (adb)，用于运行 quick-logcat 这个工具：

1. 如果当前目录下有 install-adb.sh（macOS / Linux），直接运行 `./install-adb.sh`：
   - 它会依次检查配置好的位置、PATH、常见 SDK 默认目录；
   - 都找不到时会询问是否自动从 Google 官方地址下载安装（约 10MB），下载前请先告诉我它准备下载的地址和大小，等我确认。
   - 跑完后执行一次 adb version 确认可用，然后直接跳到第 5 步。
2. 如果没有 install-adb.sh（比如 Windows，或者只能手动操作），执行 `adb version` 看系统 PATH 里是否已有可用的 adb；有的话直接跳到第 5 步。
3. 如果没有，判断我当前的操作系统（macOS / Windows / Linux），从 Google 官方地址下载对应平台的 Android SDK Platform Tools 压缩包（下载前请先告诉我文件名和大致大小，等我确认后再下载）：
   - macOS: https://dl.google.com/android/repository/platform-tools-latest-darwin.zip
   - Windows: https://dl.google.com/android/repository/platform-tools-latest-windows.zip
   - Linux: https://dl.google.com/android/repository/platform-tools-latest-linux.zip
   如果链接失效，改为打开 https://developer.android.com/tools/releases/platform-tools 找到当前的官方下载链接。
4. 把压缩包解压到本机 Android SDK 的默认目录，这样本工具不用额外配置 PATH 就能自动找到它：
   - macOS: ~/Library/Android/sdk/platform-tools
   - Linux: ~/Android/Sdk/platform-tools
   - Windows: %LOCALAPPDATA%\Android\Sdk\platform-tools
   如果这些目录都不存在，就新建对应路径下的 platform-tools 目录，然后执行一次 `<解压目录>/adb version` 确认能正常运行。
5. 验证通过后，重新启动 quick-logcat（重新执行 `npx quick-logcat` 或 start.command / start.sh），确认设备列表能正常出现。
```

## 常见问题

- **终端提示"无法验证开发者"**：右键点击 `start.command` → 打开，只需首次运行确认一次。
- **已经装了 adb 但还是提示找不到**：确认 `adb` 命令能在终端里直接跑通（`adb version`），或者用 `ADB_PATH` 环境变量显式指定路径后再启动。

## License

MIT，详见 [LICENSE](LICENSE)。
