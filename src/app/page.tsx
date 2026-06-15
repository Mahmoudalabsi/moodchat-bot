'use client';

import { useState, useEffect, useCallback, useRef, useMemo, useTransition } from 'react';
import {
  Users, MessageSquare, Shield, Activity, Bot,
  UserCheck, UserX, Clock, Search, RefreshCw,
  Eye, Ban, Trash2, CheckCircle, BarChart3,
  Send, Key, Wifi, WifiOff, Settings, Moon,
  Sun, ChevronLeft, Save, Zap, LogOut, Lock,
  MessageCircle, TrendingUp, UserPlus, AlertTriangle,
  ChevronDown, X, ArrowLeft
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// Types
interface Stats {
  totalUsers: number; approvedUsers: number; blockedUsers: number; pendingUsers: number;
  totalMessages: number; messagesToday: number; newUsersToday: number; activeUsers7d: number;
  topUsers: Array<{ userId: number; firstName: string | null; username: string | null; totalMessages: number; lastActive: string }>;
  recentJoins: Array<{ id: string; action: string; passwordTried: string | null; timestamp: string; user: { firstName: string | null; username: string | null; userId: number } | null }>;
  dailyMessages: Array<{ date: string; count: number }>;
}

interface User {
  id: string; userId: number; username: string | null; firstName: string | null;
  lastName: string | null; isApproved: boolean; isBlocked: boolean;
  waitingForPassword: boolean; totalMessages: number; firstSeen: string;
  lastActive: string; joinAttempts: number; _count: { messages: number };
}

interface Message {
  id: string; userId: number; role: string; content: string;
  modelUsed: string | null; timestamp: string;
  user?: { firstName: string | null; username: string | null; userId: number } | null;
}

interface BotConfig {
  ai_provider: string; api_base_url: string; api_key: string; api_key_raw: string;
  api_model: string; zai_chat_id: string; zai_user_id: string;
  zai_token: string; zai_token_raw: string; join_password: string;
}

// Theme hook
function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('moodchat_theme');
      if (stored === 'light' || stored === 'dark') return stored;
    }
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('moodchat_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  return { theme, toggleTheme };
}

// Format date in Arabic
function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('ar-EG', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatTime(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleTimeString('ar-EG', {
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function formatDateTime(dateStr: string) {
  return `${formatDate(dateStr)} ${formatTime(dateStr)}`;
}

export default function Dashboard() {
  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Data state
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [userFilter, setUserFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [userMessages, setUserMessages] = useState<Message[]>([]);
  const [userMessagesTotal, setUserMessagesTotal] = useState(0);
  const [userMessagesHasMore, setUserMessagesHasMore] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [activeTab, setActiveTab] = useState('stats');
  const [savingConfig, setSavingConfig] = useState(false);

  // Delete confirmation dialog
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; userId: number | null; userName: string }>({
    open: false, userId: null, userName: '',
  });

  // Config form state
  const [cfgProvider, setCfgProvider] = useState('zsdk');
  const [cfgApiUrl, setCfgApiUrl] = useState('');
  const [cfgApiKey, setCfgApiKey] = useState('');
  const [cfgApiModel, setCfgApiModel] = useState('');
  const [cfgZaiChatId, setCfgZaiChatId] = useState('');
  const [cfgZaiUserId, setCfgZaiUserId] = useState('');
  const [cfgZaiToken, setCfgZaiToken] = useState('');
  const [cfgPassword, setCfgPassword] = useState('');

  // Theme
  const { theme, toggleTheme } = useTheme();

  // Chat scroll ref
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Login handler
  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', password: loginPassword }),
      });
      const d = await r.json();
      if (d.ok) {
        localStorage.setItem('moodchat_auth', 'true');
        setIsLoggedIn(true);
        setLoginPassword('');
      } else {
        setLoginError(d.error || 'كلمة المرور خاطئة');
      }
    } catch {
      setLoginError('حدث خطأ في الاتصال');
    }
    setLoginLoading(false);
  };

  // Logout handler
  const handleLogout = async () => {
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });
    localStorage.removeItem('moodchat_auth');
    setIsLoggedIn(false);
  };

  // Verify auth on load - فوري من localStorage، ثم تحقق من السيرفر بالخلفية
  useEffect(() => {
    const storedAuth = localStorage.getItem('moodchat_auth');
    if (storedAuth === 'true') {
      // سجّل دخول فوري بدون انتظار السيرفر
      setIsLoggedIn(true);
      setCheckingAuth(false);
      // تحقق في الخلفية
      fetch('/api/auth').then(r => {
        if (!r.ok) {
          localStorage.removeItem('moodchat_auth');
          setIsLoggedIn(false);
        }
      }).catch(() => { /* أبقى داخل - الكوكي ممكن يكون صالح */ });
    } else {
      setCheckingAuth(false);
    }
  }, []);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch('/api/stats');
      if (r.ok) setStats(await r.json());
    } catch { /* ignore */ }
  }, []);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    try {
      const r = await fetch(`/api/users?filter=${userFilter}&search=${searchQuery}`);
      if (r.ok) {
        const d = await r.json();
        setUsers(d.users || []);
      }
    } catch { /* ignore */ }
  }, [userFilter, searchQuery]);

  // Fetch all messages
  const fetchMessages = useCallback(async () => {
    try {
      const r = await fetch('/api/messages?limit=9999');
      if (r.ok) {
        const d = await r.json();
        setMessages(d.messages || []);
      }
    } catch { /* ignore */ }
  }, []);

  // Fetch user messages with pagination
  const fetchUserMessages = useCallback(async (uid: number, cursor?: string) => {
    if (!cursor) {
      try {
        const r = await fetch(`/api/messages?userId=${uid}&limit=50`);
        if (r.ok) {
          const d = await r.json();
          setUserMessages(d.messages || []);
          setUserMessagesTotal(d.total || 0);
          setUserMessagesHasMore(d.hasMore || false);
        }
      } catch { /* ignore */ }
    }
  }, []);

  // Load more messages
  const loadMoreMessages = useCallback(async () => {
    if (!selectedUserId || !userMessagesHasMore) return;
    setLoadingMoreMessages(true);
    try {
      const cursor = userMessages.length > 0 ? userMessages[userMessages.length - 1].id : undefined;
      const r = await fetch(`/api/messages?userId=${selectedUserId}&limit=50&cursor=${cursor || ''}`);
      if (r.ok) {
        const d = await r.json();
        setUserMessages(prev => [...prev, ...(d.messages || [])]);
        setUserMessagesHasMore(d.hasMore || false);
      }
    } catch { /* ignore */ }
    setLoadingMoreMessages(false);
  }, [selectedUserId, userMessagesHasMore, userMessages]);

  // Fetch config
  const fetchConfig = useCallback(async () => {
    try {
      const r = await fetch('/api/config');
      if (r.ok) {
        const c = await r.json();
        setConfig(c);
        setCfgProvider(c.ai_provider || 'zsdk');
        setCfgApiUrl(c.api_base_url || '');
        setCfgApiKey(c.api_key_raw || '');
        setCfgApiModel(c.api_model || 'gpt-4');
        setCfgZaiChatId(c.zai_chat_id || '');
        setCfgZaiUserId(c.zai_user_id || '');
        setCfgZaiToken(c.zai_token_raw || '');
        setCfgPassword(c.join_password || '');
      }
    } catch { /* ignore */ }
  }, []);

  // Check webhook
  const checkWebhook = useCallback(async () => {
    try {
      const r = await fetch('/api/telegram');
      if (r.ok) {
        const d = await r.json();
        setWebhookStatus(d.result?.url ? 'online' : 'offline');
      } else {
        setWebhookStatus('offline');
      }
    } catch {
      setWebhookStatus('offline');
    }
  }, []);

  // Save config
  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai_provider: cfgProvider,
          api_base_url: cfgApiUrl,
          api_key: cfgApiKey,
          api_model: cfgApiModel,
          zai_chat_id: cfgZaiChatId,
          zai_user_id: cfgZaiUserId,
          zai_token: cfgZaiToken,
          join_password: cfgPassword,
        }),
      });
      await fetchConfig();
    } catch { /* ignore */ }
    setSavingConfig(false);
  };

  // User actions
  const blockUser = async (userId: number) => {
    await fetch('/api/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action: 'block' }),
    });
    fetchUsers();
    fetchStats();
  };

  const unblockUser = async (userId: number) => {
    await fetch('/api/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action: 'unblock' }),
    });
    fetchUsers();
    fetchStats();
  };

  const approveUser = async (userId: number) => {
    await fetch('/api/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action: 'approve' }),
    });
    fetchUsers();
    fetchStats();
  };

  const deleteUser = async (userId: number) => {
    await fetch(`/api/users?userId=${userId}`, { method: 'DELETE' });
    fetchUsers();
    fetchStats();
    setDeleteDialog({ open: false, userId: null, userName: '' });
  };

  // تحميل كل البيانات في طلب واحد (سريع!)
  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/dashboard');
      if (r.ok) {
        const d = await r.json();
        if (d.stats) setStats(d.stats);
        if (d.users) setUsers(d.users);
        if (d.messages) setMessages(d.messages);
        if (d.config) {
          setConfig(d.config);
          setCfgProvider(d.config.ai_provider || 'zsdk');
          setCfgApiUrl(d.config.api_base_url || '');
          setCfgApiKey(d.config.api_key_raw || '');
          setCfgApiModel(d.config.api_model || 'gpt-4');
          setCfgZaiChatId(d.config.zai_chat_id || '');
          setCfgZaiUserId(d.config.zai_user_id || '');
          setCfgZaiToken(d.config.zai_token_raw || '');
          setCfgPassword(d.config.join_password || '');
        }
        if (d.webhook) {
          setWebhookStatus(d.webhook.online ? 'online' : 'offline');
        }
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  // Data loading effects
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (isLoggedIn) {
      startTransition(() => { fetchDashboard(); });
    }
  }, [isLoggedIn, fetchDashboard, startTransition]);

  useEffect(() => {
    if (isLoggedIn) {
      startTransition(() => { fetchUsers(); });
    }
  }, [userFilter, searchQuery, fetchUsers, isLoggedIn, startTransition]);

  useEffect(() => {
    if (selectedUserId) {
      startTransition(() => { fetchUserMessages(selectedUserId); });
    }
  }, [selectedUserId, fetchUserMessages, startTransition]);

  // Scroll to bottom of chat when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [userMessages]);

  // Refresh all data
  const refreshAll = () => {
    fetchDashboard();
  };

  // Get unique users from messages
  const messageUsers = [...new Map(
    messages.filter(m => m.user).map(m => [m.user!.userId, m.user!])
  ).values()];

  // Stat cards data
  const statCards = stats ? [
    { label: 'اجمالي المستخدمين', value: stats.totalUsers, icon: Users, gradient: 'from-amber-500/20 to-amber-600/5', iconColor: 'text-amber-500' },
    { label: 'المفعلين', value: stats.approvedUsers, icon: UserCheck, gradient: 'from-emerald-500/20 to-emerald-600/5', iconColor: 'text-emerald-500' },
    { label: 'المحظورين', value: stats.blockedUsers, icon: UserX, gradient: 'from-red-500/20 to-red-600/5', iconColor: 'text-red-500' },
    { label: 'اجمالي الرسائل', value: stats.totalMessages, icon: MessageSquare, gradient: 'from-blue-500/20 to-blue-600/5', iconColor: 'text-blue-500' },
    { label: 'رسائل اليوم', value: stats.messagesToday, icon: Activity, gradient: 'from-yellow-500/20 to-yellow-600/5', iconColor: 'text-yellow-500' },
    { label: 'جدد اليوم', value: stats.newUsersToday, icon: UserPlus, gradient: 'from-purple-500/20 to-purple-600/5', iconColor: 'text-purple-500' },
    { label: 'نشطون 7 ايام', value: stats.activeUsers7d, icon: TrendingUp, gradient: 'from-teal-500/20 to-teal-600/5', iconColor: 'text-teal-500' },
    { label: 'بانتظار الموافقة', value: stats.pendingUsers, icon: Clock, gradient: 'from-orange-500/20 to-orange-600/5', iconColor: 'text-orange-500' },
  ] : [];

  // ============ LOADING SCREEN ============
  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Moon className="crescent-moon text-primary mx-auto" size={48} />
          <p className="text-muted-foreground mt-4">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  // ============ LOGIN SCREEN ============
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-md px-4">
          <div className="text-center mb-10">
            <div className="animate-float inline-block">
              <Moon className="crescent-moon text-primary" size={64} />
            </div>
            <h1 className="text-4xl font-extrabold text-primary mt-5 tracking-tight">مود شات</h1>
            <p className="text-muted-foreground mt-2 text-sm">لوحة تحكم البوت الذكي</p>
          </div>

          <Card className="border-border/50 shadow-2xl">
            <CardContent className="p-8">
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-muted-foreground text-sm">
                    <Lock size={14} className="inline ml-1" />
                    كلمة المرور
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    placeholder="ادخل كلمة المرور"
                    className="bg-background/50 border-border text-foreground h-12 rounded-xl"
                    autoFocus
                  />
                </div>

                {loginError && (
                  <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg p-3">
                    <AlertTriangle size={16} />
                    <span>{loginError}</span>
                  </div>
                )}

                <Button
                  onClick={handleLogin}
                  disabled={loginLoading || !loginPassword}
                  className="w-full bg-primary text-primary-foreground font-bold rounded-xl h-12 text-base hover:bg-primary/90"
                >
                  {loginLoading ? 'جاري التحقق...' : 'دخول'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <p className="text-center text-muted-foreground/40 text-xs mt-6">
            محمي بنظام مصادقة خاص
          </p>
        </div>
      </div>
    );
  }

  // ============ MAIN DASHBOARD ============
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Moon className="text-primary crescent-moon" size={32} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-primary tracking-tight">مود شات</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">لوحة تحكم البوت الذكي</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Webhook Status */}
            <Badge
              variant="outline"
              className={`text-xs gap-1.5 ${
                webhookStatus === 'online'
                  ? 'border-emerald-500 text-emerald-500'
                  : webhookStatus === 'checking'
                  ? 'border-yellow-500 text-yellow-500'
                  : 'border-red-500 text-red-500'
              }`}
            >
              {webhookStatus === 'online' ? <Wifi size={12} /> : <WifiOff size={12} />}
              <span className="hidden sm:inline">
                {webhookStatus === 'online' ? 'متصل' : webhookStatus === 'checking' ? 'يتحقق...' : 'غير متصل'}
              </span>
            </Badge>

            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="text-muted-foreground hover:text-foreground"
              title={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </Button>

            {/* Refresh */}
            <Button variant="ghost" size="sm" onClick={refreshAll} className="text-muted-foreground hover:text-foreground">
              <RefreshCw size={16} />
            </Button>

            {/* Logout */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-destructive hover:text-destructive/80 flex items-center gap-1"
            >
              <LogOut size={16} />
              <span className="text-xs hidden sm:inline">خروج</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
          <TabsList className="bg-card border border-border rounded-xl p-1 gap-1 w-fit">
            {[
              { v: 'stats', l: 'الاحصائيات', i: BarChart3 },
              { v: 'users', l: 'المستخدمين', i: Users },
              { v: 'messages', l: 'المحادثات', i: MessageSquare },
              { v: 'settings', l: 'الاعدادات', i: Settings },
            ].map(t => (
              <TabsTrigger
                key={t.v}
                value={t.v}
                className="rounded-lg px-4 py-2 text-sm data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:font-bold text-muted-foreground flex items-center gap-2 transition-all"
              >
                <t.i size={16} />
                <span className="hidden sm:inline">{t.l}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ========== STATS TAB ========== */}
          <TabsContent value="stats" className="animate-fade-in mt-6">
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Card key={i} className="border-border/50">
                    <CardContent className="p-5">
                      <Skeleton className="h-8 w-8 rounded-lg mb-3" />
                      <Skeleton className="h-8 w-16 mb-2" />
                      <Skeleton className="h-4 w-24" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <>
                {/* Stat Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {statCards.map((s, i) => (
                    <Card key={i} className={`border-border/50 stat-card-gradient bg-gradient-to-br ${s.gradient}`}>
                      <CardContent className="p-5 text-center">
                        <s.icon size={28} className={`${s.iconColor} mx-auto mb-2`} />
                        <div className="text-3xl font-extrabold text-foreground leading-none">
                          {s.value.toLocaleString('ar-EG')}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1.5">{s.label}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Daily Chart */}
                {stats?.dailyMessages && (
                  <Card className="border-border/50 mt-6">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">الرسائل اليومية - اخر 7 ايام</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={stats.dailyMessages}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis
                            dataKey="date"
                            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                            tickFormatter={(v: string) => v.slice(5)}
                          />
                          <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                          <Tooltip
                            contentStyle={{
                              background: 'var(--card)',
                              border: '1px solid var(--border)',
                              borderRadius: 8,
                              color: 'var(--foreground)',
                            }}
                          />
                          <Bar dataKey="count" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Top Users */}
                {stats?.topUsers && stats.topUsers.length > 0 && (
                  <Card className="border-border/50 mt-6">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <TrendingUp size={18} className="text-primary" />
                        اكثر المستخدمين نشاطا
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {stats.topUsers.map((u, i) => (
                          <div
                            key={u.userId}
                            className="flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                i === 0 ? 'bg-amber-500/20 text-amber-500' :
                                i === 1 ? 'bg-gray-400/20 text-gray-400' :
                                i === 2 ? 'bg-orange-500/20 text-orange-500' :
                                'bg-muted text-muted-foreground'
                              }`}>
                                {i + 1}
                              </div>
                              <div>
                                <p className="font-semibold text-sm">{u.firstName || u.username || 'مجهول'}</p>
                                {u.username && <p className="text-xs text-muted-foreground">@{u.username}</p>}
                              </div>
                            </div>
                            <div className="text-left">
                              <Badge variant="secondary" className="text-xs">
                                <MessageSquare size={10} className="ml-1" />
                                {u.totalMessages} رسالة
                              </Badge>
                              <p className="text-xs text-muted-foreground mt-1">
                                {formatDate(u.lastActive)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Recent Joins */}
                {stats?.recentJoins && stats.recentJoins.length > 0 && (
                  <Card className="border-border/50 mt-6">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Shield size={18} className="text-primary" />
                        محاولات الدخول الاخيرة
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {stats.recentJoins.map((j, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between p-3 rounded-xl bg-muted/50"
                          >
                            <div>
                              <p className="font-medium text-sm">{j.user?.firstName || 'مجهول'}</p>
                              {j.user?.username && (
                                <p className="text-xs text-muted-foreground">@{j.user.username}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                className={`text-xs border-0 ${
                                  j.action === 'success'
                                    ? 'bg-emerald-500/15 text-emerald-500'
                                    : j.action === 'fail'
                                    ? 'bg-red-500/15 text-red-500'
                                    : 'bg-yellow-500/15 text-yellow-500'
                                }`}
                              >
                                {j.action === 'success' ? 'نجح' : j.action === 'fail' ? 'فشل' : 'محاولة'}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{formatDateTime(j.timestamp)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* ========== USERS TAB ========== */}
          <TabsContent value="users" className="animate-fade-in mt-6">
            {/* Filter Bar */}
            <div className="flex gap-3 flex-wrap items-center mb-4">
              <div className="flex gap-1.5">
                {[
                  { v: 'all', l: 'الكل' },
                  { v: 'approved', l: 'مفعل' },
                  { v: 'blocked', l: 'محظور' },
                  { v: 'pending', l: 'معلق' },
                ].map(f => (
                  <Button
                    key={f.v}
                    size="sm"
                    variant={userFilter === f.v ? 'default' : 'outline'}
                    onClick={() => setUserFilter(f.v)}
                    className={`rounded-lg text-xs ${
                      userFilter === f.v
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {f.l}
                  </Button>
                ))}
              </div>
              <div className="relative flex-1 min-w-[200px]">
                <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="بحث عن مستخدم..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-card border-border text-foreground rounded-lg pr-10"
                />
              </div>
            </div>

            {/* Users Table */}
            <Card className="border-border/50 overflow-hidden">
              {loading ? (
                <CardContent className="p-6 space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  ))}
                </CardContent>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground">الاسم</TableHead>
                        <TableHead className="text-muted-foreground">المعرف</TableHead>
                        <TableHead className="text-muted-foreground">الحالة</TableHead>
                        <TableHead className="text-muted-foreground">الرسائل</TableHead>
                        <TableHead className="text-muted-foreground hidden sm:table-cell">اخر نشاط</TableHead>
                        <TableHead className="text-muted-foreground text-left">اجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map(u => (
                        <TableRow key={u.id} className="border-border/30 hover:bg-muted/30">
                          <TableCell>
                            <div>
                              <p className="font-medium">{u.firstName || u.username || 'مجهول'}</p>
                              {u.lastName && <p className="text-xs text-muted-foreground">{u.lastName}</p>}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{u.userId}</TableCell>
                          <TableCell>
                            <Badge
                              className={`text-xs border-0 ${
                                u.isBlocked
                                  ? 'bg-red-500/15 text-red-500'
                                  : u.isApproved
                                  ? 'bg-emerald-500/15 text-emerald-500'
                                  : 'bg-yellow-500/15 text-yellow-500'
                              }`}
                            >
                              {u.isBlocked ? 'محظور' : u.isApproved ? 'مفعل' : 'معلق'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{u.totalMessages}</TableCell>
                          <TableCell className="text-muted-foreground text-xs hidden sm:table-cell">
                            {formatDateTime(u.lastActive)}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setSelectedUserId(u.userId); setActiveTab('messages'); }}
                                className="text-blue-500 hover:text-blue-400 hover:bg-blue-500/10 p-1.5 h-8 w-8"
                                title="عرض المحادثة"
                              >
                                <Eye size={15} />
                              </Button>
                              {!u.isApproved && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => approveUser(u.userId)}
                                  className="text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 p-1.5 h-8 w-8"
                                  title="موافقة"
                                >
                                  <CheckCircle size={15} />
                                </Button>
                              )}
                              {!u.isBlocked ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => blockUser(u.userId)}
                                  className="text-red-500 hover:text-red-400 hover:bg-red-500/10 p-1.5 h-8 w-8"
                                  title="حظر"
                                >
                                  <Ban size={15} />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => unblockUser(u.userId)}
                                  className="text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 p-1.5 h-8 w-8"
                                  title="الغاء الحظر"
                                >
                                  <CheckCircle size={15} />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteDialog({ open: true, userId: u.userId, userName: u.firstName || u.username || 'مجهول' })}
                                className="text-red-500 hover:text-red-400 hover:bg-red-500/10 p-1.5 h-8 w-8"
                                title="حذف"
                              >
                                <Trash2 size={15} />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {users.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                            <Users size={40} className="mx-auto mb-3 opacity-30" />
                            <p>لا يوجد مستخدمين</p>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* ========== MESSAGES TAB ========== */}
          <TabsContent value="messages" className="animate-fade-in mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
              {/* Users List */}
              <Card className="border-border/50 overflow-hidden">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Users size={16} className="text-primary" />
                    المستخدمين
                    <Badge variant="secondary" className="text-xs mr-auto">{messageUsers.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <ScrollArea className="h-[500px] lg:h-[calc(100vh-280px)]">
                  {messageUsers.length > 0 ? messageUsers.map(u => {
                    if (!u) return null;
                    return (
                      <button
                        key={u.userId}
                        onClick={() => { setSelectedUserId(u.userId); fetchUserMessages(u.userId); }}
                        className={`w-full px-4 py-3 border-b border-border/30 text-right flex items-center justify-between transition-colors ${
                          selectedUserId === u.userId
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-muted/50 text-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                            selectedUserId === u.userId
                              ? 'bg-primary/20 text-primary'
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            {(u.firstName || u.username || 'م')[0]}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{u.firstName || u.username || 'مجهول'}</p>
                            {u.username && <p className="text-xs text-muted-foreground">@{u.username}</p>}
                          </div>
                        </div>
                        <ChevronLeft size={14} className="text-muted-foreground" />
                      </button>
                    );
                  }) : (
                    <div className="p-6 text-center text-muted-foreground text-sm">
                      <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
                      <p>لا توجد رسائل بعد</p>
                    </div>
                  )}
                </ScrollArea>
              </Card>

              {/* Chat View */}
              <Card className="border-border/50 overflow-hidden flex flex-col">
                {/* Chat Header */}
                <div className="p-4 border-b border-border/50 flex items-center justify-between bg-card">
                  <div className="flex items-center gap-2">
                    {selectedUserId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedUserId(null)}
                        className="lg:hidden text-muted-foreground p-1 h-8 w-8"
                      >
                        <ArrowLeft size={16} />
                      </Button>
                    )}
                    <MessageCircle size={18} className="text-primary" />
                    <CardTitle className="text-sm font-bold">
                      {selectedUserId
                        ? `محادثة المستخدم #${selectedUserId}`
                        : 'اختر مستخدم لعرض المحادثة'
                      }
                    </CardTitle>
                  </div>
                  {selectedUserId && userMessagesTotal > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {userMessagesTotal} رسالة
                    </Badge>
                  )}
                </div>

                {/* Chat Body */}
                <div className="flex-1">
                  <ScrollArea className="h-[500px] lg:h-[calc(100vh-340px)]">
                    {selectedUserId ? (
                      <div className="p-4 space-y-3">
                        {/* Load more button */}
                        {userMessagesHasMore && (
                          <div className="text-center py-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={loadMoreMessages}
                              disabled={loadingMoreMessages}
                              className="text-xs border-border text-muted-foreground"
                            >
                              {loadingMoreMessages ? (
                                <>
                                  <RefreshCw size={12} className="ml-1 animate-spin" />
                                  جاري التحميل...
                                </>
                              ) : (
                                <>
                                  <ChevronDown size={12} className="ml-1" />
                                  تحميل المزيد
                                </>
                              )}
                            </Button>
                          </div>
                        )}

                        {userMessages.map(m => (
                          <div
                            key={m.id}
                            className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}
                          >
                            <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 ${
                              m.role === 'user'
                                ? 'bg-primary/10 border border-primary/20 chat-bubble-user'
                                : 'bg-emerald-500/10 border border-emerald-500/20 chat-bubble-bot'
                            }`}>
                              {/* Role indicator */}
                              <div className="flex items-center gap-1.5 mb-1.5">
                                {m.role === 'user' ? (
                                  <Send size={10} className="text-primary" />
                                ) : (
                                  <Bot size={10} className="text-emerald-500" />
                                )}
                                <span className={`text-xs font-semibold ${
                                  m.role === 'user' ? 'text-primary' : 'text-emerald-500'
                                }`}>
                                  {m.role === 'user' ? 'المستخدم' : 'البوت'}
                                </span>
                                {m.modelUsed && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                    {m.modelUsed}
                                  </Badge>
                                )}
                              </div>

                              {/* Message content - no truncation */}
                              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                {m.content}
                              </p>

                              {/* Timestamp */}
                              <span className="text-[10px] text-muted-foreground mt-2 block">
                                {formatDateTime(m.timestamp)}
                              </span>
                            </div>
                          </div>
                        ))}
                        <div ref={chatEndRef} />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground">
                        <MessageSquare size={48} className="opacity-20 mb-3" />
                        <p className="text-sm">اختر مستخدم من القائمة لعرض محادثته</p>
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* ========== SETTINGS TAB ========== */}
          <TabsContent value="settings" className="animate-fade-in mt-6">
            <div className="max-w-3xl space-y-6">

              {/* AI Provider Selection */}
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bot size={20} className="text-primary" />
                    مزود الذكاء الاصطناعي
                  </CardTitle>
                  <CardDescription>اختر مزود الذكاء الاصطناعي للبوت</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Z-AI SDK Option */}
                  <button
                    onClick={() => setCfgProvider('zsdk')}
                    className={`w-full p-5 rounded-xl border-2 text-right transition-all ${
                      cfgProvider === 'zsdk'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-border/80 bg-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          cfgProvider === 'zsdk' ? 'border-primary' : 'border-border'
                        }`}>
                          {cfgProvider === 'zsdk' && (
                            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                          )}
                        </div>
                        <span className="font-bold text-sm">Z-AI SDK</span>
                      </div>
                      <Badge className="bg-amber-500/15 text-amber-600 border-0 text-xs font-bold">
                        مجاني
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 mr-8">
                      نظام Z-AI المدمج - سريع ومجاني بالكامل - الافضل اداء
                    </p>
                  </button>

                  {/* Z-AI Config Fields */}
                  {cfgProvider === 'zsdk' && (
                    <div className="mr-8 space-y-3 p-4 bg-muted/30 rounded-xl">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Chat ID</Label>
                        <Input
                          value={cfgZaiChatId}
                          onChange={e => setCfgZaiChatId(e.target.value)}
                          placeholder="chat-xxx..."
                          className="bg-background border-border text-foreground rounded-lg"
                          dir="ltr"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">User ID</Label>
                        <Input
                          value={cfgZaiUserId}
                          onChange={e => setCfgZaiUserId(e.target.value)}
                          placeholder="user-id..."
                          className="bg-background border-border text-foreground rounded-lg"
                          dir="ltr"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Token</Label>
                        <Input
                          value={cfgZaiToken}
                          onChange={e => setCfgZaiToken(e.target.value)}
                          type="password"
                          placeholder="eyJ..."
                          className="bg-background border-border text-foreground rounded-lg"
                          dir="ltr"
                        />
                      </div>
                    </div>
                  )}

                  {/* API Token Option */}
                  <button
                    onClick={() => setCfgProvider('api')}
                    className={`w-full p-5 rounded-xl border-2 text-right transition-all ${
                      cfgProvider === 'api'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-border/80 bg-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          cfgProvider === 'api' ? 'border-primary' : 'border-border'
                        }`}>
                          {cfgProvider === 'api' && (
                            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                          )}
                        </div>
                        <span className="font-bold text-sm">API Token</span>
                      </div>
                      <Badge className="bg-blue-500/15 text-blue-500 border-0 text-xs font-bold">
                        موصى به لـ Vercel
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 mr-8">
                      استخدم اي مزود AI يدعم OpenAI API - يعمل من Vercel بشكل موثوق
                    </p>
                  </button>

                  {/* API Config Fields */}
                  {cfgProvider === 'api' && (
                    <div className="mr-8 space-y-3">
                      {/* Quick Setup */}
                      <div className="p-4 bg-muted/30 rounded-xl border border-border/30">
                        <p className="text-xs font-bold text-primary mb-2">
                          اعداد سريع - مزودين مجانيين موصى بهم:
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setCfgApiUrl('https://api.groq.com/openai/v1');
                              setCfgApiModel('llama-3.3-70b-versatile');
                            }}
                            className="text-xs border-primary/30 text-primary hover:bg-primary/5"
                          >
                            Groq (مجاني وسريع)
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setCfgApiUrl('https://openrouter.ai/api/v1');
                              setCfgApiModel('meta-llama/llama-3.3-70b-instruct:free');
                            }}
                            className="text-xs border-purple-500/30 text-purple-500 hover:bg-purple-500/5"
                          >
                            OpenRouter (نماذج مجانية)
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-2">
                          Groq: سجل في console.groq.com واحصل على مفتاح مجاني | OpenRouter: سجل في openrouter.ai
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">رابط API (Base URL)</Label>
                        <Input
                          value={cfgApiUrl}
                          onChange={e => setCfgApiUrl(e.target.value)}
                          placeholder="https://api.groq.com/openai/v1"
                          className="bg-background border-border text-foreground rounded-lg"
                          dir="ltr"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">مفتاح API</Label>
                        <Input
                          value={cfgApiKey}
                          onChange={e => setCfgApiKey(e.target.value)}
                          type="password"
                          placeholder="gsk_... او sk-..."
                          className="bg-background border-border text-foreground rounded-lg"
                          dir="ltr"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">اسم النموذج (Model)</Label>
                        <Input
                          value={cfgApiModel}
                          onChange={e => setCfgApiModel(e.target.value)}
                          placeholder="llama-3.3-70b-versatile"
                          className="bg-background border-border text-foreground rounded-lg"
                          dir="ltr"
                        />
                      </div>
                    </div>
                  )}

                  {/* Pollinations Info */}
                  <div className="p-4 bg-muted/30 rounded-xl border border-border/20">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      <span className="text-foreground font-semibold">ملاحظة:</span>{' '}
                      البوت يستخدم Pollinations.ai كاحتياطي تلقائي مجاني (بدون مفتاح) عند فشل المزود الاساسي.
                      لضمان افضل اداء وموثوقية، ينصح باستخدام API Token مع Groq او OpenRouter.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Password Settings */}
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Key size={20} className="text-primary" />
                    كلمة مرور الدخول
                  </CardTitle>
                  <CardDescription>كلمة المرور التي يستخدمها المستخدمون للانضمام للبوت</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">كلمة المرور</Label>
                    <Input
                      value={cfgPassword}
                      onChange={e => setCfgPassword(e.target.value)}
                      placeholder="كلمة المرور الجديدة"
                      className="bg-background border-border text-foreground rounded-lg"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Webhook Info */}
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    {webhookStatus === 'online' ? (
                      <Wifi size={20} className="text-emerald-500" />
                    ) : (
                      <WifiOff size={20} className="text-red-500" />
                    )}
                    حالة الـ Webhook
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <Badge
                      className={`border-0 ${
                        webhookStatus === 'online'
                          ? 'bg-emerald-500/15 text-emerald-500'
                          : 'bg-red-500/15 text-red-500'
                      }`}
                    >
                      {webhookStatus === 'online' ? 'متصل' : webhookStatus === 'checking' ? 'يتحقق...' : 'غير متصل'}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={checkWebhook}
                      className="text-xs"
                    >
                      <RefreshCw size={12} className="ml-1" />
                      فحص
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Save Button */}
              <div className="flex items-center gap-3">
                <Button
                  onClick={saveConfig}
                  disabled={savingConfig}
                  className="bg-primary text-primary-foreground font-bold rounded-xl px-8 h-12 hover:bg-primary/90"
                >
                  <Save size={18} className="ml-2" />
                  {savingConfig ? 'جاري الحفظ...' : 'حفظ الاعدادات'}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 py-4 text-center text-xs text-muted-foreground mt-auto">
        <p>مود شات - لوحة تحكم البوت الذكي</p>
      </footer>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle size={20} />
              تاكيد الحذف
            </DialogTitle>
            <DialogDescription>
              هل انت متاكد من حذف المستخدم &quot;{deleteDialog.userName}&quot;؟ سيتم حذف جميع رسائله ايضا. هذا الاجراء لا يمكن التراجع عنه.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, userId: null, userName: '' })}
              className="rounded-lg"
            >
              الغاء
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteDialog.userId && deleteUser(deleteDialog.userId)}
              className="rounded-lg"
            >
              <Trash2 size={14} className="ml-1" />
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
