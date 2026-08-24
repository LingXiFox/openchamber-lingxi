# 自定义主题

OpenChamber 支持用户自定义主题。将一个 JSON 文件放入 themes 目录并重新加载 — 无需重启应用。

## 快速开始

1. 创建 themes 目录（完整路径见下文「主题位置」）:
   ```bash
   mkdir -p ~/.config/openchamber/themes
   ```

2. 按照下面的格式创建一个主题 JSON 文件 (例如, `my-theme.json`)。

3. 在 OpenChamber 中: **设置 → 主题 → 重新加载主题**。

4. 从下拉菜单中选择你的主题。

## 主题位置

| 平台 | 路径 |
|----------|------|
| macOS/Linux | `~/.config/openchamber/themes/` |

## 主题格式

```json
{
  "metadata": {
    "id": "my-custom-theme",
    "name": "我的自定义主题",
    "description": "一个用于 OpenChamber 的自定义主题",
    "version": "1.0.0",
    "variant": "dark",
    "tags": ["dark", "custom"]
  },
  "colors": {
    "primary": {
      "base": "#EC8B49",
      "hover": "#DA702C",
      "active": "#F9AE77",
      "foreground": "#100F0F",
      "muted": "#EC8B4980",
      "emphasis": "#F9AE77"
    },
    "surface": {
      "background": "#100F0F",
      "foreground": "#CECDC3",
      "muted": "#1C1B1A",
      "mutedForeground": "#878580",
      "elevated": "#1C1A19",
      "elevatedForeground": "#CECDC3",
      "overlay": "#00000080",
      "subtle": "#1e1d1c"
    },
    "interactive": {
      "border": "#343331",
      "borderHover": "#403E3C",
      "borderFocus": "#EC8B49",
      "selection": "#f4f4f41f",
      "selectionForeground": "#CECDC3",
      "focus": "#EC8B49",
      "focusRing": "#EC8B4950",
      "cursor": "#CECDC3",
      "hover": "#ffffff18",
      "active": "#ffffff1f"
    },
    "status": {
      "error": "#D14D41",
      "errorForeground": "#100F0F",
      "errorBackground": "#AF302920",
      "errorBorder": "#AF302950",
      "warning": "#DA702C",
      "warningForeground": "#100F0F",
      "warningBackground": "#BC521520",
      "warningBorder": "#BC521550",
      "success": "#A0AF54",
      "successForeground": "#100F0F",
      "successBackground": "#66800B20",
      "successBorder": "#66800B50",
      "info": "#4385BE",
      "infoForeground": "#100F0F",
      "infoBackground": "#205EA620",
      "infoBorder": "#205EA650"
    },
    "pr": {
      "open": "#A0AF54",
      "draft": "#878580",
      "blocked": "#DA702C",
      "merged": "#8B7EC8",
      "closed": "#D14D41"
    },
    "syntax": {
      "base": {
        "background": "#1C1B1A",
        "foreground": "#CECDC3",
        "comment": "#878580",
        "keyword": "#4385BE",
        "string": "#3AA99F",
        "number": "#8B7EC8",
        "function": "#DA702C",
        "variable": "#CECDC3",
        "type": "#D0A215",
        "operator": "#D14D41"
      },
      "tokens": {
        "commentDoc": "#575653",
        "stringEscape": "#CECDC3",
        "keywordImport": "#D14D41",
        "storageModifier": "#4385BE",
        "functionCall": "#DA702C",
        "method": "#879A39",
        "variableProperty": "#4385BE",
        "variableOther": "#879A39",
        "variableGlobal": "#CE5D97",
        "variableLocal": "#282726",
        "parameter": "#CECDC3",
        "constant": "#CECDC3",
        "class": "#DA702C",
        "className": "#DA702C",
        "interface": "#D0A215",
        "struct": "#DA702C",
        "enum": "#DA702C",
        "typeParameter": "#DA702C",
        "namespace": "#D0A215",
        "module": "#D14D41",
        "tag": "#4385BE",
        "jsxTag": "#CE5D97",
        "tagAttribute": "#D0A215",
        "tagAttributeValue": "#3AA99F",
        "boolean": "#D0A215",
        "decorator": "#D0A215",
        "label": "#CE5D97",
        "punctuation": "#878580",
        "macro": "#4385BE",
        "preprocessor": "#CE5D97",
        "regex": "#3AA99F",
        "url": "#4385BE",
        "key": "#DA702C",
        "exception": "#CE5D97"
      },
      "highlights": {
        "diffAdded": "#879A39",
        "diffAddedBackground": "#66800B20",
        "diffRemoved": "#D14D41",
        "diffRemovedBackground": "#AF302920",
        "diffModified": "#4385BE",
        "diffModifiedBackground": "#205EA620",
        "lineNumber": "#403E3C",
        "lineNumberActive": "#CECDC3"
      }
    },
    "markdown": {
      "heading1": "#fbf9e6",
      "heading2": "#e6e4d2",
      "heading3": "#CECDC3",
      "heading4": "#CECDC3",
      "link": "#4385BE",
      "linkHover": "#205EA6",
      "inlineCode": "#A0AF53",
      "inlineCodeBackground": "#1C1B1A",
      "blockquote": "#878580",
      "blockquoteBorder": "#343331",
      "listMarker": "#D0A21599"
    },
    "chat": {
      "userMessage": "#CECDC3",
      "userMessageBackground": "#2d1d15",
      "assistantMessage": "#CECDC3",
      "assistantMessageBackground": "#100F0F",
      "timestamp": "#878580",
      "divider": "#343331"
    },
    "tools": {
      "background": "#1C1B1A50",
      "border": "#42403e9d",
      "headerHover": "#34333150",
      "icon": "#aca7a1",
      "title": "#CECDC3",
      "description": "#878580",
      "edit": {
        "added": "#879A39",
        "addedBackground": "#66800B25",
        "removed": "#D14D41",
        "removedBackground": "#AF302925",
        "lineNumber": "#403E3C"
      }
    }
  },
  "config": {
    "fonts": {
      "sans": "\"IBM Plex Mono\", monospace",
      "mono": "\"IBM Plex Mono\", monospace",
      "heading": "\"IBM Plex Mono\", monospace"
    },
    "radius": {
      "none": "0",
      "sm": "0.325rem",
      "md": "0.75rem",
      "lg": "1.125rem",
      "xl": "1.5rem",
      "full": "9999px"
    },
    "transitions": {
      "fast": "150ms ease",
      "normal": "250ms ease",
      "slow": "350ms ease"
    }
  }
}
```

## Surface Alpha

- 加载校验不会检查 alpha 值。内置主题中 `colors.surface.muted` 和 `colors.surface.elevated` 使用不透明颜色；需要半透明效果时才添加 alpha (例如 `#1C1B1A90`)。

## 验证

主题会在加载时进行验证。无效主题会被跳过并在控制台显示警告。

常见问题:
- 缺少必填字段
- 无效的 `variant` (必须是 `"light"` 或 `"dark"`)
- 文件大小 > 512KB

## 提示

- 使用带 alpha 的十六进制值实现透明效果 (例如, `#FFFFFF20`)
- 参考 `packages/ui/src/lib/theme/themes/` 中的内置主题以获取更多示例
- 主题 `id` 必须唯一; 重复项会被跳过
