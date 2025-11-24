# 通用导航数据导入脚本使用说明

## 简介

`import-nav-data.js` 是一个通用的导航数据导入脚本，支持将指定目录中的JSON文件导入到指定的飞书多维表格中。

## 功能特性

- ✅ 支持指定数据目录
- ✅ 支持两种方式指定目标表格：
  - 方式1：直接指定表格ID和应用Token
  - 方式2：通过元数据表格查找表格信息
- ✅ 支持文件名过滤（正则表达式）
- ✅ 支持分类映射（将旧分类名映射为新分类名）
- ✅ 支持跳过已存在的记录（基于URL去重）
- ✅ 自动批量导入（每次最多500条）
- ✅ 详细的导入日志和错误报告

## 使用方法

### 基本用法

```bash
# 查看帮助
node scripts/import-nav-data.js --help

# 或使用 npm 命令
npm run import-nav -- --help
```

### 方式1：直接指定表格ID和应用Token

```bash
node scripts/import-nav-data.js \
  --data-dir ./scripts/openi-data \
  --table-id tbl3I3RtxgtiC7eF \
  --app-token IQJzbxdNgaDJ4FsMd67cEgofn9g
```

### 方式2：通过元数据表格查找

```bash
node scripts/import-nav-data.js \
  --data-dir ./scripts/openi-data \
  --table-name "AI导航" \
  --meta-table-id tblxxx \
  --meta-app-token xxx
```

### 高级用法

#### 1. 过滤文件名（只导入包含"AI"的文件）

```bash
node scripts/import-nav-data.js \
  --data-dir ./scripts/openi-data \
  --table-id tblxxx \
  --app-token xxx \
  --file-pattern "/AI/i"
```

#### 2. 分类映射（将多个分类合并为一个）

```bash
node scripts/import-nav-data.js \
  --data-dir ./scripts/openi-data \
  --table-id tblxxx \
  --app-token xxx \
  --category-mapping '{"体验入口":"AI大模型","API":"AI大模型","DeepSeek":"AI大模型"}'
```

#### 3. 跳过已存在的记录（避免重复导入）

```bash
node scripts/import-nav-data.js \
  --data-dir ./scripts/openi-data \
  --table-id tblxxx \
  --app-token xxx \
  --skip-existing
```

#### 4. 组合使用

```bash
node scripts/import-nav-data.js \
  --data-dir ./scripts/openi-data \
  --table-id tblxxx \
  --app-token xxx \
  --file-pattern "/AI/i" \
  --category-mapping '{"体验入口":"AI大模型"}' \
  --skip-existing
```

## 命令行参数

| 参数 | 简写 | 说明 | 示例 |
|------|------|------|------|
| `--data-dir` | `-d` | JSON数据文件所在目录（必填） | `--data-dir ./openi-data` |
| `--table-id` | `-t` | 目标表格ID（方式1） | `--table-id tblxxx` |
| `--app-token` | `-a` | 目标表格所在的应用Token（方式1） | `--app-token xxx` |
| `--table-name` | `-n` | 目标表格名称（方式2） | `--table-name "AI导航"` |
| `--meta-table-id` | | 元数据表格ID（方式2） | `--meta-table-id tblxxx` |
| `--meta-app-token` | | 元数据表格所在的应用Token（方式2） | `--meta-app-token xxx` |
| `--file-pattern` | `-p` | 文件名过滤模式（正则表达式） | `--file-pattern "/AI/i"` |
| `--category-mapping` | `-m` | 分类映射JSON | `--category-mapping '{"旧名":"新名"}'` |
| `--skip-existing` | | 跳过已存在的记录 | `--skip-existing` |
| `--help` | `-h` | 显示帮助信息 | `--help` |

## 环境变量

需要在 `.env` 文件中配置以下环境变量：

```env
# 必填
APP_ID=your_app_id
APP_SECRET=your_app_secret

# 可选（如果使用方式2或未指定--app-token）
APP_TOKEN=your_app_token
MM_TABLE_ID=your_meta_table_id
MM_APP_TOKEN=your_meta_app_token
```

## JSON文件格式

脚本支持以下JSON格式：

### 格式1：对象格式（推荐）

```json
{
  "分类名称": [
    {
      "name": "网站名称",
      "url": "https://example.com",
      "description": "网站描述"
    }
  ]
}
```

### 格式2：数组格式

```json
[
  {
    "name": "网站名称",
    "url": "https://example.com",
    "description": "网站描述"
  }
]
```

**注意：** 如果使用数组格式，分类名称将使用文件名（去掉.json后缀）。

## 使用场景

### 场景1：导入大模型数据到指定表格

```bash
node scripts/import-nav-data.js \
  --data-dir ./scripts/openi-data \
  --table-id tblxxx \
  --app-token xxx \
  --file-pattern "AI大模型"
```

### 场景2：导入所有AI相关数据并统一分类

```bash
node scripts/import-nav-data.js \
  --data-dir ./scripts/openi-data \
  --table-id tblxxx \
  --app-token xxx \
  --file-pattern "/AI/i" \
  --category-mapping '{
    "AI工具推荐":"AI工具",
    "AI写作工具":"AI工具",
    "AI编程工具":"AI工具"
  }'
```

### 场景3：增量导入（跳过已存在的记录）

```bash
node scripts/import-nav-data.js \
  --data-dir ./scripts/openi-data \
  --table-id tblxxx \
  --app-token xxx \
  --skip-existing
```

### 场景4：通过元数据表格查找并导入

```bash
node scripts/import-nav-data.js \
  --data-dir ./scripts/openi-data \
  --table-name "AI导航" \
  --meta-table-id tblxxx \
  --meta-app-token xxx
```

## 注意事项

1. **数据格式要求**：
   - JSON文件必须包含 `name` 和 `url` 字段
   - `description` 字段可选

2. **批量导入限制**：
   - 飞书API每次最多导入500条记录
   - 脚本会自动分批处理
   - 每批之间会有500ms延迟，避免请求过快

3. **去重机制**：
   - 使用 `--skip-existing` 时，基于URL进行去重
   - URL会移除查询参数和锚点后进行匹配
   - 匹配时不区分大小写

4. **分类映射**：
   - 分类映射会将多个旧分类合并到新分类
   - 映射后的分类如果不存在会自动创建

5. **错误处理**：
   - 如果某个批次导入失败，会继续处理剩余数据
   - 所有错误会在最后统一报告

## 与原有脚本的关系

- `import-ai-data.js`: 专门用于导入包含"AI"的JSON文件到"AI导航"表格
- `import-nav-data.js`: 通用脚本，可以替代上述脚本的功能，并支持更多自定义选项

## 常见问题

### Q: 如何知道表格ID和应用Token？

A: 从飞书多维表格的URL中提取：
- URL格式：`https://xxx.feishu.cn/base/APP_TOKEN?table=TABLE_ID`
- `APP_TOKEN` 就是应用Token
- `TABLE_ID` 就是表格ID

### Q: 如何只导入特定的文件？

A: 使用 `--file-pattern` 参数，支持正则表达式：
```bash
--file-pattern "/AI大模型/i"  # 只导入文件名包含"AI大模型"的文件
```

### Q: 如何合并多个分类？

A: 使用 `--category-mapping` 参数：
```bash
--category-mapping '{"分类1":"新分类","分类2":"新分类"}'
```

### Q: 导入时如何避免重复？

A: 使用 `--skip-existing` 参数，脚本会自动检查现有记录并跳过已存在的URL。

