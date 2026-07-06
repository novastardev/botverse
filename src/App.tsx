/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot as BotIcon, 
  Cpu, 
  Activity, 
  Server, 
  Send, 
  Logs, 
  Settings, 
  RefreshCw, 
  Play, 
  Pause, 
  Square, 
  Zap, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Plus, 
  Search, 
  ChevronRight, 
  ExternalLink,
  MessageSquare,
  Key,
  Shield,
  Trash2,
  Lock,
  Unlock,
  Radio,
  Clock,
  ArrowLeft,
  Smartphone,
  Eye,
  EyeOff,
  LogOut,
  Globe,
  Terminal,
  Database,
  HardDrive,
  CreditCard,
  Image as ImageIcon
} from 'lucide-react';
import { Bot, BotPlatform, BotStatus, BotLog, ActivityFeed, OperationalMetrics, AISource } from './types';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

export default function App() {
  // Navigation & Filtering States
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // User Authentication States
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string } | null>(null);
  const [authPassword, setAuthPassword] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Back-end Synchronized States
  const [bots, setBots] = useState<Bot[]>([]);
  const [metrics, setMetrics] = useState<OperationalMetrics>({
    totalBotsCount: 0,
    activeCount: 0,
    pausedCount: 0,
    stoppedCount: 0,
    errorCount: 0,
    messages24h: 0,
    successRate: 100
  });
  const [activityFeed, setActivityFeed] = useState<ActivityFeed[]>([]);
  const [selectedBotLogs, setSelectedBotLogs] = useState<BotLog[]>([]);
  
  // UI Interaction States
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' | null }>({ text: '', type: null });
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [activeBotTab, setActiveBotTab] = useState<'control' | 'ai-brain' | 'behavior' | 'integration' | 'playground'>('control');
  
  // Playground Chat State
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  
  // Create Form States
  const [newBotName, setNewBotName] = useState('');
  const [newBotPlatform, setNewBotPlatform] = useState<BotPlatform>('telegram');
  const [创造Model, set创造Model] = useState('gemini-3.5-flash');
  const [创造Source, set创造Source] = useState<AISource>('gemini');
  const [newBotGreeting, setNewBotGreeting] = useState('');
  const [newBotSystemPrompt, setNewBotSystemPrompt] = useState('');

  // Single bot editor state (managed separately to avoid frequent network queries and act as a local staging configuration)
  const [editedBotState, setEditedBotState] = useState<Bot | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [testingPlatform, setTestingPlatform] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; reason: string } | null>(null);

  // Real WhatsApp Pairing States
  const [whatsappLinkNumber, setWhatsappLinkNumber] = useState('');
  const [isGeneratingPairingCode, setIsGeneratingPairingCode] = useState(false);

  // Cognitive Memory States
  const [accountTotalUsedMb, setAccountTotalUsedMb] = useState<number>(73.8);
  const [accountMaxMemoryMb, setAccountMaxMemoryMb] = useState<number>(100);
  const [accountSubscribedPlan, setAccountSubscribedPlan] = useState<'free' | 'silver' | 'gold' | 'platinum'>('free');
  const [isUpgradingPlan, setIsUpgradingPlan] = useState<boolean>(false);
  const [showBillingModal, setShowBillingModal] = useState<boolean>(false);

  // Authenticated fetch wrapper to supply Authorization: Bearer <email> token
  const authFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const defaultHeaders: Record<string, string> = {};
    if (currentUser?.email) {
      defaultHeaders['Authorization'] = `Bearer ${currentUser.email}`;
    }
    const mergedInit: RequestInit = {
      ...init,
      headers: {
        ...defaultHeaders,
        ...(init?.headers || {})
      }
    };
    
    let targetUrl = input;
    if (typeof input === 'string' && input.startsWith('/') && !input.startsWith('//')) {
      const apiBase = (import.meta as any).env?.VITE_API_BASE_URL;
      if (apiBase) {
        const baseClean = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
        targetUrl = `${baseClean}${input}`;
      }
    }
    
    return fetch(targetUrl, mergedInit);
  };

  // Anytime the website reloads, force sign out to ask for the passkey
  useEffect(() => {
    signOut(auth).catch(() => {});
    setCurrentUser(null);
  }, []);

  // Listen for secure Firebase Authentication state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser({
          email: user.email || '',
          name: 'admin'
        });
      } else {
        setCurrentUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Helper utility to identify and render Pollinations image links beautifully inside logs/chats
  const renderMessageTextWithImages = (text: string, customTextClass: string = "leading-normal") => {
    const imageRegex = /!\[.*?\]\((https:\/\/image\.pollinations\.ai\/.*?)\)/gi;
    const rawUrlRegex = /https:\/\/image\.pollinations\.ai\/[^\s\)]+/gi;
    
    let hasImage = false;
    let imageUrls: string[] = [];
    
    // Reset indices to avoid regex execution states
    imageRegex.lastIndex = 0;
    rawUrlRegex.lastIndex = 0;

    let imgMatch;
    while ((imgMatch = imageRegex.exec(text)) !== null) {
      imageUrls.push(imgMatch[1]);
      hasImage = true;
    }
    
    if (imageUrls.length === 0) {
      let rawMatch;
      while ((rawMatch = rawUrlRegex.exec(text)) !== null) {
        imageUrls.push(rawMatch[0]);
        hasImage = true;
      }
    }
    
    const cleanText = text.replace(/!\[.*?\]\(.*?\)/gi, '').trim();

    if (hasImage) {
      return (
        <div className="space-y-2">
          {cleanText && <p className={customTextClass}>{cleanText}</p>}
          <div className="flex flex-wrap gap-2 mt-1.5">
            {imageUrls.map((url, idx) => (
              <div key={idx} className="relative rounded-xl overflow-hidden border border-gray-800 bg-[#07090F] shadow-lg max-w-full">
                <img 
                  src={url} 
                  alt="Generated Chat Graphic" 
                  className="max-h-48 md:max-h-64 object-contain rounded-xl select-none"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 rounded text-[8px] text-[#00FFC6] border border-gray-800 font-mono">
                  Pollinations AI
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    
    return <p className={customTextClass}>{text}</p>;
  };

  const handleGetPairingCode = async () => {
    if (!editedBotState || !whatsappLinkNumber) return;
    setIsGeneratingPairingCode(true);
    try {
      const response = await authFetch(`/api/bots/${editedBotState.id}/whatsapp/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: whatsappLinkNumber })
      });
      if (response.ok) {
        const data = await response.json();
        const updatedCode = data.code;
        setEditedBotState(prev => prev ? { ...prev, whatsappPairingCode: updatedCode } : null);
        setBots(prev => prev.map(b => b.id === editedBotState.id ? { ...b, whatsappPairingCode: updatedCode } : b));
        showNotification(`Pairing code generated! Enter ${updatedCode} on your mobile app.`, 'success');
      } else {
        const errData = await response.json();
        showNotification(errData.error || 'Failed to generate pairing code.', 'error');
      }
    } catch (e) {
      showNotification('Error communicating with backend cluster.', 'error');
    } finally {
      setIsGeneratingPairingCode(false);
    }
  };

  // Auto Scroll ref for chat playground and log visualizer
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const logBottomRef = useRef<HTMLDivElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  // Drag-scrolling states for horizontal tab bar navigation
  const [isDraggingTabs, setIsDraggingTabs] = useState(false);
  const [tabsStartX, setTabsStartX] = useState(0);
  const [tabsScrollLeft, setTabsScrollLeft] = useState(0);

  const handleTabsMouseDown = (e: React.MouseEvent) => {
    if (!tabsContainerRef.current) return;
    setIsDraggingTabs(true);
    setTabsStartX(e.pageX - tabsContainerRef.current.offsetLeft);
    setTabsScrollLeft(tabsContainerRef.current.scrollLeft);
  };

  const handleTabsMouseLeave = () => {
    setIsDraggingTabs(false);
  };

  const handleTabsMouseUp = () => {
    setIsDraggingTabs(false);
  };

  const handleTabsMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingTabs || !tabsContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - tabsContainerRef.current.offsetLeft;
    const walk = (x - tabsStartX) * 1.5; // Drag scroll scalar multiplier
    tabsContainerRef.current.scrollLeft = tabsScrollLeft - walk;
  };

  // Load Initial Dataset
  const fetchAllData = async () => {
    if (!currentUser?.email) return;
    try {
      const [botsRes, metricsRes, activityRes, memoryRes] = await Promise.all([
        authFetch('/api/bots'),
        authFetch('/api/metrics'),
        authFetch('/api/activity'),
        authFetch('/api/user/memory')
      ]);

      if (botsRes.ok && metricsRes.ok && activityRes.ok) {
        const isJson = (r: Response) => r.headers.get("content-type")?.includes("application/json");

        if (isJson(botsRes) && isJson(metricsRes) && isJson(activityRes)) {
          const botsData = await botsRes.json();
          const metricsData = await metricsRes.json();
          const activityData = await activityRes.json();

          if (memoryRes && memoryRes.ok && isJson(memoryRes)) {
            const memoryData = await memoryRes.json();
            setAccountTotalUsedMb(memoryData.totalUsedMb);
            setAccountMaxMemoryMb(memoryData.maxMemoryMb);
            setAccountSubscribedPlan(memoryData.subscribedPlan);
          }
          
          // Deduplicate bots by unique ID to protect against any backend synchronization/cache races
          const uniqueBotsData = Array.isArray(botsData)
            ? botsData.filter((b: any, index: number, self: any[]) => self.findIndex(x => x.id === b.id) === index)
            : [];
          setBots(uniqueBotsData);
          setMetrics(metricsData);
          setActivityFeed(activityData);
          setIsOffline(false);

          // Synchronize active edited state if inside detail view safely
          if (selectedBotId) {
            const currentBot = botsData.find((b: Bot) => b.id === selectedBotId);
            if (currentBot) {
              setEditedBotState(prev => {
                if (!prev || prev.id !== currentBot.id) return currentBot;
                // Preserve user text entry changes on active inputs from being reverted under periodic background sync
                return {
                  ...prev,
                  status: currentBot.status,
                  uptime: currentBot.uptime,
                  totalMessagesProcessed: currentBot.totalMessagesProcessed,
                  whatsappConnected: currentBot.whatsappConnected,
                  whatsappPairingCode: currentBot.whatsappPairingCode,
                  whatsappQrCode: currentBot.whatsappQrCode
                };
              });
            }
          }
        } else {
          setIsOffline(true);
        }
      } else {
        setIsOffline(true);
      }
    } catch (err) {
      console.warn("Temporary network issue syncing with BØTVΞRSΞ backend API Router:", err);
      setIsOffline(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    // Poll metrics & bots status periodically (every 4 seconds) to catch back-end simulations and uptime increases
    const interval = setInterval(fetchAllData, 4000);
    return () => clearInterval(interval);
  }, [selectedBotId, currentUser]);

  // Fetch log queue specifically for selected bot
  const fetchBotLogs = async (botId: string) => {
    if (!currentUser?.email) return;
    try {
      const res = await authFetch(`/api/bots/${botId}/logs`);
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          setSelectedBotLogs(data);
        }
      }
    } catch (err) {
      console.error("Error loading specific bot lifecycle logs:", err);
    }
  };

  useEffect(() => {
    if (selectedBotId) {
      fetchBotLogs(selectedBotId);
      // Poll active logs faster so simulated client conversations appear in real-time
      const logsInterval = setInterval(() => fetchBotLogs(selectedBotId), 2500);
      return () => clearInterval(logsInterval);
    }
  }, [selectedBotId, currentUser]);

  // Auto-scroll to the bottom of the simulator chat and log queue
  useEffect(() => {
    if (selectedBotLogs.length > 0) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      logBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedBotLogs]);

  // Toast notifier
  const showNotification = (text: string, type: 'success' | 'error' | 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage({ text: '', type: null });
    }, 4500);
  };

  // Bot Lifecycle Action Triggers (Start, Pause, Restart, Stop)
  const triggerLifecycleAction = async (botId: string, action: 'start' | 'pause' | 'stop' | 'restart') => {
    try {
      const res = await authFetch(`/api/bots/${botId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });

      if (res.ok) {
        const updatedBot = await res.json();
        setBots(bots.map(b => b.id === botId ? updatedBot : b));
        setEditedBotState(updatedBot);
        
        if (updatedBot.status === 'error') {
          showNotification(`Action failed. Key parameters missing. Review logs.`, "error");
        } else {
          showNotification(`Lifecycle switched: Bot is now ${updatedBot.status.toUpperCase()}`, "success");
        }
        
        fetchAllData();
        fetchBotLogs(botId);
      } else {
        const errData = await res.json();
        showNotification(errData.error || "Failed execution loop", "error");
      }
    } catch (error) {
      showNotification("Network sequence interrupted", "error");
    }
  };

  // Submit Newly Configured Bot
  const handleCreateBot = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
    }
    console.log("handleCreateBot triggered, name:", newBotName, "platform:", newBotPlatform);
    if (!newBotName.trim()) {
      showNotification("Please provide a representative Bot Name.", "error");
      return;
    }

    try {
      showNotification("Provisioning bot in progress...", "info");
      const res = await authFetch('/api/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newBotName,
          platform: newBotPlatform,
          aiSource: 创造Source,
          aiModel: 创造Model,
          greetingMessage: newBotGreeting,
          systemPrompt: newBotSystemPrompt
        })
      });

      console.log("Create bot response status:", res.status);
      const isJson = res.headers.get("content-type")?.includes("application/json");
      if (res.ok) {
        const created = isJson ? await res.json() : null;
        if (!created) {
          throw new Error("Empty or invalid JSON body returned by the server");
        }
        console.log("Bot created successfully:", created);
        showNotification(`Bot '${created.name}' initialized elegantly. Ready to configure.`, "success");
        setShowCreateModal(false);
        // Reset inputs
        setNewBotName('');
        setNewBotGreeting('');
        setNewBotSystemPrompt('');
        
        await fetchAllData();
        // Redirect to newly created bot's page immediately
        setSelectedBotId(created.id);
        setEditedBotState(created);
        setActiveBotTab('ai-brain');
      } else {
        const errorMsg = isJson ? await res.json() : null;
        const errText = errorMsg?.error || `Server error (Status: ${res.status})`;
        console.error("Failed to provision bot:", errText);
        showNotification(errText, "error");
      }
    } catch (err: any) {
      console.error("Handshake creation error:", err);
      showNotification(err?.message || "Error posting bot schema", "error");
    }
  };

  // Delete/Purge Bot
  const handleDeleteBot = async (botId: string) => {
    const doubleConfirm = window.confirm("Are you sure you want to permanently delete this bot from the SaaS control registry?");
    if (!doubleConfirm) return;

    try {
      const res = await authFetch(`/api/bots/${botId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        showNotification("Bot destroyed. Operational connections severed.", "info");
        setSelectedBotId(null);
        setEditedBotState(null);
        fetchAllData();
      } else {
        showNotification("Could not prune bot registers.", "error");
      }
    } catch (err) {
      showNotification("Network pruning failed", "error");
    }
  };

  // Safe Configuration Changes
  const saveEngineConfiguration = async () => {
    if (!editedBotState) return;
    setIsSavingConfig(true);
    setTestResult(null);

    try {
      const res = await authFetch(`/api/bots/${editedBotState.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedBotState)
      });

      if (res.ok) {
        const parsed = await res.json();
        setBots(bots.map(b => b.id === parsed.id ? parsed : b));
        setEditedBotState(parsed);
        showNotification("Bot configuration updated successfully.", "success");
        fetchAllData();
        fetchBotLogs(parsed.id);
      } else {
        showNotification("Failed to commit database presets.", "error");
      }
    } catch (err) {
      showNotification("Save sequence interrupted", "error");
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Trigger subscription memory upgrade plan
  const triggerUpgradePlan = async (plan: 'free' | 'silver' | 'gold' | 'platinum') => {
    setIsUpgradingPlan(true);
    try {
      const res = await authFetch('/api/user/memory/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan })
      });

      if (res.ok) {
        const data = await res.json();
        setAccountMaxMemoryMb(data.maxMemoryMb);
        setAccountSubscribedPlan(data.subscribedPlan);
        showNotification(`Successfully subscribed to the ${plan.toUpperCase()} memory plan! Limit increased to ${data.maxMemoryMb}MB.`, 'success');
        fetchAllData();
      } else {
        showNotification('Failed to change your memory subscription plan.', 'error');
      }
    } catch (e) {
      showNotification('Network boundary error while upgrading plan.', 'error');
    } finally {
      setIsUpgradingPlan(false);
    }
  };

  // Send message inside Playground Sandbox simulator
  const handleSendMessagePlayground = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !editedBotState) return;

    setIsSendingChat(true);
    const messageToSend = chatInput;
    setChatInput('');

    try {
      const res = await authFetch(`/api/bots/${editedBotState.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageToSend })
      });

      if (res.ok) {
        const data = await res.json();
        // Force refresh logs
        fetchBotLogs(editedBotState.id);
        showNotification("Workspace user inquiry processed.", "success");
      } else {
        showNotification("Playground processor returned a bad frame.", "error");
      }
    } catch (err) {
      showNotification("Network delay in sandbox chat routing", "error");
    } finally {
      setIsSendingChat(false);
    }
  };

  // Platform Integration Test
  const testPlatformConnection = async () => {
    if (!editedBotState) return;
    setTestingPlatform(true);
    setTestResult(null);

    try {
      const res = await authFetch(`/api/bots/${editedBotState.id}/platform/test`, {
        method: 'POST'
      });

      if (res.ok) {
        const data = await res.json();
        setTestResult({ success: data.success, reason: data.reason });
        if (data.success) {
          showNotification("Platform handshake verified!", "success");
        } else {
          showNotification("Platform rejected connection test.", "error");
        }
        fetchBotLogs(editedBotState.id);
      } else {
        showNotification("Unable to reach platform gateway validator.", "error");
      }
    } catch (err) {
      showNotification("Handshake pipeline timed out", "error");
    } finally {
      setTestingPlatform(false);
    }
  };

  // Helper dynamic model array mapped based on AI Source
  const getModelsForSource = (src: AISource): string[] => {
    switch (src) {
      case 'gemini': 
        return [
          'gemini-3.5-flash', 
          'gemini-3.1-flash-lite', 
          'gemini-3.1-pro-preview'
        ];
      default: 
        return ['gemini-3.5-flash'];
    }
  };

  // AI model default setter on source switch
  const handleSourceChangeInCreate = (src: AISource) => {
    set创造Source(src);
    const models = getModelsForSource(src);
    set创造Model(models[0]);
  };

  const handleSourceChangeInEditor = (src: AISource) => {
    if (!editedBotState) return;
    const models = getModelsForSource(src);
    setEditedBotState({
      ...editedBotState,
      aiSource: src,
      aiModel: models[0]
    });
  };

  // Filters computed bots list
  const filteredBots = bots.filter(bot => {
    const matchesSearch = bot.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          bot.aiModel.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPlatform = platformFilter === 'all' || bot.platform === platformFilter;
    return matchesSearch && matchesPlatform;
  });

  return (
    <>
      {/* Small Screen Restriction Overlay */}
      <div className="md:hidden fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#07090F] p-6 text-center cyber-grid overflow-hidden">
        <div className="max-w-md w-full bg-[#0E131F]/95 border-2 border-red-500/40 rounded-3xl p-8 shadow-[0_0_50px_rgba(239,68,68,0.2)] relative overflow-hidden space-y-6">
          <div className="absolute top-0 left-0 w-32 h-32 bg-red-500/5 blur-3xl rounded-full"></div>
          <div className="absolute bottom-0 right-0 w-32 h-32 bg-[#00FFC6]/5 blur-3xl rounded-full"></div>
          
          {/* Cybernetic Device Icon indicator */}
          <div className="mx-auto w-16 h-16 rounded-2xl bg-[#07090F] border border-red-500/40 flex items-center justify-center shadow-[0_0_25px_rgba(239,68,68,0.3)]">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-8 h-8 text-red-500 animate-pulse">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-6 15h9" />
            </svg>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold tracking-widest text-[#00FFC6] font-mono uppercase">
              BØTVΞRSΞ <span className="text-red-500">RESTRICTED</span>
            </h2>
            <div className="h-0.5 w-16 bg-red-500/50 mx-auto"></div>
          </div>

          <div className="space-y-4">
            <p className="text-gray-300 text-sm font-sans leading-relaxed">
              This terminal relies on high-density monitoring dashboards, multi-pane node pipelines, and active visual simulated message terminals.
            </p>
            <p className="text-red-400 text-xs font-mono font-semibold uppercase tracking-wider bg-red-950/20 py-3.5 px-4 rounded-xl border border-red-900/40 leading-normal">
              💻 THIS WEBSITE IS ONLY AVAILABLE ON PC, TABLET, OR LAPTOPS.
            </p>
            <p className="text-gray-500 text-[11px] font-medium leading-normal">
              Please scale your screen size or check from a larger device to run bot operations.
            </p>
          </div>
        </div>
      </div>

      <div className="hidden md:flex min-h-screen font-sans flex-col bg-[#07090F] text-gray-200 overflow-x-clip cyber-grid">
      
      {/* Top Glassmorphic Navigation */}
      <header className="sticky top-0 z-50 w-full bg-[#0E131F] border-b-2 border-gray-800 py-4 px-6 flex items-center justify-between shadow-[0_6px_30px_rgba(0,0,0,0.95)]">
        <div className="flex items-center gap-3">
          <div className="p-2 gap-1 rounded-lg bg-black border border-[#00FFC6]/40 flex items-center justify-center shadow-[0_0_10px_rgba(0,255,198,0.15)]">
            <BotIcon className="w-6 h-6 text-[#00FFC6] animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-widest text-[#00FFC6] flex items-center gap-1.5">
              BØTV<span className="text-white font-extrabold font-sans">Ξ</span>RSΞ 
              <span className="text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded bg-[#151C2E] border border-gray-800 text-gray-400">Hub v3.2</span>
            </h1>
            <p className="text-[11px] text-gray-400 font-mono tracking-tight hidden sm:block">Multi-Platform Chatbot Custom Brain Mesh</p>
          </div>
        </div>

        {/* Connection status fallback only */}
        {isOffline && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 animate-pulse text-xs font-mono">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping"></span>
            <span className="font-bold">CONNECTION STANDBY / RETRYING...</span>
          </div>
        )}

        {/* User Context */}
        <div className="flex items-center gap-2 md:gap-3">
          {currentUser ? (
            <div className="flex items-center gap-2.5">
              {/* User Identity Info */}
              <div className="text-right hidden sm:block">
                <p className="text-xs text-gray-300 font-medium font-mono truncate max-w-[100px] sm:max-w-[150px]">{currentUser.email}</p>
                <p className="text-[9px] text-[#00FFC6] font-mono tracking-wider text-right">ENTERPRISE ACT</p>
              </div>
              <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-[#00FFC6] to-[#0A84FF] p-0.5 flex items-center justify-center shadow-[0_0_12px_rgba(0,255,198,0.1)] shrink-0">
                <div className="h-full w-full rounded-full bg-[#07090F] flex items-center justify-center text-xs text-white font-mono font-bold">
                  {currentUser.email.slice(0, 2).toUpperCase()}
                </div>
              </div>

              {/* Account Settings Trigger Widget */}
              <button 
                id="btn-nav-settings"
                onClick={() => setShowBillingModal(true)} 
                className="py-1.5 px-3 bg-[#00FFC6]/10 hover:bg-[#00FFC6]/20 text-[#00FFC6] border border-[#00FFC6]/20 hover:border-[#00FFC6]/50 rounded-xl text-xs font-mono font-bold uppercase transition-all duration-200 cursor-pointer flex items-center gap-1.5 shrink-0"
                title="Account Settings & Memory Billing"
              >
                <Settings className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Account Settings</span>
              </button>
              
              {/* Responsive logout button */}
              <button 
                id="btn-nav-logout"
                onClick={async () => {
                  try {
                    await signOut(auth);
                  } catch (e) {
                    console.error("Sign out error", e);
                  }
                  setCurrentUser(null);
                  setSelectedBotId(null);
                  showNotification("Terminated secure session. Logged out.", "info");
                }} 
                className="py-1.5 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-400/50 rounded-xl text-xs font-mono font-bold uppercase transition-all duration-200 cursor-pointer flex items-center gap-1.5 shrink-0"
                title="Log Out Securely"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 md:gap-3">
              <div className="hidden sm:block text-right">
                <p className="text-xs text-amber-500 font-semibold font-mono">UNAUTHENTICATED</p>
                <p className="text-[10px] text-gray-400 font-mono tracking-wider">Sign In Required</p>
              </div>
              <div className="h-9 w-9 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700">
                <Lock className="w-4 h-4 text-gray-400" />
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Floating Notification */}
      {toastMessage.text && (
        <div className="fixed bottom-6 left-4 right-4 sm:left-auto sm:right-6 z-50 animate-bounce duration-500 max-w-sm">
          <div className={`p-4 rounded-xl border flex items-center gap-3 shadow-2xl ${
            toastMessage.type === 'success' 
              ? 'bg-[#0E131F] border-[#00FFC6] text-white shadow-[#00FFC6]/10' 
              : toastMessage.type === 'error'
              ? 'bg-[#0E131F] border-red-500 text-white shadow-red-500/10'
              : 'bg-[#151C2E] border-gray-700 text-gray-200'
          }`}>
            {toastMessage.type === 'success' && <CheckCircle2 className="w-5 h-5 text-[#00FFC6] shrink-0" />}
            {toastMessage.type === 'error' && <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />}
            {toastMessage.type === 'info' && <Radio className="w-5 h-5 text-blue-400 shrink-0" />}
            <p className="text-xs font-mono tracking-tight">{toastMessage.text}</p>
          </div>
        </div>
      )}

      {/* Primary Page Layout Split */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 md:p-6 flex flex-col">
        
        {!currentUser ? (
          <div className="flex-1 flex items-center justify-center py-10 md:py-16">
            <div className="w-full max-w-md bg-[#0E131F]/90 border-2 border-gray-800 rounded-3xl p-5 sm:p-8 shadow-[0_12px_50px_rgba(0,0,0,0.95)] relative overflow-hidden backdrop-blur-lg">
              <div className="absolute top-0 left-0 w-32 h-32 bg-[#00FFC6]/5 blur-3xl rounded-full"></div>
              <div className="absolute bottom-0 right-0 w-32 h-32 bg-[#0A84FF]/5 blur-3xl rounded-full"></div>
              
              {/* Header / Logo */}
              <div className="text-center space-y-2 mb-8 select-none">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-black border border-[#00FFC6]/40 flex items-center justify-center shadow-[0_4px_20px_rgba(0,255,198,0.2)] mb-3">
                  <BotIcon className="w-8 h-8 text-[#00FFC6] animate-pulse" />
                </div>
                <h2 className="text-2xl font-bold tracking-widest text-[#00FFC6] font-mono">BØTVΞRSΞ COGNITIVE</h2>
                <p className="text-[11px] text-gray-400 font-mono leading-relaxed">
                  Enter your secure administrative passkey to synchronize multi-platform AI brains and master mesh configurations.
                </p>
                {isOffline && (
                  <div className="mt-4 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-mono animate-pulse">
                    ⚠️ API Router re-establishing connection
                  </div>
                )}
              </div>

              {/* Exclusive Admin Passcode Form */}
              <div className="bg-black/40 p-4 rounded-xl border border-gray-800 mb-6 font-mono text-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">ADMINISTRATIVE MASTER PROFILE</span>
                  <span className="text-[9px] bg-[#00FFC6]/10 text-[#00FFC6] border border-[#00FFC6]/20 py-0.5 px-2 rounded-full font-bold">SHARED ALL DEVICES</span>
                </div>
                <div className="p-3 bg-[#07090F] border border-gray-800 rounded-lg text-gray-300 font-mono text-center tracking-wide font-bold text-xs relative overflow-hidden select-none">
                  admin@botverse.com
                </div>
              </div>

              {/* Password credentials form */}
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (isAuthLoading) return;
                
                const emailClean = 'admin@botverse.com';
                const passwordClean = authPassword.trim();

                if (!passwordClean) {
                  showNotification("Security passkey PIN is required.", "error");
                  return;
                }
                
                setIsAuthLoading(true);

                try {
                  if (passwordClean !== 'Botverse100%activeforNovastar') {
                    showNotification("wrong password", "error");
                    setIsAuthLoading(false);
                    return;
                  }

                  // 1. Authenticate with Firebase Auth
                  try {
                    await signInWithEmailAndPassword(auth, emailClean, passwordClean);
                  } catch (authError: any) {
                    const code = authError?.code;
                    if (code === 'auth/user-not-found' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials' || code === 'auth/user-disabled') {
                      // Attempt dynamic auto-provisioning of the administrator user
                      try {
                        await createUserWithEmailAndPassword(auth, emailClean, passwordClean);
                      } catch (signupErr) {
                        console.error("Auto-provisioning failed:", signupErr);
                      }
                    } else {
                      throw authError;
                    }
                  }

                  // 2. Sync credentials in Firestore under users/admin@botverse.com as the permanent credential record
                  try {
                    const userDocRef = doc(db, 'users', 'admin@botverse.com');
                    await setDoc(userDocRef, {
                      email: 'admin@botverse.com',
                      password: passwordClean,
                      name: 'admin',
                      createdAt: new Date().toISOString()
                    });
                  } catch (dbErr) {
                    console.error("Credentials cache sync failed:", dbErr);
                  }

                  showNotification("Secure passcode verified. Initializing master control deck...", "success");
                  setCurrentUser({ email: emailClean, name: 'admin' });
                } catch (err: any) {
                  console.error("Handshake transmission error:", err);
                  showNotification(err.message || "Authentication transmission error.", "error");
                } finally {
                  setIsAuthLoading(false);
                }
              }} className="space-y-4">

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-mono uppercase text-gray-400 font-semibold tracking-wider">Access Passkey PIN</label>
                  <p className="text-[10px] text-gray-500 font-mono">Verify master session token credentials to bridge secure websocket channels.</p>
                  <div className="relative">
                    <input
                      id="auth-password-input"
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="Enter Administrative Passkey"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className="w-full bg-[#07090F] border border-gray-800 focus:border-[#00FFC6]/60 text-gray-200 text-xs p-3.5 pr-10 rounded-xl outline-none font-mono transition-all focus:ring-1 focus:ring-[#00FFC6]/20"
                    />
                    <button
                      type="button"
                      id="btn-auth-toggle-password"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3.5 text-gray-500 hover:text-gray-300 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  id="btn-auth-submit"
                  disabled={isAuthLoading}
                  className="w-full py-3.5 px-4 bg-[#00FFC6] hover:bg-[#00D7A7] disabled:opacity-50 text-black font-extrabold text-xs font-mono tracking-widest rounded-xl transition-all shadow-[0_4px_20px_rgba(0,255,198,0.15)] flex items-center justify-center gap-2 cursor-pointer mt-3 animate-pulse"
                >
                  {isAuthLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> SECURING DECK MATRIX...
                    </>
                  ) : (
                    "INITIALIZE CORE HANDSHAKE"
                  )}
                </button>
              </form>
            </div>
          </div>
        ) : (
          !selectedBotId ? (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* SIDEBAR: System Status, Live Activity Feed */}
            <section className="lg:col-span-1 flex flex-col gap-6 order-2 lg:order-1" id="dashboard-sidebar">
              
              {/* Quick Stats Block */}
              <div className="cyber-glass rounded-2xl p-5 border border-gray-800 flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                  <h2 className="text-xs uppercase font-mono tracking-widest text-[#00FFC6] font-semibold flex items-center gap-2">
                    <Cpu className="w-4 h-4" /> Operations Overview
                  </h2>
                  <span className="text-[10px] text-gray-500 font-mono">Live Sync</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#151C2E] border border-gray-800 p-3 rounded-xl flex flex-col justify-center">
                    <span className="text-[10px] font-mono text-gray-400 uppercase tracking-tight">TOTAL BOTS</span>
                    <span className="text-2xl font-bold text-white mt-1">{metrics.totalBotsCount}</span>
                  </div>
                  <div className="bg-[#151C2E] border border-gray-800 p-3 rounded-xl flex flex-col justify-center">
                    <span className="text-[10px] font-mono text-[#00FFC6] uppercase tracking-tight">ACTIVE STATUS</span>
                    <span className="text-2xl font-bold text-[#00FFC6] mt-1">{metrics.activeCount}</span>
                  </div>
                  <div className="bg-[#151C2E] border border-gray-800 p-3 rounded-xl flex flex-col justify-center">
                    <span className="text-[10px] font-mono text-amber-500 uppercase tracking-tight">PAUSED BOTS</span>
                    <span className="text-2xl font-bold text-amber-500 mt-1">{metrics.pausedCount}</span>
                  </div>
                  <div className="bg-[#151C2E] border border-gray-800 p-3 rounded-xl flex flex-col justify-center">
                    <span className="text-[10px] font-mono text-rose-500 uppercase tracking-tight">ERROR ALERTS</span>
                    <span className="text-2xl font-bold text-rose-500 mt-1">{metrics.errorCount}</span>
                  </div>
                </div>

                <button 
                  id="btn-trigger-crebot"
                  onClick={() => setShowCreateModal(true)}
                  className="w-full py-2.5 px-4 bg-[#00FFC6] hover:bg-[#00D7A7] text-black font-semibold text-sm rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_4px_20px_rgba(0,255,198,0.2)] focus:ring-[3px] focus:ring-[#00FFC6]/40 cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Provision AI Bot
                </button>
              </div>

              {/* Real-time Global Ticker Feed */}
              <div className="cyber-glass rounded-2xl p-5 border border-gray-800 flex-1 flex flex-col min-h-[250px]">
                <h2 className="text-xs uppercase font-mono tracking-widest text-[#00FFC6] font-semibold border-b border-gray-800 pb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2"><Logs className="w-4 h-4 animate-spin-slow" /> Activity Horizon</span>
                  <span className="text-[9px] text-gray-500 font-mono">Sim Active</span>
                </h2>
                <div className="flex-1 overflow-y-auto max-h-[300px] flex flex-col gap-3 mt-3 pr-1">
                  {activityFeed.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center py-10">
                      <Activity className="w-8 h-8 text-gray-600 mb-2 shrink-0" />
                      <p className="text-[11px] font-mono text-gray-500">Listening to server operations loop...</p>
                    </div>
                  ) : (
                    activityFeed.map((act) => (
                      <div key={act.id} className="p-2.5 rounded-lg bg-[#151C2E]/60 border border-gray-800/80 hover:border-gray-700 transition-all font-mono text-[10px] leading-relaxed">
                        <div className="flex items-center justify-between mb-1 text-gray-400">
                          <span className="text-[9px] text-[#00FFC6] uppercase font-bold tracking-tight">
                            {act.platform.toUpperCase()}
                          </span>
                          <span className="text-[8px] text-gray-500">
                            {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-gray-200 line-clamp-2">{act.message}</p>
                        <span className="text-[8px] text-gray-500 mt-1 block tracking-wider truncate">ENGINE: {act.botName}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            {/* CONTAINER VIEWPORTS: Dashboard List (Viewport A) */}
            <section className="col-span-1 lg:col-span-3 space-y-6 order-1 lg:order-2">
              
              {/* Platform Filters */}
              <div className="cyber-glass rounded-2xl p-5 border border-gray-800 flex flex-col gap-3">
                <h2 className="text-xs uppercase font-mono tracking-widest text-[#00FFC6] font-semibold border-b border-gray-800 pb-3 flex items-center gap-2">
                  <Server className="w-4 h-4" /> Mesh Channels Filter List
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { id: 'all', label: 'All Bot Engines', color: 'bg-gray-500' },
                    { id: 'telegram', label: 'Telegram Channels', color: 'bg-[#0088cc]' },
                    { id: 'whatsapp', label: 'WhatsApp Nodes', color: 'bg-[#25D366]' }
                  ].map(plat => (
                    <button
                      key={plat.id}
                      id={`filter-${plat.id}`}
                      onClick={() => {
                        setPlatformFilter(plat.id);
                        if (selectedBotId === null) {
                          // Stay focused
                        } else {
                          // Go back to list if filtering
                          setSelectedBotId(null);
                        }
                      }}
                      className={`py-2 px-3 text-xs rounded-xl font-medium tracking-wide flex items-center justify-between transition-all cursor-pointer ${
                        platformFilter === plat.id 
                        ? 'bg-[#151C2E] text-[#00FFC6] border border-[#00FFC6]/30 shadow-[0_0_12px_rgba(0,255,198,0.06)]' 
                        : 'bg-transparent text-gray-400 hover:text-white hover:bg-white/5 border border-gray-800'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${plat.color}`}></span>
                        <span className="truncate">{plat.id === 'all' ? 'All' : plat.id.toUpperCase()}</span>
                      </div>
                      <span className="text-[10px] bg-[#07090F] border border-gray-800 px-1.5 py-0.5 rounded text-gray-500 font-mono shrink-0 ml-1">
                        {plat.id === 'all' 
                          ? bots.length 
                          : bots.filter(b => b.platform === plat.id).length
                        }
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Bot Filter Bar / Search bar */}
              <div className="cyber-glass rounded-2xl p-4 border border-gray-800 flex flex-col sm:flex-row items-center gap-4 justify-between">
                <div className="relative w-full sm:max-w-md">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                  <input
                    id="search-bots-input"
                    type="text"
                    placeholder="Search bots by moniker, AI language model, prompt rules..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#07090F] border border-gray-800 focus:border-[#00FFC6] focus:ring-1 focus:ring-[#00FFC6]/30 text-gray-200 text-sm pl-11 pr-4 py-2.5 rounded-xl outline-none font-mono placeholder:text-gray-600 transition-all"
                  />
                </div>
                
                <p className="text-xs font-mono text-gray-500 flex items-center gap-1.5 shrink-0 select-none">
                  Showing <span className="text-[#00FFC6] font-bold">{filteredBots.length}</span> of {bots.length} initialized AI matrices
                </p>
              </div>

              {/* Bot List Cards (Bento-grid styled flow) */}
              {isLoading ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-4">
                  <RefreshCw className="w-8 h-8 text-[#00FFC6] animate-spin" />
                  <p className="text-sm font-mono text-gray-400">Querying active cluster parameters...</p>
                </div>
              ) : filteredBots.length === 0 ? (
                <div className="cyber-glass rounded-3xl border border-gray-800 p-12 text-center flex flex-col items-center justify-center space-y-4">
                  <div className="p-4 rounded-full bg-[#151C2E] border border-gray-800 text-gray-500">
                    <BotIcon className="w-12 h-12" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">No Bot Matrices Found</h3>
                    <p className="text-sm text-gray-400 max-w-md mt-1 mx-auto">There are no bots mapped to these filters. Create a new digital brain instantly to begin multi-platform message routing.</p>
                  </div>
                  <button 
                    onClick={() => setShowCreateModal(true)}
                    className="py-2 px-5 text-sm font-semibold rounded-xl bg-gradient-to-r from-[#00FFC6] to-[#0A84FF] text-[#07090F] hover:opacity-90 shadow-lg cursor-pointer"
                  >
                    Deploy New Agent
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {filteredBots.map((bot) => {
                    const statusColors = {
                      active: 'text-[#00FFC6] bg-[#00FFC6]/10 border-[#00FFC6]/30',
                      paused: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
                      stopped: 'text-gray-400 bg-gray-400/10 border-gray-800',
                      error: 'text-rose-500 bg-rose-500/10 border-rose-500/20'
                    };
                    
                    const platformMeta = {
                      telegram: { label: 'Telegram Badge', color: 'bg-[#0088cc]' },
                      whatsapp: { label: 'WhatsApp API', color: 'bg-[#25D366]' }
                    };

                    return (
                      <div 
                        key={bot.id}
                        id={`bot-card-${bot.id}`}
                        onClick={() => {
                          setSelectedBotId(bot.id);
                          setEditedBotState(bot);
                          setActiveBotTab('control');
                        }}
                        className="group relative bg-[#0E131F]/90 border border-gray-800/80 hover:border-[#00FFC6]/40 p-6 rounded-2xl cursor-pointer transition-all hover:translate-y-[-2px] hover:shadow-[0_8px_30px_rgba(0,255,198,0.05)] overflow-hidden"
                      >
                        {/* Pulse accent behind icon for active states */}
                        {bot.status === 'active' && (
                          <div className="absolute right-0 top-0 w-32 h-32 bg-[#00FFC6]/5 blur-3xl rounded-full translate-x-12 -translate-y-12 shrink-0"></div>
                        )}

                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-[#151C2E] border border-gray-800 rounded-xl group-hover:border-[#00FFC6]/30 transition-colors">
                              <BotIcon className={`w-6 h-6 ${bot.status === 'active' ? 'text-[#00FFC6]' : 'text-gray-500'}`} />
                            </div>
                            <div>
                              <h3 className="text-[15px] font-bold text-white group-hover:text-[#00FFC6] transition-colors">{bot.name}</h3>
                              <p className="text-[11px] font-mono text-gray-500">ID: {bot.id}</p>
                            </div>
                          </div>
                          
                          <span className={`text-[10px] px-2 py-1 rounded-md font-mono border ${statusColors[bot.status] || ''} flex items-center gap-1.5`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              bot.status === 'active' ? 'bg-[#00FFC6] animate-ping' : 
                              bot.status === 'paused' ? 'bg-amber-400' : 
                              bot.status === 'error' ? 'bg-red-500' : 'bg-gray-400'
                            }`}></span>
                            {bot.status.toUpperCase()}
                          </span>
                        </div>

                        {/* Middle Info Details */}
                        <div className="my-5 space-y-2.5 border-t border-b border-gray-800/60 py-4 font-mono text-xs">
                          <div className="flex items-center justify-between text-gray-400">
                            <span>Integrate Platform:</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold text-white ${platformMeta[bot.platform].color || ''}`}>
                              {bot.platform}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-gray-400">
                            <span>AI Neural Engine:</span>
                            <span className="text-white text-[11px] bg-[#151C2E] px-2 py-0.5 rounded font-bold border border-gray-800">
                              {bot.aiSource.toUpperCase()} : {bot.aiModel}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-gray-400">
                            <span>Total Exchanged:</span>
                            <span className="text-white font-semibold flex items-center gap-1">
                              <MessageSquare className="w-3.5 h-3.5 text-gray-500" /> {bot.totalMessagesProcessed} runs
                            </span>
                          </div>
                        </div>

                        {/* Bottom Actions Row */}
                        <div className="flex items-center justify-between text-[11px] font-mono select-none pt-1">
                          <div className="text-gray-500 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            <span>
                              Uptime:{' '}
                              <span className="text-gray-400">
                                {bot.status === 'active' 
                                  ? `${Math.floor(bot.uptime / 3600)}h ${Math.floor((bot.uptime % 3600) / 60)}m` 
                                  : 'Inactive'
                                }
                              </span>
                            </span>
                          </div>

                          <span className="text-[#00FFC6] group-hover:translate-x-1 transition-transform flex items-center gap-1 font-semibold">
                            Open Control Hub <ChevronRight className="w-4 h-4" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        ) : (
          
          /* VIEWPORT B: BOT HOMEPAGE (SINGLE BOT CONTROL CENTER - SEPARATE SCREEN) */
          editedBotState && (
            <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-300">
              
              {/* Back button and Bot Profile Segment */}
              <div className="cyber-glass rounded-2xl p-5 border border-gray-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <button
                    id="btn-back-dashboard"
                    onClick={() => setSelectedBotId(null)}
                    className="p-2.5 rounded-xl bg-[#151C2E] border border-gray-800 hover:border-[#00FFC6]/40 hover:text-[#00FFC6] transition-all cursor-pointer shadow-inner shrink-0"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-lg md:text-xl font-bold text-white">{editedBotState.name}</h2>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded uppercase font-extrabold bg-[#151C2E] border border-gray-800 text-gray-400 font-mono">
                        {editedBotState.id}
                      </span>
                      <span className="text-[10px] font-mono px-2.5 py-0.5 rounded uppercase font-bold bg-[#0088cc] text-white">
                        #{editedBotState.platform.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 font-mono mt-1">
                      Deployment matrix initialized under <span className="text-[#00FFC6]">{editedBotState.aiSource.toUpperCase()}</span> logic utilizing <span className="text-[#00FFC6]">{editedBotState.aiModel}</span> model
                    </p>
                  </div>
                </div>

                {/* Lifecycle and Delete Header Controls */}
                <div className="flex items-center gap-3 w-full md:w-auto self-end md:self-center justify-end">
                  <span className={`text-xs px-2.5 py-1 rounded-lg font-mono border ${
                    editedBotState.status === 'active' ? 'text-[#00FFC6] bg-[#00FFC6]/10 border-[#00FFC6]/30' :
                    editedBotState.status === 'paused' ? 'text-amber-400 bg-amber-400/10 border-amber-400/30' :
                    editedBotState.status === 'error' ? 'text-rose-500 bg-rose-500/10 border-rose-500/20' :
                    'text-gray-400 bg-gray-400/15 border-gray-800'
                  } flex items-center gap-1.5`}>
                    <span className={`h-2 w-2 rounded-full ${
                      editedBotState.status === 'active' ? 'bg-[#ff5a5a] pulse-cyber' : 'bg-gray-500'
                    }`}></span>
                    {editedBotState.status.toUpperCase()}
                  </span>

                  <button
                    id="btn-delete-bot"
                    onClick={() => handleDeleteBot(editedBotState.id)}
                    className="p-2 text-rose-500 hover:text-white hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 rounded-xl transition-all cursor-pointer"
                    title="Decommission Agent"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* BRAND-NEW CYBERPUNK COMMAND DECK (TAB BAR) */}
              <div id="cyber-tab-deck" className="w-full mb-6">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
                  {[
                    { id: 'control', label: 'Engine Controls', subtitle: 'Runtime & Lifecycle', icon: Settings },
                    { id: 'ai-brain', label: 'AI Brain Config', subtitle: 'Model Parameters', icon: Cpu },
                    { id: 'behavior', label: 'Personalization', subtitle: 'Rules & Context', icon: MessageSquare },
                    { id: 'integration', label: 'Channel Integrations', subtitle: 'Platform Bridges', icon: Smartphone },
                    { id: 'playground', label: 'Sandbox Playground', subtitle: 'Live Test Console', icon: Zap }
                  ].map((tab, idx) => {
                    const Icon = tab.icon;
                    const isActive = activeBotTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        id={`tab-btn-${tab.id}`}
                        onClick={() => setActiveBotTab(tab.id as any)}
                        className={`relative group flex flex-col items-center justify-center p-3.5 rounded-xl border transition-all duration-300 cursor-pointer select-none text-center ${
                          tab.id === 'playground' && idx === 4 ? 'col-span-2 md:col-span-1' : ''
                        } ${
                          isActive 
                            ? 'bg-[#00FFC6]/5 border-[#00FFC6] text-[#00FFC6] shadow-[0_0_15px_rgba(0,255,198,0.15)]' 
                            : 'bg-[#0E131F]/90 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700 hover:bg-[#151C2E]'
                        }`}
                      >
                        {/* Dynamic cyber border accents */}
                        {isActive && (
                          <>
                            <span className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[#00FFC6] -mt-[1px] -ml-[1px] rounded-tl"></span>
                            <span className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-[#00FFC6] -mt-[1px] -mr-[1px] rounded-tr"></span>
                            <span className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-[#00FFC6] -mb-[1px] -ml-[1px] rounded-bl"></span>
                            <span className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-[#00FFC6] -mb-[1px] -mr-[1px] rounded-br"></span>
                          </>
                        )}
                        
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#00FFC6]' : 'text-gray-500 group-hover:text-gray-300'}`} />
                          <span className="font-mono text-xs font-bold uppercase tracking-wider">{tab.label}</span>
                        </div>
                        <span className="hidden sm:block text-[9px] font-mono mt-1 opacity-60 text-gray-400 group-hover:text-gray-300">{tab.subtitle}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

                {/* TAB WINDOW 1: BOT LIFECYCLE CONTROLS */}
                {activeBotTab === 'control' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    
                    {/* Control Panel Column */}
                    <div className="md:col-span-2 space-y-6">
                      <div className="cyber-glass rounded-2xl p-6 border border-gray-800 space-y-4">
                        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                          <h3 className="font-bold text-white text-sm flex items-center gap-2 font-mono uppercase tracking-wide">
                            <Radio className="w-4 h-4 text-[#00FFC6]" /> Operation Center Action triggers
                          </h3>
                          <span className="text-[10px] text-gray-500 font-mono">ID: {editedBotState.id}</span>
                        </div>

                        <p className="text-xs text-gray-400 leading-relaxed font-mono">
                          Switch execution states. The runtime engine automatically establishes platform listeners, processes incoming callbacks, and issues generative text responses on behalf of your SaaS profile.
                        </p>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                          <button
                            id="btn-bot-start"
                            onClick={() => triggerLifecycleAction(editedBotState.id, 'start')}
                            disabled={editedBotState.status === 'active'}
                            className={`p-3 rounded-xl flex flex-col items-center justify-center gap-2 border font-mono transition-all cursor-pointer ${
                              editedBotState.status === 'active'
                              ? 'bg-transparent text-gray-600 border-gray-900 cursor-not-allowed'
                              : 'bg-[#00FFC6]/10 hover:bg-[#00FFC6]/25 border-[#00FFC6]/40 text-[#00FFC6] text-[#00FFC6]'
                            }`}
                          >
                            <Play className="w-5 h-5 text-[#00FFC6]" />
                            <span className="text-[10px] font-bold">START BOT</span>
                          </button>

                          <button
                            id="btn-bot-pause"
                            onClick={() => triggerLifecycleAction(editedBotState.id, 'pause')}
                            disabled={editedBotState.status !== 'active'}
                            className={`p-3 rounded-xl flex flex-col items-center justify-center gap-2 border font-mono transition-all cursor-pointer ${
                              editedBotState.status !== 'active'
                              ? 'bg-transparent text-gray-600 border-gray-900 cursor-not-allowed'
                              : 'bg-amber-500/10 hover:bg-amber-500/25 border-amber-500/40 text-amber-500'
                            }`}
                          >
                            <Pause className="w-5 h-5 text-amber-500" />
                            <span className="text-[10px] font-bold">PAUSE BOT</span>
                          </button>

                          <button
                            id="btn-bot-stop"
                            onClick={() => triggerLifecycleAction(editedBotState.id, 'stop')}
                            disabled={editedBotState.status === 'stopped'}
                            className={`p-3 rounded-xl flex flex-col items-center justify-center gap-2 border font-mono transition-all cursor-pointer ${
                              editedBotState.status === 'stopped'
                              ? 'bg-transparent text-gray-600 border-gray-900 cursor-not-allowed'
                              : 'bg-red-500/10 hover:bg-red-500/25 border-red-500/40 text-red-400'
                            }`}
                          >
                            <Square className="w-5 h-5 text-red-500" />
                            <span className="text-[10px] font-bold">SUSPEND BOT</span>
                          </button>

                          <button
                            id="btn-bot-restart"
                            onClick={() => triggerLifecycleAction(editedBotState.id, 'restart')}
                            className="p-3 bg-blue-500/10 hover:bg-blue-500/25 border border-blue-500/40 text-blue-400 hover:text-white rounded-xl flex flex-col items-center justify-center gap-2 font-mono transition-all cursor-pointer"
                          >
                            <RefreshCw className="w-5 h-5 text-blue-400" />
                            <span className="text-[10px] font-bold">RESTART ENG</span>
                          </button>
                        </div>
                      </div>

                      {/* Info Cards / Vital metrics */}
                      <div className={`grid grid-cols-1 ${editedBotState.enableMemory ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-4`}>
                        <div className="cyber-glass rounded-xl p-5 border border-gray-800 flex items-center gap-4">
                          <div className="p-3 bg-[#151C2E] border border-gray-800 rounded-xl text-amber-400 shrink-0">
                            <Clock className="w-6 h-6" />
                          </div>
                          <div>
                            <span className="text-[10px] font-mono uppercase text-gray-500 block tracking-wider font-bold">UPTIME INDICATOR</span>
                            <span className="text-base font-bold text-white font-mono mt-1 block">
                              {editedBotState.status === 'active' 
                                ? `${Math.floor(editedBotState.uptime / 3600)}h ${Math.floor((editedBotState.uptime % 3600) / 60)}m ${editedBotState.uptime % 60}s` 
                                : 'Inactive posture'
                              }
                            </span>
                          </div>
                        </div>

                        <div className="cyber-glass rounded-xl p-5 border border-gray-800 flex items-center gap-4">
                          <div className="p-3 bg-[#151C2E] border border-gray-800 rounded-xl text-blue-400 shrink-0">
                            <Activity className="w-6 h-6" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-[10px] font-mono uppercase text-gray-500 block tracking-wider font-bold">SESSION RUNS</span>
                            <span className="text-base font-bold text-white font-mono mt-1 block">
                              {editedBotState.totalMessagesProcessed} inquiries logged
                            </span>
                          </div>
                        </div>

                        {editedBotState.enableMemory && (
                          <div className="cyber-glass rounded-xl p-5 border border-gray-800 flex items-center gap-4 animate-in zoom-in-95 duration-200">
                            <div className="p-3 bg-[#151C2E] border border-gray-800 rounded-xl text-[#00FFC6] shrink-0">
                              <Database className="w-6 h-6" />
                            </div>
                            <div className="min-w-0">
                              <span className="text-[10px] font-mono uppercase text-[#00FFC6] block tracking-wider font-bold">COGNITIVE INDEX</span>
                              <span className="text-base font-bold text-white font-mono mt-1 block">
                                {(editedBotState.memoryUsedMb || 0).toFixed(1)} MB USED
                              </span>
                              <span className="text-[9px] text-gray-500 font-mono block">
                                of {accountMaxMemoryMb} MB total limit
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Operational health diagnostics */}
                    <div className="cyber-glass rounded-2xl p-5 border border-gray-800 space-y-4">
                      <h3 className="font-bold text-white text-xs font-mono uppercase tracking-widest border-b border-gray-800 pb-3 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-[#00FFC6]" /> Diagnostic Status
                      </h3>
                      
                      <div className="space-y-3.5 text-xs font-mono leading-loose">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Node Status:</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            editedBotState.status === 'active' ? 'text-[#00FFC6] bg-[#00FFC6]/10' : 'text-gray-400 bg-[#151C2E]'
                          }`}>
                            {editedBotState.status === 'active' ? 'ONLINE_MUTEX' : 'SUSPENDED_SOCKET'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Webhook Connection:</span>
                          <span className="text-white text-right">
                            {editedBotState.platform === 'telegram' && editedBotState.telegramToken ? "SECURE_HOOK" : 
                             editedBotState.platform === 'whatsapp' && editedBotState.whatsappConnected ? "CONNECTED" : "DISCONNECTED"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">API Gateway Source:</span>
                          <span className="text-white uppercase font-bold">{editedBotState.aiSource}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Model Framework:</span>
                          <span className="text-[11px] text-[#00FFC6]">{editedBotState.aiModel}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Security Encrypt:</span>
                          <span className="text-green-400 flex items-center gap-1"><Shield className="w-3.5 h-3.5 shrink-0" /> AES_256_SSL</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB WINDOW 2: AI BRAIN CONFIGURATION */}
                {activeBotTab === 'ai-brain' && (
                  <div className="cyber-glass rounded-2xl p-6 border border-gray-800 space-y-6">
                    <div className="border-b border-gray-800 pb-3">
                      <h3 className="font-bold text-white text-sm flex items-center gap-2 font-mono uppercase tracking-wide">
                        <Cpu className="w-5 h-5 text-[#00FFC6]" /> Neural Engine Selector
                      </h3>
                      <p className="text-xs text-gray-400 mt-1">Configure which AI provider maps input to response generation.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Left: Engine selection checkboxes */}
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-mono uppercase text-gray-400 mb-2">AI Source Provider</label>
                          <div className="grid grid-cols-1 gap-3">
                            {[
                              { id: 'gemini', label: 'Google Gemini', desc: 'Secure enterprise cognitive models (exclusively available)' }
                            ].map(provider => (
                              <div
                                key={provider.id}
                                id={`selector-provider-${provider.id}`}
                                onClick={() => handleSourceChangeInEditor(provider.id as any)}
                                className={`p-3.5 rounded-xl border cursor-pointer transition-all bg-[#151C2E] border-[#00FFC6] text-white shadow-[0_0_15px_rgba(0,255,198,0.05)]`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className="h-4 w-4 rounded-full border-2 p-0.5 flex items-center justify-center border-[#00FFC6]">
                                    <div className="h-2 w-2 rounded-full bg-[#00FFC6]"></div>
                                  </div>
                                  <span className="text-xs font-bold font-mono tracking-wide">{provider.label}</span>
                                </div>
                                <p className="text-[10px] text-[#00FFC6] font-mono mt-1 pl-6">{provider.desc}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-mono uppercase text-gray-400 mb-2">Active AI Model</label>
                          <select
                            id="editing-ai-model-select"
                            value={editedBotState.aiModel}
                            onChange={(e) => setEditedBotState({ ...editedBotState, aiModel: e.target.value })}
                            className="w-full bg-[#07090F] border border-gray-800 focus:border-[#00FFC6] focus:ring-1 focus:ring-[#00FFC6]/30 text-gray-200 text-sm p-2.5 rounded-xl outline-none font-mono tracking-wide"
                          >
                            {getModelsForSource(editedBotState.aiSource).map(m => {
                              let label = m;
                              if (m === 'gemini-3.5-flash') label = `${m} (Free Tier - 0¢/msg)`;
                              if (m === 'gemini-3.1-flash-lite') label = `${m} (Ultra Lite - 0¢/msg)`;
                              if (m === 'gemini-3.1-pro-preview') label = `${m} (Advanced Pro - Paid/Developer Key)`;
                              return <option key={m} value={m}>{label}</option>;
                            })}
                          </select>
                        </div>

                        {/* Tool Belt Configuration (Google Search & Code Interpreter) */}
                        <div className="bg-[#151C2E]/20 border border-gray-800/80 p-4 rounded-xl space-y-4">
                          <label className="block text-xs font-mono uppercase text-gray-400 font-bold tracking-wide">
                            AI Grounding & Sandbox Tools
                          </label>
                          <p className="text-[10px] text-gray-500 font-mono -mt-1 leading-relaxed">
                            Configure advanced tool belt execution packages for standard models processing platform inquiries.
                          </p>

                          <div className="space-y-3">
                            {/* Google Search Switch */}
                            <div className="flex items-center justify-between p-2 rounded-lg bg-[#07090F]/60 border border-gray-800 hover:border-gray-700 transition-all">
                              <div className="flex items-start gap-2.5">
                                <span className={`p-1.5 rounded-md ${editedBotState?.enableGoogleSearch ? 'bg-[#00FFC6]/10 text-[#00FFC6]' : 'bg-gray-950 text-gray-500'}`}>
                                  <Globe className="w-4 h-4" />
                                </span>
                                <div>
                                  <div className="text-xs font-bold text-white font-mono uppercase">Google Search Grounding</div>
                                  <div className="text-[10px] text-gray-400">Fetch real-time world knowledge & live events</div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setEditedBotState(editedBotState ? { 
                                  ...editedBotState, 
                                  enableGoogleSearch: !editedBotState.enableGoogleSearch 
                                } : null)}
                                className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${
                                  editedBotState?.enableGoogleSearch ? 'bg-[#00FFC6]' : 'bg-gray-800'
                                }`}
                              >
                                <div className={`bg-black w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${
                                  editedBotState?.enableGoogleSearch ? 'translate-x-5' : 'translate-x-0'
                                }`} />
                              </button>
                            </div>

                            {/* Code Execution Switch */}
                            <div className="flex items-center justify-between p-2 rounded-lg bg-[#07090F]/60 border border-gray-800 hover:border-gray-700 transition-all">
                              <div className="flex items-start gap-2.5">
                                <span className={`p-1.5 rounded-md ${editedBotState?.enableCodeExecution ? 'bg-[#00FFC6]/10 text-[#00FFC6]' : 'bg-gray-950 text-gray-500'}`}>
                                  <Terminal className="w-4 h-4" />
                                </span>
                                <div>
                                  <div className="text-xs font-bold text-white font-mono uppercase">Sandbox Code Execution</div>
                                  <div className="text-[10px] text-gray-400">Solve complex math, strings & logic in python sandbox</div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setEditedBotState(editedBotState ? { 
                                  ...editedBotState, 
                                  enableCodeExecution: !editedBotState.enableCodeExecution 
                                } : null)}
                                className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${
                                  editedBotState?.enableCodeExecution ? 'bg-[#00FFC6]' : 'bg-gray-800'
                                }`}
                              >
                                <div className={`bg-black w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${
                                  editedBotState?.enableCodeExecution ? 'translate-x-5' : 'translate-x-0'
                                }`} />
                              </button>
                            </div>

                            {/* Cognitive Memory Network Switch */}
                            <div className="flex items-center justify-between p-2 rounded-lg bg-[#07090F]/60 border border-gray-800 hover:border-gray-700 transition-all">
                              <div className="flex items-start gap-2.5">
                                <span className={`p-1.5 rounded-md ${editedBotState?.enableMemory ? 'bg-[#00FFC6]/10 text-[#00FFC6]' : 'bg-gray-950 text-gray-500'}`}>
                                  <Database className="w-4 h-4" />
                                </span>
                                <div>
                                  <div className="text-xs font-bold text-white font-mono uppercase flex items-center gap-1.5">
                                    Cognitive Memory store
                                    {editedBotState?.enableMemory && (
                                      <span className="text-[9px] bg-[#00FFC6]/10 border border-[#00FFC6]/30 text-[#00FFC6] px-1 rounded font-mono font-bold">
                                        {(editedBotState.memoryUsedMb || 0).toFixed(1)} MB
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-gray-400">Enable long-term knowledge retention across conversational histories</div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setEditedBotState(editedBotState ? { 
                                  ...editedBotState, 
                                  enableMemory: !editedBotState.enableMemory 
                                } : null)}
                                className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${
                                  editedBotState?.enableMemory ? 'bg-[#00FFC6]' : 'bg-gray-800'
                                }`}
                              >
                                <div className={`bg-black w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${
                                  editedBotState?.enableMemory ? 'translate-x-5' : 'translate-x-0'
                                }`} />
                              </button>
                            </div>

                            {/* Particular bot memory footprint info & manual Reset button */}
                            {editedBotState?.enableMemory && (
                              <div className="text-[11px] font-mono bg-black/40 px-3 py-2 rounded-xl border border-gray-800 flex items-center justify-between animate-in fade-in duration-300">
                                <div className="space-y-0.5">
                                  <span className="text-gray-500 text-[10px] block uppercase font-bold">BOT MEMORY USAGE</span>
                                  <div className="flex items-center gap-1.5 font-bold text-white">
                                    <HardDrive className="w-3.5 h-3.5 text-[#00FFC6]" />
                                    {(editedBotState.memoryUsedMb || 0).toFixed(2)} MB FOOTPRINT
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (window.confirm("Flush cognitive file cells for this chatbot? Long-term memory records will be irreversibly erased.")) {
                                      try {
                                        const res = await authFetch(`/api/bots/${editedBotState.id}/memory`, { method: 'DELETE' });
                                        if (res.ok) {
                                          const data = await res.json();
                                          showNotification(data.message || "Brain variables flushed.", "success");
                                          setEditedBotState(prev => prev ? { ...prev, memoryUsedMb: 0.0 } : null);
                                          fetchAllData();
                                        }
                                      } catch (e) {
                                        showNotification("Error wiping memory registers", "error");
                                      }
                                    }
                                  }}
                                  className="text-[10px] font-bold text-rose-400 border border-rose-500/25 bg-rose-500/5 hover:bg-rose-500/10 px-2 py-1 rounded-md transition-colors cursor-pointer"
                                >
                                  Wipe Memory
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: API credentials input */}
                      <div className="space-y-4 bg-[#151C2E]/30 p-5 rounded-2xl border border-gray-800/80">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-mono uppercase text-gray-400 flex items-center gap-1.5 font-bold">
                            <Key className="w-4 h-4 text-amber-400" /> Platform API Security Credentials
                          </label>
                          <span className="text-[10px] text-gray-500 font-mono text-right">AES_256 Encrypted</span>
                        </div>

                        <p className="text-[11px] leading-relaxed font-mono text-amber-400">
                          To connect your custom agent profile directly, you <strong>MUST</strong> specify your own private Gemini API access token here. For key security and quota isolation, each user operates strictly on their own API credentials. Leaving this blank or using default placeholders will result in an API error.
                        </p>

                        {editedBotState.aiSource !== 'freeapi' && (
                          <div className="relative">
                            <input
                              id="editing-api-key-input"
                              type={showApiKey ? "text" : "password"}
                              placeholder="Enter API token key... (e.g., sk-proj-...)"
                              value={editedBotState.apiKey}
                              onChange={(e) => setEditedBotState({ ...editedBotState, apiKey: e.target.value })}
                              className="w-full bg-[#07090F] border border-gray-800 focus:border-[#00FFC6] text-gray-100 text-xs pl-4 pr-11 py-3 rounded-xl outline-none font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => setShowApiKey(!showApiKey)}
                              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                            >
                              {showApiKey ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                            </button>
                          </div>
                        )}

                        {/* Pollinations Image Generation Section */}
                        <div className="border-t border-gray-800/60 pt-4 space-y-4 font-sans">
                          <div className="flex items-center justify-between">
                            <div className="flex items-start gap-2.5">
                              <span className={`p-1.5 rounded-md ${editedBotState?.enableImageGen ? 'bg-[#00FFC6]/10 text-[#00FFC6]' : 'bg-gray-950 text-gray-500'}`}>
                                <ImageIcon className="w-4 h-4" />
                              </span>
                              <div>
                                <div className="text-xs font-bold text-white font-mono uppercase">Image Generation Integration</div>
                                <div className="text-[10px] text-gray-400 font-mono">Generate creative graphics via pollinations AI</div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setEditedBotState(editedBotState ? { 
                                ...editedBotState, 
                                enableImageGen: !editedBotState.enableImageGen 
                              } : null)}
                              className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${
                                editedBotState?.enableImageGen ? 'bg-[#00FFC6]' : 'bg-gray-800'
                              }`}
                            >
                              <div className={`bg-black w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${
                                editedBotState?.enableImageGen ? 'translate-x-5' : 'translate-x-0'
                              }`} />
                            </button>
                          </div>

                          {editedBotState?.enableImageGen && (
                            <div className="space-y-3.5 animate-in fade-in duration-300">
                              <div>
                                <label className="block text-[10px] font-mono uppercase text-gray-400 mb-1.5">Pollinations Model Choice</label>
                                <select
                                  id="editing-pollinations-model-select"
                                  value={editedBotState.pollinationsModel || "flux"}
                                  onChange={(e) => setEditedBotState({ ...editedBotState, pollinationsModel: e.target.value })}
                                  className="w-full bg-[#07090F] border border-gray-800 focus:border-[#00FFC6] text-gray-200 text-xs p-2.5 rounded-xl outline-none font-mono"
                                >
                                  <option value="flux">flux (Default Standard)</option>
                                  <option value="flux-realism">flux-realism (Photorealistic)</option>
                                  <option value="flux-anime">flux-anime (Anime / Manga style)</option>
                                  <option value="flux-3d">flux-3d (3D Render style)</option>
                                  <option value="any-dark">any-dark (Chiaroscuro / Dark cinematic)</option>
                                  <option value="turbo">turbo (Ultra-low latency generation)</option>
                                  <option value="sana">sana (Creative Artistic representation)</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-[10px] font-mono uppercase text-gray-400 mb-1.5">Pollinations API Key (Optional)</label>
                                <input
                                  id="editing-pollinations-api-key-input"
                                  type="password"
                                  placeholder="Bearer authentication token (optional)..."
                                  value={editedBotState.pollinationsApiKey || ""}
                                  onChange={(e) => setEditedBotState({ ...editedBotState, pollinationsApiKey: e.target.value })}
                                  className="w-full bg-[#07090F] border border-gray-800 focus:border-[#00FFC6] text-gray-100 text-xs px-3.5 py-2.5 rounded-xl outline-none font-mono"
                                />
                                <span className="text-[9px] text-gray-500 font-mono mt-1 block">
                                  Standard pollinations is fully free and public. Provide key only if using custom paid/pro endpoints.
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="pt-4 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono">
                            <Shield className="w-3.5 h-3.5 text-green-400" />
                            <span>Vault Storage: Signed SSL Client</span>
                          </div>
                          
                          <button
                            id="btn-save-ai-presets"
                            onClick={saveEngineConfiguration}
                            disabled={isSavingConfig}
                            className="py-2 px-4 bg-[#00FFC6] text-[#07090F] font-bold text-xs rounded-xl shadow-[0_4px_15px_rgba(0,255,198,0.15)] flex items-center gap-1.5 hover:opacity-90 cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4" /> 
                            {isSavingConfig ? "Syncing Tools & Presets..." : "Commit AI Config & Tool Belt"}
                          </button>
                        </div>
                      </div>

                    </div>
                  </div>
                )}

                {/* TAB WINDOW 3: BOT BEHAVIOR SETTINGS */}
                {activeBotTab === 'behavior' && (
                  <div className="cyber-glass rounded-2xl p-6 border border-[#00FFC6]/20 bg-[#0E131F] space-y-6">
                    <div className="border-b border-gray-800 pb-3 flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-white text-sm flex items-center gap-2 font-mono uppercase tracking-wide">
                          <MessageSquare className="w-5 h-5 text-[#00FFC6]" /> Core AI Personality Rules
                        </h3>
                        <p className="text-xs text-gray-400 mt-1">Configure tone of voice, greeting scripts, and contextual main system prompts.</p>
                      </div>
                      
                      <button
                        id="btn-save-behavior-top"
                        onClick={saveEngineConfiguration}
                        disabled={isSavingConfig}
                        className="py-1.5 px-3 bg-[#00FFC6] hover:bg-[#00D7A7] text-black font-semibold text-xs rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                      >
                        {isSavingConfig ? "Saving..." : "Save Rules"}
                      </button>
                    </div>

                    <div className="space-y-4">
                      {/* Greeting Message */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-mono uppercase text-gray-400 font-semibold">User Welcome Greeting Message</label>
                        <p className="text-[10px] text-gray-500 font-mono">This is the introductory message broadcasted when your customer speaks to your channel webhook for the first time.</p>
                        <input
                          id="editing-greeting-message"
                          type="text"
                          value={editedBotState.greetingMessage}
                          onChange={(e) => setEditedBotState({ ...editedBotState, greetingMessage: e.target.value })}
                          placeholder="e.g., Welcome to Delta Technical workspace! Ready to analyze your server deployments."
                          className="w-full bg-[#07090F] border border-gray-800 focus:border-[#00FFC6] focus:ring-1 focus:ring-[#00FFC6]/30 text-gray-200 text-xs p-3 rounded-xl outline-none font-mono"
                        />
                      </div>

                      {/* Custom Instructions */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-mono uppercase text-gray-400 font-semibold">Custom Persona guidelines & instructions</label>
                        <p className="text-[10px] text-gray-500 font-mono">Define unique behavioral parameters (e.g. use technical definitions, include emojies, ask questions, explain logic step-by-step).</p>
                        <textarea
                          id="editing-custom-instructions"
                          rows={4}
                          value={editedBotState.customInstructions}
                          onChange={(e) => setEditedBotState({ ...editedBotState, customInstructions: e.target.value })}
                          placeholder="e.g., Guide users through debugging their deployments gracefully. Offer practical fixes: check configurations, rebuild containers, or contact an engineering specialist if complex issues persist."
                          className="w-full bg-[#07090F] border border-gray-800 focus:border-[#00FFC6] focus:ring-1 focus:ring-[#00FFC6]/30 text-gray-200 text-xs p-3 rounded-xl outline-none font-mono resize-y"
                        />
                      </div>

                      {/* System Main Prompt */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-mono uppercase text-gray-400 font-semibold">System Main Prompt (Highest Priority Model Ruleset)</label>
                        <p className="text-[10px] text-gray-500 font-mono">The foundational context which directs the core intelligence scope. Handled server-side before other statements.</p>
                        <textarea
                          id="editing-system-prompt"
                          rows={5}
                          value={editedBotState.systemPrompt}
                          onChange={(e) => setEditedBotState({ ...editedBotState, systemPrompt: e.target.value })}
                          placeholder="e.g., You are the head technical support bot for a software house called CloudCraft. Your goal is to guide users through debugging their deployments gracefully."
                          className="w-full bg-[#07090F] border border-gray-800 focus:border-[#00FFC6] focus:ring-1 focus:ring-[#00FFC6]/30 text-gray-200 text-xs p-3 rounded-xl outline-none font-mono resize-y"
                        />
                      </div>
                    </div>

                    <div className="border-t border-gray-800/80 pt-4 flex items-center justify-between">
                      <span className="text-[11px] text-gray-500 font-mono">Saved instructions automatically persist in secure database cache.</span>
                      <button
                        id="btn-save-behavior-bottom"
                        onClick={saveEngineConfiguration}
                        disabled={isSavingConfig}
                        className="py-2.5 px-5 bg-gradient-to-r from-[#00FFC6] to-blue-500 text-[#07090F] hover:shadow-lg font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {isSavingConfig ? "Updating cache..." : "Commit Instructions Cache"}
                      </button>
                    </div>
                  </div>
                )}

                {/* TAB WINDOW 4: CHANNEL PLATFORM INTEGRATION PAGES */}
                {activeBotTab === 'integration' && (
                  <div className="space-y-6">
                    
                    {/* Platform Connection Settings */}
                    <div className="cyber-glass rounded-2xl p-6 border border-gray-800 space-y-6">
                      <div className="border-b border-gray-800 pb-3 flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-white text-sm flex items-center gap-2 font-mono uppercase tracking-wide">
                            <Smartphone className="w-5 h-5 text-[#00FFC6]" /> Channel Configuration Hub
                          </h3>
                          <p className="text-xs text-gray-400 mt-1">Configure Webhook callback channels and credential handshakes specifically for {editedBotState.platform.toUpperCase()}.</p>
                        </div>
                        <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-[#111] border border-gray-800 text-white font-bold">
                          {editedBotState.platform} GATEWAY
                        </span>
                      </div>

                      {/* Platform Specific Form UI */}
                      <div className="max-w-2xl space-y-6">
                        
                        {/* A. TELEGRAM SPECIFIC PAGE */}
                        {editedBotState.platform === 'telegram' && (
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <label className="block text-xs font-mono uppercase text-gray-400">Telegram Botfather Token</label>
                              <p className="text-[10px] text-gray-500 font-mono">Create an agent profile with Telegram @BotFather, retrieve the token parameter, and bind it in the matrix.</p>
                              <input
                                id="telegram-token-input"
                                type="text"
                                placeholder="e.g., 872391039:AAEfgH10JK90LmpQrStuVwXyz"
                                value={editedBotState.telegramToken || ''}
                                onChange={(e) => setEditedBotState({ ...editedBotState, telegramToken: e.target.value })}
                                className="w-full bg-[#07090F] border border-gray-800 focus:border-[#00FFC6] text-gray-200 text-xs p-3 rounded-xl outline-none font-mono"
                              />
                            </div>
                          </div>
                        )}

                        {/* B. WHATSAPP SPECIFIC PAGE */}
                        {editedBotState.platform === 'whatsapp' && (
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <label className="block text-xs font-mono uppercase text-gray-400">WhatsApp Link Phone Number (Numbers only)</label>
                              <p className="text-[10px] text-gray-500 font-mono">Include country code first (e.g. 447911123456 or 14155552671). Do not include spacing or symbols.</p>
                              <div className="flex gap-2">
                                <input
                                  id="whatsapp-num-input"
                                  type="text"
                                  placeholder="e.g., 447911123456"
                                  value={whatsappLinkNumber}
                                  onChange={(e) => setWhatsappLinkNumber(e.target.value)}
                                  className="flex-1 bg-[#07090F] border border-gray-800 focus:border-[#00FFC6] text-gray-200 text-xs p-3 rounded-xl outline-none font-mono"
                                />
                                <button
                                  type="button"
                                  onClick={handleGetPairingCode}
                                  disabled={isGeneratingPairingCode || !whatsappLinkNumber}
                                  className="px-4 py-3 bg-[#00FFC6]/10 hover:bg-[#00FFC6]/20 text-[#00FFC6] font-mono text-xs rounded-xl border border-[#00FFC6]/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isGeneratingPairingCode ? "GENERATING..." : "REQUEST PAIRING CODE"}
                                </button>
                              </div>
                            </div>

                            <div className="bg-[#151C2E] p-4.5 rounded-xl border border-gray-800 space-y-3 font-mono text-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-white text-xs">DYNAMIC LINK MODULE (@whiskeysockets/baileys)</span>
                                <span className={`h-2 w-2 rounded-full ${editedBotState.whatsappConnected ? 'bg-green-400' : 'bg-amber-400'} pulse-cyber`}></span>
                              </div>
                              <p className="text-[11px] text-gray-400 leading-relaxed">
                                Establish communication hooks with WhatsApp Multi-device Web socket securely using Baileys token engine.
                              </p>
                              
                              <div className="p-3 bg-black/50 rounded border border-gray-800 text-[#00FFC6] flex items-center justify-between">
                                <div>
                                  <span className="text-[10px] text-gray-400 block pb-1">PAIRING SYNC CODE:</span>
                                  <span className="text-sm font-bold tracking-widest">{editedBotState.whatsappPairingCode || 'AWAITING INPUT'}</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-[10px] text-gray-400 block pb-0.5">PLATFORM LINK:</span>
                                  <span className={`text-[10px] font-bold ${editedBotState.whatsappConnected ? 'text-green-400' : 'text-amber-400'}`}>
                                    {editedBotState.whatsappConnected ? 'CONNECTED' : 'DISCONNECTED'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <label className="flex items-center gap-2 text-xs font-mono uppercase text-gray-400">
                                <input
                                  id="whatsapp-connected-check"
                                  type="checkbox"
                                  checked={editedBotState.whatsappConnected || false}
                                  onChange={(e) => setEditedBotState({ ...editedBotState, whatsappConnected: e.target.checked })}
                                  className="w-4 h-4 rounded accent-[#00FFC6]"
                                />
                                Account Hook Registered & Connected in SaaS Cluster
                              </label>
                            </div>
                          </div>
                        )}



                        {/* Connection Test Sandbox Console */}
                        <div className="border-t border-gray-800 pt-5 space-y-4">
                          <label className="block text-xs font-mono uppercase text-gray-400 font-semibold mb-2">Platform Connection Sandbox & Testing Suite</label>
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              id="btn-test-platform-conn"
                              onClick={testPlatformConnection}
                              disabled={testingPlatform}
                              className="py-2.5 px-4 bg-transparent border border-[#00FFC6]/60 text-[#00FFC6] hover:bg-[#00FFC6]/5 font-mono text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <RefreshCw className={`w-4 h-4 ${testingPlatform ? 'animate-spin' : ''}`} />
                              {testingPlatform ? "Simulating Handshake..." : "Test Platform Connection"}
                            </button>

                            <button
                              id="btn-save-integration-config"
                              onClick={saveEngineConfiguration}
                              disabled={isSavingConfig}
                              className="py-2.5 px-4 bg-[#00FFC6] text-[#07090F] font-bold text-xs rounded-xl flex items-center gap-1.5 hover:opacity-90 cursor-pointer"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Save Channel Config
                            </button>
                          </div>

                          {testResult && (
                            <div className={`p-4 rounded-xl border font-mono text-xs ${
                              testResult.success 
                              ? 'bg-[#151C2E] border-green-500/50 text-green-400' 
                              : 'bg-[#151C2E] border-rose-500/50 text-rose-400'
                            }`}>
                              <span className="font-bold uppercase tracking-widest block mb-1">
                                [CHANNEL ENGINE RESULT: {testResult.success ? "SUCCESS" : "FAILURE"}]
                              </span>
                              <p className="text-[11px] leading-relaxed">{testResult.reason}</p>
                            </div>
                          )}
                        </div>

                      </div>
                    </div>

                    {/* QR Code / Mobile Simulator Mock (Only showing for WhatsApp pairing) */}
                    {editedBotState.platform === 'whatsapp' && (
                      <div className="cyber-glass rounded-2xl p-6 border border-gray-800 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                        <div className="col-span-1 flex flex-col items-center text-center">
                          <span className="text-[10px] text-gray-500 font-mono mb-2 uppercase">VIRTUAL SCAN QR CODE</span>
                          <div className="bg-white p-3 rounded-xl inline-block shadow-inner">
                            {/* Visual custom QR simulation using grid pixel divs */}
                            <div className="grid grid-cols-6 gap-0.5 h-32 w-32 bg-black p-1">
                              {[...Array(36)].map((_, i) => (
                                <div 
                                  key={i} 
                                  className={`rounded-xs ${
                                    i % 3 === 0 || i < 10 || i > 25 || (i > 14 && i < 20)
                                    ? 'bg-[#0E131F]' 
                                    : 'bg-white'
                                  }`}
                                ></div>
                              ))}
                            </div>
                          </div>
                          <p className="text-[9px] text-[#00FFC6] font-mono mt-2 tracking-wide uppercase">WHATSAPP WEB QR FRAME</p>
                        </div>
                        <div className="md:col-span-2 space-y-3 font-mono text-xs">
                          <h4 className="font-bold text-white flex items-center gap-1.5">
                            <Smartphone className="w-4 h-4 text-[#00FFC6]" /> How to pair WhatsApp via barcode scanner:
                          </h4>
                          <p className="text-gray-400 text-[11px] leading-relaxed">
                            1. Open WhatsApp messenger on your mobile device.<br />
                            2. Access Linked Devices → Bind New Node.<br />
                            3. Select scanning workflow, or type the pairing synchronization code <b className="text-white bg-[#151C2E] border border-gray-800 px-1.5 py-0.5 rounded font-bold">{editedBotState.whatsappPairingCode || 'K7R8-XM9P'}</b>.<br />
                            4. Handshake finishes automatically under 30 seconds.
                          </p>
                        </div>
                      </div>
                    )}

                  </div>
                )}

                {/* TAB WINDOW 5: INQUIRY PLAYGROUND & LIVE BOT LOGS */}
                {activeBotTab === 'playground' && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Log Queue terminal console */}
                    <div className="lg:col-span-2 cyber-glass rounded-2xl p-5 border border-gray-800 flex flex-col min-h-[500px] lg:h-[580px]">
                      <div className="flex items-center justify-between border-b border-gray-800 pb-3 mb-4">
                        <h3 className="font-bold text-white text-xs font-mono uppercase tracking-widest flex items-center gap-2">
                          <Logs className="w-4 h-4 text-amber-500" /> Operational Message Logs
                        </h3>
                        <span className="text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded font-mono uppercase tracking-widest">
                          LIVE STREAM
                        </span>
                      </div>

                      <div className="flex-1 bg-black/60 border border-gray-800 rounded-xl p-4 overflow-y-auto max-h-[460px] flex flex-col gap-3 font-mono text-[11px] leading-relaxed">
                        {selectedBotLogs.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 py-12">
                            <Activity className="w-8 h-8 text-gray-700 mb-2 animate-pulse shrink-0" />
                            <span>Cluster connection established under inactive channel hook. No traffic logs detected in stack.</span>
                            <span className="text-[10px] text-gray-600 mt-2">Trigger queries via the sandbox simulator on the right pane!</span>
                          </div>
                        ) : (
                          selectedBotLogs.map((log) => (
                            <div 
                              key={log.id} 
                              className={`p-3 rounded-lg border leading-relaxed ${
                                log.direction === 'in' 
                                  ? 'bg-[#151C2E]/40 border-gray-800 text-gray-200' 
                                  : log.direction === 'out'
                                  ? 'bg-[#00FFC6]/5 border-[#00FFC6]/20 text-white shadow-sm'
                                  : 'bg-red-500/[0.04] border-red-950 text-amber-500'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1.5 text-[9px] text-gray-500">
                                <div className="flex items-center gap-1.5">
                                  <span className={`h-1.5 w-1.5 rounded-full ${
                                    log.direction === 'in' ? 'bg-indigo-400' : log.direction === 'out' ? 'bg-[#00FFC6]' : 'bg-rose-500'
                                  }`}></span>
                                  <span className="font-extrabold uppercase tracking-widest">
                                    {log.direction === 'in' ? 'CALLBACK: INCOMING' : log.direction === 'out' ? 'AI DISPATCH: OUTGOING' : 'SYSTEM EXCEPTION'}
                                  </span>
                                </div>
                                <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                              </div>

                              <div className="flex items-start gap-1 justify-between text-xs">
                                <span className="font-bold text-gray-400 font-mono">{log.sender}:</span>
                              </div>
                              {renderMessageTextWithImages(log.text, "mt-1 text-gray-100 whitespace-pre-wrap")}

                              {log.modelUsed && (
                                <div className="mt-2 text-[8px] text-[#00FFC6] tracking-wider uppercase flex items-center justify-between font-mono gap-1 border-t border-gray-800/60 pt-1.5">
                                  <span>EVAL MODEL: {log.modelUsed}</span>
                                  <span>STATUS: RESOLVED_OK</span>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                        <div ref={logBottomRef}></div>
                      </div>

                      <div className="mt-4 flex items-center justify-between text-[10px] text-gray-500 font-mono">
                        <span>Monitoring live callback event loops</span>
                        <span>Auto Scroll: Enabled</span>
                      </div>
                    </div>

                    {/* Interactive Sandbox Simulator Panel */}
                    <div className="cyber-glass rounded-2xl p-5 border border-gray-800 flex flex-col min-h-[500px] lg:h-[580px]">
                      <div className="border-b border-gray-800 pb-3 mb-4">
                        <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">CHANNEL SIMULATION ENGINE</span>
                        <h3 className="font-bold text-white text-xs font-mono uppercase tracking-widest flex items-center gap-1">
                          <Zap className="w-4 h-4 text-[#00FFC6]" /> Playground Sandbox
                        </h3>
                      </div>

                      <p className="text-[11px] leading-relaxed font-mono text-gray-400 mb-4">
                        Mock client communication in real-time. Type questions to evaluate the bot instructions, greeting parameters, or key bindings directly before launching public webhooks.
                      </p>

                      {/* Playground Messages */}
                      <div className="flex-1 bg-black/40 border border-gray-800/80 rounded-xl p-3 overflow-y-auto mb-4 font-mono text-[10px] flex flex-col gap-3 max-h-[300px] lg:max-h-[350px]">
                        <div className="p-2.5 rounded bg-gray-900/60 border border-gray-800 text-gray-400">
                          <span className="font-bold text-slate-300 block mb-1">SYSTEM HANDSHAKE DIAGNOSTIC:</span>
                          AI Model mapping verified. Personality constraints compiled. Send a user inquiry to trigger processing sequence.
                        </div>

                        {/* Simulate showing greeting on first run */}
                        <div className="p-2.5 rounded bg-[#00FFC6]/5 border border-[#00FFC6]/20 text-white">
                          <span className="font-bold text-[#00FFC6] block mb-1">{editedBotState.name} greeting prompt:</span>
                          "{editedBotState.greetingMessage}"
                        </div>

                        {selectedBotLogs
                          .filter(l => l.direction === 'in' || l.direction === 'out')
                          .slice(-4)
                          .map(chat => (
                            <div 
                              key={chat.id} 
                              className={`p-2.5 rounded border ${
                                chat.direction === 'in' 
                                  ? 'bg-[#151C2E]/60 border-gray-800 text-gray-200 self-end max-w-[90%]' 
                                  : 'bg-[#00FFC6]/5 border-[#00FFC6]/10 text-white self-start max-w-[90%]'
                              }`}
                            >
                              <span className={`font-bold block mb-1 ${chat.direction === 'in' ? 'text-indigo-400' : 'text-[#00FFC6]'}`}>
                                {chat.direction === 'in' ? 'You' : chat.sender}
                              </span>
                              {renderMessageTextWithImages(chat.text, "text-[11px] leading-normal")}
                            </div>
                        ))}
                        <div ref={chatBottomRef}></div>
                      </div>

                      {/* Message Input Form */}
                      <form onSubmit={handleSendMessagePlayground} className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            id="playground-chat-input"
                            type="text"
                            placeholder="Type simulated visitor message..."
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            disabled={isSendingChat}
                            className="flex-1 bg-[#07090F] border border-gray-800 focus:border-[#00FFC6] text-gray-100 text-xs px-3.5 py-2.5 rounded-xl outline-none font-mono placeholder:text-gray-600"
                          />
                          <button
                            id="btn-send-playground-chat"
                            type="submit"
                            disabled={isSendingChat || !chatInput.trim()}
                            className="p-2.5 rounded-xl bg-[#00FFC6] text-[#07090F] font-bold shadow-lg hover:opacity-90 disabled:opacity-40 select-none cursor-pointer"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                        <span className="text-[8.5px] text-gray-500 font-mono tracking-wide mt-1 block uppercase text-center">
                          {isSendingChat ? "Routing message to brain engine..." : "Sends live payload simulation"}
                        </span>
                      </form>
                    </div>

                  </div>
                )}

              </div>
            )
          )
        )}

      </main>

      {/* MODAL WINDOW: AI BOT PROVISIONER */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-[#07090F]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0E131F] border border-[#00FFC6]/30 shadow-[0_0_50px_rgba(0,255,198,0.1)] rounded-3xl w-full max-w-xl p-5 sm:p-8 space-y-6 animate-in fade-in zoom-in duration-300 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#00FFC6]/10 border border-[#00FFC6]/30 rounded-xl text-[#00FFC6]">
                  <BotIcon className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-wide">Provision AI Bot Engine</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">Initialize a blank custom brain profile</p>
                </div>
              </div>
              <button
                id="btn-close-crebot"
                onClick={() => setShowCreateModal(false)}
                className="p-2 rounded-xl bg-[#151C2E] border border-gray-800 hover:border-red-500/50 hover:text-red-500 transition-all font-mono text-xs cursor-pointer text-gray-400"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleCreateBot} className="space-y-4">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-mono uppercase text-gray-400 font-semibold">Bot Moniker Name</label>
                  <input
                    id="new-bot-name-input"
                    type="text"
                    required
                    placeholder="e.g., Customer Support Delta"
                    value={newBotName}
                    onChange={(e) => setNewBotName(e.target.value)}
                    className="w-full bg-[#07090F] border border-gray-800 focus:border-[#00FFC6] text-gray-100 text-xs p-3 rounded-xl outline-none font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-mono uppercase text-gray-400 font-semibold">Mesh Platform Channel</label>
                  <select
                    id="new-bot-platform-select"
                    value={newBotPlatform}
                    onChange={(e) => setNewBotPlatform(e.target.value as BotPlatform)}
                    className="w-full bg-[#07090F] border border-gray-800 focus:border-[#00FFC6] text-gray-100 text-xs p-3 rounded-xl outline-none font-mono"
                  >
                    <option value="telegram">Telegram Channel</option>
                    <option value="whatsapp">WhatsApp Node</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-mono uppercase text-gray-400 font-semibold">Initial AI Source</label>
                  <select
                    id="new-bot-source-select"
                    value={创造Source}
                    onChange={(e) => handleSourceChangeInCreate(e.target.value as AISource)}
                    className="w-full bg-[#07090F] border border-gray-800 focus:border-[#00FFC6] text-gray-100 text-xs p-3 rounded-xl outline-none font-mono"
                  >
                    <option value="gemini">Google Gemini (Only Provider)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-mono uppercase text-gray-400 font-semibold">Active AI Model</label>
                  <select
                    id="new-bot-model-select"
                    value={创造Model}
                    onChange={(e) => set创造Model(e.target.value)}
                    className="w-full bg-[#07090F] border border-gray-800 focus:border-[#00FFC6] text-gray-100 text-xs p-3 rounded-xl outline-none font-mono"
                  >
                    {getModelsForSource(创造Source).map(m => {
                      let label = m;
                      if (m === 'gemini-3.5-flash') label = `${m} (Free Tier - 0¢/msg)`;
                      if (m === 'gemini-3.1-flash-lite') label = `${m} (Ultra Lite - 0¢/msg)`;
                      if (m === 'gemini-3.1-pro-preview') label = `${m} (Advanced Pro - Paid/Developer Key)`;
                      return <option key={m} value={m}>{label}</option>;
                    })}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-mono uppercase text-gray-400 font-semibold">User Welcome Greeting Message</label>
                <input
                  id="new-bot-greeting-input"
                  type="text"
                  placeholder="e.g., Welcome! Delta Support core is active. How may we help?"
                  value={newBotGreeting}
                  onChange={(e) => setNewBotGreeting(e.target.value)}
                  className="w-full bg-[#07090F] border border-gray-800 focus:border-[#00FFC6] text-gray-100 text-xs p-3 rounded-xl outline-none font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-mono uppercase text-gray-400 font-semibold">Primary System Prompt Ruleset</label>
                <textarea
                  id="new-bot-prompt-input"
                  rows={3}
                  placeholder="e.g., You are a helpful sales bot that answers in bullet points..."
                  value={newBotSystemPrompt}
                  onChange={(e) => setNewBotSystemPrompt(e.target.value)}
                  className="w-full bg-[#07090F] border border-gray-800 focus:border-[#00FFC6] text-gray-100 text-xs p-3 rounded-xl outline-none font-mono resize-none"
                />
              </div>

              <p className="text-[10px] text-gray-500 font-mono italic leading-normal pt-1.5 border-t border-gray-800">
                ⚠️ As requested by bot lifecycle configurations, newly provisioned bots start locked and STOPPED. Connect the integration parameters (e.g. tokens, qr codes) of the channel then start manually to sync.
              </p>

              <div className="pt-4 flex items-center justify-end gap-3 select-none">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="py-2.5 px-4 rounded-xl bg-[#151C2E] text-slate-300 font-mono text-xs font-bold hover:text-white border border-transparent hover:border-gray-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-create-bot"
                  type="button"
                  onClick={handleCreateBot}
                  className="py-2.5 px-5 rounded-xl bg-[#00FFC6] text-black hover:bg-[#00D7A7] font-bold text-xs shadow-lg transition-all cursor-pointer"
                >
                  Confirm Provisioning
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Account Settings & Memory Storage billing modal */}
      {showBillingModal && (
        <div className="fixed inset-0 z-50 bg-[#07090F]/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0E131F] border border-gray-800 shadow-[0_0_50px_rgba(0,120,255,0.15)] rounded-3xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header branding band */}
            <div className="p-6 md:p-8 bg-gradient-to-r from-[#0E131F] to-[#151C2E] border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#00FFC6]/10 border border-[#00FFC6]/30 text-[#00FFC6] rounded-2xl">
                  <Settings className="w-6 h-6 animate-spin-slow" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-wide font-sans">SaaS Account Control Settings</h3>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">Manage allocations, memory limits and subscription nodes</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBillingModal(false)}
                className="p-2 rounded-xl bg-[#07090F] border border-gray-800 hover:border-red-500/50 hover:text-[#00FFC6] transition-all font-mono text-xs text-gray-400 cursor-pointer"
              >
                Close Settings
              </button>
            </div>

            <div className="p-6 md:p-8 space-y-6 max-h-[80vh] overflow-y-auto">
              
              {/* CURRENT MEMORY INFRASTRUCTURE ALLOCATION VIEW CARD */}
              <div className="bg-black/40 border border-gray-800/80 p-5 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest block font-bold">Account Cloud Storage Usage</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-extrabold text-white font-mono">{accountTotalUsedMb.toFixed(1)} MB</span>
                      <span className="text-xs text-gray-500 font-mono">/ {accountMaxMemoryMb} MB Limit</span>
                    </div>
                  </div>
                  
                  <span className={`text-[10px] uppercase px-3 py-1.5 rounded-lg border font-mono font-bold tracking-widest ${
                    accountSubscribedPlan === 'free' ? 'bg-gray-800/20 text-gray-400 border-gray-800' :
                    accountSubscribedPlan === 'silver' ? 'bg-blue-500/10 text-blue-400 border-blue-500/40' :
                    accountSubscribedPlan === 'gold' ? 'bg-amber-500/10 text-amber-400 border-amber-500/40' :
                    'bg-[#00FFC6]/10 text-[#00FFC6] border-[#00FFC6]/40 shadow-[0_0_10px_rgba(0,255,198,0.1)]'
                  }`}>
                    {accountSubscribedPlan.toUpperCase()} ACTIVE PLAN
                  </span>
                </div>

                {/* Aesthetic Progress Bar */}
                <div className="space-y-2">
                  <div className="w-full bg-gray-950 rounded-full h-2.5 overflow-hidden border border-gray-800">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        (accountTotalUsedMb / accountMaxMemoryMb) >= 0.9 ? 'bg-rose-500' :
                        (accountTotalUsedMb / accountMaxMemoryMb) >= 0.7 ? 'bg-amber-400' :
                        'bg-gradient-to-r from-blue-500 to-[#00FFC6]'
                      }`}
                      style={{ width: `${Math.min(100, (accountTotalUsedMb / accountMaxMemoryMb) * 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-gray-450">
                    <span>0 MB (Shared Free Tier Limit)</span>
                    <span className="font-bold text-gray-400">
                      {(accountMaxMemoryMb - accountTotalUsedMb) > 0 
                        ? `${(accountMaxMemoryMb - accountTotalUsedMb).toFixed(1)} MB Unused space`
                        : "Out of Memory! Upgrade required to save memory details"
                      }
                    </span>
                    <span>{accountMaxMemoryMb} MB Cap</span>
                  </div>
                </div>

                {/* Mini Bot Allocator Table */}
                <div className="border-t border-gray-800/80 pt-4 mt-2">
                  <span className="text-[9px] font-mono uppercase text-gray-400 font-bold tracking-wide block mb-3">Individual Bot Memory Allocations</span>
                  <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                    {bots.length === 0 ? (
                      <p className="text-[10px] font-mono text-gray-550 italic py-2">No provisioned bots found.</p>
                    ) : (
                      bots.map(b => (
                        <div key={b.id} className="flex items-center justify-between p-2.5 rounded-xl bg-[#07090F]/50 border border-gray-800/80 hover:border-gray-700 transition-all font-mono text-[11px]">
                          <div className="flex items-center gap-2">
                            <BotIcon className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-gray-200 font-bold truncate max-w-[150px]">{b.name}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 border border-gray-805 text-gray-500 uppercase">{b.platform}</span>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <span className={`text-[10px] font-bold ${b.enableMemory ? 'text-white' : 'text-gray-450'}`}>
                              {b.enableMemory ? `${(b.memoryUsedMb || 0).toFixed(1)} MB` : 'MEM DISABLED'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setShowBillingModal(false);
                                setSelectedBotId(b.id);
                                setEditedBotState(b);
                                setActiveBotTab('ai-brain');
                              }}
                              className="text-[9px] font-bold text-[#00FFC6] bg-[#00FFC6]/5 hover:bg-[#00FFC6]/15 border border-[#00FFC6]/20 hover:border-[#00FFC6]/50 px-2 py-1 rounded transition-all cursor-pointer uppercase"
                            >
                              Configure
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* COGNITIVE MEMORY UPGRADE PLANS SELECTION CONTAINER */}
              <div className="space-y-4">
                <div className="border-b border-gray-800 pb-2">
                  <h4 className="text-xs uppercase font-mono font-bold tracking-widest text-[#00FFC6] flex items-center gap-2">
                    <CreditCard className="w-4 h-4" /> Cognitive Memory Upgrade Plans
                  </h4>
                  <p className="text-[10px] text-gray-400 font-mono mt-1">
                    Select a tier level to expand your global client context thresholds. Run bots under heavy workloads without memory exhaustion.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Plan 1: 300MB */}
                  <div className={`p-4 rounded-2xl border transition-all relative flex flex-col justify-between ${
                    accountSubscribedPlan === 'silver'
                      ? 'bg-blue-500/5 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                      : 'bg-[#07090F]/60 border-gray-800 hover:border-gray-700'
                  }`}>
                    {accountSubscribedPlan === 'silver' && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[8px] bg-blue-500 text-white font-mono font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        ACTIVE PLAN
                      </span>
                    )}
                    <div className="space-y-2">
                      <div className="text-white font-extrabold text-sm font-sans flex items-center justify-between">
                        <span>Silver Brain Node</span>
                        <HardDrive className="w-4 h-4 text-gray-400" />
                      </div>
                      <div className="font-mono">
                        <span className="text-2xl font-bold text-white">300 MB</span>
                        <p className="text-[10px] text-gray-500">Global memory capacity</p>
                      </div>
                      <p className="text-[11px] font-mono text-gray-400 pt-1 leading-relaxed">
                        Best value for startup bots running light chat automation schedules.
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-800/60">
                      <div className="flex items-baseline gap-1 text-[#00FFC6] font-mono mb-3">
                        <span className="text-[13px] text-gray-400 font-bold">$14.00</span>
                        <span className="text-[10px] text-gray-500">/mo (1,400 credits)</span>
                      </div>
                      <button
                        type="button"
                        id="btn-subscribe-silver"
                        disabled={isUpgradingPlan || accountSubscribedPlan === 'silver'}
                        onClick={() => triggerUpgradePlan('silver')}
                        className={`w-full py-2 text-xs font-mono font-bold rounded-xl outline-none cursor-pointer border ${
                          accountSubscribedPlan === 'silver'
                            ? 'bg-blue-500/15 border-blue-500 text-blue-400 cursor-default'
                            : 'bg-white hover:bg-gray-105 text-black border-transparent transition-all'
                        }`}
                      >
                        {accountSubscribedPlan === 'silver' ? 'Current Plan' : 'Subscribe'}
                      </button>
                    </div>
                  </div>

                  {/* Plan 2: 500MB */}
                  <div className={`p-4 rounded-2xl border transition-all relative flex flex-col justify-between ${
                    accountSubscribedPlan === 'gold'
                      ? 'bg-amber-500/5 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                      : 'bg-[#07090F]/60 border-gray-800 hover:border-gray-700'
                  }`}>
                    {accountSubscribedPlan === 'gold' && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[8px] bg-amber-500 text-white font-mono font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        ACTIVE PLAN
                      </span>
                    )}
                    <div className="space-y-2">
                      <div className="text-white font-extrabold text-sm font-sans flex items-center justify-between">
                        <span>Gold Brain Node</span>
                        <Cpu className="w-4 h-4 text-gray-400" />
                      </div>
                      <div className="font-mono">
                        <span className="text-2xl font-bold text-white">500 MB</span>
                        <p className="text-[10px] text-gray-500">Global memory capacity</p>
                      </div>
                      <p className="text-[11px] font-mono text-gray-400 pt-1 leading-relaxed">
                        Excellent scaling bandwidth for multithreaded AI support agents.
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-800/60">
                      <div className="flex items-baseline gap-1 text-[#00FFC6] font-mono mb-3">
                        <span className="text-[13px] text-gray-400 font-bold">$24.00</span>
                        <span className="text-[10px] text-gray-500">/mo (2,400 credits)</span>
                      </div>
                      <button
                        type="button"
                        id="btn-subscribe-gold"
                        disabled={isUpgradingPlan || accountSubscribedPlan === 'gold'}
                        onClick={() => triggerUpgradePlan('gold')}
                        className={`w-full py-2 text-xs font-mono font-bold rounded-xl outline-none cursor-pointer border ${
                          accountSubscribedPlan === 'gold'
                            ? 'bg-amber-500/15 border-amber-500 text-amber-400 cursor-default'
                            : 'bg-white hover:bg-gray-105 text-black border-transparent transition-all'
                        }`}
                      >
                        {accountSubscribedPlan === 'gold' ? 'Current Plan' : 'Subscribe'}
                      </button>
                    </div>
                  </div>

                  {/* Plan 3: 1GB */}
                  <div className={`p-4 rounded-2xl border transition-all relative flex flex-col justify-between ${
                    accountSubscribedPlan === 'platinum'
                      ? 'bg-[#00FFC6]/5 border-[#00FFC6] shadow-[0_0_15px_rgba(0,255,198,0.15)]'
                      : 'bg-[#07090F]/60 border-gray-800 hover:border-gray-700'
                  }`}>
                    {accountSubscribedPlan === 'platinum' && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[8px] bg-[#00FFC6] text-black font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        ACTIVE PLAN
                      </span>
                    )}
                    <div className="space-y-2">
                      <div className="text-white font-extrabold text-sm font-sans flex items-center justify-between">
                        <span>Platinum Quantum</span>
                        <Zap className="w-4 h-4 text-[#00FFC6]" />
                      </div>
                      <div className="font-mono">
                        <span className="text-2xl font-bold text-white">1.0 GB</span>
                        <p className="text-[10px] text-gray-500">Global memory capacity</p>
                      </div>
                      <p className="text-[11px] font-mono text-gray-400 pt-1 leading-relaxed">
                        Infinite recall parameters for highly active multi-platform chatbots.
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-800/60">
                      <div className="flex items-baseline gap-1 text-[#00FFC6] font-mono mb-3">
                        <span className="text-[13px] text-gray-400 font-bold">$46.00</span>
                        <span className="text-[10px] text-gray-500">/mo (46,000 credits)</span>
                      </div>
                      <button
                        type="button"
                        id="btn-subscribe-platinum"
                        disabled={isUpgradingPlan || accountSubscribedPlan === 'platinum'}
                        onClick={() => triggerUpgradePlan('platinum')}
                        className={`w-full py-2 text-xs font-mono font-bold rounded-xl outline-none cursor-pointer border relative overflow-hidden ${
                          accountSubscribedPlan === 'platinum'
                            ? 'bg-[#00FFC6]/10 border-[#00FFC6] text-[#00FFC6] cursor-default'
                            : 'bg-gradient-to-r from-blue-400 to-[#00FFC6] hover:opacity-90 text-black border-transparent transition-all'
                        }`}
                      >
                        {accountSubscribedPlan === 'platinum' ? 'Current Plan' : 'Subscribe'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Coming Soon nodes */}
                <div className="p-3 bg-black/20 text-gray-500 rounded-xl flex items-center justify-between font-mono text-[10px] border border-gray-900 border-dashed">
                  <span>🚀 ULTIMATE ENTERPRISE CHRONO-BRAIN NODES</span>
                  <span className="bg-gray-850 px-2 py-0.5 text-gray-400 rounded-md font-bold text-[9px] uppercase">COMING SOON / PRIVATE BETA</span>
                </div>
              </div>

            </div>

            <div className="p-6 bg-[#07090F] border-t border-gray-800 flex items-center justify-between font-mono text-[10px] text-gray-500">
              <span>Secure card handshakes processed via Stripe.</span>
              <span>Default account owner: Admin-1</span>
            </div>

          </div>
        </div>
      )}

      {/* Persistent Visual Footer */}
      <footer className="w-full text-center py-6 border-t border-gray-900 font-mono text-[10px] text-gray-500">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>© 2026 BØTVΞRSΞ Inc. Secured Multi-platform AI SaaS control routing network.</span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 pulse-cyber"></span>
              All nodes fully operational
            </span>
            <span className="text-gray-600">|</span>
            <span className="hover:text-white transition-colors cursor-pointer flex items-center gap-1">Developer Sandbox Terminal <ExternalLink className="w-3 h-3" /></span>
          </div>
        </div>
      </footer>

      </div>
    </>
  );
}
