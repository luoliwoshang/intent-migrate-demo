import { useEffect, useRef, useState } from "react";

const ENDPOINTS = {
  MODELS: "/v1/models",
  CHAT_COMPLETIONS: "/v1/chat/completions",
};
const RESPONSES_PATHS = ["/responses", "/v1/responses"];

const MESSAGE_ROLES = {
  USER: "user",
  ASSISTANT: "assistant",
  SYSTEM: "system",
  INTENT: "intent",
  TOOL: "tool",
};

const TOOL_NAMES = {
  CHECK_SUPERMARKET_STOCK: "check_supermarket_stock",
  CONTINUE_CHAT: "continue_chat",
  GET_TIME: "get_time",
  GET_WEATHER: "get_weather",
};

const ASYNC_TASK_STATUS = {
  ACCEPTED: "accepted",
  PROCESSING: "processing",
  FINALIZING: "finalizing",
  COMPLETED: "completed",
  NOTIFIED: "notified",
};

const ASYNC_TASK_STATUS_LABELS = {
  [ASYNC_TASK_STATUS.ACCEPTED]: "已接受",
  [ASYNC_TASK_STATUS.PROCESSING]: "处理中",
  [ASYNC_TASK_STATUS.FINALIZING]: "收尾中",
  [ASYNC_TASK_STATUS.COMPLETED]: "已完成",
  [ASYNC_TASK_STATUS.NOTIFIED]: "已通知",
};

const ASYNC_TASK_STEP_DELAY_MS = 3000;
const ASYNC_TASK_UPDATES = [
  {
    status: ASYNC_TASK_STATUS.PROCESSING,
    progress: 42,
    message: "正在整理商品名称，并联系附近超市确认库存。",
  },
  {
    status: ASYNC_TASK_STATUS.FINALIZING,
    progress: 78,
    message: "已经拿到超市回复，正在整理门店、库存和下一步建议。",
  },
];

const TOOL_RESPONSE_MODES = {
  DIRECT: "direct",
  REQLLM: "reqlm",
};

const TOOL_DELAY_MS = 5000;
const MINIMAL_PROMPT = "Reply with exactly: ok";
const LOCAL_STORAGE_KEY = "migrate-demo-form";
const DISPLAYABLE_HISTORY_ROLES = new Set([
  MESSAGE_ROLES.USER,
  MESSAGE_ROLES.ASSISTANT,
]);
const PERSISTED_FORM_KEYS = [
  "baseUrl",
  "apiKey",
  "model",
  "maxTokens",
  "temperature",
  "timeoutMs",
  "stream",
  "useProxy",
  "systemPrompt",
  "intentEnabled",
  "intentBaseUrl",
  "intentApiKey",
  "intentModel",
  "intentSystemPrompt",
  "toolEnabledWeather",
  "toolEnabledTime",
  "toolEnabledSupermarketStock",
  "toolResponseMode",
];

const INTENT_TOOL_SWITCH_KEYS = {
  [TOOL_NAMES.GET_WEATHER]: "toolEnabledWeather",
  [TOOL_NAMES.GET_TIME]: "toolEnabledTime",
  [TOOL_NAMES.CHECK_SUPERMARKET_STOCK]: "toolEnabledSupermarketStock",
};

function getEnabledIntentToolNames(form) {
  return [
    form.toolEnabledWeather ? TOOL_NAMES.GET_WEATHER : null,
    form.toolEnabledTime ? TOOL_NAMES.GET_TIME : null,
    form.toolEnabledSupermarketStock ? TOOL_NAMES.CHECK_SUPERMARKET_STOCK : null,
    TOOL_NAMES.CONTINUE_CHAT,
  ].filter(Boolean);
}

function buildDefaultIntentSystemPrompt(formLike) {
  const enabledToolNames = getEnabledIntentToolNames(formLike);
  const lines = [
    "你是灵矽的前置意图识别器。",
    `你只能在 ${enabledToolNames.join("、")} 之间做选择。`,
    "你必须且只能选择一个工具。",
    "绝对不要直接回答用户问题。",
    "绝对不要输出自然语言解释。",
  ];

  if (formLike.toolEnabledWeather) {
    lines.push(`如果用户在问天气，优先调用 ${TOOL_NAMES.GET_WEATHER}。`);
    lines.push("示例：用户说“上海天气怎么样”时，应该调用 get_weather。");
  }

  if (formLike.toolEnabledTime) {
    lines.push(`如果用户在问当前时间、日期、星期，优先调用 ${TOOL_NAMES.GET_TIME}。`);
    lines.push("示例：用户说“现在几点了”时，应该调用 get_time。");
  }

  if (formLike.toolEnabledSupermarketStock) {
    lines.push(
      `如果用户要求查询超市有没有货、某个商品有没有现货、附近超市能不能买到某个东西，必须调用 ${TOOL_NAMES.CHECK_SUPERMARKET_STOCK}。`,
    );
    lines.push(
      `即使用户没有说清楚具体超市名，只要核心诉求是“帮我去查超市库存或现货”，也必须调用 ${TOOL_NAMES.CHECK_SUPERMARKET_STOCK}，参数可以留空或只填写部分字段。`,
    );
    lines.push("不要把“帮我查下附近超市有没有无糖酸奶”“去问问超市还有没有鸡蛋”误判成 continue_chat。");
    lines.push(
      "示例：用户说“帮我查下附近超市有没有无糖酸奶”时，应该调用 check_supermarket_stock，并尽量提取 item。",
    );
    lines.push(
      "示例：用户说“帮我问下盒马还有没有鸡蛋”时，应该调用 check_supermarket_stock，并尽量提取 store 和 item。",
    );
  }

  lines.push(
    `只有在明确不是已启用的任务能力，也没有明显任务型诉求时，才调用 ${TOOL_NAMES.CONTINUE_CHAT}。`,
  );
  lines.push("示例：用户说“你好吗”时，才调用 continue_chat。");

  return lines.join("\n");
}

const DEFAULT_INTENT_SYSTEM_PROMPT = buildDefaultIntentSystemPrompt({
  toolEnabledWeather: true,
  toolEnabledTime: true,
  toolEnabledSupermarketStock: true,
});

const DEFAULT_FORM = {
  baseUrl: "https://api.cloudappl.com",
  apiKey: "",
  model: "gpt-5.4",
  maxTokens: "256",
  temperature: "0.2",
  timeoutMs: "60000",
  stream: false,
  useProxy: true,
  systemPrompt: "",
  intentEnabled: true,
  intentBaseUrl: "https://api.cloudappl.com",
  intentApiKey: "",
  intentModel: "gpt-5.4",
  intentSystemPrompt: DEFAULT_INTENT_SYSTEM_PROMPT,
  toolEnabledWeather: true,
  toolEnabledTime: true,
  toolEnabledSupermarketStock: true,
  toolResponseMode: TOOL_RESPONSE_MODES.REQLLM,
  userInput: "帮我查一下附近超市有没有无糖酸奶",
};

const INTENT_TOOL_DEFINITIONS = {
  [TOOL_NAMES.GET_WEATHER]: {
    type: "function",
    function: {
      name: TOOL_NAMES.GET_WEATHER,
      description: "获取某个地点的天气信息，适用于天气、下雨、温度、穿衣建议等问题。",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "用户提到的城市或地点，例如杭州、上海。",
          },
        },
        required: [],
      },
    },
  },
  [TOOL_NAMES.CHECK_SUPERMARKET_STOCK]: {
    type: "function",
    function: {
      name: TOOL_NAMES.CHECK_SUPERMARKET_STOCK,
      description:
        "查询超市商品库存。凡是用户要求查超市有没有货、某个商品还有没有现货、附近门店能不能买到某个东西，都应该优先命中这个工具。",
      parameters: {
        type: "object",
        properties: {
          item: {
            type: "string",
            description: "用户想查的商品，例如无糖酸奶、鸡蛋、番茄酱、矿泉水。",
          },
          store: {
            type: "string",
            description: "用户提到的超市或门店，例如盒马、永辉、附近超市。",
          },
        },
        required: [],
      },
    },
  },
  [TOOL_NAMES.GET_TIME]: {
    type: "function",
    function: {
      name: TOOL_NAMES.GET_TIME,
      description: "获取当前日期、时间和星期，适用于询问几点、今天几号、星期几等问题。",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  [TOOL_NAMES.CONTINUE_CHAT]: {
    type: "function",
    function: {
      name: TOOL_NAMES.CONTINUE_CHAT,
      description: "仅当用户没有提出天气、时间、超市查货等明确任务需求时，继续正常聊天。",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
};

const TOOLCALL_PROBE_TOOLS = [
  {
    type: "function",
    function: {
      name: "ping_tool",
      description: "Capability probe tool. Must be called when the model supports tool calling.",
      parameters: {
        type: "object",
        properties: {
          value: {
            type: "string",
            description: "Always set this field to pong.",
          },
        },
        required: ["value"],
      },
    },
  },
];

const RESPONSES_PROBE_TOOLS = [
  {
    type: "function",
    name: "ping_tool",
    description: "Capability probe tool. Must be called when the model supports tool calling.",
    parameters: {
      type: "object",
      properties: {
        value: {
          type: "string",
          description: "Always set this field to pong.",
        },
      },
      required: ["value"],
    },
  },
];

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function normalizeContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("");
  }

  if (content && typeof content.text === "string") {
    return content.text;
  }

  return "";
}

function extractAssistantText(payload) {
  return normalizeContent(payload?.choices?.[0]?.message?.content);
}

function extractDeltaText(payload) {
  return normalizeContent(payload?.choices?.[0]?.delta?.content);
}

function humanizeError(error) {
  if (error?.name === "AbortError") {
    return "请求超时或被中止。";
  }
  return error?.message || String(error);
}

function formatTaskClock(timestamp = Date.now()) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(timestamp);
}

function safeParseJson(text, fallbackValue) {
  try {
    return JSON.parse(text);
  } catch {
    return fallbackValue;
  }
}

function prettyJsonText(text) {
  const parsed = safeParseJson(text, null);
  if (parsed === null) {
    return text;
  }
  return JSON.stringify(parsed, null, 2);
}

function buildStoredForm() {
  if (typeof window === "undefined") {
    return DEFAULT_FORM;
  }

  const parsed = safeParseJson(window.localStorage.getItem(LOCAL_STORAGE_KEY), null);
  if (!parsed || typeof parsed !== "object") {
    return DEFAULT_FORM;
  }

  return {
    ...DEFAULT_FORM,
    ...parsed,
  };
}

function persistForm(form) {
  if (typeof window === "undefined") {
    return;
  }

  const payload = Object.fromEntries(
    PERSISTED_FORM_KEYS.map((key) => [key, form[key]]),
  );
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
}

function stringifyArguments(argumentsObject) {
  if (!argumentsObject || typeof argumentsObject !== "object") {
    return "{}";
  }
  return JSON.stringify(argumentsObject);
}

function parseToolArguments(rawArguments) {
  if (!rawArguments) {
    return {};
  }

  if (typeof rawArguments === "object") {
    return rawArguments;
  }

  return safeParseJson(rawArguments, {});
}

function extractIntentDecision(payload) {
  const toolCall = payload?.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.name) {
    return {
      id: toolCall.id || crypto.randomUUID(),
      name: toolCall.function.name,
      arguments: parseToolArguments(toolCall.function.arguments),
      source: "tool_calls",
    };
  }

  const functionCall = payload?.choices?.[0]?.message?.function_call;
  if (functionCall?.name) {
    return {
      id: crypto.randomUUID(),
      name: functionCall.name,
      arguments: parseToolArguments(functionCall.arguments),
      source: "function_call",
    };
  }

  const content = extractAssistantText(payload);
  const parsedContent = safeParseJson(content, null);
  const parsedFunctionCall = parsedContent?.function_call;
  if (parsedFunctionCall?.name) {
    return {
      id: crypto.randomUUID(),
      name: parsedFunctionCall.name,
      arguments: parseToolArguments(parsedFunctionCall.arguments),
      source: "content.function_call",
    };
  }

  return {
    id: crypto.randomUUID(),
    name: TOOL_NAMES.CONTINUE_CHAT,
    arguments: {},
    source: "fallback",
  };
}

function extractResponsesFunctionCall(payload) {
  const outputItems = Array.isArray(payload?.output) ? payload.output : [];

  for (const item of outputItems) {
    if (item?.type !== "function_call" || !item.name) {
      continue;
    }

    return {
      id: item.call_id || item.id || crypto.randomUUID(),
      name: item.name,
      arguments: parseToolArguments(item.arguments),
      source: "responses.output.function_call",
    };
  }

  return {
    id: crypto.randomUUID(),
    name: TOOL_NAMES.CONTINUE_CHAT,
    arguments: {},
    source: "fallback",
  };
}

function extractResponsesText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const outputItems = Array.isArray(payload?.output) ? payload.output : [];
  const texts = [];

  for (const item of outputItems) {
    if (item?.type === "message" && Array.isArray(item.content)) {
      for (const contentItem of item.content) {
        if (
          contentItem?.type === "output_text" &&
          typeof contentItem.text === "string" &&
          contentItem.text.trim()
        ) {
          texts.push(contentItem.text.trim());
        }
      }
      continue;
    }

    if (
      item?.type === "output_text" &&
      typeof item.text === "string" &&
      item.text.trim()
    ) {
      texts.push(item.text.trim());
    }
  }

  return texts.join("\n").trim();
}

function buildHeaders(apiKey) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  return headers;
}

function getEnabledIntentTools(form) {
  return getEnabledIntentToolNames(form).map(
    (toolName) => INTENT_TOOL_DEFINITIONS[toolName],
  );
}

function toMainRequestConfig(form) {
  return {
    baseUrl: form.baseUrl.trim(),
    apiKey: form.apiKey.trim(),
    apiKeySource: form.apiKey.trim() ? "main" : "none",
    timeoutMs: form.timeoutMs,
    useProxy: form.useProxy,
  };
}

function toIntentRequestConfig(form) {
  const intentApiKey = form.intentApiKey.trim();
  const mainApiKey = form.apiKey.trim();

  return {
    baseUrl: form.intentBaseUrl.trim() || form.baseUrl,
    apiKey: intentApiKey || mainApiKey,
    apiKeySource: intentApiKey ? "intent" : (mainApiKey ? "main-fallback" : "none"),
    timeoutMs: form.timeoutMs,
    useProxy: form.useProxy,
  };
}

function describeRequestConfig(label, config, extra = {}) {
  return [
    `----- ${label} config -----`,
    `baseUrl: ${config.baseUrl || "[empty]"}`,
    `apiKeySource: ${config.apiKeySource || "unknown"}`,
    `authorization: ${config.apiKey ? "present" : "missing"}`,
    ...Object.entries(extra).map(([key, value]) => `${key}: ${value}`),
  ].join("\n");
}

function buildVisibleConversation(targetMessages, systemPrompt) {
  const nextMessages = [];

  if (systemPrompt.trim()) {
    nextMessages.push({
      role: MESSAGE_ROLES.SYSTEM,
      content: systemPrompt.trim(),
    });
  }

  for (const message of targetMessages) {
    if (!DISPLAYABLE_HISTORY_ROLES.has(message.role)) {
      continue;
    }

    nextMessages.push({
      role: message.role,
      content: message.content,
    });
  }

  return nextMessages;
}

function buildChatPayload(form, targetMessages, stream) {
  return {
    model: form.model.trim(),
    messages: buildVisibleConversation(targetMessages, form.systemPrompt),
    max_tokens: Number(form.maxTokens || 256),
    temperature: Number(form.temperature || 0.2),
    stream,
  };
}

function buildToolContextPayload(form, targetMessages, decision, toolResult, stream) {
  return {
    model: form.model.trim(),
    messages: [
      ...buildVisibleConversation(targetMessages, form.systemPrompt),
      {
        role: MESSAGE_ROLES.SYSTEM,
        content: [
          "前端本地模拟服务已经执行完成，这不是一次真实 tool_call。",
          "不要再声明调用工具，也不要复述系统过程，只需要基于下面结果直接回答用户。",
          `intent_name: ${decision.name}`,
          `arguments: ${stringifyArguments(decision.arguments)}`,
          "service_result:",
          toolResult.rawResult,
        ].join("\n"),
      },
    ],
    max_tokens: Number(form.maxTokens || 256),
    temperature: Number(form.temperature || 0.2),
    stream,
  };
}

function buildIntentPayload(form, targetMessages) {
  return {
    model: form.intentModel.trim() || form.model.trim(),
    messages: buildVisibleConversation(targetMessages, form.intentSystemPrompt),
    tools: getEnabledIntentTools(form),
    tool_choice: "required",
    parallel_tool_calls: false,
    temperature: 0,
    max_tokens: 128,
    stream: false,
  };
}

function buildToolcallProbePayload(form) {
  return {
    model: form.intentModel.trim() || form.model.trim(),
    messages: [
      {
        role: MESSAGE_ROLES.SYSTEM,
        content: [
          "You are a capability probe.",
          "You must call ping_tool exactly once.",
          "Do not answer in natural language.",
          'Set arguments.value to "pong".',
        ].join("\n"),
      },
      {
        role: MESSAGE_ROLES.USER,
        content: "Please call the required tool now.",
      },
    ],
    tools: TOOLCALL_PROBE_TOOLS,
    tool_choice: "required",
    parallel_tool_calls: false,
    temperature: 0,
    max_tokens: 64,
    stream: false,
  };
}

function buildResponsesProbePayload(form) {
  return {
    model: form.intentModel.trim() || form.model.trim(),
    instructions: [
      "You are a capability probe.",
      "You must call ping_tool exactly once.",
      "Do not answer in natural language.",
      'Set arguments.value to "pong".',
    ].join("\n"),
    input: "Please call the required tool now.",
    tools: RESPONSES_PROBE_TOOLS,
    tool_choice: "required",
    temperature: 0,
    max_output_tokens: 64,
  };
}

function buildTimeSnapshot() {
  const now = new Date();
  const weekdays = [
    "星期日",
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六",
  ];
  const pad = (value) => String(value).padStart(2, "0");

  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    weekday: weekdays[now.getDay()],
  };
}

function buildMockToolResult(decision) {
  if (decision.name === TOOL_NAMES.GET_TIME) {
    const snapshot = buildTimeSnapshot();
    return {
      rawResult: `当前日期: ${snapshot.date}，当前时间: ${snapshot.time}，${snapshot.weekday}`,
      responseText: `现在是 ${snapshot.time}，${snapshot.weekday}。`,
    };
  }

  if (decision.name === TOOL_NAMES.GET_WEATHER) {
    const location =
      typeof decision.arguments.location === "string" &&
      decision.arguments.location.trim()
        ? decision.arguments.location.trim()
        : "当前定位城市";

    return {
      rawResult: [
        `您查询的位置是：${location}`,
        "",
        "当前天气: 多云",
        "详细参数：",
        "  · 温度: 22℃",
        "  · 体感温度: 20℃",
        "  · 湿度: 67%",
        "  · 风向风力: 东南风 3 级",
        "",
        "未来2小时提示：",
        "  · 17:00 多云，22℃",
        "  · 18:00 多云，21℃",
        "",
        "（如需更精细的逐小时天气，请告诉我具体日期或时段）",
      ].join("\n"),
      responseText: `${location} 现在多云，22 度，湿度 67%，未来两小时天气比较稳定。`,
    };
  }

  return {
    rawResult: "未命中 mock tool。",
    responseText: "这次没有命中可执行工具，我先继续正常聊天。",
  };
}

function guessSupermarketItem(userMessage) {
  const cleaned = userMessage
    .replace(/[，。！？,.!?]/g, " ")
    .replace(
      /帮我|帮忙|请|查一下|查下|看看|问一下|问下|超市|门店|附近|有没有|有没|还有没有|现货|货|一下|个/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned) {
    return cleaned;
  }

  return "无糖酸奶";
}

function guessSupermarketStore(userMessage) {
  if (userMessage.includes("盒马")) {
    return "盒马鲜生";
  }
  if (userMessage.includes("永辉")) {
    return "永辉超市";
  }
  if (userMessage.includes("山姆")) {
    return "山姆会员店";
  }
  return "附近超市";
}

function createTaskEvent(status, progress, message) {
  return {
    id: crypto.randomUUID(),
    status,
    progress,
    message,
    at: formatTaskClock(),
  };
}

function buildSupermarketTask(decision, userMessage) {
  const item =
    typeof decision.arguments.item === "string" && decision.arguments.item.trim()
      ? decision.arguments.item.trim()
      : guessSupermarketItem(userMessage);
  const store =
    typeof decision.arguments.store === "string" && decision.arguments.store.trim()
      ? decision.arguments.store.trim()
      : guessSupermarketStore(userMessage);

  const acceptedMessage = "已接受超市查货请求，开始整理商品名称和门店范围。";

  return {
    id: crypto.randomUUID(),
    intent: TOOL_NAMES.CHECK_SUPERMARKET_STOCK,
    item,
    store,
    status: ASYNC_TASK_STATUS.ACCEPTED,
    progress: 12,
    currentMessage: acceptedMessage,
    updates: [createTaskEvent(ASYNC_TASK_STATUS.ACCEPTED, 12, acceptedMessage)],
    result: "",
    pendingMerge: false,
    createdAt: Date.now(),
  };
}

function buildSupermarketResult(task) {
  return [
    `你刚才让我查的 ${task.item}，我查到了。`,
    `${task.store} 回复说目前还有现货，货架上大约还剩 6 件。`,
    "门店建议一小时内去拿，会更稳妥。",
    "要我继续帮你问价格，或者顺便再查别的商品吗？",
  ].join("\n");
}

function buildSupermarketDispatchPayload(form, targetMessages, task) {
  return {
    model: form.model.trim(),
    messages: [
      ...buildVisibleConversation(targetMessages, form.systemPrompt),
      {
        role: MESSAGE_ROLES.SYSTEM,
        content: [
          "你识别到用户想查超市商品库存。",
          "真正的完整查货结果会由后台异步任务生成。",
          "你当前只能给出一条同步确认回复，不要直接编造库存结果。",
          `item: ${task.item}`,
          `store: ${task.store}`,
          "请用自然中文在两句以内告诉用户：你已经接到任务，正在联系超市确认库存，稍后会把结果带回来。",
        ].join("\n"),
      },
    ],
    max_tokens: Number(form.maxTokens || 256),
    temperature: Number(form.temperature || 0.2),
    stream: form.stream,
  };
}

function buildSupermarketNotification(task) {
  return [
    `关于你刚才让我查的超市商品，我已经问到了。`,
    `商品：${task.item}，门店：${task.store}。`,
    "",
    task.result,
  ].join("\n");
}

function buildIntentMessage(decision) {
  if (decision.source === "fallback") {
    return "前置 intent 没有返回可解析的结构化工具选择，前端降级为 continue_chat。";
  }

  if (decision.name === TOOL_NAMES.CONTINUE_CHAT) {
    return "前置 intent 判断为 continue_chat，直接进入主对话模型。";
  }

  if (decision.name === TOOL_NAMES.CHECK_SUPERMARKET_STOCK) {
    return `前置 intent 命中 ${decision.name}，编排层将它路由为异步超市查货任务，参数：${stringifyArguments(decision.arguments)}`;
  }

  return `前置 intent 命中 ${decision.name}，参数：${stringifyArguments(decision.arguments)}`;
}

function formatStatusFromDecision(decision) {
  if (decision.name === TOOL_NAMES.CONTINUE_CHAT) {
    return "未命中工具，将直接进入主聊天模型。";
  }

  if (decision.name === TOOL_NAMES.CHECK_SUPERMARKET_STOCK) {
    return "命中 check_supermarket_stock，当前轮会先同步确认，查货结果转为异步任务并实时展示进度。";
  }

  return `命中 ${decision.name}，前端 mock tool 会固定等待 ${TOOL_DELAY_MS / 1000} 秒后返回。`;
}

export default function App() {
  const [form, setForm] = useState(buildStoredForm);
  const [messages, setMessages] = useState([]);
  const [asyncTasks, setAsyncTasks] = useState([]);
  const [expandedTaskIds, setExpandedTaskIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [rawOutput, setRawOutput] = useState("");
  const [status, setStatus] = useState({
    kind: "warning",
    title: "等待测试",
    text: "默认按灵矽当前主路径模拟：前置 intent 判工具，时间/天气同步返回；如果命中 check_supermarket_stock，则由编排层转成异步任务，等同步回复结束后再把查货结果合流进下一条消息。",
  });
  const chatListRef = useRef(null);
  const messagesRef = useRef(messages);
  const asyncTasksRef = useRef(asyncTasks);
  const syncTurnInFlightRef = useRef(false);

  useEffect(() => {
    const element = chatListRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    asyncTasksRef.current = asyncTasks;
  }, [asyncTasks]);

  useEffect(() => {
    persistForm(form);
  }, [form]);

  useEffect(() => {
    setForm((current) => {
      const nextPrompt = buildDefaultIntentSystemPrompt(current);
      if (current.intentSystemPrompt === nextPrompt) {
        return current;
      }

      return {
        ...current,
        intentSystemPrompt: nextPrompt,
      };
    });
  }, [
    form.toolEnabledWeather,
    form.toolEnabledTime,
    form.toolEnabledSupermarketStock,
  ]);

  function updateForm(key, value) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function setStatusBox(kind, title, text) {
    setStatus({ kind, title, text });
  }

  function appendRawOutput(value) {
    setRawOutput((current) => (current ? `${current}\n${value}` : value));
  }

  function getAsyncTaskById(taskId) {
    return asyncTasksRef.current.find((task) => task.id === taskId) || null;
  }

  function ensureTaskExpanded(taskId) {
    setExpandedTaskIds((current) => (
      current.includes(taskId) ? current : [...current, taskId]
    ));
  }

  function toggleTaskExpanded(taskId) {
    setExpandedTaskIds((current) => (
      current.includes(taskId)
        ? current.filter((id) => id !== taskId)
        : [...current, taskId]
    ));
  }

  function addAsyncTask(task) {
    setAsyncTasks((current) => {
      const nextTasks = [task, ...current];
      asyncTasksRef.current = nextTasks;
      return nextTasks;
    });
    ensureTaskExpanded(task.id);
  }

  function updateAsyncTask(taskId, statusValue, progress, message, extra = {}) {
    const update = createTaskEvent(statusValue, progress, message);
    setAsyncTasks((current) => {
      const nextTasks = current.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        return {
          ...task,
          status: statusValue,
          progress,
          currentMessage: message,
          updates: [...task.updates, update],
          ...extra,
        };
      });
      asyncTasksRef.current = nextTasks;
      return nextTasks;
    });
    appendRawOutput(
      `----- async task update -----\n${taskId} -> ${statusValue} (${progress}%)\n${message}`,
    );
  }

  function handleAsyncTaskStatusCallback(taskId, payload) {
    appendRawOutput(
      `----- async notify callback -----\nPOST /mock/async-tasks/${taskId}/status\n${JSON.stringify(payload, null, 2)}`,
    );
    updateAsyncTask(
      taskId,
      payload.status,
      payload.progress,
      payload.message,
      payload.extra || {},
    );
  }

  function flushAsyncTaskNotification(taskId) {
    const currentTask = getAsyncTaskById(taskId);
    if (
      !currentTask ||
      !currentTask.result ||
      syncTurnInFlightRef.current ||
      currentTask.status === ASYNC_TASK_STATUS.NOTIFIED
    ) {
      return;
    }

    const notification = buildSupermarketNotification(currentTask);
    setMessages((current) => [
      ...current,
      {
        role: MESSAGE_ROLES.ASSISTANT,
        content: notification,
      },
    ]);
    appendRawOutput(`----- async task notified -----\n${notification}`);
    updateAsyncTask(
      taskId,
      ASYNC_TASK_STATUS.NOTIFIED,
      100,
      "查货结果已作为下一条 assistant 消息通知给用户。",
      {
        pendingMerge: false,
        notifiedAt: Date.now(),
      },
    );
  }

  function maybeFlushAsyncTaskNotifications() {
    if (syncTurnInFlightRef.current) {
      return;
    }

    const readyTaskIds = asyncTasksRef.current
      .filter((task) => task.result && task.status !== ASYNC_TASK_STATUS.NOTIFIED)
      .sort((left, right) => (left.completedAt || left.createdAt) - (right.completedAt || right.createdAt))
      .map((task) => task.id);

    for (const taskId of readyTaskIds) {
      flushAsyncTaskNotification(taskId);
    }
  }

  async function runAsyncTaskLifecycle(task) {
    for (const step of ASYNC_TASK_UPDATES) {
      await sleep(ASYNC_TASK_STEP_DELAY_MS);
      const latestTask = getAsyncTaskById(task.id);
      if (!latestTask) {
        return;
      }
      handleAsyncTaskStatusCallback(task.id, step);
    }

    await sleep(ASYNC_TASK_STEP_DELAY_MS);
    const latestTask = getAsyncTaskById(task.id);
    if (!latestTask) {
      return;
    }

    const result = buildSupermarketResult(latestTask);
    handleAsyncTaskStatusCallback(task.id, {
      status: ASYNC_TASK_STATUS.COMPLETED,
      progress: 100,
      message: syncTurnInFlightRef.current
        ? "查货结果已经整理好，等待当前同步回复结束后再通知用户。"
        : "查货结果已经整理好，可以立即作为下一条消息通知用户。",
      extra: {
        result,
        completedAt: Date.now(),
        pendingMerge: syncTurnInFlightRef.current,
      },
    });

    if (!syncTurnInFlightRef.current) {
      flushAsyncTaskNotification(task.id);
    }
  }

  async function requestWithConfig(config, path, options = {}) {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => controller.abort(),
      Number(config.timeoutMs || 60000),
    );

    try {
      if (config.useProxy) {
        return await fetch("/proxy/request", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            baseUrl: config.baseUrl.trim(),
            path,
            method: options.method || "GET",
            headers: buildHeaders(config.apiKey),
            body: options.body,
          }),
          signal: controller.signal,
        });
      }

      return await fetch(
        `${config.baseUrl.trim().replace(/\/+$/, "")}${path}`,
        {
          ...options,
          headers: buildHeaders(config.apiKey),
          signal: controller.signal,
        },
      );
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function listModels() {
    const requestConfig = toMainRequestConfig(form);
    setBusy(true);
    setRawOutput("");
    setStatusBox("warning", "请求中", "正在拉取主聊天模型列表...");
    appendRawOutput(describeRequestConfig("main-models", requestConfig));

    try {
      const response = await requestWithConfig(requestConfig, ENDPOINTS.MODELS, {
        method: "GET",
      });
      const text = await response.text();
      setRawOutput(text);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const parsed = safeParseJson(text, {});
      const ids = Array.isArray(parsed.data)
        ? parsed.data.map((item) => item.id).filter(Boolean)
        : [];

      setStatusBox(
        "ok",
        "模型列表成功",
        ids.length ? `共返回 ${ids.length} 个模型。` : "请求成功，但未解析到模型 ID。",
      );
    } catch (error) {
      appendRawOutput(`[error] ${humanizeError(error)}`);
      setStatusBox("error", "模型列表失败", humanizeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function sendMinimal() {
    const requestConfig = toMainRequestConfig(form);
    setBusy(true);
    setRawOutput("");
    setStatusBox("warning", "请求中", "正在发送主模型最小请求...");

    const previewMessages = [
      {
        role: MESSAGE_ROLES.USER,
        content: MINIMAL_PROMPT,
      },
    ];
    const payload = buildChatPayload(form, previewMessages, false);
    setRawOutput(
      `${describeRequestConfig("main-minimal", requestConfig, {
        model: form.model.trim(),
      })}\n${JSON.stringify(payload, null, 2)}`,
    );

    try {
      const response = await requestWithConfig(
        requestConfig,
        ENDPOINTS.CHAT_COMPLETIONS,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      const text = await response.text();
      appendRawOutput(`\n----- response -----\n${text}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const parsed = safeParseJson(text, {});
      const content = extractAssistantText(parsed);
      setStatusBox(
        "ok",
        "最小请求成功",
        content ? `模型返回：${content}` : "请求成功，但未解析到 assistant 内容。",
      );
    } catch (error) {
      appendRawOutput(`\n[error] ${humanizeError(error)}`);
      setStatusBox("error", "最小请求失败", humanizeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function runIntentDetection(targetMessages) {
    const requestConfig = toIntentRequestConfig(form);
    const payload = buildIntentPayload(form, targetMessages);
    appendRawOutput(
      `${describeRequestConfig("intent", requestConfig, {
        model: form.intentModel.trim() || form.model.trim(),
      })}\n----- intent request -----\n${JSON.stringify(payload, null, 2)}`,
    );

    const response = await requestWithConfig(
      requestConfig,
      ENDPOINTS.CHAT_COMPLETIONS,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
    const text = await response.text();
    appendRawOutput(`----- intent response -----\n${prettyJsonText(text)}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return extractIntentDecision(safeParseJson(text, {}));
  }

  async function probeToolcallSupport() {
    const requestConfig = toIntentRequestConfig(form);
    const payload = buildToolcallProbePayload(form);
    setBusy(true);
    setRawOutput("");
    setStatusBox("warning", "探针执行中", "正在验证上游是否真的返回 tool_calls...");
    appendRawOutput(
      `${describeRequestConfig("toolcall-probe", requestConfig, {
        model: form.intentModel.trim() || form.model.trim(),
      })}\n----- toolcall probe request -----\n${JSON.stringify(payload, null, 2)}`,
    );

    try {
      const response = await requestWithConfig(
        requestConfig,
        ENDPOINTS.CHAT_COMPLETIONS,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      const text = await response.text();
      appendRawOutput(`----- toolcall probe response -----\n${prettyJsonText(text)}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const parsed = safeParseJson(text, {});
      const decision = extractIntentDecision(parsed);
      if (decision.source !== "fallback") {
        setStatusBox(
          "ok",
          "探针成功",
          `上游返回了结构化工具选择：${decision.name}，来源 ${decision.source}。`,
        );
        return;
      }

      const content = extractAssistantText(parsed);
      setStatusBox(
        "error",
        "探针失败",
        content
          ? "上游返回了普通文本，没有返回结构化 tool_calls。"
          : "上游没有返回可解析的 tool_calls / function_call 结构。",
      );
    } catch (error) {
      appendRawOutput(`[error] ${humanizeError(error)}`);
      setStatusBox("error", "探针失败", humanizeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function probeResponsesToolSupport() {
    const requestConfig = toIntentRequestConfig(form);
    const payload = buildResponsesProbePayload(form);
    setBusy(true);
    setRawOutput("");
    setStatusBox("warning", "探针执行中", "正在对照验证 /responses 和 /v1/responses 是否返回 function_call...");

    const probeResults = [];

    try {
      for (const path of RESPONSES_PATHS) {
        appendRawOutput(
          `${describeRequestConfig("responses-tool-probe", requestConfig, {
            model: form.intentModel.trim() || form.model.trim(),
            path,
          })}\n----- responses probe request -----\n${JSON.stringify(payload, null, 2)}`,
        );

        try {
          const response = await requestWithConfig(
            requestConfig,
            path,
            {
              method: "POST",
              body: JSON.stringify(payload),
            },
          );
          const text = await response.text();
          appendRawOutput(`----- responses probe response (${path}) -----\n${prettyJsonText(text)}`);

          if (!response.ok) {
            probeResults.push({
              path,
              ok: false,
              reason: `HTTP ${response.status}`,
            });
            continue;
          }

          const parsed = safeParseJson(text, {});
          const decision = extractResponsesFunctionCall(parsed);
          const content = extractResponsesText(parsed);

          if (decision.source !== "fallback") {
            probeResults.push({
              path,
              ok: true,
              reason: `function_call: ${decision.name}`,
            });
            continue;
          }

          probeResults.push({
            path,
            ok: false,
            reason: content
              ? "returned text without function_call"
              : "no parseable function_call",
          });
        } catch (error) {
          appendRawOutput(`[error:${path}] ${humanizeError(error)}`);
          probeResults.push({
            path,
            ok: false,
            reason: humanizeError(error),
          });
        }
      }

      const successResults = probeResults.filter((result) => result.ok);
      if (successResults.length > 0) {
        setStatusBox(
          "ok",
          "Responses 对照探针成功",
          successResults.map((result) => `${result.path}: ${result.reason}`).join(" | "),
        );
        return;
      }

      setStatusBox(
        "error",
        "Responses 对照探针失败",
        probeResults.map((result) => `${result.path}: ${result.reason}`).join(" | "),
      );
    } catch (error) {
      appendRawOutput(`[error] ${humanizeError(error)}`);
      setStatusBox("error", "Responses 对照探针失败", humanizeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function previewIntent() {
    const userMessage = form.userInput.trim();
    if (!userMessage) {
      setStatusBox("error", "意图识别失败", "User Message 不能为空。");
      return;
    }

    setBusy(true);
    setRawOutput("");
    setStatusBox("warning", "意图识别中", "正在只跑前置 intent 模型...");

    try {
      const decision = await runIntentDetection([
        ...messages,
        {
          role: MESSAGE_ROLES.USER,
          content: userMessage,
        },
      ]);

      setStatusBox("ok", "意图识别完成", formatStatusFromDecision(decision));
    } catch (error) {
      appendRawOutput(`[error] ${humanizeError(error)}`);
      setStatusBox("error", "意图识别失败", humanizeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function runAssistantOnce(targetMessages, payload, successTitle, successText) {
    const requestConfig = toMainRequestConfig(form);
    const response = await requestWithConfig(
      requestConfig,
      ENDPOINTS.CHAT_COMPLETIONS,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
    const text = await response.text();
    appendRawOutput(`----- chat response -----\n${text}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const parsed = safeParseJson(text, {});
    const content = extractAssistantText(parsed) || "[empty response]";
    setMessages([
      ...targetMessages,
      {
        role: MESSAGE_ROLES.ASSISTANT,
        content,
      },
    ]);
    setStatusBox("ok", successTitle, successText);
  }

  async function runAssistantStream(targetMessages, payload, successTitle, successText) {
    const requestConfig = toMainRequestConfig(form);
    const response = await requestWithConfig(
      requestConfig,
      ENDPOINTS.CHAT_COMPLETIONS,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      appendRawOutput(`----- chat response -----\n${text}`);
      throw new Error(`HTTP ${response.status}`);
    }

    if (!response.body) {
      throw new Error("流式响应没有返回 body。");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let content = "";

    setMessages([
      ...targetMessages,
      {
        role: MESSAGE_ROLES.ASSISTANT,
        content: "正在接收流式返回...",
      },
    ]);

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() || "";

      for (const chunk of chunks) {
        const lines = chunk
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);

        for (const line of lines) {
          if (!line.startsWith("data:")) {
            continue;
          }

          const data = line.slice(5).trim();
          if (data === "[DONE]") {
            continue;
          }

          appendRawOutput(data);

          const parsed = safeParseJson(data, null);
          const delta = parsed ? extractDeltaText(parsed) : "";
          if (!delta) {
            continue;
          }

          content += delta;
          setMessages([
            ...targetMessages,
            {
              role: MESSAGE_ROLES.ASSISTANT,
              content,
            },
          ]);
        }
      }
    }

    setMessages([
      ...targetMessages,
      {
        role: MESSAGE_ROLES.ASSISTANT,
        content: content || "[empty stream response]",
      },
    ]);
    setStatusBox("ok", successTitle, successText);
  }

  async function runAssistantRequest(targetMessages, payload, successTitle, successText) {
    appendRawOutput(
      `----- chat request -----\n${JSON.stringify(payload, null, 2)}`,
    );

    if (form.stream) {
      await runAssistantStream(targetMessages, payload, successTitle, successText);
      return;
    }

    await runAssistantOnce(targetMessages, payload, successTitle, successText);
  }

  async function runSynchronousAssistantTurn(
    targetMessages,
    payload,
    successTitle,
    successText,
  ) {
    syncTurnInFlightRef.current = true;
    try {
      await runAssistantRequest(targetMessages, payload, successTitle, successText);
    } finally {
      syncTurnInFlightRef.current = false;
      maybeFlushAsyncTaskNotifications();
    }
  }

  async function sendChat() {
    const userMessage = form.userInput.trim();
    if (!userMessage) {
      setStatusBox("error", "发送失败", "User Message 不能为空。");
      return;
    }

    const userTurnMessages = [
      ...messages,
      {
        role: MESSAGE_ROLES.USER,
        content: userMessage,
      },
    ];

    setMessages(userTurnMessages);
    updateForm("userInput", "");
    setRawOutput("");
    setBusy(true);

    try {
      if (!form.intentEnabled) {
        setStatusBox("warning", "主模型处理中", "当前未启用前置 intent，直接进入主对话模型。");
        const payload = buildChatPayload(form, userTurnMessages, form.stream);
        await runSynchronousAssistantTurn(
          userTurnMessages,
          payload,
          "对话完成",
          "当前这轮没有经过前置 intent，直接由主模型回答。",
        );
        return;
      }

      setStatusBox("warning", "意图识别中", "正在运行前置 intent 模型...");
      const decision = await runIntentDetection(userTurnMessages);
      const messagesWithIntent = [
        ...userTurnMessages,
        {
          role: MESSAGE_ROLES.INTENT,
          content: buildIntentMessage(decision),
        },
      ];
      setMessages(messagesWithIntent);

      if (decision.name === TOOL_NAMES.CHECK_SUPERMARKET_STOCK) {
        const nextTask = buildSupermarketTask(decision, userMessage);
        addAsyncTask(nextTask);
        appendRawOutput(
          `----- async task created -----\n${nextTask.id}\nintent: ${nextTask.intent}\nitem: ${nextTask.item}\nstore: ${nextTask.store}`,
        );
        void runAsyncTaskLifecycle(nextTask);
        setStatusBox(
          "warning",
          "查货任务已派发",
          "check_supermarket_stock 已被编排层转换为异步任务。当前轮会先同步确认，右侧异步任务侧边栏会每 3 秒更新一次进度。",
        );
        const payload = buildSupermarketDispatchPayload(form, userTurnMessages, nextTask);
        await runSynchronousAssistantTurn(
          messagesWithIntent,
          payload,
          "查货任务已接受",
          "同步确认已经返回；查货仍在后台处理中，完成后会作为下一条 assistant 消息合流回来。",
        );
        return;
      }

      if (decision.name === TOOL_NAMES.CONTINUE_CHAT) {
        setStatusBox("warning", "主模型处理中", "未命中工具，继续进入主聊天模型。");
        const payload = buildChatPayload(form, messagesWithIntent, form.stream);
        await runSynchronousAssistantTurn(
          messagesWithIntent,
          payload,
          "对话完成",
          "前置 intent 判断为 continue_chat，主模型已直接回复。",
        );
        return;
      }

      setStatusBox(
        "warning",
        "工具执行中",
        `命中 ${decision.name}，mock tool 固定等待 ${TOOL_DELAY_MS / 1000} 秒后返回。`,
      );
      appendRawOutput(
        `----- tool pending -----\n${decision.name} will resolve after ${TOOL_DELAY_MS}ms`,
      );
      await sleep(TOOL_DELAY_MS);

      const toolResult = buildMockToolResult(decision);
      appendRawOutput(`----- tool result -----\n${toolResult.rawResult}`);
      const messagesWithTool = [
        ...messagesWithIntent,
        {
          role: MESSAGE_ROLES.TOOL,
          content: toolResult.rawResult,
        },
      ];
      setMessages(messagesWithTool);

      if (form.toolResponseMode === TOOL_RESPONSE_MODES.DIRECT) {
        setMessages([
          ...messagesWithTool,
          {
            role: MESSAGE_ROLES.ASSISTANT,
            content: toolResult.responseText,
          },
        ]);
        setStatusBox(
          "ok",
          "工具直出完成",
          "当前走的是直接返回工具结果，不再把原始数据回交给主 LLM。",
        );
        return;
      }

      setStatusBox(
        "warning",
        "主模型润色中",
        "前端本地服务已经返回原始数据，正在把结果作为普通上下文交给主 LLM 组织最终回复。",
      );
      const payload = buildToolContextPayload(
        form,
        userTurnMessages,
        decision,
        toolResult,
        form.stream,
      );
      await runSynchronousAssistantTurn(
        messagesWithTool,
        payload,
        "工具回流完成",
        "前端本地服务的原始结果已经作为普通上下文回交主 LLM，并生成了最终回复。",
      );
    } catch (error) {
      appendRawOutput(`[error] ${humanizeError(error)}`);
      setStatusBox("error", "对话失败", humanizeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyCurl() {
    const previewMessages = [
      ...messages,
      {
        role: MESSAGE_ROLES.USER,
        content: form.userInput.trim() || MINIMAL_PROMPT,
      },
    ];
    const payload = buildChatPayload(form, previewMessages, false);
    const curl = [
      `curl "${form.baseUrl.trim().replace(/\/+$/, "")}${ENDPOINTS.CHAT_COMPLETIONS}" \\`,
      `  -H "Authorization: Bearer ${form.apiKey.trim() || "<YOUR_API_KEY>"}" \\`,
      '  -H "Content-Type: application/json" \\',
      `  -d '${JSON.stringify(payload)}'`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(curl);
      setStatusBox("ok", "已复制", "主聊天模型对应的 curl 命令已经复制到剪贴板。");
    } catch (error) {
      setStatusBox("error", "复制失败", humanizeError(error));
    }
  }

  function clearHistory() {
    setMessages([]);
    setAsyncTasks([]);
    asyncTasksRef.current = [];
    setExpandedTaskIds([]);
    syncTurnInFlightRef.current = false;
    setRawOutput("");
    setStatusBox("warning", "已清空", "对话历史、异步任务状态和调试输出已经清空。");
  }

  function clearStoredConfig() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
    setForm(DEFAULT_FORM);
    setStatusBox("warning", "本地配置已清空", "localStorage 中保存的模型配置和 API Key 已移除。");
  }

  return (
    <div className="page-shell">
      <header className="hero">
        <p className="hero-tag">Vite + React Demo</p>
        <h1>灵矽前置意图识别 + 工具回流模拟</h1>
        <p className="hero-copy">
          这个页面把灵矽当前更常见的链路搬到了前端：先跑独立 intent 模型决定
          <code>get_weather</code> / <code>get_time</code> / <code>check_supermarket_stock</code> /
          <code>continue_chat</code>。天气和时间走同步链路；如果命中
          <code>check_supermarket_stock</code>，编排层会派发异步查货任务，右侧实时展示进度，并在当前同步回复结束后把查货结果作为下一条消息合流回来。
        </p>
      </header>

      <main className="layout">
        <section className="panel">
          <div className="panel-head">
            <h2>配置与策略</h2>
          </div>
          <div className="panel-body form-stack">
            <section className="config-block">
              <p className="section-kicker">Main Chat Model</p>
              <p className="note">
                这里的 <code>Base URL</code> 可以直接改成任意 OpenAI-compatible 服务地址。
                主模型列表、最小请求和正式对话都会复用这一组配置。
              </p>
              <div className="field">
                <label htmlFor="baseUrl">Base URL</label>
                <input
                  id="baseUrl"
                  value={form.baseUrl}
                  placeholder="例如：https://api.cloudappl.com"
                  onChange={(event) => updateForm("baseUrl", event.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="apiKey">API Key</label>
                <input
                  id="apiKey"
                  type="password"
                  value={form.apiKey}
                  placeholder="sk-..."
                  onChange={(event) => updateForm("apiKey", event.target.value)}
                />
              </div>

              <div className="field-row">
                <div className="field">
                  <label htmlFor="model">Model</label>
                  <input
                    id="model"
                    value={form.model}
                    onChange={(event) => updateForm("model", event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="maxTokens">Max Tokens</label>
                  <input
                    id="maxTokens"
                    type="number"
                    value={form.maxTokens}
                    onChange={(event) => updateForm("maxTokens", event.target.value)}
                  />
                </div>
              </div>

              <div className="field-row">
                <div className="field">
                  <label htmlFor="temperature">Temperature</label>
                  <input
                    id="temperature"
                    type="number"
                    step="0.1"
                    value={form.temperature}
                    onChange={(event) => updateForm("temperature", event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="timeoutMs">Timeout (ms)</label>
                  <input
                    id="timeoutMs"
                    type="number"
                    step="1000"
                    value={form.timeoutMs}
                    onChange={(event) => updateForm("timeoutMs", event.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="systemPrompt">Chat System Prompt</label>
                <textarea
                  id="systemPrompt"
                  value={form.systemPrompt}
                  placeholder="可选"
                  onChange={(event) => updateForm("systemPrompt", event.target.value)}
                />
              </div>
            </section>

            <section className="config-block">
              <p className="section-kicker">Intent Model</p>
              <p className="note">
                这里也可以单独切换到另一套 <code>Base URL</code>。前置 intent、
                Chat ToolCall 探针、Responses 对照探针都会复用这一组配置；留空时会回退到主模型配置。
              </p>
              <div className="field">
                <label htmlFor="intentBaseUrl">Intent Base URL</label>
                <input
                  id="intentBaseUrl"
                  value={form.intentBaseUrl}
                  placeholder="留空则复用主模型 Base URL"
                  onChange={(event) => updateForm("intentBaseUrl", event.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="intentApiKey">Intent API Key</label>
                <input
                  id="intentApiKey"
                  type="password"
                  value={form.intentApiKey}
                  placeholder="留空则复用主模型 API Key"
                  onChange={(event) => updateForm("intentApiKey", event.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="intentModel">Intent Model</label>
                <input
                  id="intentModel"
                  value={form.intentModel}
                  placeholder="留空则复用主模型 Model"
                  onChange={(event) => updateForm("intentModel", event.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="intentSystemPrompt">Intent System Prompt</label>
                <textarea
                  id="intentSystemPrompt"
                  value={form.intentSystemPrompt}
                  onChange={(event) => updateForm("intentSystemPrompt", event.target.value)}
                />
              </div>

              <div className="field">
                <label>Intent Tools</label>
                <div className="toggle-row">
                  <label className="toggle-item">
                    <input
                      type="checkbox"
                      checked={form.toolEnabledWeather}
                      onChange={(event) =>
                        updateForm("toolEnabledWeather", event.target.checked)
                      }
                    />
                    <span>{TOOL_NAMES.GET_WEATHER}</span>
                  </label>
                  <label className="toggle-item">
                    <input
                      type="checkbox"
                      checked={form.toolEnabledTime}
                      onChange={(event) => updateForm("toolEnabledTime", event.target.checked)}
                    />
                    <span>{TOOL_NAMES.GET_TIME}</span>
                  </label>
                  <label className="toggle-item">
                    <input
                      type="checkbox"
                      checked={form.toolEnabledSupermarketStock}
                      onChange={(event) =>
                        updateForm("toolEnabledSupermarketStock", event.target.checked)
                      }
                    />
                    <span>{TOOL_NAMES.CHECK_SUPERMARKET_STOCK}</span>
                  </label>
                </div>
                <p className="note">
                  关闭后的工具不会出现在前置 intent 请求的 <code>tools</code> 列表里，默认提示词也会同步收紧。<code>{TOOL_NAMES.CONTINUE_CHAT}</code> 作为兜底能力始终保留。
                </p>
              </div>
            </section>

            <section className="config-block">
              <p className="section-kicker">Toolcall Probe</p>
              <p className="note">
                这里同时保留两种探针：一个测 <code>/v1/chat/completions</code> 的
                <code>tool_calls</code>，一个对照测 <code>/responses</code> 和
                <code>/v1/responses</code> 的 <code>function_call</code>。两者都会复用当前 Intent 配置。API Key 和模型配置会保存在当前浏览器的
                <code>localStorage</code> 里。
              </p>
              <div className="button-row">
                <button type="button" className="button secondary" onClick={probeToolcallSupport} disabled={busy}>
                  验证 Chat ToolCall 探针
                </button>
                <button type="button" className="button secondary" onClick={probeResponsesToolSupport} disabled={busy}>
                  验证 Responses 对照探针
                </button>
                <button type="button" className="button ghost" onClick={clearStoredConfig} disabled={busy}>
                  清空本地配置
                </button>
              </div>
            </section>

            <section className="config-block">
              <p className="section-kicker">Simulation Policy</p>
              <div className="toggle-row">
                <label className="toggle-item">
                  <input
                    type="checkbox"
                    checked={form.intentEnabled}
                    onChange={(event) => updateForm("intentEnabled", event.target.checked)}
                  />
                  <span>启用前置 Intent</span>
                </label>
                <label className="toggle-item">
                  <input
                    type="checkbox"
                    checked={form.stream}
                    onChange={(event) => updateForm("stream", event.target.checked)}
                  />
                  <span>主模型流式返回</span>
                </label>
                <label className="toggle-item">
                  <input
                    type="checkbox"
                    checked={form.useProxy}
                    onChange={(event) => updateForm("useProxy", event.target.checked)}
                  />
                  <span>使用本地代理</span>
                </label>
              </div>

              <div className="field">
                <label htmlFor="toolResponseMode">工具结果处理方式</label>
                <select
                  id="toolResponseMode"
                  value={form.toolResponseMode}
                  onChange={(event) => updateForm("toolResponseMode", event.target.value)}
                >
                  <option value={TOOL_RESPONSE_MODES.REQLLM}>
                    回交主 LLM 润色（前端上下文注入）
                  </option>
                  <option value={TOOL_RESPONSE_MODES.DIRECT}>工具直出</option>
                </select>
              </div>

              <div className="chip-row">
                {form.toolEnabledWeather ? (
                  <span className="chip">注册工具: {TOOL_NAMES.GET_WEATHER}</span>
                ) : null}
                {form.toolEnabledTime ? (
                  <span className="chip">注册工具: {TOOL_NAMES.GET_TIME}</span>
                ) : null}
                {form.toolEnabledSupermarketStock ? (
                  <span className="chip">
                    异步意图: {TOOL_NAMES.CHECK_SUPERMARKET_STOCK}
                  </span>
                ) : null}
                <span className="chip">兜底工具: {TOOL_NAMES.CONTINUE_CHAT}</span>
                <span className="chip">Mock Delay: {TOOL_DELAY_MS}ms</span>
              </div>

              <p className="note">
                当前灵矽里，天气和时间这类信息工具更常见的返回方式是
                <code>Action.REQLLM</code>，也就是工具先产出原始结果，再交还给主 LLM
                组织用户最终会听到的回复。这个 demo 里，天气和时间服务本身由前端 JS
                直接模拟；<code>check_supermarket_stock</code> 不走同步 tool，而是由编排层转成异步任务。
                Intent 这一栏如果留空，会自动复用主模型的 Base URL、API Key 和 Model。
              </p>
            </section>

            <div className={`status-box status-${status.kind}`}>
              <strong>{status.title}</strong>
              <span>{status.text}</span>
            </div>

            <div className="button-row">
              <button type="button" className="button secondary" onClick={listModels} disabled={busy}>
                拉主模型列表
              </button>
              <button type="button" className="button secondary" onClick={sendMinimal} disabled={busy}>
                发主模型最小请求
              </button>
              <button type="button" className="button secondary" onClick={previewIntent} disabled={busy}>
                只跑 Intent
              </button>
              <button type="button" className="button ghost" onClick={copyCurl} disabled={busy}>
                复制主模型 curl
              </button>
            </div>

            <p className="note">
              如果只是本地调试，优先保留“使用本地代理”开启状态，然后通过 <code>npm run dev</code>
              打开页面。这个 demo 只在前端模拟 intent 和 tool，后端不需要配套改动。
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head panel-head-split">
            <h2>对话与回流观察</h2>
            <div className="button-row">
              <button type="button" className="button primary" onClick={sendChat} disabled={busy}>
                发送对话
              </button>
              <button type="button" className="button ghost" onClick={clearHistory} disabled={busy}>
                清空历史
              </button>
            </div>
          </div>

          <div className="panel-body chat-stack">
            <div className="chat-list" ref={chatListRef}>
              {messages.length === 0 ? (
                <div className="message message-system">
                  <div className="message-role">history</div>
                  <div className="message-text">
                    当前还没有消息。可以先问天气/时间，再试一句“帮我问一下盒马有没有鸡蛋”，观察同步确认、异步进度和结果合流的顺序。
                  </div>
                </div>
              ) : (
                messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`message message-${message.role}`}>
                    <div className="message-role">{message.role}</div>
                    <div className="message-text">{message.content}</div>
                  </div>
                ))
              )}
            </div>

            <div className="field">
              <label htmlFor="userInput">User Message</label>
              <textarea
                id="userInput"
                value={form.userInput}
                placeholder="输入一条消息，例如：帮我查一下附近超市有没有无糖酸奶"
                onChange={(event) => updateForm("userInput", event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="rawOutput">原始响应 / 调试输出</label>
              <pre id="rawOutput" className="raw-output">
                {rawOutput}
              </pre>
            </div>
          </div>
        </section>

        <aside className="panel sidebar-panel">
          <div className="panel-head">
            <h2>异步任务侧边栏</h2>
          </div>

          <div className="panel-body sidebar-stack">
            <p className="note">
              这里单独展示异步任务进度。每一项都可以展开或收起，当前 demo 用本地 mock
              callback 模拟 tool 主动上报状态。
            </p>

            <section className="task-board task-board-sidebar">
              <div className="task-board-head">
                <h3>任务列表</h3>
                <span className="task-board-tip">accepted → processing → finalizing → completed → notified</span>
              </div>

              {asyncTasks.length > 0 ? (
                <div className="task-list">
                  {asyncTasks.map((task) => {
                    const expanded = expandedTaskIds.includes(task.id);
                    return (
                      <div key={task.id} className="task-card">
                        <button
                          type="button"
                          className="task-accordion-trigger"
                          onClick={() => toggleTaskExpanded(task.id)}
                        >
                          <div className="task-card-top">
                            <div>
                              <div className="task-title">{task.item}</div>
                              <div className="task-subtitle">{task.store}</div>
                            </div>
                            <div className="task-head-actions">
                              <span className={`task-status task-status-${task.status}`}>
                                {ASYNC_TASK_STATUS_LABELS[task.status]}
                              </span>
                              <span className="task-toggle-indicator">
                                {expanded ? "收起" : "展开"}
                              </span>
                            </div>
                          </div>
                          <div className="task-summary">
                            <span>{task.progress}%</span>
                            <span>{task.currentMessage}</span>
                          </div>
                        </button>

                        {expanded ? (
                          <div className="task-card-body">
                            <div className="task-progress-track">
                              <div
                                className="task-progress-fill"
                                style={{ width: `${task.progress}%` }}
                              />
                            </div>
                            <div className="task-progress-meta">
                              <span>{task.progress}%</span>
                              <span>{task.currentMessage}</span>
                            </div>
                            <div className="task-update-list">
                              {task.updates.map((update) => (
                                <div key={update.id} className="task-update-item">
                                  <span className="task-update-time">{update.at}</span>
                                  <span className="task-update-status">
                                    {ASYNC_TASK_STATUS_LABELS[update.status]}
                                  </span>
                                  <span className="task-update-message">{update.message}</span>
                                </div>
                              ))}
                            </div>
                            {task.result ? (
                              <div className="task-result-preview">
                                <div className="task-result-label">最终查货结果</div>
                                <div className="task-result-text">{task.result}</div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="task-empty">
                  当前还没有异步任务。你可以试试说“帮我查一下附近超市有没有无糖酸奶”，观察同步确认和异步合流是怎么分开的。
                </div>
              )}
            </section>
          </div>
        </aside>
      </main>
    </div>
  );
}
