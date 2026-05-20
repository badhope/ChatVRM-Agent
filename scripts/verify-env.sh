#!/bin/bash

echo "============================================="
echo "  DevFlow Agent 环境验证工具"
echo "============================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查项计数器
PASSED=0
FAILED=0
WARNING=0

check() {
    local message=$1
    local command=$2
    local expected=$3
    local is_version=${4:-false}

    echo -n "检查: ${message}... "
    
    eval "$command" > /dev/null 2>&1
    local exit_code=$?
    
    if [[ "$expected" == "" ]]; then
        if [ $exit_code -eq 0 ]; then
            echo -e "${GREEN}✓ 通过${NC}"
            ((PASSED++))
        else
            echo -e "${RED}✗ 失败${NC}"
            ((FAILED++))
        fi
    else
        if $is_version; then
            local output=$(eval "$command" 2>&1 | head -n1)
            local actual_version=$(echo "$output" | sed 's/[^0-9.]//g' | cut -d. -f1,2,3)
            if [[ "$actual_version" > "$expected" || "$actual_version" == "$expected" ]]; then
                echo -e "${GREEN}✓ 通过 (v$actual_version)${NC}"
                ((PASSED++))
            else
                echo -e "${RED}✗ 失败${NC}"
                echo -e "  要求: >=$expected, 实际: v$actual_version"
                ((FAILED++))
            fi
        else
            if [ $exit_code -eq 0 ]; then
                echo -e "${GREEN}✓ 通过${NC}"
                ((PASSED++))
            else
                echo -e "${RED}✗ 失败${NC}"
                ((FAILED++))
            fi
        fi
    fi
}

# 检查 Node.js 版本
NODE_VERSION=$(node --version 2>/dev/null | sed 's/v//')
check "Node.js 版本" "node --version" "20.0.0" true

# 检查 npm 版本
check "npm 版本" "npm --version" "8.0.0" true

# 检查是否在正确的目录
check "项目根目录" "ls package.json" ""

# 检查依赖是否安装
check "node_modules 存在" "ls node_modules" ""

# 检查是否有 dist 目录
check "构建产物 (dist)" "ls dist" ""

# 检查 TypeScript 配置
check "tsconfig.json 存在" "ls tsconfig.json" ""

# 尝试构建项目（如果需要）
if [ ! -d "dist" ] || [ -z "$(ls -A dist)" ]; then
    echo ""
    echo "构建产物缺失，正在构建..."
    npm run build
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ 构建成功${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗ 构建失败${NC}"
        ((FAILED++))
    fi
fi

# 检查 CLI 是否能运行
check "CLI 正常运行" "node dist/cli.js --version" "0.1.0"

echo ""
echo "============================================="
echo "  验证结果:"
echo "  通过: $PASSED"
echo "  失败: $FAILED"
echo "  警告: $WARNING"
echo "============================================="

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ 所有检查通过！环境已准备好！${NC}"
    echo ""
    echo "快速启动命令:"
    echo "  node dist/cli.js --help"
    echo "  npm run dev"
    echo "  npm test"
else
    echo -e "${RED}✗ 部分检查失败，请查看上方错误信息${NC}"
    echo ""
    echo "建议操作:"
    echo "  nvm install 20 && nvm use 20"
    echo "  npm install --legacy-peer-deps"
    echo "  npm run build"
    exit 1
fi

