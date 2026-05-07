export const WEB_I18N_LANGUAGE_OPTIONS = [
  { value: "en-US", label: "English (US)" },
  { value: "zh-CN", label: "Chinese (Mandarin)" },
  { value: "hi-IN", label: "Hindi" },
  { value: "es-ES", label: "Spanish" },
  { value: "fr-FR", label: "French" },
  { value: "ar-SA", label: "Arabic" },
  { value: "ja-JP", label: "Japanese" },
  { value: "pt-BR", label: "Portuguese" },
  { value: "ru-RU", label: "Russian" },
  { value: "ur-PK", label: "Urdu" },
] as const;

const WEB_I18N_LANGUAGE_VALUES = new Set<string>(
  WEB_I18N_LANGUAGE_OPTIONS.map((option) => option.value)
);

function normalizeDictionaryLanguage(language: string | null | undefined): Locale {
  const value = (language || "").trim();
  return (WEB_I18N_LANGUAGE_VALUES.has(value) ? value : "en-US") as Locale;
}

export const en = {
  settings: "Settings",
  account: "Account",
  preferences: "Preferences",
  apiKeys: "API Keys",
  connectors: "Connectors",
  apps: "Apps",
  home: "Home",
  registry: "Registry",
  workflows: "Workflows",
  chat: "Chat",
  docs: "Docs",
  newChat: "New Chat",
  yourChats: "Your Chats",
  searchChats: "Search chats",
  chatHistory: "History",
  loadingChats: "Loading chats...",
  noChatsYet: "No chats yet",
  rename: "Rename",
  openInNewTab: "Open in new tab",
  pinChat: "Pin chat",
  unpinChat: "Unpin chat",
  pinnedChats: "Pinned",
  todayChats: "Today",
  yesterdayChats: "Yesterday",
  previous7Days: "Previous 7 days",
  previous30Days: "Previous 30 days",
  olderChats: "Older",
  justNow: "Just now",
  share: "Share",
  delete: "Delete",
  copyLink: "Copy link",
  shareConversation: "Share this conversation",
  shareWarning: "This may contain personal information. Please review before sharing.",
  private: "Private",
  public: "Public",
  publicAccess: "Public access",
  onlyYouAccess: "Only you have access",
  anyoneWithLink: "Anyone with the link can view",
  chooseAgentBehavior: "Choose how the agent localizes responses and handles MCP tool execution.",
  themeDescription: "Choose the app color scheme for chat, settings, and connector views.",
  timezoneDescription: "Used for date-sensitive answers, scheduling language, and timestamps.",
  local: "Local",
  saved: "Saved",
  theme: "Theme",
  timezone: "Timezone",
  currentTime: "Current time",
  language: "Language",
  languageWebOnly: "Used for app interface text and locale formatting.",
  mcpToolApproval: "MCP tool approval",
  askEveryTime: "Ask every time",
  askRiskyTools: "Ask for risky tools",
  runAutomatically: "Run automatically",
  selectTimezone: "Select timezone",
  selectLanguage: "Select language",
  selectApprovalPolicy: "Select approval policy",
  accountTitle: "Account",
  manageAccount: "Manage your account settings and preferences",
  profile: "Profile",
  accountInfo: "Account Information",
  userId: "User ID",
  phone: "Phone",
  memberSince: "Member Since",
  lastUpdated: "Last Updated",
  lastSignIn: "Last Sign In",
  emailConfirmed: "Email Confirmed",
  notProvided: "Not provided",
  connectedProviders: "Connected Providers",
  connectedOn: "Connected",
  lastUsed: "Last used",
  signOut: "Sign Out",
  notAvailable: "N/A",
  loading: "Loading...",
  showServers: "Show Servers",
  deleteServer: "Delete Server",
  deleteServerConfirm: "Are you sure you want to delete",
  cannotBeUndone: "This action cannot be undone.",
  cancel: "Cancel",
  heroTitle1: "Connect MCP servers",
  heroTitle2: "directly from your browser",
  explore: "Explore",
  playground: "Playground",
  browserClient: "Browser client",
  localAndRemote: "Local + Remote MCP",
  developerTools: "Developer tools",
  freeToUse: "Free to use",
  mcps: "MCP's",
  active: "active",
  add: "Add",
  addRemoteMcp: "Add Remote MCP",
  addGateway: "Add Gateway",
  refresh: "Refresh",
  filter: "Filter",
  filterByCategory: "Filter by Category",
  allCategories: "All Categories",
  searchByServerName: "Search by server name...",
  myServers: "My Servers",
  loadingMoreServers: "Loading more servers...",
  welcomeMcpAssistant: "Welcome to MCP Assistant",
  selectServerFromSidebar: "Select a server from the sidebar to explore its capabilities, inspect tools, and monitor connections.",
  exploreTools: "Explore Tools",
  exploreToolsDesc: "Browse and test available tools from connected servers interactively.",
  monitorHealth: "Monitor Health",
  monitorHealthDesc: "Real-time connection status validation and health checking.",
  executeActions: "Execute Actions",
  executeActionsDesc: "Run tools directly from the interface and see results instantly.",
  openGatewayManager: "Open Gateway Manager",
  noPersonalServers: "No Personal Servers",
  noPersonalServersDesc: "You haven't connected any custom servers yet. Add a local or remote server to get started.",
  noPublicServersFound: "No Public Servers Found",
  noPublicServersFoundDesc: "We couldn't find any public servers matching your criteria. Try adjusting your filters.",
  officialMcpRegistry: "Official MCP Registry",
  officialMcpRegistryDesc: "Explore the newest additions and updates from the official MCP registry.",
  browseRegistry: "Browse Registry",
  featuredOnMcpAssistant: "Featured on MCP Assistant",
  featuredOnMcpAssistantDesc: "Discover a curated selection of MCP servers you can access and test in Playground.",
  openMcp: "Open MCP",
  footerTagline: "One place to discover and interact with MCPs.",
  quickLinks: "Quick Links",
  mcpServers: "MCP Servers",
  githubRepository: "GitHub Repository",
  reportIssue: "Report an Issue",
  legal: "Legal",
  privacyPolicy: "Privacy Policy",
  resources: "Resources",
  documentation: "Documentation",
  mcpDocs: "MCP Docs",
  contact: "Contact",
  allRightsReserved: "All rights reserved.",
  activeMcpServerConnections: "Active MCP server connections",
  localMcpServers: "Local MCP Servers",
  installGateway: "Install gateway:",
  enableLocalMcpServers: "Enable local MCP servers to let the agent execute their MCP tools.",
  detected: "detected",
  enabled: "enabled",
  detectingGatewayServers: "Detecting gateway MCP servers...",
  noGatewayServersDetected: "No gateway servers detected. Start your local gateway and refresh.",
  connected: "Connected",
  error: "Error",
  tools: "tools",
  remoteMcpConnections: "Remote MCP Connections",
  remote: "Remote",
  authenticatedRemoteConnections: "Authenticated remote MCP servers connected to your browser session.",
  loadingConnections: "Loading connections...",
  noActiveRemoteConnections: "No active remote connections found",
  disconnect: "Disconnect",
  sessionId: "Session ID",
  connectedAt: "Connected At",
  typeYourPrompt: "Type your prompt...",
  quickActions: "Quick Actions",
  chatHeroTitle: "Let's figure it out together",
  readOnlySharedChat: "This is a read-only shared chat",
  recipeEmailSummary: "Email Summary",
  recipeEmailSummaryDesc: "Using Composio MCP to get access to Gmail, check my unread emails from today and summarize the important ones",
  recipeSemanticSearch: "Semantic Search",
  recipeSemanticSearchDesc: "Search the web using Exa to find the latest research papers on LLM optimization from the past month.",
  recipeGithubIssueSummary: "GitHub Issue Summary",
  recipeGithubIssueSummaryDesc: "Use Composio MCP to get access to Github to fetch the latest open issues for this repository and summarize the most critical bugs.",
  recipeSupabaseProject: "Supabase Project",
  recipeSupabaseProjectDesc: "You help users manage Supabase projects and databases. Assist with projects, tables, migrations, SQL, and troubleshooting while following Supabase best practices. Use documentation and project context to provide accurate, safe, and actionable guidance.",
  recipeNotionMeetingPrep: "Notion Meeting Prep",
  recipeNotionMeetingPrepDesc: "Generate a briefing document by synthesizing project notes and recent updates directly from Notion.",
  recipeMarketAnalysis: "Market Analysis",
  recipeMarketAnalysisDesc: "Use Alpha Vantage to fetch the last 30 days of daily prices for {TICKER}. Summarize whether the price trend is up, down, or flat.",
  toolExecutionRequest: "Tool Execution Request",
  actionRequired: "Action Required",
  requestingToolExecution: "Requesting to execute {toolName} on server {serverId}.",
  payload: "Payload",
  approve: "Approve",
  deny: "Deny",
  toolExecutionApproved: "Tool execution approved",
  toolExecutionDenied: "Tool execution denied",
  mcpTool: "MCP tool",
  selectedMcpServer: "Selected MCP server",
  userDeniedMcpToolRequest: "User denied the MCP tool request.",
  mcpToolRequestDenied: "MCP tool request denied.",
  mcpServer: "MCP Server",
  connectionFailed: "Connection failed",
  connecting: "Connecting...",
  connectionReady: "Connection is ready.",
  connectionNotReady: "Connection did not reach ready state. Please try again.",
  waitingForConnectionReady: "Waiting for connection to reach ready state.",
  connectionRequestCancelled: "Connection request cancelled.",
  connectionToolFailed: "Connection tool failed",
  userDeniedConnectionRequest: "User denied the connection request.",
  pleaseConnectToContinue: "Please connect to continue.",
  connect: "Connect",
  chainOfThought: "Chain of Thought",
  reasoning: "Reasoning",
  thoughtFor: "Thought for",
  args: "Args",
  result: "Result",
  edit: "Edit",
  copy: "Copy",
  copied: "Copied",
  regenerate: "Regenerate",
  editYourMessage: "Edit your message...",
  subsequentMessagesDeleted: "Subsequent messages will be deleted",
  updateAndContinue: "Update & Continue",
  copiedToClipboard: "Copied to clipboard",
  failedToCopy: "Failed to copy",
  inputTokens: "Input",
  outputTokens: "Output",
  totalTokens: "Total",
  openNavigationMenu: "Open navigation menu",
  closeNavigationMenu: "Close navigation menu",
  toggleSidebar: "Toggle sidebar",
  chatActions: "Chat actions",
  assistantLogo: "Assistant logo",
  assistantAvatar: "Assistant avatar",
  setPublicToShare: "Set chat to Public to enable sharing.",
  linkCopied: "Link copied",
  failedToCopyLink: "Failed to copy link",
  chatDeletedSuccessfully: "Chat deleted successfully",
  failedToUpdateSharing: "Failed to update sharing",
  shareSettingsUpdated: "Share settings updated",
  apiKeysDescription: "LLM provider credentials and Workflow Automation Engine access",
  llmSettings: "LLM Settings",
  provider: "Provider",
  selectProvider: "Select provider",
  model: "Model",
  apiKey: "API Key",
  pasteApiKey: "Paste your API key",
  hideApiKey: "Hide API key",
  showApiKey: "Show API key",
  browserKeyPrivacy: "Your key stays in your browser and is sent only with your prompts.",
  custom: "Custom",
  customModelDescription: "Custom model provided by your API",
} as const;

export type WebMessageKey = keyof typeof en;
type Dictionary = Record<WebMessageKey, string>;
type Locale = (typeof WEB_I18N_LANGUAGE_OPTIONS)[number]["value"];
type RecipeMessageKey =
  | "recipeEmailSummary"
  | "recipeEmailSummaryDesc"
  | "recipeSemanticSearch"
  | "recipeSemanticSearchDesc"
  | "recipeGithubIssueSummary"
  | "recipeGithubIssueSummaryDesc"
  | "recipeSupabaseProject"
  | "recipeSupabaseProjectDesc"
  | "recipeNotionMeetingPrep"
  | "recipeNotionMeetingPrepDesc"
  | "recipeMarketAnalysis"
  | "recipeMarketAnalysisDesc";
type ChatSidebarMessageKey =
  | "chatHistory"
  | "pinChat"
  | "unpinChat"
  | "pinnedChats"
  | "todayChats"
  | "yesterdayChats"
  | "previous7Days"
  | "previous30Days"
  | "olderChats"
  | "justNow";

export const webI18nLocales = WEB_I18N_LANGUAGE_OPTIONS.map((option) => option.value);

const requiredLocalizedKeys = [
  "settings",
  "account",
  "preferences",
  "apiKeys",
  "connectors",
  "apps",
  "newChat",
  "yourChats",
  "searchChats",
  "loadingChats",
  "noChatsYet",
  "rename",
  "share",
  "delete",
  "copyLink",
  "shareConversation",
  "shareWarning",
  "private",
  "public",
  "publicAccess",
  "onlyYouAccess",
  "anyoneWithLink",
  "chooseAgentBehavior",
  "themeDescription",
  "timezoneDescription",
  "local",
  "saved",
  "theme",
  "timezone",
  "currentTime",
  "language",
  "languageWebOnly",
  "mcpToolApproval",
  "askEveryTime",
  "askRiskyTools",
  "runAutomatically",
  "selectTimezone",
  "selectLanguage",
  "selectApprovalPolicy",
  "typeYourPrompt",
  "quickActions",
  "chatHeroTitle",
  "readOnlySharedChat",
  "thinking",
  "toolExecutionRequest",
  "actionRequired",
  "requestingToolExecution",
  "payload",
  "approve",
  "deny",
  "toolExecutionApproved",
  "toolExecutionDenied",
  "mcpTool",
  "selectedMcpServer",
  "mcpServer",
  "connectionFailed",
  "connecting",
  "connectionReady",
  "connectionNotReady",
  "waitingForConnectionReady",
  "connectionRequestCancelled",
  "connectionToolFailed",
  "pleaseConnectToContinue",
  "connect",
  "chainOfThought",
  "reasoning",
  "thoughtFor",
  "args",
  "result",
  "edit",
  "copy",
  "copied",
  "regenerate",
  "editYourMessage",
  "subsequentMessagesDeleted",
  "updateAndContinue",
  "copiedToClipboard",
  "failedToCopy",
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "openNavigationMenu",
  "closeNavigationMenu",
  "toggleSidebar",
  "chatActions",
  "assistantLogo",
  "assistantAvatar",
  "setPublicToShare",
  "linkCopied",
  "failedToCopyLink",
  "chatDeletedSuccessfully",
  "failedToUpdateSharing",
  "shareSettingsUpdated",
  "apiKeysDescription",
  "llmSettings",
  "provider",
  "selectProvider",
  "model",
  "apiKey",
  "pasteApiKey",
  "hideApiKey",
  "showApiKey",
  "browserKeyPrivacy",
  "custom",
  "customModelDescription",
] as const satisfies ReadonlyArray<WebMessageKey>;

type RequiredLocalizedKey = (typeof requiredLocalizedKeys)[number];
type LocaleOverrides = Record<RequiredLocalizedKey, string> & Partial<Dictionary>;

const localeSources: Record<Exclude<Locale, "en-US">, LocaleOverrides> = {
  "zh-CN": {
    settings: "设置", account: "账户", preferences: "偏好设置", apiKeys: "API 密钥", connectors: "连接器", apps: "应用", newChat: "新建聊天", yourChats: "你的聊天", searchChats: "搜索聊天", loadingChats: "正在加载聊天...", noChatsYet: "还没有聊天", rename: "重命名", share: "分享", delete: "删除", copyLink: "复制链接", shareConversation: "分享此对话", shareWarning: "这可能包含个人信息。分享前请先检查。", private: "私有", public: "公开", publicAccess: "公开访问", onlyYouAccess: "只有你可以访问", anyoneWithLink: "拥有链接的任何人都可以查看", chooseAgentBehavior: "选择代理如何本地化响应并处理 MCP 工具执行。", themeDescription: "选择聊天、设置和连接器视图的应用配色方案。", timezoneDescription: "用于日期相关回答、日程语言和时间戳。", local: "本地", saved: "已保存", theme: "主题", timezone: "时区", currentTime: "当前时间", language: "语言", languageWebOnly: "用于应用界面文本和区域格式。", mcpToolApproval: "MCP 工具批准", askEveryTime: "每次都询问", askRiskyTools: "询问高风险工具", runAutomatically: "自动运行", selectTimezone: "选择时区", selectLanguage: "选择语言", selectApprovalPolicy: "选择批准策略", typeYourPrompt: "输入你的提示...", quickActions: "快捷操作", chatHeroTitle: "让我们一起解决它", readOnlySharedChat: "这是只读共享聊天", thinking: "思考中...", toolExecutionRequest: "工具执行请求", actionRequired: "需要操作", requestingToolExecution: "请求在 {serverId} 上运行 {toolName}。", payload: "载荷", approve: "批准", deny: "拒绝", toolExecutionApproved: "工具执行已批准", toolExecutionDenied: "工具执行已拒绝", mcpTool: "MCP 工具", selectedMcpServer: "选定的 MCP 服务器", mcpServer: "MCP 服务器", connectionFailed: "连接失败", connecting: "正在连接...", connectionReady: "连接已就绪。", connectionNotReady: "连接未达到就绪状态。请重试。", waitingForConnectionReady: "正在等待连接就绪。", connectionRequestCancelled: "连接请求已取消。", connectionToolFailed: "连接工具失败", pleaseConnectToContinue: "请连接以继续。", connect: "连接", chainOfThought: "思维链", reasoning: "推理", thoughtFor: "思考用时", args: "参数", result: "结果", edit: "编辑", copy: "复制", copied: "已复制", regenerate: "重新生成", editYourMessage: "编辑你的消息...", subsequentMessagesDeleted: "后续消息将被删除", updateAndContinue: "更新并继续", copiedToClipboard: "已复制到剪贴板", failedToCopy: "复制失败", inputTokens: "输入", outputTokens: "输出", totalTokens: "总计", openNavigationMenu: "打开导航菜单", closeNavigationMenu: "关闭导航菜单", toggleSidebar: "切换侧边栏", chatActions: "聊天操作", assistantLogo: "助手标志", assistantAvatar: "助手头像", setPublicToShare: "将聊天设为公开以启用分享。", linkCopied: "链接已复制", failedToCopyLink: "复制链接失败", chatDeletedSuccessfully: "聊天已删除", failedToUpdateSharing: "更新分享失败", shareSettingsUpdated: "分享设置已更新", apiKeysDescription: "LLM 提供商凭据和工作流自动化引擎访问", llmSettings: "LLM 设置", provider: "提供商", selectProvider: "选择提供商", model: "模型", apiKey: "API 密钥", pasteApiKey: "粘贴你的 API 密钥", hideApiKey: "隐藏 API 密钥", showApiKey: "显示 API 密钥", browserKeyPrivacy: "你的密钥保留在浏览器中，并且只会随提示发送。", custom: "自定义", customModelDescription: "由你的 API 提供的自定义模型",
  },
  "hi-IN": {
    settings: "सेटिंग्स", account: "खाता", preferences: "प्राथमिकताएं", apiKeys: "API कुंजियां", connectors: "कनेक्टर", apps: "ऐप्स", newChat: "नई चैट", yourChats: "आपकी चैट्स", searchChats: "चैट खोजें", loadingChats: "चैट लोड हो रही हैं...", noChatsYet: "अभी कोई चैट नहीं", rename: "नाम बदलें", share: "शेयर करें", delete: "हटाएं", copyLink: "लिंक कॉपी करें", shareConversation: "यह बातचीत शेयर करें", shareWarning: "इसमें निजी जानकारी हो सकती है। शेयर करने से पहले समीक्षा करें।", private: "निजी", public: "सार्वजनिक", publicAccess: "सार्वजनिक पहुंच", onlyYouAccess: "केवल आपके पास पहुंच है", anyoneWithLink: "लिंक वाला कोई भी व्यक्ति देख सकता है", chooseAgentBehavior: "चुनें कि एजेंट जवाबों को कैसे स्थानीयकृत करे और MCP टूल निष्पादन कैसे संभाले।", themeDescription: "चैट, सेटिंग्स और कनेक्टर दृश्यों के लिए ऐप रंग योजना चुनें।", timezoneDescription: "दिनांक-संवेदनशील जवाबों, शेड्यूलिंग भाषा और टाइमस्टैम्प के लिए उपयोग होता है।", local: "स्थानीय", saved: "सहेजा गया", theme: "थीम", timezone: "समय क्षेत्र", currentTime: "वर्तमान समय", language: "भाषा", languageWebOnly: "ऐप इंटरफेस टेक्स्ट और लोकेल फॉर्मेटिंग के लिए उपयोग होता है।", mcpToolApproval: "MCP टूल स्वीकृति", askEveryTime: "हर बार पूछें", askRiskyTools: "जोखिम वाले टूल के लिए पूछें", runAutomatically: "स्वचालित रूप से चलाएं", selectTimezone: "समय क्षेत्र चुनें", selectLanguage: "भाषा चुनें", selectApprovalPolicy: "स्वीकृति नीति चुनें", typeYourPrompt: "अपना प्रॉम्प्ट टाइप करें...", quickActions: "त्वरित कार्रवाइयां", chatHeroTitle: "आइए इसे साथ में समझते हैं", readOnlySharedChat: "यह केवल पढ़ने योग्य साझा चैट है", thinking: "सोच रहा है...", toolExecutionRequest: "टूल निष्पादन अनुरोध", actionRequired: "कार्रवाई आवश्यक", requestingToolExecution: "{serverId} पर {toolName} चलाने का अनुरोध।", payload: "पेलोड", approve: "स्वीकृत करें", deny: "अस्वीकार करें", toolExecutionApproved: "टूल निष्पादन स्वीकृत", toolExecutionDenied: "टूल निष्पादन अस्वीकृत", mcpTool: "MCP टूल", selectedMcpServer: "चुना हुआ MCP सर्वर", mcpServer: "MCP सर्वर", connectionFailed: "कनेक्शन विफल", connecting: "कनेक्ट हो रहा है...", connectionReady: "कनेक्शन तैयार है।", connectionNotReady: "कनेक्शन तैयार स्थिति तक नहीं पहुंचा। कृपया फिर कोशिश करें।", waitingForConnectionReady: "कनेक्शन तैयार होने की प्रतीक्षा है।", connectionRequestCancelled: "कनेक्शन अनुरोध रद्द किया गया।", connectionToolFailed: "कनेक्शन टूल विफल", pleaseConnectToContinue: "जारी रखने के लिए कनेक्ट करें।", connect: "कनेक्ट करें", chainOfThought: "विचार श्रृंखला", reasoning: "तर्क", thoughtFor: "सोचा गया", args: "आर्ग्यूमेंट", result: "परिणाम", edit: "संपादित करें", copy: "कॉपी करें", copied: "कॉपी हुआ", regenerate: "फिर जनरेट करें", editYourMessage: "अपना संदेश संपादित करें...", subsequentMessagesDeleted: "बाद के संदेश हटाए जाएंगे", updateAndContinue: "अपडेट करें और जारी रखें", copiedToClipboard: "क्लिपबोर्ड में कॉपी हुआ", failedToCopy: "कॉपी विफल", inputTokens: "इनपुट", outputTokens: "आउटपुट", totalTokens: "कुल", openNavigationMenu: "नेविगेशन मेनू खोलें", closeNavigationMenu: "नेविगेशन मेनू बंद करें", toggleSidebar: "साइडबार टॉगल करें", chatActions: "चैट कार्रवाइयां", assistantLogo: "असिस्टेंट लोगो", assistantAvatar: "असिस्टेंट अवतार", setPublicToShare: "शेयरिंग सक्षम करने के लिए चैट को सार्वजनिक करें।", linkCopied: "लिंक कॉपी हुआ", failedToCopyLink: "लिंक कॉपी विफल", chatDeletedSuccessfully: "चैट हटा दी गई", failedToUpdateSharing: "शेयरिंग अपडेट विफल", shareSettingsUpdated: "शेयर सेटिंग्स अपडेट हुईं", apiKeysDescription: "LLM प्रदाता क्रेडेंशियल और वर्कफ़्लो ऑटोमेशन इंजन पहुंच", llmSettings: "LLM सेटिंग्स", provider: "प्रदाता", selectProvider: "प्रदाता चुनें", model: "मॉडल", apiKey: "API कुंजी", pasteApiKey: "अपनी API कुंजी पेस्ट करें", hideApiKey: "API कुंजी छिपाएं", showApiKey: "API कुंजी दिखाएं", browserKeyPrivacy: "आपकी कुंजी आपके ब्राउज़र में रहती है और केवल आपके प्रॉम्प्ट के साथ भेजी जाती है।", custom: "कस्टम", customModelDescription: "आपके API द्वारा दिया गया कस्टम मॉडल",
  },
  "es-ES": {
    settings: "Configuración", account: "Cuenta", preferences: "Preferencias", apiKeys: "Claves API", connectors: "Conectores", apps: "Apps", newChat: "Nuevo chat", yourChats: "Tus chats", searchChats: "Buscar chats", loadingChats: "Cargando chats...", noChatsYet: "Aún no hay chats", rename: "Renombrar", share: "Compartir", delete: "Eliminar", copyLink: "Copiar enlace", shareConversation: "Compartir esta conversación", shareWarning: "Esto puede contener información personal. Revísalo antes de compartir.", private: "Privado", public: "Público", publicAccess: "Acceso público", onlyYouAccess: "Solo tú tienes acceso", anyoneWithLink: "Cualquiera con el enlace puede ver", chooseAgentBehavior: "Elige cómo el agente localiza respuestas y maneja la ejecución de herramientas MCP.", themeDescription: "Elige el esquema de color de la app para chat, configuración y conectores.", timezoneDescription: "Se usa para respuestas sensibles a fechas, lenguaje de programación y marcas de tiempo.", local: "Local", saved: "Guardado", theme: "Tema", timezone: "Zona horaria", currentTime: "Hora actual", language: "Idioma", languageWebOnly: "Se usa para texto de la interfaz y formato regional.", mcpToolApproval: "Aprobación de herramienta MCP", askEveryTime: "Preguntar siempre", askRiskyTools: "Preguntar por herramientas riesgosas", runAutomatically: "Ejecutar automáticamente", selectTimezone: "Seleccionar zona horaria", selectLanguage: "Seleccionar idioma", selectApprovalPolicy: "Seleccionar política de aprobación", typeYourPrompt: "Escribe tu prompt...", quickActions: "Acciones rápidas", chatHeroTitle: "Resolvámoslo juntos", readOnlySharedChat: "Este es un chat compartido de solo lectura", thinking: "Pensando...", toolExecutionRequest: "Solicitud de ejecución de herramienta", actionRequired: "Acción requerida", requestingToolExecution: "Solicita ejecutar {toolName} en {serverId}.", payload: "Carga útil", approve: "Aprobar", deny: "Denegar", toolExecutionApproved: "Ejecución de herramienta aprobada", toolExecutionDenied: "Ejecución de herramienta denegada", mcpTool: "Herramienta MCP", selectedMcpServer: "Servidor MCP seleccionado", mcpServer: "Servidor MCP", connectionFailed: "Conexión fallida", connecting: "Conectando...", connectionReady: "La conexión está lista.", connectionNotReady: "La conexión no llegó al estado listo. Inténtalo de nuevo.", waitingForConnectionReady: "Esperando a que la conexión esté lista.", connectionRequestCancelled: "Solicitud de conexión cancelada.", connectionToolFailed: "Falló la herramienta de conexión", pleaseConnectToContinue: "Conéctate para continuar.", connect: "Conectar", chainOfThought: "Cadena de pensamiento", reasoning: "Razonamiento", thoughtFor: "Pensó durante", args: "Argumentos", result: "Resultado", edit: "Editar", copy: "Copiar", copied: "Copiado", regenerate: "Regenerar", editYourMessage: "Edita tu mensaje...", subsequentMessagesDeleted: "Los mensajes posteriores se eliminarán", updateAndContinue: "Actualizar y continuar", copiedToClipboard: "Copiado al portapapeles", failedToCopy: "No se pudo copiar", inputTokens: "Entrada", outputTokens: "Salida", totalTokens: "Total", openNavigationMenu: "Abrir menú de navegación", closeNavigationMenu: "Cerrar menú de navegación", toggleSidebar: "Alternar barra lateral", chatActions: "Acciones del chat", assistantLogo: "Logotipo del asistente", assistantAvatar: "Avatar del asistente", setPublicToShare: "Haz público el chat para habilitar el uso compartido.", linkCopied: "Enlace copiado", failedToCopyLink: "No se pudo copiar el enlace", chatDeletedSuccessfully: "Chat eliminado correctamente", failedToUpdateSharing: "No se pudo actualizar el uso compartido", shareSettingsUpdated: "Configuración de uso compartido actualizada", apiKeysDescription: "Credenciales de proveedores LLM y acceso al motor de automatización de flujos", llmSettings: "Configuración LLM", provider: "Proveedor", selectProvider: "Seleccionar proveedor", model: "Modelo", apiKey: "Clave API", pasteApiKey: "Pega tu clave API", hideApiKey: "Ocultar clave API", showApiKey: "Mostrar clave API", browserKeyPrivacy: "Tu clave permanece en tu navegador y se envía solo con tus prompts.", custom: "Personalizado", customModelDescription: "Modelo personalizado proporcionado por tu API",
  },
  "fr-FR": {
    settings: "Paramètres", account: "Compte", preferences: "Préférences", apiKeys: "Clés API", connectors: "Connecteurs", apps: "Applications", newChat: "Nouveau chat", yourChats: "Vos chats", searchChats: "Rechercher des chats", loadingChats: "Chargement des chats...", noChatsYet: "Aucun chat pour l'instant", rename: "Renommer", share: "Partager", delete: "Supprimer", copyLink: "Copier le lien", shareConversation: "Partager cette conversation", shareWarning: "Cela peut contenir des informations personnelles. Vérifiez avant de partager.", private: "Privé", public: "Public", publicAccess: "Accès public", onlyYouAccess: "Vous seul avez accès", anyoneWithLink: "Toute personne ayant le lien peut voir", chooseAgentBehavior: "Choisissez comment l'agent localise les réponses et gère l'exécution des outils MCP.", themeDescription: "Choisissez le thème de couleurs pour le chat, les paramètres et les connecteurs.", timezoneDescription: "Utilisé pour les réponses liées aux dates, la planification et les horodatages.", local: "Local", saved: "Enregistré", theme: "Thème", timezone: "Fuseau horaire", currentTime: "Heure actuelle", language: "Langue", languageWebOnly: "Utilisé pour le texte de l'interface et le format régional.", mcpToolApproval: "Approbation d'outil MCP", askEveryTime: "Demander à chaque fois", askRiskyTools: "Demander pour les outils risqués", runAutomatically: "Exécuter automatiquement", selectTimezone: "Sélectionner le fuseau horaire", selectLanguage: "Sélectionner la langue", selectApprovalPolicy: "Sélectionner la politique d'approbation", typeYourPrompt: "Saisissez votre prompt...", quickActions: "Actions rapides", chatHeroTitle: "Résolvons cela ensemble", readOnlySharedChat: "Ce chat partagé est en lecture seule", thinking: "Réflexion...", toolExecutionRequest: "Demande d'exécution d'outil", actionRequired: "Action requise", requestingToolExecution: "Demande d'exécution de {toolName} sur {serverId}.", payload: "Charge utile", approve: "Approuver", deny: "Refuser", toolExecutionApproved: "Exécution de l'outil approuvée", toolExecutionDenied: "Exécution de l'outil refusée", mcpTool: "Outil MCP", selectedMcpServer: "Serveur MCP sélectionné", mcpServer: "Serveur MCP", connectionFailed: "Connexion échouée", connecting: "Connexion...", connectionReady: "La connexion est prête.", connectionNotReady: "La connexion n'a pas atteint l'état prêt. Réessayez.", waitingForConnectionReady: "En attente que la connexion soit prête.", connectionRequestCancelled: "Demande de connexion annulée.", connectionToolFailed: "L'outil de connexion a échoué", pleaseConnectToContinue: "Connectez-vous pour continuer.", connect: "Connecter", chainOfThought: "Chaîne de pensée", reasoning: "Raisonnement", thoughtFor: "Réflexion pendant", args: "Arguments", result: "Résultat", edit: "Modifier", copy: "Copier", copied: "Copié", regenerate: "Régénérer", editYourMessage: "Modifiez votre message...", subsequentMessagesDeleted: "Les messages suivants seront supprimés", updateAndContinue: "Mettre à jour et continuer", copiedToClipboard: "Copié dans le presse-papiers", failedToCopy: "Échec de la copie", inputTokens: "Entrée", outputTokens: "Sortie", totalTokens: "Total", openNavigationMenu: "Ouvrir le menu de navigation", closeNavigationMenu: "Fermer le menu de navigation", toggleSidebar: "Basculer la barre latérale", chatActions: "Actions du chat", assistantLogo: "Logo de l'assistant", assistantAvatar: "Avatar de l'assistant", setPublicToShare: "Rendez le chat public pour activer le partage.", linkCopied: "Lien copié", failedToCopyLink: "Échec de la copie du lien", chatDeletedSuccessfully: "Chat supprimé", failedToUpdateSharing: "Échec de la mise à jour du partage", shareSettingsUpdated: "Paramètres de partage mis à jour", apiKeysDescription: "Identifiants des fournisseurs LLM et accès au moteur d'automatisation des workflows", llmSettings: "Paramètres LLM", provider: "Fournisseur", selectProvider: "Sélectionner un fournisseur", model: "Modèle", apiKey: "Clé API", pasteApiKey: "Collez votre clé API", hideApiKey: "Masquer la clé API", showApiKey: "Afficher la clé API", browserKeyPrivacy: "Votre clé reste dans votre navigateur et n'est envoyée qu'avec vos prompts.", custom: "Personnalisé", customModelDescription: "Modèle personnalisé fourni par votre API",
  },
  "ar-SA": {
    settings: "الإعدادات", account: "الحساب", preferences: "التفضيلات", apiKeys: "مفاتيح API", connectors: "الموصلات", apps: "التطبيقات", newChat: "محادثة جديدة", yourChats: "محادثاتك", searchChats: "ابحث في المحادثات", loadingChats: "جار تحميل المحادثات...", noChatsYet: "لا توجد محادثات بعد", rename: "إعادة تسمية", share: "مشاركة", delete: "حذف", copyLink: "نسخ الرابط", shareConversation: "مشاركة هذه المحادثة", shareWarning: "قد يحتوي هذا على معلومات شخصية. يرجى المراجعة قبل المشاركة.", private: "خاص", public: "عام", publicAccess: "وصول عام", onlyYouAccess: "لديك وحدك حق الوصول", anyoneWithLink: "يمكن لأي شخص لديه الرابط العرض", chooseAgentBehavior: "اختر كيف يترجم الوكيل الردود ويتعامل مع تنفيذ أدوات MCP.", themeDescription: "اختر نظام ألوان التطبيق للدردشة والإعدادات والموصلات.", timezoneDescription: "يستخدم للإجابات الحساسة للتاريخ ولغة الجدولة والطوابع الزمنية.", local: "محلي", saved: "تم الحفظ", theme: "السمة", timezone: "المنطقة الزمنية", currentTime: "الوقت الحالي", language: "اللغة", languageWebOnly: "تستخدم لنص واجهة التطبيق وتنسيق المنطقة.", mcpToolApproval: "الموافقة على أداة MCP", askEveryTime: "اسأل كل مرة", askRiskyTools: "اسأل عن الأدوات الخطرة", runAutomatically: "تشغيل تلقائي", selectTimezone: "اختر المنطقة الزمنية", selectLanguage: "اختر اللغة", selectApprovalPolicy: "اختر سياسة الموافقة", typeYourPrompt: "اكتب طلبك...", quickActions: "إجراءات سريعة", chatHeroTitle: "لنحلها معًا", readOnlySharedChat: "هذه محادثة مشتركة للقراءة فقط", thinking: "جار التفكير...", toolExecutionRequest: "طلب تنفيذ أداة", actionRequired: "إجراء مطلوب", requestingToolExecution: "طلب تشغيل {toolName} على {serverId}.", payload: "الحمولة", approve: "موافقة", deny: "رفض", toolExecutionApproved: "تمت الموافقة على تنفيذ الأداة", toolExecutionDenied: "تم رفض تنفيذ الأداة", mcpTool: "أداة MCP", selectedMcpServer: "خادم MCP المحدد", mcpServer: "خادم MCP", connectionFailed: "فشل الاتصال", connecting: "جار الاتصال...", connectionReady: "الاتصال جاهز.", connectionNotReady: "لم يصل الاتصال إلى حالة الجاهزية. يرجى المحاولة مرة أخرى.", waitingForConnectionReady: "بانتظار جاهزية الاتصال.", connectionRequestCancelled: "تم إلغاء طلب الاتصال.", connectionToolFailed: "فشلت أداة الاتصال", pleaseConnectToContinue: "يرجى الاتصال للمتابعة.", connect: "اتصال", chainOfThought: "سلسلة التفكير", reasoning: "الاستدلال", thoughtFor: "استغرق التفكير", args: "المعاملات", result: "النتيجة", edit: "تعديل", copy: "نسخ", copied: "تم النسخ", regenerate: "إعادة التوليد", editYourMessage: "عدل رسالتك...", subsequentMessagesDeleted: "سيتم حذف الرسائل اللاحقة", updateAndContinue: "تحديث ومتابعة", copiedToClipboard: "تم النسخ إلى الحافظة", failedToCopy: "فشل النسخ", inputTokens: "الإدخال", outputTokens: "الإخراج", totalTokens: "الإجمالي", openNavigationMenu: "فتح قائمة التنقل", closeNavigationMenu: "إغلاق قائمة التنقل", toggleSidebar: "تبديل الشريط الجانبي", chatActions: "إجراءات المحادثة", assistantLogo: "شعار المساعد", assistantAvatar: "صورة المساعد", setPublicToShare: "اجعل المحادثة عامة لتمكين المشاركة.", linkCopied: "تم نسخ الرابط", failedToCopyLink: "فشل نسخ الرابط", chatDeletedSuccessfully: "تم حذف المحادثة", failedToUpdateSharing: "فشل تحديث المشاركة", shareSettingsUpdated: "تم تحديث إعدادات المشاركة", apiKeysDescription: "بيانات اعتماد مزودي LLM والوصول إلى محرك أتمتة سير العمل", llmSettings: "إعدادات LLM", provider: "المزود", selectProvider: "اختر المزود", model: "النموذج", apiKey: "مفتاح API", pasteApiKey: "الصق مفتاح API", hideApiKey: "إخفاء مفتاح API", showApiKey: "إظهار مفتاح API", browserKeyPrivacy: "يبقى مفتاحك في المتصفح ويرسل فقط مع مطالباتك.", custom: "مخصص", customModelDescription: "نموذج مخصص يوفره API الخاص بك",
  },
  "ja-JP": {
    settings: "設定", account: "アカウント", preferences: "環境設定", apiKeys: "API キー", connectors: "コネクタ", apps: "アプリ", newChat: "新しいチャット", yourChats: "あなたのチャット", searchChats: "チャットを検索", loadingChats: "チャットを読み込み中...", noChatsYet: "チャットはまだありません", rename: "名前を変更", share: "共有", delete: "削除", copyLink: "リンクをコピー", shareConversation: "この会話を共有", shareWarning: "個人情報が含まれる可能性があります。共有前に確認してください。", private: "非公開", public: "公開", publicAccess: "公開アクセス", onlyYouAccess: "アクセスできるのはあなただけです", anyoneWithLink: "リンクを知っている全員が表示できます", chooseAgentBehavior: "エージェントが応答をローカライズし MCP ツール実行を処理する方法を選択します。", themeDescription: "チャット、設定、コネクタ表示の配色を選択します。", timezoneDescription: "日付に関する回答、スケジュール表現、タイムスタンプに使用されます。", local: "ローカル", saved: "保存済み", theme: "テーマ", timezone: "タイムゾーン", currentTime: "現在時刻", language: "言語", languageWebOnly: "アプリのインターフェイス文言とロケール書式に使用されます。", mcpToolApproval: "MCP ツール承認", askEveryTime: "毎回確認", askRiskyTools: "リスクのあるツールは確認", runAutomatically: "自動実行", selectTimezone: "タイムゾーンを選択", selectLanguage: "言語を選択", selectApprovalPolicy: "承認ポリシーを選択", typeYourPrompt: "プロンプトを入力...", quickActions: "クイックアクション", chatHeroTitle: "一緒に解決しましょう", readOnlySharedChat: "これは読み取り専用の共有チャットです", thinking: "考え中...", toolExecutionRequest: "ツール実行リクエスト", actionRequired: "操作が必要", requestingToolExecution: "{serverId} で {toolName} を実行しようとしています。", payload: "ペイロード", approve: "承認", deny: "拒否", toolExecutionApproved: "ツール実行を承認しました", toolExecutionDenied: "ツール実行を拒否しました", mcpTool: "MCP ツール", selectedMcpServer: "選択された MCP サーバー", mcpServer: "MCP サーバー", connectionFailed: "接続に失敗しました", connecting: "接続中...", connectionReady: "接続の準備ができました。", connectionNotReady: "接続が準備完了になりませんでした。もう一度お試しください。", waitingForConnectionReady: "接続の準備完了を待っています。", connectionRequestCancelled: "接続リクエストをキャンセルしました。", connectionToolFailed: "接続ツールが失敗しました", pleaseConnectToContinue: "続行するには接続してください。", connect: "接続", chainOfThought: "思考の連鎖", reasoning: "推論", thoughtFor: "思考時間", args: "引数", result: "結果", edit: "編集", copy: "コピー", copied: "コピー済み", regenerate: "再生成", editYourMessage: "メッセージを編集...", subsequentMessagesDeleted: "以降のメッセージは削除されます", updateAndContinue: "更新して続行", copiedToClipboard: "クリップボードにコピーしました", failedToCopy: "コピーに失敗しました", inputTokens: "入力", outputTokens: "出力", totalTokens: "合計", openNavigationMenu: "ナビゲーションメニューを開く", closeNavigationMenu: "ナビゲーションメニューを閉じる", toggleSidebar: "サイドバーを切り替え", chatActions: "チャット操作", assistantLogo: "アシスタントのロゴ", assistantAvatar: "アシスタントのアバター", setPublicToShare: "共有を有効にするにはチャットを公開にしてください。", linkCopied: "リンクをコピーしました", failedToCopyLink: "リンクのコピーに失敗しました", chatDeletedSuccessfully: "チャットを削除しました", failedToUpdateSharing: "共有設定の更新に失敗しました", shareSettingsUpdated: "共有設定を更新しました", apiKeysDescription: "LLM プロバイダーの認証情報とワークフロー自動化エンジンへのアクセス", llmSettings: "LLM 設定", provider: "プロバイダー", selectProvider: "プロバイダーを選択", model: "モデル", apiKey: "API キー", pasteApiKey: "API キーを貼り付け", hideApiKey: "API キーを非表示", showApiKey: "API キーを表示", browserKeyPrivacy: "キーはブラウザに保存され、プロンプトと一緒にのみ送信されます。", custom: "カスタム", customModelDescription: "API で提供されるカスタムモデル",
  },
  "pt-BR": {
    settings: "Configurações", account: "Conta", preferences: "Preferências", apiKeys: "Chaves de API", connectors: "Conectores", apps: "Apps", newChat: "Novo chat", yourChats: "Seus chats", searchChats: "Pesquisar chats", loadingChats: "Carregando chats...", noChatsYet: "Ainda não há chats", rename: "Renomear", share: "Compartilhar", delete: "Excluir", copyLink: "Copiar link", shareConversation: "Compartilhar esta conversa", shareWarning: "Isto pode conter informações pessoais. Revise antes de compartilhar.", private: "Privado", public: "Público", publicAccess: "Acesso público", onlyYouAccess: "Só você tem acesso", anyoneWithLink: "Qualquer pessoa com o link pode ver", chooseAgentBehavior: "Escolha como o agente localiza respostas e lida com a execução de ferramentas MCP.", themeDescription: "Escolha o esquema de cores do app para chat, configurações e conectores.", timezoneDescription: "Usado para respostas sensíveis a datas, linguagem de agendamento e timestamps.", local: "Local", saved: "Salvo", theme: "Tema", timezone: "Fuso horário", currentTime: "Hora atual", language: "Idioma", languageWebOnly: "Usado para texto da interface e formatação regional.", mcpToolApproval: "Aprovação de ferramenta MCP", askEveryTime: "Perguntar sempre", askRiskyTools: "Perguntar para ferramentas arriscadas", runAutomatically: "Executar automaticamente", selectTimezone: "Selecionar fuso horário", selectLanguage: "Selecionar idioma", selectApprovalPolicy: "Selecionar política de aprovação", typeYourPrompt: "Digite seu prompt...", quickActions: "Ações rápidas", chatHeroTitle: "Vamos resolver isso juntos", readOnlySharedChat: "Este é um chat compartilhado somente leitura", thinking: "Pensando...", toolExecutionRequest: "Solicitação de execução de ferramenta", actionRequired: "Ação necessária", requestingToolExecution: "Solicitando executar {toolName} em {serverId}.", payload: "Payload", approve: "Aprovar", deny: "Negar", toolExecutionApproved: "Execução da ferramenta aprovada", toolExecutionDenied: "Execução da ferramenta negada", mcpTool: "Ferramenta MCP", selectedMcpServer: "Servidor MCP selecionado", mcpServer: "Servidor MCP", connectionFailed: "Falha na conexão", connecting: "Conectando...", connectionReady: "A conexão está pronta.", connectionNotReady: "A conexão não chegou ao estado pronto. Tente novamente.", waitingForConnectionReady: "Aguardando a conexão ficar pronta.", connectionRequestCancelled: "Solicitação de conexão cancelada.", connectionToolFailed: "Falha na ferramenta de conexão", pleaseConnectToContinue: "Conecte para continuar.", connect: "Conectar", chainOfThought: "Cadeia de pensamento", reasoning: "Raciocínio", thoughtFor: "Pensou por", args: "Argumentos", result: "Resultado", edit: "Editar", copy: "Copiar", copied: "Copiado", regenerate: "Gerar novamente", editYourMessage: "Edite sua mensagem...", subsequentMessagesDeleted: "As mensagens seguintes serão excluídas", updateAndContinue: "Atualizar e continuar", copiedToClipboard: "Copiado para a área de transferência", failedToCopy: "Falha ao copiar", inputTokens: "Entrada", outputTokens: "Saída", totalTokens: "Total", openNavigationMenu: "Abrir menu de navegação", closeNavigationMenu: "Fechar menu de navegação", toggleSidebar: "Alternar barra lateral", chatActions: "Ações do chat", assistantLogo: "Logo do assistente", assistantAvatar: "Avatar do assistente", setPublicToShare: "Defina o chat como público para habilitar o compartilhamento.", linkCopied: "Link copiado", failedToCopyLink: "Falha ao copiar o link", chatDeletedSuccessfully: "Chat excluído com sucesso", failedToUpdateSharing: "Falha ao atualizar compartilhamento", shareSettingsUpdated: "Configurações de compartilhamento atualizadas", apiKeysDescription: "Credenciais de provedores LLM e acesso ao Workflow Automation Engine", llmSettings: "Configurações de LLM", provider: "Provedor", selectProvider: "Selecionar provedor", model: "Modelo", apiKey: "Chave de API", pasteApiKey: "Cole sua chave de API", hideApiKey: "Ocultar chave de API", showApiKey: "Mostrar chave de API", browserKeyPrivacy: "Sua chave fica no navegador e é enviada apenas com seus prompts.", custom: "Personalizado", customModelDescription: "Modelo personalizado fornecido pela sua API",
  },
  "ru-RU": {
    settings: "Настройки", account: "Аккаунт", preferences: "Параметры", apiKeys: "API-ключи", connectors: "Коннекторы", apps: "Приложения", newChat: "Новый чат", yourChats: "Ваши чаты", searchChats: "Поиск чатов", loadingChats: "Загрузка чатов...", noChatsYet: "Чатов пока нет", rename: "Переименовать", share: "Поделиться", delete: "Удалить", copyLink: "Скопировать ссылку", shareConversation: "Поделиться этой беседой", shareWarning: "Это может содержать личную информацию. Проверьте перед отправкой.", private: "Приватно", public: "Публично", publicAccess: "Публичный доступ", onlyYouAccess: "Доступ есть только у вас", anyoneWithLink: "Любой по ссылке может просматривать", chooseAgentBehavior: "Выберите, как агент локализует ответы и выполняет инструменты MCP.", themeDescription: "Выберите цветовую схему приложения для чата, настроек и коннекторов.", timezoneDescription: "Используется для ответов с датами, языка планирования и временных меток.", local: "Локально", saved: "Сохранено", theme: "Тема", timezone: "Часовой пояс", currentTime: "Текущее время", language: "Язык", languageWebOnly: "Используется для текста интерфейса и локального форматирования.", mcpToolApproval: "Подтверждение инструмента MCP", askEveryTime: "Спрашивать каждый раз", askRiskyTools: "Спрашивать для рискованных инструментов", runAutomatically: "Запускать автоматически", selectTimezone: "Выберите часовой пояс", selectLanguage: "Выберите язык", selectApprovalPolicy: "Выберите политику подтверждения", typeYourPrompt: "Введите запрос...", quickActions: "Быстрые действия", chatHeroTitle: "Разберемся вместе", readOnlySharedChat: "Это общий чат только для чтения", thinking: "Думаю...", toolExecutionRequest: "Запрос на выполнение инструмента", actionRequired: "Требуется действие", requestingToolExecution: "Запрос на запуск {toolName} на {serverId}.", payload: "Данные", approve: "Разрешить", deny: "Отклонить", toolExecutionApproved: "Выполнение инструмента разрешено", toolExecutionDenied: "Выполнение инструмента отклонено", mcpTool: "Инструмент MCP", selectedMcpServer: "Выбранный сервер MCP", mcpServer: "Сервер MCP", connectionFailed: "Сбой подключения", connecting: "Подключение...", connectionReady: "Подключение готово.", connectionNotReady: "Подключение не стало готовым. Попробуйте снова.", waitingForConnectionReady: "Ожидание готовности подключения.", connectionRequestCancelled: "Запрос подключения отменен.", connectionToolFailed: "Инструмент подключения завершился с ошибкой", pleaseConnectToContinue: "Подключитесь, чтобы продолжить.", connect: "Подключить", chainOfThought: "Цепочка рассуждений", reasoning: "Рассуждение", thoughtFor: "Думал", args: "Аргументы", result: "Результат", edit: "Изменить", copy: "Копировать", copied: "Скопировано", regenerate: "Сгенерировать заново", editYourMessage: "Измените сообщение...", subsequentMessagesDeleted: "Следующие сообщения будут удалены", updateAndContinue: "Обновить и продолжить", copiedToClipboard: "Скопировано в буфер обмена", failedToCopy: "Не удалось скопировать", inputTokens: "Ввод", outputTokens: "Вывод", totalTokens: "Итого", openNavigationMenu: "Открыть меню навигации", closeNavigationMenu: "Закрыть меню навигации", toggleSidebar: "Переключить боковую панель", chatActions: "Действия чата", assistantLogo: "Логотип ассистента", assistantAvatar: "Аватар ассистента", setPublicToShare: "Сделайте чат публичным, чтобы включить общий доступ.", linkCopied: "Ссылка скопирована", failedToCopyLink: "Не удалось скопировать ссылку", chatDeletedSuccessfully: "Чат удален", failedToUpdateSharing: "Не удалось обновить общий доступ", shareSettingsUpdated: "Настройки общего доступа обновлены", apiKeysDescription: "Учетные данные провайдеров LLM и доступ к Workflow Automation Engine", llmSettings: "Настройки LLM", provider: "Провайдер", selectProvider: "Выберите провайдера", model: "Модель", apiKey: "API-ключ", pasteApiKey: "Вставьте API-ключ", hideApiKey: "Скрыть API-ключ", showApiKey: "Показать API-ключ", browserKeyPrivacy: "Ваш ключ хранится в браузере и отправляется только с вашими запросами.", custom: "Пользовательский", customModelDescription: "Пользовательская модель, предоставленная вашим API",
  },
  "ur-PK": {
    settings: "ترتیبات", account: "اکاؤنٹ", preferences: "ترجیحات", apiKeys: "API کلیدیں", connectors: "کنیکٹرز", apps: "ایپس", newChat: "نئی چیٹ", yourChats: "آپ کی چیٹس", searchChats: "چیٹس تلاش کریں", loadingChats: "چیٹس لوڈ ہو رہی ہیں...", noChatsYet: "ابھی کوئی چیٹ نہیں", rename: "نام بدلیں", share: "شیئر کریں", delete: "حذف کریں", copyLink: "لنک کاپی کریں", shareConversation: "یہ گفتگو شیئر کریں", shareWarning: "اس میں ذاتی معلومات ہو سکتی ہیں۔ شیئر کرنے سے پہلے جائزہ لیں۔", private: "نجی", public: "عوامی", publicAccess: "عوامی رسائی", onlyYouAccess: "صرف آپ کو رسائی ہے", anyoneWithLink: "لنک والا کوئی بھی دیکھ سکتا ہے", chooseAgentBehavior: "منتخب کریں کہ ایجنٹ جوابات کو کیسے مقامی بنائے اور MCP ٹول چلانا کیسے سنبھالے۔", themeDescription: "چیٹ، ترتیبات اور کنیکٹر ویوز کے لیے ایپ رنگ سکیم منتخب کریں۔", timezoneDescription: "تاریخ سے متعلق جوابات، شیڈولنگ زبان اور ٹائم اسٹیمپس کے لیے استعمال ہوتا ہے۔", local: "مقامی", saved: "محفوظ", theme: "تھیم", timezone: "ٹائم زون", currentTime: "موجودہ وقت", language: "زبان", languageWebOnly: "ایپ انٹرفیس متن اور علاقائی فارمیٹنگ کے لیے استعمال ہوتا ہے۔", mcpToolApproval: "MCP ٹول منظوری", askEveryTime: "ہر بار پوچھیں", askRiskyTools: "خطرناک ٹولز کے لیے پوچھیں", runAutomatically: "خودکار چلائیں", selectTimezone: "ٹائم زون منتخب کریں", selectLanguage: "زبان منتخب کریں", selectApprovalPolicy: "منظوری پالیسی منتخب کریں", typeYourPrompt: "اپنا پرامپٹ لکھیں...", quickActions: "فوری کارروائیاں", chatHeroTitle: "آئیں اسے مل کر حل کریں", readOnlySharedChat: "یہ صرف پڑھنے والی شیئرڈ چیٹ ہے", thinking: "سوچ رہا ہے...", toolExecutionRequest: "ٹول چلانے کی درخواست", actionRequired: "کارروائی درکار", requestingToolExecution: "{serverId} پر {toolName} چلانے کی درخواست۔", payload: "پے لوڈ", approve: "منظور کریں", deny: "رد کریں", toolExecutionApproved: "ٹول چلانا منظور ہوا", toolExecutionDenied: "ٹول چلانا رد ہوا", mcpTool: "MCP ٹول", selectedMcpServer: "منتخب MCP سرور", mcpServer: "MCP سرور", connectionFailed: "کنکشن ناکام", connecting: "کنیکٹ ہو رہا ہے...", connectionReady: "کنکشن تیار ہے۔", connectionNotReady: "کنکشن تیار حالت تک نہیں پہنچا۔ دوبارہ کوشش کریں۔", waitingForConnectionReady: "کنکشن تیار ہونے کا انتظار ہے۔", connectionRequestCancelled: "کنکشن درخواست منسوخ ہو گئی۔", connectionToolFailed: "کنکشن ٹول ناکام", pleaseConnectToContinue: "جاری رکھنے کے لیے کنیکٹ کریں۔", connect: "کنیکٹ کریں", chainOfThought: "خیالات کی زنجیر", reasoning: "استدلال", thoughtFor: "سوچا گیا", args: "دلائل", result: "نتیجہ", edit: "ترمیم", copy: "کاپی", copied: "کاپی ہو گیا", regenerate: "دوبارہ بنائیں", editYourMessage: "اپنا پیغام ترمیم کریں...", subsequentMessagesDeleted: "بعد کے پیغامات حذف ہو جائیں گے", updateAndContinue: "اپ ڈیٹ کریں اور جاری رکھیں", copiedToClipboard: "کلپ بورڈ میں کاپی ہو گیا", failedToCopy: "کاپی ناکام", inputTokens: "ان پٹ", outputTokens: "آؤٹ پٹ", totalTokens: "کل", openNavigationMenu: "نیویگیشن مینو کھولیں", closeNavigationMenu: "نیویگیشن مینو بند کریں", toggleSidebar: "سائیڈ بار بدلیں", chatActions: "چیٹ کارروائیاں", assistantLogo: "اسسٹنٹ لوگو", assistantAvatar: "اسسٹنٹ اوتار", setPublicToShare: "شیئرنگ فعال کرنے کے لیے چیٹ کو عوامی کریں۔", linkCopied: "لنک کاپی ہو گیا", failedToCopyLink: "لنک کاپی ناکام", chatDeletedSuccessfully: "چیٹ حذف ہو گئی", failedToUpdateSharing: "شیئرنگ اپ ڈیٹ ناکام", shareSettingsUpdated: "شیئر ترتیبات اپ ڈیٹ ہوئیں", apiKeysDescription: "LLM فراہم کنندہ اسناد اور ورک فلو آٹومیشن انجن رسائی", llmSettings: "LLM ترتیبات", provider: "فراہم کنندہ", selectProvider: "فراہم کنندہ منتخب کریں", model: "ماڈل", apiKey: "API کلید", pasteApiKey: "اپنی API کلید پیسٹ کریں", hideApiKey: "API کلید چھپائیں", showApiKey: "API کلید دکھائیں", browserKeyPrivacy: "آپ کی کلید آپ کے براؤزر میں رہتی ہے اور صرف آپ کے پرامپٹس کے ساتھ بھیجی جاتی ہے۔", custom: "حسب ضرورت", customModelDescription: "آپ کے API کا فراہم کردہ حسب ضرورت ماڈل",
  },
};

const localizedOpenInNewTab: Record<Exclude<Locale, "en-US">, string> = {
  "zh-CN": "在新标签页中打开",
  "hi-IN": "नए टैब में खोलें",
  "es-ES": "Abrir en una pestaña nueva",
  "fr-FR": "Ouvrir dans un nouvel onglet",
  "ar-SA": "فتح في علامة تبويب جديدة",
  "ja-JP": "新しいタブで開く",
  "pt-BR": "Abrir em nova aba",
  "ru-RU": "Открыть в новой вкладке",
  "ur-PK": "نئے ٹیب میں کھولیں",
};

const localizedChatSidebarMessages: Record<
  Exclude<Locale, "en-US">,
  Pick<Dictionary, ChatSidebarMessageKey>
> = {
  "zh-CN": {
    chatHistory: "历史记录",
    pinChat: "固定聊天",
    unpinChat: "取消固定聊天",
    pinnedChats: "已固定",
    todayChats: "今天",
    yesterdayChats: "昨天",
    previous7Days: "过去 7 天",
    previous30Days: "过去 30 天",
    olderChats: "更早",
    justNow: "刚刚",
  },
  "hi-IN": {
    chatHistory: "इतिहास",
    pinChat: "चैट पिन करें",
    unpinChat: "चैट अनपिन करें",
    pinnedChats: "पिन की गई",
    todayChats: "आज",
    yesterdayChats: "कल",
    previous7Days: "पिछले 7 दिन",
    previous30Days: "पिछले 30 दिन",
    olderChats: "पुरानी",
    justNow: "अभी",
  },
  "es-ES": {
    chatHistory: "Historial",
    pinChat: "Fijar chat",
    unpinChat: "Desfijar chat",
    pinnedChats: "Fijados",
    todayChats: "Hoy",
    yesterdayChats: "Ayer",
    previous7Days: "Últimos 7 días",
    previous30Days: "Últimos 30 días",
    olderChats: "Más antiguos",
    justNow: "Ahora mismo",
  },
  "fr-FR": {
    chatHistory: "Historique",
    pinChat: "Épingler le chat",
    unpinChat: "Désépingler le chat",
    pinnedChats: "Épinglés",
    todayChats: "Aujourd'hui",
    yesterdayChats: "Hier",
    previous7Days: "7 derniers jours",
    previous30Days: "30 derniers jours",
    olderChats: "Plus anciens",
    justNow: "À l'instant",
  },
  "ar-SA": {
    chatHistory: "السجل",
    pinChat: "تثبيت المحادثة",
    unpinChat: "إلغاء تثبيت المحادثة",
    pinnedChats: "مثبتة",
    todayChats: "اليوم",
    yesterdayChats: "أمس",
    previous7Days: "آخر 7 أيام",
    previous30Days: "آخر 30 يوما",
    olderChats: "أقدم",
    justNow: "الآن",
  },
  "ja-JP": {
    chatHistory: "履歴",
    pinChat: "チャットをピン留め",
    unpinChat: "ピン留めを解除",
    pinnedChats: "ピン留め",
    todayChats: "今日",
    yesterdayChats: "昨日",
    previous7Days: "過去 7 日間",
    previous30Days: "過去 30 日間",
    olderChats: "それ以前",
    justNow: "たった今",
  },
  "pt-BR": {
    chatHistory: "Histórico",
    pinChat: "Fixar chat",
    unpinChat: "Desafixar chat",
    pinnedChats: "Fixados",
    todayChats: "Hoje",
    yesterdayChats: "Ontem",
    previous7Days: "Últimos 7 dias",
    previous30Days: "Últimos 30 dias",
    olderChats: "Mais antigos",
    justNow: "Agora",
  },
  "ru-RU": {
    chatHistory: "История",
    pinChat: "Закрепить чат",
    unpinChat: "Открепить чат",
    pinnedChats: "Закрепленные",
    todayChats: "Сегодня",
    yesterdayChats: "Вчера",
    previous7Days: "Последние 7 дней",
    previous30Days: "Последние 30 дней",
    olderChats: "Более старые",
    justNow: "Только что",
  },
  "ur-PK": {
    chatHistory: "تاریخ",
    pinChat: "چیٹ پن کریں",
    unpinChat: "چیٹ ان پن کریں",
    pinnedChats: "پن کی گئی",
    todayChats: "آج",
    yesterdayChats: "گزشتہ روز",
    previous7Days: "پچھلے 7 دن",
    previous30Days: "پچھلے 30 دن",
    olderChats: "پرانی",
    justNow: "ابھی",
  },
};

const localizedRecipeMessages: Record<
  Exclude<Locale, "en-US">,
  Pick<Dictionary, RecipeMessageKey>
> = {
  "zh-CN": {
    recipeEmailSummary: "邮件摘要",
    recipeEmailSummaryDesc:
      "使用 Composio MCP 访问 Gmail，查看我今天的未读邮件并总结重要内容",
    recipeSemanticSearch: "语义搜索",
    recipeSemanticSearchDesc:
      "使用 Exa 搜索网页，查找过去一个月关于 LLM 优化的最新研究论文。",
    recipeGithubIssueSummary: "GitHub Issue 摘要",
    recipeGithubIssueSummaryDesc:
      "使用 Composio MCP 访问 GitHub，获取此仓库最新开放 issue 并总结最关键的 bug。",
    recipeSupabaseProject: "Supabase 项目",
    recipeSupabaseProjectDesc:
      "帮助用户管理 Supabase 项目和数据库。遵循 Supabase 最佳实践，协助处理项目、表、迁移、SQL 和故障排查。",
    recipeNotionMeetingPrep: "Notion 会议准备",
    recipeNotionMeetingPrepDesc:
      "直接从 Notion 综合项目笔记和最新更新，生成一份简报文档。",
    recipeMarketAnalysis: "市场分析",
    recipeMarketAnalysisDesc:
      "使用 Alpha Vantage 获取 {TICKER} 最近 30 天的每日价格。总结价格趋势是上涨、下跌还是持平。",
  },
  "hi-IN": {
    recipeEmailSummary: "ईमेल सारांश",
    recipeEmailSummaryDesc:
      "Gmail तक पहुंचने के लिए Composio MCP का उपयोग करें, आज के मेरे अपठित ईमेल जांचें और महत्वपूर्ण ईमेल का सारांश दें",
    recipeSemanticSearch: "सिमेंटिक खोज",
    recipeSemanticSearchDesc:
      "पिछले महीने के LLM ऑप्टिमाइजेशन पर नवीनतम शोध पत्र खोजने के लिए Exa से वेब खोजें।",
    recipeGithubIssueSummary: "GitHub इश्यू सारांश",
    recipeGithubIssueSummaryDesc:
      "इस रिपॉजिटरी के नवीनतम खुले इश्यू लाने और सबसे महत्वपूर्ण बग का सारांश देने के लिए Composio MCP से GitHub तक पहुंचें।",
    recipeSupabaseProject: "Supabase प्रोजेक्ट",
    recipeSupabaseProjectDesc:
      "आप उपयोगकर्ताओं को Supabase प्रोजेक्ट और डेटाबेस प्रबंधित करने में मदद करते हैं। Supabase best practices का पालन करते हुए प्रोजेक्ट, टेबल, माइग्रेशन, SQL और troubleshooting में मदद करें।",
    recipeNotionMeetingPrep: "Notion मीटिंग तैयारी",
    recipeNotionMeetingPrepDesc:
      "Notion से प्रोजेक्ट नोट्स और हालिया अपडेट को मिलाकर एक briefing document बनाएं।",
    recipeMarketAnalysis: "बाजार विश्लेषण",
    recipeMarketAnalysisDesc:
      "Alpha Vantage से {TICKER} के पिछले 30 दिनों के daily prices fetch करें। बताएं कि price trend ऊपर, नीचे या flat है।",
  },
  "es-ES": {
    recipeEmailSummary: "Resumen de correo",
    recipeEmailSummaryDesc:
      "Usa Composio MCP para acceder a Gmail, revisar mis correos no leídos de hoy y resumir los importantes",
    recipeSemanticSearch: "Búsqueda semántica",
    recipeSemanticSearchDesc:
      "Busca en la web con Exa los artículos de investigación más recientes sobre optimización de LLM del último mes.",
    recipeGithubIssueSummary: "Resumen de issues de GitHub",
    recipeGithubIssueSummaryDesc:
      "Usa Composio MCP para acceder a GitHub, obtener los issues abiertos más recientes de este repositorio y resumir los bugs más críticos.",
    recipeSupabaseProject: "Proyecto Supabase",
    recipeSupabaseProjectDesc:
      "Ayuda a los usuarios a gestionar proyectos y bases de datos de Supabase. Asiste con proyectos, tablas, migraciones, SQL y resolución de problemas siguiendo buenas prácticas de Supabase.",
    recipeNotionMeetingPrep: "Preparación de reunión en Notion",
    recipeNotionMeetingPrepDesc:
      "Genera un documento informativo sintetizando notas del proyecto y actualizaciones recientes directamente desde Notion.",
    recipeMarketAnalysis: "Análisis de mercado",
    recipeMarketAnalysisDesc:
      "Usa Alpha Vantage para obtener los precios diarios de los últimos 30 días de {TICKER}. Resume si la tendencia del precio sube, baja o está plana.",
  },
  "fr-FR": {
    recipeEmailSummary: "Résumé des e-mails",
    recipeEmailSummaryDesc:
      "Utilise Composio MCP pour accéder à Gmail, consulter mes e-mails non lus d'aujourd'hui et résumer les plus importants",
    recipeSemanticSearch: "Recherche sémantique",
    recipeSemanticSearchDesc:
      "Recherche sur le web avec Exa les derniers articles de recherche sur l'optimisation des LLM du mois dernier.",
    recipeGithubIssueSummary: "Résumé des issues GitHub",
    recipeGithubIssueSummaryDesc:
      "Utilise Composio MCP pour accéder à GitHub, récupérer les dernières issues ouvertes de ce dépôt et résumer les bugs les plus critiques.",
    recipeSupabaseProject: "Projet Supabase",
    recipeSupabaseProjectDesc:
      "Aide les utilisateurs à gérer des projets et bases de données Supabase. Assiste sur les projets, tables, migrations, SQL et dépannage en suivant les bonnes pratiques Supabase.",
    recipeNotionMeetingPrep: "Préparation de réunion Notion",
    recipeNotionMeetingPrepDesc:
      "Génère un document de briefing en synthétisant les notes de projet et les dernières mises à jour directement depuis Notion.",
    recipeMarketAnalysis: "Analyse de marché",
    recipeMarketAnalysisDesc:
      "Utilise Alpha Vantage pour récupérer les prix quotidiens des 30 derniers jours de {TICKER}. Résume si la tendance du prix monte, baisse ou reste stable.",
  },
  "ar-SA": {
    recipeEmailSummary: "ملخص البريد الإلكتروني",
    recipeEmailSummaryDesc:
      "استخدم Composio MCP للوصول إلى Gmail، وافحص رسائلي غير المقروءة اليوم، ولخص الرسائل المهمة",
    recipeSemanticSearch: "بحث دلالي",
    recipeSemanticSearchDesc:
      "ابحث في الويب باستخدام Exa للعثور على أحدث أبحاث تحسين LLM خلال الشهر الماضي.",
    recipeGithubIssueSummary: "ملخص مشكلات GitHub",
    recipeGithubIssueSummaryDesc:
      "استخدم Composio MCP للوصول إلى GitHub وجلب أحدث المشكلات المفتوحة في هذا المستودع وتلخيص أهم الأخطاء.",
    recipeSupabaseProject: "مشروع Supabase",
    recipeSupabaseProjectDesc:
      "ساعد المستخدمين في إدارة مشاريع وقواعد بيانات Supabase. قدم المساعدة في المشاريع والجداول والترحيلات وSQL واستكشاف الأخطاء مع اتباع أفضل ممارسات Supabase.",
    recipeNotionMeetingPrep: "تحضير اجتماع Notion",
    recipeNotionMeetingPrepDesc:
      "أنشئ مستند إحاطة عبر تلخيص ملاحظات المشروع وآخر التحديثات مباشرة من Notion.",
    recipeMarketAnalysis: "تحليل السوق",
    recipeMarketAnalysisDesc:
      "استخدم Alpha Vantage لجلب الأسعار اليومية لآخر 30 يوما لـ {TICKER}. لخص ما إذا كان اتجاه السعر صاعدا أو هابطا أو مستقرا.",
  },
  "ja-JP": {
    recipeEmailSummary: "メール要約",
    recipeEmailSummaryDesc:
      "Composio MCP で Gmail にアクセスし、今日の未読メールを確認して重要なものを要約する",
    recipeSemanticSearch: "セマンティック検索",
    recipeSemanticSearchDesc:
      "Exa を使ってウェブを検索し、過去 1 か月の LLM 最適化に関する最新研究論文を探す。",
    recipeGithubIssueSummary: "GitHub Issue 要約",
    recipeGithubIssueSummaryDesc:
      "Composio MCP で GitHub にアクセスし、このリポジトリの最新の未解決 issue を取得して重要なバグを要約する。",
    recipeSupabaseProject: "Supabase プロジェクト",
    recipeSupabaseProjectDesc:
      "Supabase プロジェクトとデータベースの管理を支援します。Supabase のベストプラクティスに従い、プロジェクト、テーブル、マイグレーション、SQL、トラブルシューティングを支援します。",
    recipeNotionMeetingPrep: "Notion 会議準備",
    recipeNotionMeetingPrepDesc:
      "Notion からプロジェクトノートと最新更新を統合し、ブリーフィング資料を生成する。",
    recipeMarketAnalysis: "市場分析",
    recipeMarketAnalysisDesc:
      "Alpha Vantage を使って {TICKER} の過去 30 日分の日次価格を取得し、価格トレンドが上昇、下落、横ばいかを要約する。",
  },
  "pt-BR": {
    recipeEmailSummary: "Resumo de e-mails",
    recipeEmailSummaryDesc:
      "Use o Composio MCP para acessar o Gmail, verificar meus e-mails não lidos de hoje e resumir os importantes",
    recipeSemanticSearch: "Busca semântica",
    recipeSemanticSearchDesc:
      "Pesquise na web com Exa os artigos de pesquisa mais recentes sobre otimização de LLM do último mês.",
    recipeGithubIssueSummary: "Resumo de issues do GitHub",
    recipeGithubIssueSummaryDesc:
      "Use o Composio MCP para acessar o GitHub, buscar as issues abertas mais recentes deste repositório e resumir os bugs mais críticos.",
    recipeSupabaseProject: "Projeto Supabase",
    recipeSupabaseProjectDesc:
      "Ajude usuários a gerenciar projetos e bancos de dados Supabase. Auxilie com projetos, tabelas, migrações, SQL e solução de problemas seguindo boas práticas do Supabase.",
    recipeNotionMeetingPrep: "Preparação de reunião no Notion",
    recipeNotionMeetingPrepDesc:
      "Gere um documento de briefing sintetizando notas do projeto e atualizações recentes diretamente do Notion.",
    recipeMarketAnalysis: "Análise de mercado",
    recipeMarketAnalysisDesc:
      "Use Alpha Vantage para buscar os preços diários dos últimos 30 dias de {TICKER}. Resuma se a tendência do preço está subindo, caindo ou estável.",
  },
  "ru-RU": {
    recipeEmailSummary: "Сводка писем",
    recipeEmailSummaryDesc:
      "Используйте Composio MCP для доступа к Gmail, проверьте мои непрочитанные письма за сегодня и кратко изложите важные",
    recipeSemanticSearch: "Семантический поиск",
    recipeSemanticSearchDesc:
      "Найдите в интернете через Exa последние исследовательские статьи по оптимизации LLM за последний месяц.",
    recipeGithubIssueSummary: "Сводка issue GitHub",
    recipeGithubIssueSummaryDesc:
      "Используйте Composio MCP для доступа к GitHub, получите последние открытые issue этого репозитория и кратко изложите самые критичные ошибки.",
    recipeSupabaseProject: "Проект Supabase",
    recipeSupabaseProjectDesc:
      "Помогайте пользователям управлять проектами и базами данных Supabase. Помогайте с проектами, таблицами, миграциями, SQL и устранением неполадок, следуя лучшим практикам Supabase.",
    recipeNotionMeetingPrep: "Подготовка встречи Notion",
    recipeNotionMeetingPrepDesc:
      "Создайте briefing-документ, синтезируя заметки проекта и последние обновления прямо из Notion.",
    recipeMarketAnalysis: "Анализ рынка",
    recipeMarketAnalysisDesc:
      "Используйте Alpha Vantage, чтобы получить дневные цены {TICKER} за последние 30 дней. Кратко опишите, растет цена, падает или остается стабильной.",
  },
  "ur-PK": {
    recipeEmailSummary: "ای میل خلاصہ",
    recipeEmailSummaryDesc:
      "Composio MCP کے ذریعے Gmail تک رسائی حاصل کریں، آج کی میری unread emails دیکھیں اور اہم emails کا خلاصہ بنائیں",
    recipeSemanticSearch: "Semantic تلاش",
    recipeSemanticSearchDesc:
      "Exa کے ذریعے ویب تلاش کریں اور پچھلے مہینے کی LLM optimization پر تازہ ترین research papers تلاش کریں۔",
    recipeGithubIssueSummary: "GitHub issue خلاصہ",
    recipeGithubIssueSummaryDesc:
      "Composio MCP کے ذریعے GitHub تک رسائی حاصل کریں، اس repository کے تازہ ترین open issues حاصل کریں اور اہم bugs کا خلاصہ بنائیں۔",
    recipeSupabaseProject: "Supabase پروجیکٹ",
    recipeSupabaseProjectDesc:
      "صارفین کو Supabase projects اور databases manage کرنے میں مدد دیں۔ Supabase best practices کے مطابق projects, tables, migrations, SQL اور troubleshooting میں مدد کریں۔",
    recipeNotionMeetingPrep: "Notion meeting تیاری",
    recipeNotionMeetingPrepDesc:
      "Notion سے project notes اور recent updates کو synthesize کر کے briefing document بنائیں۔",
    recipeMarketAnalysis: "مارکیٹ تجزیہ",
    recipeMarketAnalysisDesc:
      "Alpha Vantage سے {TICKER} کے پچھلے 30 دنوں کے daily prices حاصل کریں۔ خلاصہ کریں کہ price trend اوپر، نیچے یا flat ہے۔",
  },
};

const dictionaries: Record<Locale, Dictionary> = Object.fromEntries(
  WEB_I18N_LANGUAGE_OPTIONS.map((option) => [
    option.value,
    option.value === "en-US"
      ? en
      : {
          ...en,
          ...localeSources[option.value as Exclude<Locale, "en-US">],
          ...localizedChatSidebarMessages[option.value as Exclude<Locale, "en-US">],
          ...localizedRecipeMessages[option.value as Exclude<Locale, "en-US">],
          openInNewTab: localizedOpenInNewTab[option.value as Exclude<Locale, "en-US">],
        },
  ])
) as Record<Locale, Dictionary>;

function dictionaryForLanguage(language: string): Dictionary {
  const normalized = normalizeDictionaryLanguage(language);
  return dictionaries[normalized as Locale] ?? en;
}

export function translateWebMessage(language: string, key: WebMessageKey): string {
  return dictionaryForLanguage(language)[key];
}

export function formatWebMessage(
  language: string,
  key: WebMessageKey,
  values: Record<string, string | number>
): string {
  return translateWebMessage(language, key).replace(/\{(\w+)\}/g, (match, name) =>
    values[name] == null ? match : String(values[name])
  );
}

export function getTextDirectionForLanguage(language: string): "ltr" | "rtl" {
  const normalized = normalizeDictionaryLanguage(language);
  return normalized === "ar-SA" || normalized === "ur-PK" ? "rtl" : "ltr";
}

export function getWebI18nDiagnostics() {
  return WEB_I18N_LANGUAGE_OPTIONS.flatMap((option) => {
    if (option.value === "en-US") return [];
    const source = localeSources[option.value as Exclude<Locale, "en-US">];
    return requiredLocalizedKeys
      .filter((key) => !(key in source))
      .map((key) => ({ locale: option.value, missingKey: key }));
  });
}
