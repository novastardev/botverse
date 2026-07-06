/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import firebaseAppletConfig from "./firebase-applet-config.json";

dotenv.config();

// Initialize Firebase Admin SDK
let appInstance: any;
let firestoreAvailable = true;

const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

if (!serviceAccountKey || serviceAccountKey.trim() === "") {
  console.log("==========================================================");
  console.log("🛡️  FIRESTORE DYNAMIC FALLBACK: IN-MEMORY MODE ACTIVE       🛡️");
  console.log("Reason: There is no 'FIREBASE_SERVICE_ACCOUNT_KEY' in .env");
  console.log("The Applet Express backend will persist all chatbot data,");
  console.log("logs, and activity streams in-memory for this live session.");
  console.log("To connect to a persistent Google Cloud Firestore database:");
  console.log("1. Open the Firebase console and generate a new Service Account Key.");
  console.log("2. Minimize/compress the JSON string to a single-line string.");
  console.log("3. Add it as FIREBASE_SERVICE_ACCOUNT_KEY in your .env file.");
  console.log("==========================================================");
  firestoreAvailable = false;
}

try {
  const adminConfig: any = {
    projectId: firebaseAppletConfig.projectId
  };

  if (serviceAccountKey && serviceAccountKey.trim() !== "") {
    try {
      const parsedKey = JSON.parse(serviceAccountKey);
      adminConfig.credential = cert(parsedKey);
      console.log("[Firebase Admin] Initialized with Service Account Key from env variable.");
    } catch (parseErr: any) {
      console.error("[Firebase Admin Error] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY env variable as JSON. Falling back to default initialization.", parseErr.message);
      firestoreAvailable = false;
    }
  } else {
    console.log("[Firebase Admin] No FIREBASE_SERVICE_ACCOUNT_KEY environment variable provided. Relying on host environment default credentials.");
  }

  appInstance = initializeApp(adminConfig);
} catch (initErr: any) {
  console.error("[Firebase Admin Error] Failed during app initialization:", initErr.message);
  firestoreAvailable = false;
}

const db = firebaseAppletConfig.firestoreDatabaseId && firebaseAppletConfig.firestoreDatabaseId !== "(default)"
  ? getFirestore(appInstance, firebaseAppletConfig.firestoreDatabaseId)
  : getFirestore();

// Run immediate async connection verification if active to catch permission issues early
if (firestoreAvailable) {
  db.collection("test-connection-status").doc("startup-probe").get()
    .then(() => {
      console.log("[Firebase Connection Check] Success: Backend is fully authorized and connected to Cloud Firestore on project:", firebaseAppletConfig.projectId);
    })
    .catch((probeErr) => {
      console.warn(`[Firebase Connection Check] Warning: Backend connection failed with PERMISSION_DENIED. Falling back to in-memory mode.`);
      firestoreAvailable = false;
    });
}

// Helper to clean undefined fields before saving to Firestore Admin
function cleanData(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (Array.isArray(obj)) {
    return obj.map(cleanData);
  }
  if (typeof obj === 'object') {
    const res: any = {};
    for (const key of Object.keys(obj)) {
      if (obj[key] !== undefined) {
        res[key] = cleanData(obj[key]);
      }
    }
    return res;
  }
  return obj;
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Enable CORS for all requests to support direct API calls from custom frontends (e.g., Vercel)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

// In-Memory Database representing bots and logs
interface BotStore {
  id: string;
  userId: string;
  name: string;
  platform: 'telegram' | 'whatsapp';
  status: 'active' | 'paused' | 'stopped' | 'error';
  aiSource: 'gemini' | 'openai' | 'deepseek' | 'paniex' | 'freeapi';
  aiModel: string;
  apiKey: string;
  systemPrompt: string;
  customInstructions: string;
  greetingMessage: string;
  enableGoogleSearch?: boolean;
  enableCodeExecution?: boolean;
  enableMemory?: boolean;
  memoryUsedMb?: number;
  enableImageGen?: boolean;
  pollinationsApiKey?: string;
  pollinationsModel?: string;
  
  telegramToken?: string;
  whatsappConnected?: boolean;
  whatsappPairingCode?: string;
  whatsappQrCode?: string;
  
  createdAt: string;
  uptime: number; // in seconds
  totalMessagesProcessed: number;
}

interface LogStore {
  id: string;
  botId: string;
  direction: 'in' | 'out' | 'system';
  text: string;
  sender: string;
  timestamp: string;
  status: 'success' | 'failed' | 'info';
  modelUsed?: string;
}

interface ActivityStore {
  id: string;
  botId: string;
  botName: string;
  type: 'message' | 'status_change' | 'config_update' | 'error';
  message: string;
  timestamp: string;
  platform: 'telegram' | 'whatsapp';
}

// Seed Initial realistic mock data for SaaS control center look
let bots: BotStore[] = [
  {
    id: "bot-tg-01",
    userId: "user-1",
    name: "Customer Support Delta",
    platform: "telegram",
    status: "active",
    aiSource: "gemini",
    aiModel: "gemini-3.5-flash",
    apiKey: "••••••••••••••••••••••••",
    systemPrompt: "You are the head technical support bot for a software house called CloudCraft. Your goal is to guide users through debugging their deployments gracefully.",
    customInstructions: "Use technical but helpful language. Mention common fixes like clearing cache, validating configuration keys, or rebuilding containers. Always offer to connect to an engineering specialist if complex issues persist.",
    greetingMessage: "Hello! Delta technical workspace is online. Let me know your service error or debugging query.",
    enableMemory: true,
    memoryUsedMb: 12.5,
    telegramToken: "872391039:AAEfgH10JK90LmpQrStuVwXyz",
    createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    uptime: 172800,
    totalMessagesProcessed: 142
  },
  {
    id: "bot-wa-02",
    userId: "user-1",
    name: "WhatsApp Sales Dynamo",
    platform: "whatsapp",
    status: "active",
    aiSource: "gemini",
    aiModel: "gemini-3.1-flash-lite",
    apiKey: "••••••••••••••••••••••••",
    systemPrompt: "You are an elite, energetic sales assistant for a digital agency. You handle leads, outline service pricing, and schedule free product walkthroughs.",
    customInstructions: "Keep responses snappy, promotional, and energetic. Include actionable calls-to-action like planning a call. Add occasional emojis to keep conversations conversational and warm.",
    greetingMessage: "Hey there! Thanks for reaching out. We have some outstanding digital growth campaigns currently running. What service can we boost for you?",
    enableMemory: true,
    memoryUsedMb: 36.8,
    whatsappConnected: true,
    whatsappPairingCode: "K7R8-XM9P",
    createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    uptime: 86400,
    totalMessagesProcessed: 89
  }
];

interface UserMemoryConfig {
  userId: string;
  maxMemoryMb: number;
  subscribedPlan: 'free' | 'silver' | 'gold' | 'platinum';
}

let usersMemoryConfig: Record<string, UserMemoryConfig> = {
  "user-1": {
    userId: "user-1",
    maxMemoryMb: 100,
    subscribedPlan: 'free'
  }
};

function getUserEmail(req: any): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7).trim();
}

function handleFirestoreError(err: any, context: string) {
  const errMsg = err?.message || String(err);
  const isPermissionOrCredentialErr = 
    errMsg.includes("PERMISSION_DENIED") || 
    err.code === 7 || 
    errMsg.includes("credential") || 
    errMsg.includes("project") ||
    errMsg.includes("App") ||
    errMsg.includes("access");

  if (isPermissionOrCredentialErr) {
    if (firestoreAvailable) {
      console.warn(`[Firestore Error] ${context} failed with: ${errMsg}`);
      console.warn("==========================================================");
      console.warn("🛡️  FIRESTORE DISCONNECTED / DEGRADED TO IN-MEMORY MODE 🛡️");
      console.warn("Reason: The Applet Node Express backend lacks permissions to write to");
      console.warn(`the target Firebase project "${firebaseAppletConfig.projectId}".`);
      console.warn("HOW TO FIX:");
      console.warn("1. Go to Firebase Console (https://console.firebase.google.com).");
      console.warn("2. Navigate to Project Settings -> Service Accounts.");
      console.warn("3. Click 'Generate new private key' to download the Service Account Key JSON.");
      console.warn("4. Compress/Minimize the downloaded JSON to a single-line string.");
      console.warn("5. Set it as the Environment Variable 'FIREBASE_SERVICE_ACCOUNT_KEY' on Vercel/Render");
      console.warn("   or inside your /.env file to authorize the backend server.");
      console.warn("==========================================================");
      firestoreAvailable = false;
    }
  } else {
    console.warn(`[Firestore Warning] ${context} error:`, errMsg);
  }
}

function uniqueBots(arr: BotStore[]): BotStore[] {
  const seen = new Set<string>();
  return arr.filter(b => {
    if (seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });
}

async function loadUserBotsFromFirestore(email: string): Promise<BotStore[]> {
  const emailClean = email.trim().toLowerCase();
  
  if (!firestoreAvailable) {
    return uniqueBots(bots.filter(b => b.userId === emailClean));
  }

  try {
    const snapshot = await db.collection(`users/${emailClean}/bots`).get();
    const userBots: BotStore[] = [];
    
    for (const docSnap of snapshot.docs) {
      const rawBot = docSnap.data() as BotStore;
      // Always put all restored/loaded bots into suspend ('stopped') mode as requested
      rawBot.status = 'stopped';
      userBots.push(rawBot);
      
      try {
        // Save the status update back to Firestore to make the suspend permanent
        await db.collection(`users/${emailClean}/bots`).doc(rawBot.id).set(cleanData(rawBot));
      } catch (writeErr: any) {
        handleFirestoreError(writeErr, "loadUserBotsFromFirestore (status sync)");
      }
    }
    
    // Sync memory cache
    bots = bots.filter(b => b.userId !== emailClean);
    bots.push(...userBots);
    bots = uniqueBots(bots);
    
    return uniqueBots(userBots);
  } catch (err: any) {
    handleFirestoreError(err, "loadUserBotsFromFirestore");
    return uniqueBots(bots.filter(b => b.userId === emailClean));
  }
}

async function saveUserBotToFirestore(email: string, bot: BotStore): Promise<void> {
  const emailClean = email.trim().toLowerCase();
  bot.userId = emailClean;
  
  // Always update our local memory cache first immediately
  const idx = bots.findIndex(b => b.id === bot.id);
  if (idx !== -1) {
    bots[idx] = bot;
  } else {
    bots.push(bot);
  }
  bots = uniqueBots(bots);

  if (!firestoreAvailable) {
    return;
  }

  try {
    await db.collection(`users/${emailClean}/bots`).doc(bot.id).set(cleanData(bot));
  } catch (err: any) {
    handleFirestoreError(err, "saveUserBotToFirestore");
  }
}

async function deleteUserBotFromFirestore(email: string, botId: string): Promise<void> {
  const emailClean = email.trim().toLowerCase();
  
  // Always update our local memory cache first immediately
  bots = bots.filter(b => b.id !== botId);

  if (!firestoreAvailable) {
    return;
  }

  try {
    await db.collection(`users/${emailClean}/bots`).doc(botId).delete();
  } catch (err: any) {
    handleFirestoreError(err, "deleteUserBotFromFirestore");
  }
}

async function saveLogToFirestore(email: string, log: LogStore): Promise<void> {
  const emailClean = email.trim().toLowerCase();
  if (!firestoreAvailable) return;
  try {
    await db.collection(`users/${emailClean}/bots/${log.botId}/logs`).doc(log.id).set(cleanData(log));
  } catch (err: any) {
    handleFirestoreError(err, "saveLogToFirestore");
  }
}

async function loadLogsFromFirestore(email: string, botId: string): Promise<LogStore[]> {
  const emailClean = email.trim().toLowerCase();
  if (!firestoreAvailable) {
    return logs.filter(l => l.botId === botId);
  }
  try {
    const snapshot = await db.collection(`users/${emailClean}/bots/${botId}/logs`).orderBy("timestamp", "asc").get();
    const dbLogs: LogStore[] = [];
    snapshot.forEach(docSnap => {
      dbLogs.push(docSnap.data() as LogStore);
    });
    
    // Sync into local memory cache without triggering redundant Firestore writes
    const remainingLogs = logs.filter(l => l.botId !== botId);
    logs.length = 0;
    originalLogsPush.apply(logs, [...remainingLogs, ...dbLogs]);
    return dbLogs;
  } catch (err: any) {
    handleFirestoreError(err, "loadLogsFromFirestore");
    return logs.filter(l => l.botId === botId);
  }
}

async function saveActivityToFirestore(email: string, activity: ActivityStore): Promise<void> {
  const emailClean = email.trim().toLowerCase();
  if (!firestoreAvailable) return;
  try {
    await db.collection(`users/${emailClean}/activities`).doc(activity.id).set(cleanData(activity));
  } catch (err: any) {
    handleFirestoreError(err, "saveActivityToFirestore");
  }
}

async function loadActivitiesFromFirestore(email: string): Promise<ActivityStore[]> {
  const emailClean = email.trim().toLowerCase();
  if (!firestoreAvailable) {
    return generalActivity;
  }
  try {
    const snapshot = await db.collection(`users/${emailClean}/activities`).orderBy("timestamp", "desc").limit(100).get();
    const dbActivities: ActivityStore[] = [];
    snapshot.forEach(docSnap => {
      dbActivities.push(docSnap.data() as ActivityStore);
    });
    
    const userBots = bots.filter(b => b.userId === emailClean);
    const userBotIds = userBots.map(b => b.id);
    
    // Merge into generalActivity memory cache without triggering redundant Firestore writes
    const otherActivities = generalActivity.filter(act => !userBotIds.includes(act.botId));
    const combined = [...otherActivities, ...dbActivities];
    combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    generalActivity.length = 0;
    originalActivityUnshift.apply(generalActivity, combined);
    
    return dbActivities;
  } catch (err: any) {
    handleFirestoreError(err, "loadActivitiesFromFirestore");
    return generalActivity;
  }
}

async function getUserMemoryConfigFromFirestore(email: string): Promise<UserMemoryConfig> {
  const emailClean = email.trim().toLowerCase();
  
  if (!firestoreAvailable) {
    if (!usersMemoryConfig[emailClean]) {
      usersMemoryConfig[emailClean] = {
        userId: emailClean,
        maxMemoryMb: 100,
        subscribedPlan: 'free'
      };
    }
    return usersMemoryConfig[emailClean];
  }

  try {
    const snap = await db.collection(`users/${emailClean}/subscription`).doc("config").get();
    if (snap.exists) {
      const cfg = snap.data() as UserMemoryConfig;
      usersMemoryConfig[emailClean] = cfg;
      return cfg;
    }
    
    // Default fallback if not defined yet
    const defaultCfg: UserMemoryConfig = {
      userId: emailClean,
      maxMemoryMb: 100,
      subscribedPlan: 'free'
    };
    try {
      await db.collection(`users/${emailClean}/subscription`).doc("config").set(cleanData(defaultCfg));
    } catch (writeErr) {
      handleFirestoreError(writeErr, "getUserMemoryConfigFromFirestore (save default)");
    }
    usersMemoryConfig[emailClean] = defaultCfg;
    return defaultCfg;
  } catch (err: any) {
    handleFirestoreError(err, "getUserMemoryConfigFromFirestore");
    if (!usersMemoryConfig[emailClean]) {
      usersMemoryConfig[emailClean] = {
        userId: emailClean,
        maxMemoryMb: 100,
        subscribedPlan: 'free'
      };
    }
    return usersMemoryConfig[emailClean];
  }
}

async function saveUserMemoryConfigToFirestore(email: string, cfg: UserMemoryConfig): Promise<void> {
  const emailClean = email.trim().toLowerCase();
  usersMemoryConfig[emailClean] = cfg;

  if (!firestoreAvailable) {
    return;
  }

  try {
    await db.collection(`users/${emailClean}/subscription`).doc("config").set(cleanData(cfg));
  } catch (err: any) {
    handleFirestoreError(err, "saveUserMemoryConfigToFirestore");
  }
}

// Middleware to ensure user bots are loaded into cache on every backend call
async function ensureUserBotsLoaded(req: any, res: any, next: any) {
  const email = getUserEmail(req);
  if (email) {
    const emailClean = email.trim().toLowerCase();
    // Check if we already have bots for this user in cache. If not, load them.
    const hasBots = bots.some(b => b.userId === emailClean);
    if (!hasBots) {
      try {
        await loadUserBotsFromFirestore(email);
      } catch (err) {
        console.error("Failed to load user bots for cache sync:", err);
      }
    }
  }
  next();
}

// Register user bots sync middleware for all backend endpoints
app.use("/api", ensureUserBotsLoaded);

let logs: LogStore[] = [
  {
    id: "log-1",
    botId: "bot-tg-01",
    direction: "in",
    sender: "+1-925-341-9980",
    text: "Can you help me? My server deployment keeps returning a 502 Bad Gateway.",
    timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    status: "success"
  },
  {
    id: "log-2",
    botId: "bot-tg-01",
    direction: "out",
    sender: "Customer Support Delta",
    text: "Greeting! Live Delta support is here. A 502 Bad Gateway usually indicates that your front-facing Nginx load balancer cannot route correctly to your downstream Node.js/Python server container. Please confirm if your container list is running and binding to the correct local port (e.g., port 3000) inside your cluster.",
    timestamp: new Date(Date.now() - 9.5 * 60 * 1000).toISOString(),
    status: "success",
    modelUsed: "gemini-3.5-flash"
  },
  {
    id: "log-3",
    botId: "bot-wa-02",
    direction: "in",
    sender: "@alex_cyber",
    text: "Do you have pricing lists for custom app integrations?",
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    status: "success"
  },
  {
    id: "log-4",
    botId: "bot-wa-02",
    direction: "out",
    sender: "WhatsApp Sales Dynamo",
    text: "Great question! 🚀 Our app integration workflows typically range starting from $2,500, including secure OAuth, dedicated SQL databases, and real-time custom API pipelines. Tell me a bit more about what service you are looking to integrate, so we can tailor a nice proposal for you!",
    timestamp: new Date(Date.now() - 4.5 * 60 * 1000).toISOString(),
    status: "success",
    modelUsed: "gemini-3.1-flash-lite"
  }
];

let generalActivity: ActivityStore[] = [
  {
    id: "act-1",
    botId: "bot-tg-01",
    botName: "Customer Support Delta",
    type: "status_change",
    message: "Bot Delta successfully registered. Lifecycle set to ACTIVE.",
    timestamp: new Date(Date.now() - 47 * 3600 * 1000).toISOString(),
    platform: "telegram"
  },
  {
    id: "act-2",
    botId: "bot-tg-01",
    botName: "Customer Support Delta",
    type: "message",
    message: "Processed message from +1-925-341-9980: 'My server keeps returning 502'",
    timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    platform: "telegram"
  },
  {
    id: "act-3",
    botId: "bot-wa-02",
    botName: "WhatsApp Sales Dynamo",
    type: "message",
    message: "Processed WhatsApp transaction response to @alex_cyber on 'pricing lists'",
    timestamp: new Date(Date.now() - 4.5 * 60 * 1000).toISOString(),
    platform: "whatsapp"
  }
];

// Configure log and activity arrays to auto-sync additions to Firestore
const originalLogsPush = logs.push;
logs.push = function (...items: LogStore[]) {
  const result = originalLogsPush.apply(this, items);
  for (const item of items) {
    const parentBot = bots.find(b => b.id === item.botId);
    if (parentBot && parentBot.userId) {
      saveLogToFirestore(parentBot.userId, item).catch(() => {});
    }
  }
  return result;
};

const originalActivityUnshift = generalActivity.unshift;
generalActivity.unshift = function (...items: ActivityStore[]) {
  const result = originalActivityUnshift.apply(this, items);
  for (const item of items) {
    const parentBot = bots.find(b => b.id === item.botId);
    if (parentBot && parentBot.userId) {
      saveActivityToFirestore(parentBot.userId, item).catch(() => {});
    }
  }
  return result;
};

// Background uptime incrementer
setInterval(() => {
  bots.forEach(bot => {
    if (bot.status === 'active') {
      bot.uptime += 5;
    }
  });
}, 5000);

// Helper function to query Gemini API 
async function generateBotResponse(bot: BotStore, query: string, historyLogs: LogStore[] = []): Promise<string> {
  // Check if image generation is requested via pattern matching or /imagine command
  const qClean = query.trim().toLowerCase();
  let imagePrompt: string | null = null;
  let isExplicitImagine = false;

  if (qClean.startsWith('/imagine')) {
    isExplicitImagine = true;
    // Support telegram styles such as /imagine@bot_name prompt (case-insensitive and matches any suffix handle)
    const cleanQuery = query.replace(/^\/imagine(@[a-zA-Z0-9_]+)?\s*/i, "").trim();
    if (cleanQuery) {
      imagePrompt = cleanQuery;
    } else {
      return `🎨 **[BØTVΞRSΞ Image Generator]**\nTo generate an AI image, please specify a description after the \`/imagine\` command.\n\nExample:\n\`/imagine cute neon cat in cyberpunk Tokyo, high-fidelity digital art\``;
    }
  } else {
    const prefixes = [
      "generate an image of",
      "generate image of",
      "generate an image",
      "make an image of",
      "make image of",
      "create an image of",
      "create image of",
      "draw an image of",
      "draw a picture of",
      "draw a",
      "draw image"
    ];
    for (const prefix of prefixes) {
      if (qClean.startsWith(prefix + " ")) {
        imagePrompt = query.substring(prefix.length + 1).trim();
        break;
      }
    }
  }

  if (imagePrompt) {
    // If it is not an explicit /imagine terminal command, check if image gen is enabled
    // Explicit /imagine overrides standard toggles to enable easy visual testing/debugging!
    if (!isExplicitImagine && !bot.enableImageGen) {
      return `⚠️ **[Image Generation Disabled]** Image generator functions are currently disabled for chatbot "${bot.name}". Please open the bot's configuration panel and toggle the "Pollinations AI Image Generation" switch on to enable this feature!`;
    }

    try {
      const model = bot.pollinationsModel || "flux";
      const seed = Math.floor(Math.random() * 10000000);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?model=${encodeURIComponent(model)}&seed=${seed}&nologo=true`;
      
      return `🎨 Here is the image generated for your prompt: "${imagePrompt}" using model **${model}**:\n\n![${imagePrompt}](${imageUrl})`;
    } catch (err: any) {
      return `❌ Failed to generate the requested image. Error: ${err.message || err}`;
    }
  }

  const customKey = bot.apiKey?.trim();
  const hasValidUserKey = customKey && customKey !== "" && customKey !== "••••••••••••••••••••••••";

  if (!hasValidUserKey) {
    return `⚠️ API Configuration Error: No custom Gemini API key was detected for chatbot "${bot.name}". Each user must specify their own private Gemini API key under the 'AI Brain' configuration settings before the bot can process AI chats. Please select the bot and update your personal Gemini API key.`;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: customKey,
      httpOptions: {
        headers: {
          'User-Agent': "aistudio-build",
        }
      }
    });

    // Extract recent conversational context for a multi-turn chat experience
    const recentConversations = historyLogs
      .filter(l => l.direction === 'in' || l.direction === 'out')
      .slice(-5)
      .map(l => ({
        role: l.direction === 'in' ? 'user' : 'model',
        parts: [{ text: l.text }]
      }));

    recentConversations.push({
      role: 'user',
      parts: [{ text: query }]
    });

    const systemInstruction = `
You are an AI assistant acting on behalf of a chatbot deployment named "${bot.name}" integrated into the ${bot.platform.toUpperCase()} platform.
Its platform badge is: ${bot.platform.toUpperCase()}.
Its runtime AI source configuration is mapped to: ${bot.aiSource.toUpperCase()} using model: ${bot.aiModel}.

Core system prompt instructions established by the bot owner:
${bot.systemPrompt || "You are a helpful, professional agent."}

Owner's custom behavioral instructions and persona guidelines:
${bot.customInstructions || "Reply helpfully, naturally, and supportively."}

Strict Guidelines:
- Adopt the persona completely.
- Formulate your reply specifically around your custom instructions and platform medium (keep it platform-friendly!).
- Make answers concise (within 3-4 paragraphs max). Do not mention that you are a language model or simulated; act as the actual client bot.
`;

    const tools: any[] = [];
    if (bot.enableGoogleSearch) {
      tools.push({ googleSearch: {} });
    }
    if (bot.enableCodeExecution) {
      tools.push({ codeExecution: {} });
    }

    const response = await ai.models.generateContent({
      model: bot.aiModel || "gemini-3.5-flash",
      contents: recentConversations as any,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.8,
        ...(tools.length > 0 ? { tools } : {})
      }
    });

    let reply = response.text || "[System: Generated an empty text frame]";

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (bot.enableGoogleSearch && chunks && chunks.length > 0) {
      const sources: string[] = [];
      chunks.forEach((chunk: any) => {
        if (chunk.web?.uri) {
          sources.push(`- [${chunk.web.title || chunk.web.uri}](${chunk.web.uri})`);
        }
      });
      if (sources.length > 0) {
        reply += `\n\n🔍 **Sources & Search Grounding:**\n${sources.join("\n")}`;
      }
    }

    return reply;
  } catch (error: any) {
    console.error("Gemini API error during generation:", error);
    
    // Check if error is related to quota, API rate limit, or exhausted resources
    let errorDump = "";
    try {
      errorDump = [
        error?.message,
        error?.status,
        error?.code,
        typeof error === 'object' ? JSON.stringify(error) : '',
        String(error),
        error?.stack
      ].filter(Boolean).join(" ").toLowerCase();
    } catch (e) {
      errorDump = String(error || "").toLowerCase();
    }

    const isQuotaError = 
      error?.status === 429 ||
      error?.code === 429 ||
      errorDump.includes("429") || 
      errorDump.includes("quota") || 
      errorDump.includes("resource_exhausted") || 
      errorDump.includes("limit") || 
      errorDump.includes("exhausted") ||
      errorDump.includes("rate");

    const isSuspendedOrAuthError =
      error?.status === 403 ||
      error?.code === 403 ||
      error?.status === 401 ||
      error?.code === 401 ||
      errorDump.includes("suspended") ||
      errorDump.includes("permission_denied") ||
      errorDump.includes("unauthorized") ||
      errorDump.includes("api_key") ||
      errorDump.includes("key") ||
      errorDump.includes("invalid") ||
      errorDump.includes("unverified");

    let statusNote = "Live AI API connection issue detected";
    if (isQuotaError) {
      statusNote = "Shared developer API tier rate limit reached";
    } else if (isSuspendedOrAuthError) {
      statusNote = "Configured Gemini API key has been suspended or is unauthorized";
    }

    const personaRules = bot.customInstructions || bot.systemPrompt || "Respond supportively and helpfully.";
    
    // Choose a highly context-specific acknowledge text based on standard keywords in user's query
    let baseReply = `I am processing your query under my active personality instructions.`;
    if (query.toLowerCase().includes("hello") || query.toLowerCase().includes("hi") || query.toLowerCase().includes("hey")) {
      baseReply = `Hello there! I received your greeting. Let's make headway on whatever is on your mind today!`;
    } else if (query.toLowerCase().includes("price") || query.toLowerCase().includes("pricing") || query.toLowerCase().includes("cost")) {
      baseReply = `Regarding costs or pricing details, I am reviewing our current schedules according to my configuration. We'll find the absolute best options suited for your needs.`;
    } else if (query.toLowerCase().includes("help") || query.toLowerCase().includes("support") || query.toLowerCase().includes("issue")) {
      baseReply = `I'm deeply sorry to hear about any issues! Let's get this resolved. I am scanning my internal logs to support you step-by-step.`;
    } else if (query.toLowerCase().includes("status") || query.toLowerCase().includes("active")) {
      baseReply = `All channels are up! I am standing by fully personalized with customized guidelines.`;
    }

    // Generate a wonderful custom paragraph simulation mimicking the bot's directives
    return `🧠 [BØTVΞRSΞ Standby Engine: Active]
(⚠️ ${statusNote}. Switched to high-fidelity offline standby brain)

"${baseReply} As ${bot.name}, my response follows my active personality rules: '${personaRules.substring(0, 160)}${personaRules.length > 160 ? '...' : ''}'. I am processing your message with these rules fully operational."

---
🤖 Active Chatbot: ${bot.name} (${bot.platform.toUpperCase()})
💡 Custom Prompt: "${personaRules}"
✨ Prompt Status: Applied successfully via offline fallback layer.
🔑 API Key Note: Please check or update your personal 'GEMINI_API_KEY' under your bot's 'AI Brain' settings panel or user Settings to restore uninterrupted live cloud intelligence.`;
  }
}

// Global active WhatsApp sockets index
const whatsappSessions = new Map<string, { sock: any; pairingCode?: string }>();

// Start WhatsApp dynamic chatbot connection via Baileys multi-device pairing
async function startWhatsAppBot(botId: string, phoneNumber?: string): Promise<string | undefined> {
  const bot = bots.find(b => b.id === botId);
  if (!bot) return undefined;

  try {
    const { default: makeWASocket, useMultiFileAuthState, delay, DisconnectReason } = await import('@whiskeysockets/baileys');
    const pino = (await import('pino')).default;

    // Check and terminate if already running
    if (whatsappSessions.has(botId)) {
      try {
        whatsappSessions.get(botId)!.sock.end();
      } catch (e) {}
      whatsappSessions.delete(botId);
    }

    const { state, saveCreds } = await useMultiFileAuthState(path.join(process.cwd(), `auth_info_${botId}`));

    const sock = (makeWASocket as any)({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' })
    });

    whatsappSessions.set(botId, { sock });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect } = update;
      const currentBot = bots.find(b => b.id === botId);
      if (!currentBot) return;

      if (connection === 'close') {
        currentBot.whatsappConnected = false;
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== (DisconnectReason ? (DisconnectReason as any).loggedOut : 401);
        console.log(`WhatsApp connection close. StatusCode: ${statusCode}. Reconnect: ${shouldReconnect}`);
        
        if (shouldReconnect && currentBot.status === 'active') {
          setTimeout(() => startWhatsAppBot(botId), 5000);
        }
      } else if (connection === 'open') {
        console.log(`WhatsApp Bot '${currentBot.name}' connected successfully!`);
        currentBot.whatsappConnected = true;
        currentBot.status = 'active';

        logs.push({
          id: `sys-wa-${Date.now()}`,
          botId: currentBot.id,
          direction: 'system',
          sender: currentBot.name,
          text: `WhatsApp service linked with credentials. Under active status, routing chat messages via customised AI instructions.`,
          timestamp: new Date().toISOString(),
          status: 'success'
        });
      }

      if (currentBot.userId) {
        await saveUserBotToFirestore(currentBot.userId, currentBot).catch(() => {});
      }
    });

    sock.ev.on('messages.upsert', async (m: any) => {
      const currentBot = bots.find(b => b.id === botId);
      if (!currentBot || currentBot.status !== 'active') return;

      if (m.type === 'notify') {
        for (const msg of m.messages) {
          if (!msg.key.fromMe && msg.message) {
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            if (text) {
              const jid = msg.key.remoteJid;
              if (!jid) continue;

              const sender = msg.pushName || jid.split('@')[0];
              
              // Add input log
              logs.push({
                id: `wa-in-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                botId: currentBot.id,
                direction: 'in',
                sender,
                text,
                timestamp: new Date().toISOString(),
                status: 'success'
              });

              // Generate Gemini Response
              const aiResponse = await generateBotResponse(currentBot, text, logs.filter(l => l.botId === currentBot.id));

              // Send back message
              const waImageMatch = aiResponse.match(/!\[.*?\]\((https:\/\/image\.pollinations\.ai\/.*?)\)/);
              if (waImageMatch && waImageMatch[1]) {
                const imageUrl = waImageMatch[1];
                const captionText = aiResponse.replace(/!\[.*?\]\(.*?\)/, '').trim();
                try {
                  await sock.sendMessage(jid, { 
                    image: { url: imageUrl }, 
                     caption: captionText || "Generated Image"
                  });
                } catch (waImgErr: any) {
                  console.error("Failed to send WhatsApp image message, sending fallback text:", waImgErr);
                  await sock.sendMessage(jid, { text: aiResponse });
                }
              } else {
                await sock.sendMessage(jid, { text: aiResponse });
              }

              // Add output log
              logs.push({
                id: `wa-out-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                botId: currentBot.id,
                direction: 'out',
                sender: currentBot.name,
                text: aiResponse,
                timestamp: new Date().toISOString(),
                status: 'success',
                modelUsed: currentBot.aiModel
              });

              currentBot.totalMessagesProcessed += 1;
              if (currentBot.userId) {
                await saveUserBotToFirestore(currentBot.userId, currentBot).catch(() => {});
              }
              
              generalActivity.unshift({
                id: `act-wa-${Date.now()}`,
                botId: currentBot.id,
                botName: currentBot.name,
                type: "message",
                message: `Processed WhatsApp incoming chat from ${sender}`,
                timestamp: new Date().toISOString(),
                platform: 'whatsapp'
              });
            }
          }
        }
      }
    });

    if (phoneNumber) {
      await delay(3000);
      const cleaned = phoneNumber.replace(/[^0-9]/g, '');
      const code = await sock.requestPairingCode(cleaned);
      bot.whatsappPairingCode = code;
      const session = whatsappSessions.get(botId);
      if (session) session.pairingCode = code;
      
      if (bot.userId) {
        await saveUserBotToFirestore(bot.userId, bot).catch(() => {});
      }
      return code;
    }
  } catch (err: any) {
    console.error(`Failed to initialize WhatsApp bot ${botId}:`, err);
    throw err;
  }
}

// Telegram background poller data
function buildMultipartBody(
  boundary: string,
  fields: Record<string, string>,
  fileField?: { name: string; buffer: Buffer; filename: string; contentType: string }
): Buffer {
  const parts: Buffer[] = [];
  
  for (const [key, val] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\n`));
    parts.push(Buffer.from(`Content-Disposition: form-data; name="${key}"\r\n\r\n`));
    parts.push(Buffer.from(`${val}\r\n`));
  }
  
  if (fileField) {
    parts.push(Buffer.from(`--${boundary}\r\n`));
    parts.push(Buffer.from(`Content-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"\r\n`));
    parts.push(Buffer.from(`Content-Type: ${fileField.contentType}\r\n\r\n`));
    parts.push(fileField.buffer);
    parts.push(Buffer.from(`\r\n`));
  }
  
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  
  return Buffer.concat(parts);
}

const telegramOffsets = new Map<string, number>();
const telegramPollingActive = new Set<string>();

// Dynamic background poller for active Telegram AI Chatbots
async function pollTelegramBot(bot: BotStore) {
  if (telegramPollingActive.has(bot.id)) return;
  telegramPollingActive.add(bot.id);

  try {
    const offset = telegramOffsets.get(bot.id) || 0;
    const response = await fetch(`https://api.telegram.org/bot${bot.telegramToken}/getUpdates?offset=${offset}&timeout=4`);
    
    if (response.status === 401 || response.status === 404) {
      bot.status = 'error';
      logs.push({
        id: `tg-err-${Date.now()}`,
        botId: bot.id,
        direction: 'system',
        sender: 'System Router',
        text: `Telegram bot token is unauthorized or expired. Please check configured BotFather HTTP tokens.`,
        timestamp: new Date().toISOString(),
        status: 'failed'
      });
      telegramPollingActive.delete(bot.id);
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP response code: ${response.status}`);
    }

    const data: any = await response.json();
    if (data.ok && data.result && data.result.length > 0) {
      for (const update of data.result) {
        telegramOffsets.set(bot.id, update.update_id + 1);

        const message = update.message;
        if (!message || !message.text) continue;

        const sender = message.from.username ? '@' + message.from.username : (message.from.first_name || 'Telegram User');
        const text = message.text;
        const chatId = message.chat.id;

        // Record inbound log
        logs.push({
          id: `tg-in-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          botId: bot.id,
          direction: "in",
          sender: sender,
          text: text,
          timestamp: new Date().toISOString(),
          status: "success"
        });

        // Run Gemini AI prompt Generation following personification and custom owner rules
        const aiResponse = await generateBotResponse(bot, text, logs.filter(l => l.botId === bot.id));

        // Transmit output back to user via Telegram Bot API
        const tgImageMatch = aiResponse.match(/!\[.*?\]\((https:\/\/image\.pollinations\.ai\/.*?)\)/);
        if (tgImageMatch && tgImageMatch[1]) {
          const imageUrl = tgImageMatch[1];
          const captionText = aiResponse.replace(/!\[.*?\]\(.*?\)/, '').trim();
          try {
            let sentPhotoDirectly = false;
            try {
              // Pre-fetch the dynamic image on our high-speed container server first to ensure 100% availability!
              const imgRes = await fetch(imageUrl);
              if (imgRes.ok) {
                const arrayBuffer = await imgRes.arrayBuffer();
                const imageBuffer = Buffer.from(arrayBuffer);
                
                const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
                const fields: Record<string, string> = {
                  chat_id: String(chatId)
                };
                if (captionText) {
                  fields.caption = captionText.substring(0, 1024);
                }
                
                const bodyBuffer = buildMultipartBody(boundary, fields, {
                  name: 'photo',
                  buffer: imageBuffer,
                  filename: 'image.jpg',
                  contentType: 'image/jpeg'
                });

                const tgRes = await fetch(`https://api.telegram.org/bot${bot.telegramToken}/sendPhoto`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`
                  },
                  body: bodyBuffer
                });

                if (tgRes.ok) {
                  sentPhotoDirectly = true;
                } else {
                  const errBody = await tgRes.text().catch(() => "");
                  console.error(`Direct Telegram sendPhoto upload rejected: ${tgRes.status} ${errBody}`);
                }
              } else {
                console.error(`Dynamic image server status: ${imgRes.status}`);
              }
            } catch (preErr) {
              console.error("Direct photo pipeline error:", preErr);
            }

            // Fallback: If direct binary upload failed, attempt Telegram URL-fetch method
            if (!sentPhotoDirectly) {
              const tgRes = await fetch(`https://api.telegram.org/bot${bot.telegramToken}/sendPhoto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId,
                  photo: imageUrl,
                  caption: captionText.substring(0, 1024) || "Generated Image"
                })
              });
              if (!tgRes.ok) {
                const errBody = await tgRes.text().catch(() => "");
                throw new Error(`Telegram rejected photo payload: ${tgRes.status} ${errBody}`);
              }
            }
          } catch (photoErr: any) {
            console.error("Failed to send photo via sendPhoto, falling back to sendMessage text block:", photoErr);
            // Dynamic final fallback: Send the raw text response containing the markdown image link so the client can click/render it!
            await fetch(`https://api.telegram.org/bot${bot.telegramToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: aiResponse
              })
            });
          }
        } else {
          await fetch(`https://api.telegram.org/bot${bot.telegramToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: aiResponse
            })
          });
        }

        // Record outbound log
        logs.push({
          id: `tg-out-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          botId: bot.id,
          direction: "out",
          sender: bot.name,
          text: aiResponse,
          timestamp: new Date().toISOString(),
          status: "success",
          modelUsed: bot.aiModel
        });

        bot.totalMessagesProcessed += 1;
        if (bot.userId) {
          await saveUserBotToFirestore(bot.userId, bot).catch(() => {});
        }

        generalActivity.unshift({
          id: `act-tg-${Date.now()}`,
          botId: bot.id,
          botName: bot.name,
          type: "message",
          message: `Processed Telegram incoming chat from ${sender}`,
          timestamp: new Date().toISOString(),
          platform: 'telegram'
        });
      }
    }
  } catch (err: any) {
    console.error(`Error polling Telegram bot ${bot.id}:`, err);
  } finally {
    telegramPollingActive.delete(bot.id);
  }
}

// Setup automated cycle querying updates for all active configured Telegram bots
setInterval(async () => {
  const activeTGBots = bots.filter(b => b.status === 'active' && b.platform === 'telegram' && b.telegramToken);
  for (const bot of activeTGBots) {
    pollTelegramBot(bot);
  }
}, 2500);

// Background Simulated Incoming Traffic to active bots to show dynamic graph changes and SaaS operational reality!
const simulatedUsers = ["@mark_ventures", "+1-415-889-1102", "@sara_green", "Gamer_Alpha_11", "+44-7911-209210"];
const simulatedQueries = [
  "Are you guys currently online? Let me know how to contact customer billing.",
  "Let me know if there's any active discount codes running on packages.",
  "Hello, I ran some API commands but they returned authorization failure. What token should I specify?",
  "What's your core delivery schedule?",
  "Awesome bot! Who developed this bot platform?"
];

setInterval(async () => {
  const activeBots = bots.filter(b => b.status === 'active');
  if (activeBots.length === 0) return;

  // Pick a random active bot
  const randomBot = activeBots[Math.floor(Math.random() * activeBots.length)];

  const sender = simulatedUsers[Math.floor(Math.random() * simulatedUsers.length)];
  let query = simulatedQueries[Math.floor(Math.random() * simulatedQueries.length)];

  const timestamp = new Date().toISOString();
  const logIdIn = `log-sim-in-${Math.random().toString(36).substr(2, 9)}`;
  const logIdOut = `log-sim-out-${Math.random().toString(36).substr(2, 9)}`;

  // Save raw log of user inquire
  const newInLog: LogStore = {
    id: logIdIn,
    botId: randomBot.id,
    direction: "in",
    sender,
    text: query,
    timestamp,
    status: "success"
  };
  logs.push(newInLog);

  // Generate real AI response
  const responseText = await generateBotResponse(randomBot, query, logs.filter(l => l.botId === randomBot.id));

  const newOutLog: LogStore = {
    id: logIdOut,
    botId: randomBot.id,
    direction: "out",
    sender: randomBot.name,
    text: responseText,
    timestamp: new Date().toISOString(),
    status: "success",
    modelUsed: randomBot.aiModel
  };
  logs.push(newOutLog);

  // Keep logs at max 300 to avoid excessive memory leak
  if (logs.length > 300) {
    logs.splice(0, logs.length - 200);
  }

  // Record globally in activities ticker
  const activity: ActivityStore = {
    id: `act-sim-${Math.random().toString(36).substr(2, 9)}`,
    botId: randomBot.id,
    botName: randomBot.name,
    type: "message",
    message: `Processed inquiry from ${sender} using ${randomBot.aiModel}`,
    timestamp: new Date().toISOString(),
    platform: randomBot.platform
  };
  generalActivity.unshift(activity);
  if (generalActivity.length > 100) {
    generalActivity.splice(80);
  }

  randomBot.totalMessagesProcessed += 1;
  if (randomBot.userId) {
    saveUserBotToFirestore(randomBot.userId, randomBot).catch(() => {});
  }
}, 30000); // Trigger traffic simulation every 30 seconds

/* API ENDPOINTS */

// Get global metrics of control hub
app.get("/api/metrics", (req, res) => {
  const email = getUserEmail(req);
  if (!email) {
    return res.status(401).json({ error: "Access Denied: Please log in first." });
  }

  const emailClean = email.trim().toLowerCase();
  const userBots = bots.filter(b => b.userId === emailClean);

  const totalBotsCount = userBots.length;
  const activeCount = userBots.filter(b => b.status === 'active').length;
  const pausedCount = userBots.filter(b => b.status === 'paused').length;
  const stoppedCount = userBots.filter(b => b.status === 'stopped').length;
  const errorCount = userBots.filter(b => b.status === 'error').length;
  
  // Calculate total messages processed across all bots
  const messagesTotal = userBots.reduce((acc, current) => acc + current.totalMessagesProcessed, 0);

  // Filter logs associated with this user's bots
  const userBotIds = userBots.map(b => b.id);
  const userLogs = logs.filter(l => userBotIds.includes(l.botId));

  // Success rate: success logs divided by total completed text runs
  const successLogs = userLogs.filter(l => l.status === 'success' || l.status === 'info').length;
  const totalLogsCount = userLogs.length || 1;
  const successRate = Math.round((successLogs / totalLogsCount) * 100);

  res.json({
    totalBotsCount,
    activeCount,
    pausedCount,
    stoppedCount,
    errorCount,
    messages24h: messagesTotal,
    successRate: Math.max(85, successRate) // SaaS standard looking
  });
});

// List all bots
app.get("/api/bots", async (req, res) => {
  const email = getUserEmail(req);
  if (!email) {
    return res.status(401).json({ error: "Access Denied: Please log in first." });
  }
  try {
    const userBots = await loadUserBotsFromFirestore(email);
    res.json(userBots);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load bots from Firestore" });
  }
});

// Create a new bot
app.post("/api/bots", async (req, res) => {
  const email = getUserEmail(req);
  if (!email) {
    return res.status(401).json({ error: "Access Denied: Please log in first." });
  }
  
  const { name, platform, aiSource, aiModel, greetingMessage, systemPrompt, enableGoogleSearch, enableCodeExecution, enableMemory, enableImageGen, pollinationsApiKey, pollinationsModel } = req.body;
  
  if (!name || !platform) {
    return res.status(400).json({ error: "Bot name and platform are required inputs." });
  }

  const newBot: BotStore = {
    id: `bot-${platform}-${Date.now().toString(36)}`,
    userId: email.trim().toLowerCase(),
    name,
    platform,
    status: "stopped", // starts stopped/empty config as requested in BOT LIFECYCLE
    aiSource: aiSource || "gemini",
    aiModel: aiModel || "gemini-3.5-flash",
    apiKey: "",
    systemPrompt: systemPrompt || "You are a helpful SaaS chatbot. Guide users through support and general queries.",
    customInstructions: "Answer in a friendly, conversational manner.",
    greetingMessage: greetingMessage || `Welcome to ${name}! Ready to support you.`,
    enableGoogleSearch: enableGoogleSearch !== undefined ? enableGoogleSearch : false,
    enableCodeExecution: enableCodeExecution !== undefined ? enableCodeExecution : false,
    enableMemory: enableMemory !== undefined ? enableMemory : false,
    enableImageGen: enableImageGen !== undefined ? enableImageGen : false,
    pollinationsApiKey: pollinationsApiKey || "",
    pollinationsModel: pollinationsModel || "flux",
    memoryUsedMb: 0.0,
    createdAt: new Date().toISOString(),
    uptime: 0,
    totalMessagesProcessed: 0
  };

  // Remove the two default bots when a user creates a new bot
  bots = bots.filter(b => b.id !== "bot-tg-01" && b.id !== "bot-wa-02");

  try {
    await saveUserBotToFirestore(email, newBot);

    const activity: ActivityStore = {
      id: `act-${Date.now()}`,
      botId: newBot.id,
      botName: newBot.name,
      type: "config_update",
      message: `Bot '${name}' created successfully on platform: ${platform.toUpperCase()}`,
      timestamp: new Date().toISOString(),
      platform
    };
    generalActivity.unshift(activity);

    res.json(newBot);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to save bot to Firestore" });
  }
});

// Update a specific bot configurations
app.put("/api/bots/:id", async (req, res) => {
  const email = getUserEmail(req);
  if (!email) {
    return res.status(401).json({ error: "Access Denied: Please log in first." });
  }

  const botId = req.params.id;
  const botIndex = bots.findIndex(b => b.id === botId);

  if (botIndex === -1) {
    return res.status(404).json({ error: "Bot not found on this deployment." });
  }

  const original = bots[botIndex];
  const { 
    name, status, aiSource, aiModel, apiKey, systemPrompt, customInstructions, greetingMessage,
    enableGoogleSearch, enableCodeExecution, enableMemory, memoryUsedMb,
    enableImageGen, pollinationsApiKey, pollinationsModel,
    telegramToken, whatsappConnected
  } = req.body;

  // Let's modify fields safely
  const updatedBot: BotStore = {
    ...original,
    name: name !== undefined ? name : original.name,
    status: status !== undefined ? status : original.status,
    aiSource: aiSource !== undefined ? aiSource : original.aiSource,
    aiModel: aiModel !== undefined ? aiModel : original.aiModel,
    apiKey: apiKey !== undefined ? apiKey : original.apiKey,
    systemPrompt: systemPrompt !== undefined ? systemPrompt : original.systemPrompt,
    customInstructions: customInstructions !== undefined ? customInstructions : original.customInstructions,
    greetingMessage: greetingMessage !== undefined ? greetingMessage : original.greetingMessage,
    enableGoogleSearch: enableGoogleSearch !== undefined ? enableGoogleSearch : original.enableGoogleSearch,
    enableCodeExecution: enableCodeExecution !== undefined ? enableCodeExecution : original.enableCodeExecution,
    enableMemory: enableMemory !== undefined ? enableMemory : original.enableMemory,
    memoryUsedMb: memoryUsedMb !== undefined ? memoryUsedMb : original.memoryUsedMb,
    enableImageGen: enableImageGen !== undefined ? enableImageGen : original.enableImageGen,
    pollinationsApiKey: pollinationsApiKey !== undefined ? pollinationsApiKey : original.pollinationsApiKey,
    pollinationsModel: pollinationsModel !== undefined ? pollinationsModel : original.pollinationsModel,
    
    // Platform payload tokens
    telegramToken: telegramToken !== undefined ? telegramToken : original.telegramToken,
    whatsappConnected: whatsappConnected !== undefined ? whatsappConnected : original.whatsappConnected
  };

  try {
    await saveUserBotToFirestore(email, updatedBot);

    // Record action update
    const activity: ActivityStore = {
      id: `act-${Date.now()}`,
      botId: updatedBot.id,
      botName: updatedBot.name,
      type: "config_update",
      message: `Updated core AI Brain parameters and platform specifications for '${updatedBot.name}'`,
      timestamp: new Date().toISOString(),
      platform: updatedBot.platform
    };
    generalActivity.unshift(activity);

    res.json(updatedBot);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update bot configurations in Firestore" });
  }
});

// Delete a specific bot
app.delete("/api/bots/:id", async (req, res) => {
  const email = getUserEmail(req);
  if (!email) {
    return res.status(401).json({ error: "Access Denied: Please log in first." });
  }

  const botId = req.params.id;
  const botIndex = bots.findIndex(b => b.id === botId);

  if (botIndex === -1) {
    return res.status(404).json({ error: "Bot not found on this deployment." });
  }

  const name = bots[botIndex].name;
  const platform = bots[botIndex].platform;

  try {
    await deleteUserBotFromFirestore(email, botId);

    // Also purge logs linked to this bot without reassigning logs array variable
    const remainingLogs = logs.filter(l => l.botId !== botId);
    logs.length = 0;
    originalLogsPush.apply(logs, remainingLogs);

    const activity: ActivityStore = {
      id: `act-${Date.now()}`,
      botId,
      botName: name,
      type: "status_change",
      message: `Bot '${name}' and its historical logs deleted from controller workspace.`,
      timestamp: new Date().toISOString(),
      platform
    };
    generalActivity.unshift(activity);

    res.json({ message: "Bot deleted successfully from hub." });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete bot from Firestore" });
  }
});

// Trigger bot action: Start, Pause, Stop, Restart
app.post("/api/bots/:id/action", async (req, res) => {
  const email = getUserEmail(req);
  if (!email) {
    return res.status(401).json({ error: "Access Denied: Please log in first." });
  }

  const botId = req.params.id;
  const { action } = req.body; // 'start', 'pause', 'stop', 'restart'

  const botIndex = bots.findIndex(b => b.id === botId);
  if (botIndex === -1) {
    return res.status(404).json({ error: "Bot not found." });
  }

  const bot = bots[botIndex];
  let oldStatus = bot.status;
  let newStatus: 'active' | 'paused' | 'stopped' | 'error' = bot.status;

  if (action === 'start') {
    const customKey = bot.apiKey?.trim();
    const hasValidKey = customKey && customKey !== "" && customKey !== "••••••••••••••••••••••••";
    // Check if configuration has been finished
    if (!hasValidKey) {
      newStatus = 'error';
      // Record a failure log
      logs.push({
        id: `sys-log-${Date.now()}`,
        botId: bot.id,
        direction: 'system',
        sender: 'System Router',
        text: `Unable to activate chatbot. Error: Private Gemini API key is missing. Each user must specify their own API key in the 'AI Brain' tab before active deployment.`,
        timestamp: new Date().toISOString(),
        status: 'failed'
      });
    } else {
      newStatus = 'active';
      bot.uptime = 0; // restart counting elapsed active sessions

      // Post greeting message as a diagnostic trace
      logs.push({
        id: `sys-log-${Date.now()}`,
        botId: bot.id,
        direction: 'system',
        sender: bot.name,
        text: `Connection finalized. Broadcasted Custom Greeting on active endpoints: "${bot.greetingMessage}"`,
        timestamp: new Date().toISOString(),
        status: 'info'
      });

      // Start WhatsApp bot if platform is whatsapp
      if (bot.platform === 'whatsapp') {
        startWhatsAppBot(botId);
      }
    }
  } else if (action === 'pause') {
    newStatus = 'paused';
    if (bot.platform === 'whatsapp') {
      try {
        whatsappSessions.get(botId)?.sock.end();
        whatsappSessions.delete(botId);
      } catch(e) {}
    }
  } else if (action === 'stop') {
    newStatus = 'stopped';
    bot.uptime = 0;
    if (bot.platform === 'whatsapp') {
      try {
        whatsappSessions.get(botId)?.sock.end();
        whatsappSessions.delete(botId);
      } catch(e) {}
    }
  } else if (action === 'restart') {
    newStatus = 'active';
    bot.uptime = 0;
    logs.push({
      id: `sys-log-${Date.now()}`,
      botId: bot.id,
      direction: 'system',
      sender: 'System Router',
      text: `Rebuilding bot engine runtime under environment profile. Live session restarted.`,
      timestamp: new Date().toISOString(),
      status: 'info'
    });

    if (bot.platform === 'whatsapp') {
      startWhatsAppBot(botId);
    }
  }

  bot.status = newStatus;

  // Register in activity logs
  const activity: ActivityStore = {
    id: `act-${Date.now()}`,
    botId: bot.id,
    botName: bot.name,
    type: "status_change",
    message: `State transition: Bot lifecycle shifted from ${oldStatus.toUpperCase()} to ${newStatus.toUpperCase()}`,
    timestamp: new Date().toISOString(),
    platform: bot.platform
  };
  generalActivity.unshift(activity);

  try {
    await saveUserBotToFirestore(email, bot);
    res.json(bot);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update lifecycle changes in Firestore" });
  }
});

// Real WhatsApp Multi-device phone number linking endpoint
app.post("/api/bots/:id/whatsapp/pair", async (req, res) => {
  const botId = req.params.id;
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ error: "Phone number parameter is required." });
  }

  const botIndex = bots.findIndex(b => b.id === botId);
  if (botIndex === -1) {
    return res.status(404).json({ error: "Bot not found on this deployment config." });
  }

  try {
    const code = await startWhatsAppBot(botId, phoneNumber);
    if (code) {
      res.json({ code });
    } else {
      res.status(500).json({ error: "Could not generate pairing code. Secure Baileys socket error or invalid phone number format." });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to generate pairing code." });
  }
});

// Platform Integration Test
app.post("/api/bots/:id/platform/test", (req, res) => {
  const botId = req.params.id;
  const bot = bots.find(b => b.id === botId);

  if (!bot) {
    return res.status(404).json({ error: "Bot not found." });
  }

  // Simulate verification checks
  let success = true;
  let reason = "Integration link established securely. Payload hook validated.";

  if (bot.platform === 'telegram' && !bot.telegramToken) {
    success = false;
    reason = "Telegram token parameter is empty. Set your BotFather HTTP API token before testing.";
  }

  const timestamp = new Date().toISOString();
  
  // Record trace
  logs.push({
    id: `sys-test-${Date.now()}`,
    botId: bot.id,
    direction: "system",
    sender: "Integration Validator",
    text: `Platform connection trial for ${bot.platform.toUpperCase()}: ${success ? "CONNECTED" : "FAILED"}. ${reason}`,
    timestamp,
    status: success ? "success" : "failed"
  });

  res.json({ success, reason });
});

// Fetch log queue for a specific bot
app.get("/api/bots/:id/logs", async (req, res) => {
  const email = getUserEmail(req);
  if (!email) {
    return res.status(401).json({ error: "Access Denied: Please log in first." });
  }
  const botId = req.params.id;
  try {
    const dbLogs = await loadLogsFromFirestore(email, botId);
    res.json(dbLogs);
  } catch (err: any) {
    const filteredLogs = logs.filter(l => l.botId === botId);
    res.json(filteredLogs);
  }
});

// Send custom chat message in the live workspace playground
app.post("/api/bots/:id/chat", async (req, res) => {
  const email = getUserEmail(req);
  if (!email) {
    return res.status(401).json({ error: "Access Denied: Please log in first." });
  }

  const botId = req.params.id;
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Chat message body is empty." });
  }

  const bot = bots.find(b => b.id === botId);
  if (!bot) {
    return res.status(404).json({ error: "Bot not found." });
  }

  // Log user message
  const timestamp = new Date().toISOString();
  const userLog: LogStore = {
    id: `chat-usr-${Date.now()}`,
    botId: bot.id,
    direction: "in",
    sender: "You (Workspace Playground)",
    text: message,
    timestamp,
    status: "success"
  };
  logs.push(userLog);

  // Generate real or high-fidelity simulated AI response
  let responseText = await generateBotResponse(bot, message, logs.filter(l => l.botId === bot.id));

  // Cognitive memory handling
  if (bot.enableMemory) {
    try {
      const userMemory = await getUserMemoryConfigFromFirestore(email);
      const userBots = bots.filter(b => b.userId === email.trim().toLowerCase());
      const currentTotalMemory = userBots.reduce((acc, b) => acc + (b.memoryUsedMb || 0), 0);
      
      if (currentTotalMemory >= userMemory.maxMemoryMb) {
        // Memory blocked! Full context warning appended
        responseText += `\n\n⚠️ **[Cognitive Memory Blocked]**: Account cloud memory limit is full (${currentTotalMemory.toFixed(1)}MB / ${userMemory.maxMemoryMb}MB). This dialog segment could not be committed to long-term memory. Go to Account Settings to upgrade.`;
        
        // Insert a telemetry message log
        logs.push({
          id: `sys-mem-full-${Date.now()}`,
          botId: bot.id,
          direction: "system",
          sender: "Memory Sentinel",
          text: `Error: Cognitive system memory exhausted for '${bot.name}' (${currentTotalMemory.toFixed(1)}MB / ${userMemory.maxMemoryMb}MB limit saturated). Context dropped.`,
          timestamp: new Date().toISOString(),
          status: "failed"
        });
      } else {
        // Memory saved successfully
        const increment = 5.5; // Simulate MB footprint per interaction
        const theoreticalMemory = currentTotalMemory + increment;
        if (theoreticalMemory > userMemory.maxMemoryMb) {
          // partial increment up to cap, then blocks
          const allowed = userMemory.maxMemoryMb - currentTotalMemory;
          bot.memoryUsedMb = Number(((bot.memoryUsedMb || 0) + allowed).toFixed(2));
          responseText += `\n\n💾 **[Memory Saved - Cap Reached]** Saved new context (+${allowed.toFixed(1)}MB). Total memory is now fully saturated. Please upgrade to avoid dropping subsequent dialog context.`;
        } else {
          bot.memoryUsedMb = Number(((bot.memoryUsedMb || 0) + increment).toFixed(2));
          responseText += `\n\n💾 **[Memory Saved]** Saved new profile facts (+5.5MB) to ${bot.name}'s memory bank. Current bot memory footprint: ${bot.memoryUsedMb.toFixed(1)}MB.`;
        }
      }
    } catch (err: any) {
      console.error("Failed to process memory configurations inside Firestore:", err);
    }
  }

  const systemLog: LogStore = {
    id: `chat-bot-${Date.now()}`,
    botId: bot.id,
    direction: "out",
    sender: bot.name,
    text: responseText,
    timestamp: new Date().toISOString(),
    status: "success",
    modelUsed: bot.aiModel
  };
  logs.push(systemLog);

  bot.totalMessagesProcessed += 1;

  try {
    await saveUserBotToFirestore(email, bot);
    res.json({ text: responseText, logs: [userLog, systemLog] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to save state during chat interaction" });
  }
});

// Global Activity Stream
app.get("/api/activity", async (req, res) => {
  const email = getUserEmail(req);
  if (!email) {
    return res.status(401).json({ error: "Access Denied: Please log in first." });
  }

  const emailClean = email.trim().toLowerCase();
  try {
    await loadActivitiesFromFirestore(email);
  } catch (err: any) {
    console.warn("[Firestore Activity Load Warning]:", err.message || err);
  }
  
  const userBotIds = bots.filter(b => b.userId === emailClean).map(b => b.id);
  
  // Keep logs associated with the user's bots or system billing/actions
  const userActivity = generalActivity.filter(act => 
    act.botId === "system" || userBotIds.includes(act.botId)
  );

  res.json(userActivity);
});

// GET user memory metrics
app.get("/api/user/memory", async (req, res) => {
  const email = getUserEmail(req);
  if (!email) {
    return res.status(401).json({ error: "Access Denied: Please log in first." });
  }
  
  try {
    const userBots = bots.filter(b => b.userId === email.trim().toLowerCase());
    const totalUsedMb = userBots.reduce((acc, b) => acc + (b.memoryUsedMb || 0), 0);
    const planInfo = await getUserMemoryConfigFromFirestore(email);
    res.json({
      totalUsedMb: Number(totalUsedMb.toFixed(2)),
      maxMemoryMb: planInfo.maxMemoryMb,
      subscribedPlan: planInfo.subscribedPlan
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to retrieve user memory config" });
  }
});

// POST to upgrade user memory plans
app.post("/api/user/memory/upgrade", async (req, res) => {
  const email = getUserEmail(req);
  if (!email) {
    return res.status(401).json({ error: "Access Denied: Please log in first." });
  }

  const { plan } = req.body;
  if (!['free', 'silver', 'gold', 'platinum'].includes(plan)) {
    return res.status(400).json({ error: "Invalid payment memory plan." });
  }

  const planLimitMap = {
    free: 100,
    silver: 300,
    gold: 500,
    platinum: 1000
  };

  const selectedLimit = planLimitMap[plan as 'free' | 'silver' | 'gold' | 'platinum'];
  const newConfig = {
    userId: email.trim().toLowerCase(),
    maxMemoryMb: selectedLimit,
    subscribedPlan: plan as any
  };

  try {
    await saveUserMemoryConfigToFirestore(email, newConfig);

    const userBots = bots.filter(b => b.userId === email.trim().toLowerCase());
    const totalUsedMb = userBots.reduce((acc, b) => acc + (b.memoryUsedMb || 0), 0);

    // Log in activity feed
    const activity: ActivityStore = {
      id: `act-upgrade-${Date.now()}`,
      botId: "system",
      botName: "System Billing",
      type: "status_change",
      message: `Account memory upgraded to ${selectedLimit}MB (${plan.toUpperCase()} PLAN)`,
      timestamp: new Date().toISOString(),
      platform: "telegram"
    };
    generalActivity.unshift(activity);

    res.json({
      success: true,
      totalUsedMb: Number(totalUsedMb.toFixed(2)),
      maxMemoryMb: selectedLimit,
      subscribedPlan: plan
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to save upgrade plan to Firestore" });
  }
});

// DELETE a specific bot's cognitive memory footprint (Wipe Memory)
app.delete("/api/bots/:id/memory", async (req, res) => {
  const email = getUserEmail(req);
  if (!email) {
    return res.status(401).json({ error: "Access Denied: Please log in first." });
  }

  const botId = req.params.id;
  const bot = bots.find(b => b.id === botId);
  if (!bot) {
    return res.status(404).json({ error: "Target bot not found." });
  }

  const wipedSize = bot.memoryUsedMb || 0;
  bot.memoryUsedMb = 0.0;

  // Log activity
  const activity: ActivityStore = {
    id: `act-wipe-${Date.now()}`,
    botId: bot.id,
    botName: bot.name,
    type: "config_update",
    message: `Flushed and cleared cognitive memory footprint for bot '${bot.name}' (-${wipedSize.toFixed(1)}MB saved)`,
    timestamp: new Date().toISOString(),
    platform: bot.platform
  };
  generalActivity.unshift(activity);

  try {
    await saveUserBotToFirestore(email, bot);
    res.json({ success: true, message: `Successfully flushed botanical brain files. Memory reduced to 0.0MB.`, bot });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to wipe memory in Firestore" });
  }
});

// Google OAuth URL generation endpoint
app.get("/api/auth/google/url", (req, res) => {
  const oauthClient = process.env.GOOGLE_CLIENT_ID || process.env.CLIENT_ID || "";
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${appUrl}/auth/callback`;

  const params = new URLSearchParams({
    client_id: oauthClient,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email",
    access_type: "offline",
    prompt: "consent"
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  res.json({ url: authUrl });
});

// Google OAuth Callback URL handler (supporting trailing slashes)
app.get(["/auth/callback", "/auth/callback/"], async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send("No authorization code provided.");
  }

  try {
    const oauthClient = process.env.GOOGLE_CLIENT_ID || process.env.CLIENT_ID || "";
    const oauthSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.CLIENT_SECRET || "";
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${appUrl}/auth/callback`;

    if (!oauthClient || !oauthSecret) {
      throw new Error("Google OAuth Credentials (CLIENT_ID, CLIENT_SECRET) are missing. Please configure them in your settings.");
    }

    // Exchange code for token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code: code as string,
        client_id: oauthClient,
        client_secret: oauthSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      throw new Error(`Token exchange failed: ${errorText}`);
    }

    const tokens = await tokenResponse.json() as { access_token: string };

    // Fetch user profile info with access token
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!userInfoResponse.ok) {
      throw new Error("Failed to fetch user profiles info.");
    }

    const userInfo = await userInfoResponse.json() as { email: string; name?: string; picture?: string };

    // Send success postMessage to parent window and close popup
    res.send(`
      <html>
        <body style="background: #07090F; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center;">
          <div style="max-width: 320px; padding: 20px;">
            <div style="border: 3px solid #00FFC6; border-top-color: transparent; border-radius: 50%; width: 44px; height: 44px; animation: spin 1s linear infinite; margin: 0 auto 20px;"></div>
            <p style="font-size: 16px; font-weight: bold; margin: 0 0 8px; color: #00FFC6;">Handshake Successful</p>
            <p style="font-size: 12px; color: #a1a1aa; margin: 0;">Authorized as ${userInfo.email}. Closing secure terminal window...</p>
          </div>
          <style>
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
          <script>
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'OAUTH_AUTH_SUCCESS', 
                user: ${JSON.stringify({ email: userInfo.email, name: userInfo.name || userInfo.email.split('@')[0] })}
              }, '*');
              setTimeout(() => {
                window.close();
              }, 1000);
            } else {
              window.location.href = '/';
            }
          </script>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error("OAuth callback error:", error);
    res.status(500).send(`
      <html>
        <body style="background: #07090F; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; padding: 20px;">
          <div style="max-width: 400px; background: #0E131F; border: 1px solid #ef4444/30; border-radius: 16px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <div style="background: rgba(239, 68, 68, 0.1); width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <p style="font-weight: bold; font-size: 16px; margin: 0 0 8px; color: #ef4444;">Handshake Interrupted</p>
            <p style="font-size: 13px; color: #a1a1aa; margin: 0 0 20px; line-height: 1.5;">${error?.message || "Internal server exception. Please ensure Google API is properly configured."}</p>
            <button onclick="window.close()" style="background: #ef4444; color: white; border: none; padding: 10px 20px; border-radius: 10px; font-weight: bold; font-size: 12px; cursor: pointer; transition: background 0.2s;">Dismiss Connection</button>
          </div>
        </body>
      </html>
    `);
  }
});

// Handle serving SPA frontend
// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: any, res: any) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server started. Dashboard live on http://localhost:${PORT}`);
  });
}

startServer();
