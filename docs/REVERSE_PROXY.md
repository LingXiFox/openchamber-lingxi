# 反向代理设置

当你通过 Nginx、Nginx Proxy Manager、Caddy、Cloudflare 或其他反向代理运行 OpenChamber 时，请使用本指南。

## 在设置代理之前

1. 首先确认 OpenChamber 可以直接正常访问。
2. 在同一网络中打开 `http://<server-ip>:3000` 或你自定义的端口。
3. 只有在直接连接正常工作后，再添加反向代理。

## 代理必须支持的功能

* 用于实时消息传输的 WebSocket：

  * `/api/event/ws`
  * `/api/global/event/ws`
  * `/api/terminal/ws`
* 不进行缓冲的 SSE：

  * `/api/event`
  * `/api/global/event`
  * `/api/notifications/stream`
  * `/api/openchamber/events`
* 用于附件和文件操作的大尺寸请求体
* 用于实时流和终端会话的长时间读取超时

## 关键规则

* 启用 WebSocket 代理。
* 在 SSE 路由上禁用缓冲。
* 如果 OpenChamber 已经在压缩响应，请在代理上禁用 gzip。
* 只在一层启用压缩。
* 转发常规代理请求头，例如 `Host`、`X-Forwarded-For` 和 `X-Forwarded-Proto`。
* 如果用户需要上传文件，请提高请求体大小限制。

## 快速检查清单

* OpenChamber 可以在局域网中直接访问
* 代理中已启用 WebSocket
* SSE 路由已关闭缓冲
* 代理主机上设置了 `gzip off`，或者通过其他方式禁用了代理压缩
* `client_max_body_size` 足够容纳附件
* `proxy_read_timeout` 对数据流来说足够长

## 示例：Nginx

<details>
<summary>显示示例配置</summary>

```nginx
client_max_body_size 50M;
client_body_buffer_size 50M;
proxy_request_buffering off;

proxy_http_version 1.1;
proxy_set_header Connection "";
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;

gzip off;
proxy_connect_timeout 30s;

location = /api/terminal/ws {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}

location = /api/global/event/ws {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}

location = /api/event/ws {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}

location ~ ^/api/(event|global/event|notifications/stream|openchamber/events)$ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Accept "text/event-stream";
    proxy_set_header Cache-Control "no-cache";
    proxy_buffering off;
    proxy_cache off;
    gzip off;
    add_header X-Accel-Buffering "no" always;
    add_header Cache-Control "no-cache, no-transform" always;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}

location /api {
    proxy_pass http://127.0.0.1:3000;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}

location / {
    proxy_pass http://127.0.0.1:3000;
}
```

</details>

## 示例：Nginx Proxy Manager

1. 添加代理主机，转发到 `127.0.0.1:3000`。
2. 在该主机的「高级」选项卡中粘贴上一节 Nginx 示例的同一段配置。
3. 为该主机启用 `Websockets Support`（WebSocket 支持）。

## 常见故障表现

### 页面可以加载，但发送消息失败

* 代理中没有启用 WebSocket
* `/api/event/ws` 或 `/api/global/event/ws` 没有被正确转发

### 通知或实时状态不更新

* 某个 SSE 路由被缓冲或缓存
* 缺少 `X-Accel-Buffering "no"`

### 文件上传失败

* `client_max_body_size` 太小

### 本地一切正常，但通过代理后就出问题

* 代理正在对实时流量进行压缩和缓冲
* 代理缺少 WebSocket 支持

## 示例：Caddy

<details>
<summary>显示示例配置</summary>

```caddy
reverse_proxy 127.0.0.1:3000 {
    # Caddy 会自动支持 WebSocket

    # 立即刷新 SSE 响应
    flush_interval -1

    # 传递 Host 和代理请求头
    header_up Host {host}
    header_up X-Real-IP {remote_host}
    header_up X-Forwarded-For {remote_host}
    header_up X-Forwarded-Proto {scheme}

    # 为长时间运行的数据流增加超时时间
    transport http {
        read_timeout 3600s
        write_timeout 3600s
    }
}
```

</details>

Caddy 会自动处理 WebSocket 升级——无需额外配置。`flush_interval -1` 指令可以确保 SSE 数据块立即向下游转发，而不会被缓冲。

## CDN 和重复压缩警告

如果你在反向代理前面再放置一层 CDN（例如 Cloudflare），需要注意重复压缩问题：

* OpenChamber 使用 gzip 压缩 HTTP 响应（阈值为 1 KB）。
* Cloudflare 和其他 CDN 默认也会压缩响应。
* 这可能导致响应被重复压缩，或者产生错误的 `Content-Encoding` 请求头。

为避免这种情况，请在**其中一层**禁用压缩：

* **Cloudflare：** Rules → Compression → 禁用（或者使用“Passthrough”模式）。
* **Nginx：** `gzip off`（上面的示例中已经设置）。
* **Caddy：** 如果上游已经发送压缩后的内容，Caddy 默认不会再次压缩。

OpenChamber 会将 SSE 流式路由排除在压缩之外，但 CDN 仍然可能对这些路由进行缓冲。请查看你所使用 CDN 的文档，了解如何在 SSE 路径上禁用缓冲。
