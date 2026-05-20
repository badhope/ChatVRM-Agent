#!/bin/bash

# DevFlow-Agent 配置验证脚本
# 验证所有配置是否正确完成

echo "🔍 DevFlow-Agent 配置验证"
echo "======================================"
echo ""

pass_count=0
fail_count=0

check_item() {
    local name="$1"
    local command="$2"
    
    echo -n "检查 $name... "
    if eval "$command" > /dev/null 2>&1; then
        echo "✓"
        ((pass_count++))
        return 0
    else
        echo "✗"
        ((fail_count++))
        return 1
    fi
}

check_file() {
    local name="$1"
    local file="$2"
    
    echo -n "检查 $name... "
    if [ -f "$file" ]; then
        echo "✓ ($file)"
        ((pass_count++))
        return 0
    else
        echo "✗ ($file 不存在)"
        ((fail_count++))
        return 1
    fi
}

check_dir() {
    local name="$1"
    local dir="$2"
    
    echo -n "检查 $name... "
    if [ -d "$dir" ]; then
        echo "✓ ($dir)"
        ((pass_count++))
        return 0
    else
        echo "✗ ($dir 不存在)"
        ((fail_count++))
        return 1
    fi
}

# 1. 基础环境检查
echo "📋 基础环境"
echo "------------------------------------"
check_item "Node.js" "node --version"
check_item "npm" "npm --version"
echo ""

# 2. 项目文件检查
echo "📁 项目结构"
echo "------------------------------------"
check_file "package.json" "package.json"
check_file "tsconfig.json" "tsconfig.json"
check_file "README.md" "README.md"
check_dir "src 目录" "src"
echo ""

# 3. 配置文件检查
echo "⚙️  配置文件"
echo "------------------------------------"
check_file "技能配置" ".devflow/skills-config.json"
check_file "MCP 配置" ".devflow/mcp-config.json"
check_file "开发文档" "DEVELOPMENT_SETUP.md"
check_file "开发 README" "README_DEVELOPMENT.md"
check_file "安装脚本" "setup.sh"
echo ""

# 4. AI 技能检查
echo "🤖 AI 技能"
echo "------------------------------------"
check_dir "AI Agent 开发" ".skills/ai-agent-development"
check_dir "Agent 记忆系统" ".skills/agent-memory-systems"
check_dir "Agent 工具构建" ".skills/agent-tool-builder"
check_dir "Agent 编排器" ".skills/agent-orchestrator"
check_dir "Agent 评估" ".skills/agent-evaluation"
echo ""

# 5. Git 配置检查
echo "🔗 Git 集成"
echo "------------------------------------"
check_item "Git 仓库" "git rev-parse --git-dir"
echo ""

# 6. MCP 配置验证
echo "🔌 MCP 服务器"
echo "------------------------------------"
if [ -f ".devflow/mcp-config.json" ]; then
    echo "✓ MCP 配置存在"
    
    # 检查配置内容
    if grep -q '"github"' .devflow/mcp-config.json; then
        echo "✓ GitHub MCP 服务器已配置"
        ((pass_count++))
    fi
    
    if grep -q '"filesystem"' .devflow/mcp-config.json; then
        echo "✓ Filesystem MCP 服务器已配置"
        ((pass_count++))
    fi
    
    if grep -q '"git"' .devflow/mcp-config.json; then
        echo "✓ Git MCP 服务器已配置"
        ((pass_count++))
    fi
    
    if grep -q '"sqlite"' .devflow/mcp-config.json; then
        echo "✓ SQLite MCP 服务器已配置"
        ((pass_count++))
    fi
else
    echo "✗ MCP 配置文件不存在"
    ((fail_count++))
fi
echo ""

# 7. 依赖检查
echo "📦 依赖状态"
echo "------------------------------------"
if [ -d "node_modules" ]; then
    echo "✓ node_modules 存在"
    ((pass_count++))
    
    if [ -f "node_modules/typescript" ]; then
        echo "✓ TypeScript 已安装"
        ((pass_count++))
    fi
    
    if [ -f "node_modules/vitest" ]; then
        echo "✓ Vitest 已安装"
        ((pass_count++))
    fi
else
    echo "⚠️  node_modules 不存在（需要运行 npm install）"
    echo "   运行: npm install --legacy-peer-deps"
    echo "   或运行: bash setup.sh"
fi
echo ""

# 总结
echo "======================================"
echo "📊 验证结果"
echo "======================================"
echo "通过: $pass_count"
echo "失败: $fail_count"
echo ""

if [ $fail_count -eq 0 ]; then
    echo "✅ 所有配置验证通过！"
    echo ""
    echo "接下来您可以："
    echo "1. 查看开发文档: cat README_DEVELOPMENT.md"
    echo "2. 运行安装脚本: bash setup.sh"
    echo "3. 配置 AI 平台: devflow config provider set-key <platform> <key>"
    echo "4. 启动开发: npm run dev"
else
    echo "⚠️  部分配置验证失败"
    echo ""
    echo "请检查失败的配置项"
fi
echo ""
