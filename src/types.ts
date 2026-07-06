/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AISource = 'gemini' | 'openai' | 'deepseek' | 'paniex' | 'freeapi';

export type BotPlatform = 'telegram' | 'whatsapp';

export type BotStatus = 'active' | 'paused' | 'stopped' | 'error';

export interface Bot {
  id: string;
  userId: string;
  name: string;
  platform: BotPlatform;
  status: BotStatus;
  aiSource: AISource;
  aiModel: string;
  apiKey: string;
  systemPrompt: string;
  customInstructions: string;
  greetingMessage: string;
  enableGoogleSearch?: boolean;
  enableCodeExecution?: boolean;
  enableMemory?: boolean;
  memoryUsedMb?: number;
  
  // Image Generation settings
  enableImageGen?: boolean;
  pollinationsApiKey?: string;
  pollinationsModel?: string;
  
  // Platform configs
  telegramToken?: string;
  whatsappConnected?: boolean;
  whatsappPairingCode?: string;
  whatsappQrCode?: string;
  
  createdAt: string;
  uptime: number; // in seconds
  totalMessagesProcessed: number;
}

export interface BotLog {
  id: string;
  botId: string;
  direction: 'in' | 'out' | 'system';
  text: string;
  sender: string;
  timestamp: string;
  status: 'success' | 'failed' | 'info';
  modelUsed?: string;
}

export interface ActivityFeed {
  id: string;
  botId: string;
  botName: string;
  type: 'message' | 'status_change' | 'config_update' | 'error';
  message: string;
  timestamp: string;
  platform: BotPlatform;
}

export interface OperationalMetrics {
  totalBotsCount: number;
  activeCount: number;
  pausedCount: number;
  stoppedCount: number;
  errorCount: number;
  messages24h: number;
  successRate: number;
}
