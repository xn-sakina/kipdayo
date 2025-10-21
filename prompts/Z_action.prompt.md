
你是一名 Tauri 专家。
为此项目新增一个 GitHub Actions 构建文件，满足如下要求：
1、可以构建双平台，构建脚本为 scripts/build-macos.sh 和 scripts/build-windows.sh
2、构建时可以选择是否自动把产物提交到 Release ，勾选后才会发到 Release 
3、构建时需要输入版本号，去掉 v ，比如输入 1.0.0，最后发布到 Release 里的 .exe 和 .app 需要添加版本号，比如 vidio_v1.0.0.app （仅在需要发布到 Release 时）。
4、如果不发布到 Release ，那么这是一次测试构建，可以选择构建哪个平台，比如仅构建 macos app 或 windows exe ，最后可以在 actions 的 artifact 里下载自测使用。
