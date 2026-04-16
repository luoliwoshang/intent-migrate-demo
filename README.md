# migrate-demo

最小的 Vite + React 调试页，用来验证 OpenAI-compatible 接口是否能打通，并在前端模拟一版“灵矽前置意图识别 + 工具回流”链路。

## 启动

```bash
cd docs/migrate-demo
npm install
npm run dev
```

默认地址：

- `http://localhost:5173`

## 默认能力

- 默认 `base_url` 为 `https://api.cloudappl.com`
- 默认 `model` 为 `gpt-5.4`
- 主模型和 Intent 模型都支持直接修改各自的 `Base URL`，可切到任意 OpenAI-compatible 服务
- 支持单独配置一个 intent 模型
- 支持前置 intent tools 判定：`get_weather` / `get_time` / `check_supermarket_stock` / `continue_chat`
- 支持在左侧动态开关 `get_weather` / `get_time` / `check_supermarket_stock`，关闭后不会再带进 intent 请求的 `tools`
- 支持前置 intent 命中 `check_supermarket_stock` 后，由编排层派发异步超市查货任务
- 支持前端 JS 直接模拟天气 / 时间服务，固定延迟 `5s`
- 异步查货任务会按 `accepted -> processing -> finalizing -> completed -> notified` 推进，并每 `3s` 更新一次前端进度
- 如果异步查货在同步回复尚未结束时完成，会先排队，等当前同步回复结束后再作为下一条 assistant 消息合流
- 右侧提供独立“异步任务侧边栏”，每个任务项都支持展开 / 收起查看进度详情
- 当前 demo 用本地 mock callback 模拟“tool 主动上报异步任务状态”，还没有接真实 HTTP 通知接口
- 支持两种工具结果路径：
  - `回交主 LLM 润色`
  - `工具直出`
- 主模型默认使用非流式返回，页面里仍可手动切回流式
- 不会真的向主模型发送实际 `tool_call`，而是把本地服务结果当普通上下文回交
- Intent 配置留空时，会自动复用主模型的 `Base URL / API Key / Model`
- 页面内置两类探针：
  - `Chat ToolCall Probe`：检查 `/v1/chat/completions` 是否真的返回结构化 `tool_calls`
  - `Responses Compare Probe`：对照检查 `/responses` 和 `/v1/responses` 是否真的返回结构化 `function_call`
- `API Key / Base URL / Model` 等配置会保存在当前浏览器 `localStorage`
- 支持拉模型列表
- 支持最小请求
- 支持多轮对话
- 支持流式返回
- 支持复制 curl

## 本地代理

开发模式下默认开启“使用本地代理”。

页面会先请求：

- `/proxy/request`

再由 `vite.config.js` 里的中间件转发到目标 OpenAI-compatible 接口。

这样做的目的，是避免浏览器直接请求外部接口时遇到 CORS 限制。

如果你已经在接口侧放开了跨域，也可以在页面里关闭“使用本地代理”，改为浏览器直连。
