#!/bin/bash
set -e

echo "======================================"
echo "  Building Bilibili URL Parser"
echo "  Platform: macOS"
echo "======================================"

# 获取项目根目录的绝对路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 切换到项目根目录
cd "$PROJECT_ROOT"

# 清理之前的构建
echo "Cleaning previous builds..."
rm -rf src-tauri/target/release/bundle

# 构建应用
echo "Building application..."
pnpm tauri build

# 输出构建结果
echo ""
echo "======================================"
echo "  Build Complete!"
echo "======================================"
echo ""
echo "Build artifacts location:"
# 查找所有可能的 .app 文件路径（支持不同的目标架构）
find src-tauri/target -name "*.app" -path "*/bundle/macos/*" -type d -exec ls -lhd {} \; || echo "No .app bundle found"
echo ""
echo "You can find the macOS app in:"
echo "  $PROJECT_ROOT/src-tauri/target/release/bundle/macos/"
