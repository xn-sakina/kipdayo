#!/bin/bash
set -e

echo "======================================"
echo "  macOS 图标生成工具"
echo "======================================"

# 获取项目根目录的绝对路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 配置
ORIGINAL_ICON="$PROJECT_ROOT/test/rounded_corners.png"
TEMP_ICON="/tmp/app-icon-with-padding.png"

# 检查原始图标是否存在
if [ ! -f "$ORIGINAL_ICON" ]; then
    echo "❌ 错误: 找不到原始图标 $ORIGINAL_ICON"
    exit 1
fi

echo "📐 检查原始图标尺寸..."
ORIGINAL_SIZE=$(sips -g pixelWidth "$ORIGINAL_ICON" | grep pixelWidth | awk '{print $2}')
echo "   原始尺寸: ${ORIGINAL_SIZE}x${ORIGINAL_SIZE}"

CANVAS_SIZE=1024
CONTENT_SIZE=820

echo ""
echo "✨ 添加 10% 安全边距..."
echo "   画布尺寸: ${CANVAS_SIZE}x${CANVAS_SIZE}"
echo "   内容尺寸: ${CONTENT_SIZE}x${CONTENT_SIZE}"

# 第一步: 缩放图标到内容尺寸
sips -z $CONTENT_SIZE $CONTENT_SIZE "$ORIGINAL_ICON" --out /tmp/icon_resized.png > /dev/null 2>&1

# 第二步: 创建带透明边距的画布
# 使用 ImageMagick 如果可用,否则使用 sips
if command -v convert &> /dev/null; then
    echo "   使用 ImageMagick 添加边距..."
    convert /tmp/icon_resized.png -gravity center -background none -extent ${CANVAS_SIZE}x${CANVAS_SIZE} "$TEMP_ICON"
else
    echo "   使用 sips 添加边距..."
    # 创建透明背景
    sips -z $CANVAS_SIZE $CANVAS_SIZE /tmp/icon_resized.png --out "$TEMP_ICON" --padColor FFFFFF00 > /dev/null 2>&1
fi

echo "✅ 边距添加完成: $TEMP_ICON"

echo ""
echo "🎨 使用 Tauri CLI 生成所有图标尺寸..."
cd "$PROJECT_ROOT"
pnpm tauri icon "$TEMP_ICON"

echo ""
echo "======================================"
echo "  ✅ 图标生成完成!"
echo "======================================"
echo ""
echo "生成的图标位于: $PROJECT_ROOT/src-tauri/icons/"
echo ""
echo "查看生成的图标:"
echo "  ls -lh $PROJECT_ROOT/src-tauri/icons/"
echo ""
echo "重新构建应用:"
echo "  cd $PROJECT_ROOT && pnpm tauri build"
echo ""
