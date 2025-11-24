# 通用导航数据爬取脚本使用说明

## 简介

`scrape-nav-data.js` 是一个通用的导航数据爬取脚本，支持通过命令行参数灵活指定爬取的目标URL和类别。

## 功能特性

- ✅ 支持指定单个或多个URL
- ✅ 支持指定要抓取的类别（可多个，用逗号分隔）
- ✅ 支持抓取所有类别
- ✅ 支持合并多个类别到一个文件
- ✅ 支持自定义输出目录
- ✅ 支持自定义选择器（通过修改代码中的配置）
- ✅ 自动去重
- ✅ 调试模式（保存HTML）

## 使用方法

### 基本用法

```bash
# 查看帮助
node scripts/scrape-nav-data.js --help

# 或使用 npm 命令
npm run scrape-nav -- --help
```

### 示例

#### 1. 抓取指定类别

```bash
# 抓取单个类别
node scripts/scrape-nav-data.js --url https://openi.cn/ --categories "体验入口"

# 抓取多个类别
node scripts/scrape-nav-data.js --url https://openi.cn/ --categories "体验入口,API,DeepSeek"
```

#### 2. 抓取所有类别

```bash
node scripts/scrape-nav-data.js --url https://openi.cn/ --all
```

#### 3. 抓取指定类别并合并为一个分类

```bash
node scripts/scrape-nav-data.js \
  --url https://openi.cn/ \
  --categories "体验入口,API,DeepSeek" \
  --merge \
  --output-category "AI大模型"
```

#### 4. 尝试多个URL（如果第一个失败会自动尝试下一个）

```bash
node scripts/scrape-nav-data.js \
  --url https://openi.cn/ \
  --url https://openi.cn/favorites/5114.html \
  --categories "体验入口"
```

#### 5. 自定义输出目录

```bash
node scripts/scrape-nav-data.js \
  --url https://openi.cn/ \
  --categories "体验入口" \
  --output-dir ./custom-output
```

#### 6. 启用调试模式（保存HTML文件）

```bash
node scripts/scrape-nav-data.js \
  --url https://openi.cn/ \
  --categories "体验入口" \
  --debug
```

## 命令行参数

| 参数 | 简写 | 说明 | 示例 |
|------|------|------|------|
| `--url` | `-u` | 要爬取的URL（可多次指定） | `--url https://openi.cn/` |
| `--categories` | `-c` | 要抓取的类别，用逗号分隔 | `--categories "体验入口,API"` |
| `--all` | `-a` | 抓取所有类别 | `--all` |
| `--merge` | `-m` | 合并所有类别到一个文件 | `--merge` |
| `--output-category` | `-o` | 合并后的分类名称 | `--output-category "AI大模型"` |
| `--output-dir` | `-d` | 输出目录 | `--output-dir ./output` |
| `--base-url` | `-b` | URL相对路径的基础URL | `--base-url https://openi.cn` |
| `--debug` | | 保存HTML用于调试 | `--debug` |
| `--help` | `-h` | 显示帮助信息 | `--help` |

## 输出格式

脚本会将数据保存为JSON文件，格式如下：

```json
{
  "类别名称": [
    {
      "name": "网站名称",
      "url": "https://example.com",
      "description": "网站描述"
    }
  ]
}
```

## 自定义选择器

如果需要适配不同的网站结构，可以修改脚本中的 `DEFAULT_CONFIG` 对象：

```javascript
const DEFAULT_CONFIG = {
  tabButtonSelector: 'li.nav-item[data-action="load_home_tab"]',  // Tab按钮选择器
  linkSelectors: ['.url-card a.card[data-url]'],                   // 链接选择器
  nameSelectors: ['.url-info strong'],                             // 名称选择器
  descSelectors: ['.url-info p.text-muted'],                       // 描述选择器
  // ...
};
```

## 注意事项

1. 如果网站内容是通过JavaScript动态加载的，可能需要使用浏览器自动化工具（如Puppeteer）
2. 某些网站可能有反爬虫机制，建议适当设置请求间隔
3. 如果抓取失败，可以使用 `--debug` 参数保存HTML文件进行调试
4. 合并功能会自动去重（基于URL）

## 与原有脚本的关系

- `scrape-openi-data.js`: 专门用于抓取 openi.cn 的所有数据
- `scrape-damoxing-data.js`: 专门用于抓取 openi.cn 的大模型数据
- `scrape-nav-data.js`: 通用脚本，可以替代上述两个脚本的功能

## 示例场景

### 场景1：抓取大模型导航数据并合并

```bash
node scripts/scrape-nav-data.js \
  --url https://openi.cn/ \
  --categories "体验入口,API,DeepSeek,ChatGPT,百度,阿里" \
  --merge \
  --output-category "AI大模型"
```

### 场景2：抓取所有AI相关类别

```bash
node scripts/scrape-nav-data.js \
  --url https://openi.cn/ \
  --categories "AI工具推荐,AI写作工具,AI编程工具,AI图像工具" \
  --output-dir ./ai-data
```

