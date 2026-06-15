'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, MessageSquare, Shield, Activity, Bot,
  UserCheck, UserX, Clock, Search, RefreshCw,
  Eye, Ban, Trash2, CheckCircle, BarChart3,
  Send, Key, Wifi, WifiOff, Settings, Moon,
  ChevronLeft, Save, Zap
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// Colors
const C = {
  bg: '#0B1929', card: '#1E3A5F', cardHover: '#264A6E',
  accent: '#D4A853', accentHover: '#E5BD6A',
  text: '#F0E6D3', textSec: '#8BA3C1',
  success: '#4ADE80', danger: '#F87171', warn: '#FBBF24',
  border: '#2A4A6B',
};

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

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [userFilter, setUserFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [userMessages, setUserMessages] = useState<Message[]>([]);
  const [webhookStatus, setWebhookStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [activeTab, setActiveTab] = useState('stats');
  const [savingConfig, setSavingConfig] = useState(false);

  // Config form state
  const [cfgProvider, setCfgProvider] = useState('zsdk');
  const [cfgApiUrl, setCfgApiUrl] = useState('');
  const [cfgApiKey, setCfgApiKey] = useState('');
  const [cfgApiModel, setCfgApiModel] = useState('');
  const [cfgZaiChatId, setCfgZaiChatId] = useState('');
  const [cfgZaiUserId, setCfgZaiUserId] = useState('');
  const [cfgZaiToken, setCfgZaiToken] = useState('');
  const [cfgPassword, setCfgPassword] = useState('');

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try { const r = await fetch('/api/stats'); if (r.ok) setStats(await r.json()); } catch {}
  }, []);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    try {
      const r = await fetch(`/api/users?filter=${userFilter}&search=${searchQuery}`);
      if (r.ok) { const d = await r.json(); setUsers(d.users || []); }
    } catch {}
  }, [userFilter, searchQuery]);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    try {
      const r = await fetch('/api/messages?limit=100');
      if (r.ok) { const d = await r.json(); setMessages(d.messages || []); }
    } catch {}
  }, []);

  // Fetch user messages
  const fetchUserMessages = useCallback(async (uid: number) => {
    try {
      const r = await fetch(`/api/messages?userId=${uid}&limit=200`);
      if (r.ok) { const d = await r.json(); setUserMessages(d.messages || []); }
    } catch {}
  }, []);

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
    } catch {}
  }, []);

  // Check webhook
  const checkWebhook = useCallback(async () => {
    try {
      const r = await fetch('/api/telegram');
      if (r.ok) {
        const d = await r.json();
        setWebhookStatus(d.result?.url ? 'online' : 'offline');
      } else { setWebhookStatus('offline'); }
    } catch { setWebhookStatus('offline'); }
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
    } catch {}
    setSavingConfig(false);
  };

  // User actions
  const blockUser = async (userId: number) => {
    await fetch('/api/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, action: 'block' }) });
    fetchUsers();
  };
  const unblockUser = async (userId: number) => {
    await fetch('/api/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, action: 'unblock' }) });
    fetchUsers();
  };
  const approveUser = async (userId: number) => {
    await fetch('/api/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, action: 'approve' }) });
    fetchUsers();
  };
  const deleteUser = async (userId: number) => {
    await fetch(`/api/users?userId=${userId}`, { method: 'DELETE' });
    fetchUsers(); fetchStats();
  };

  useEffect(() => { fetchStats(); fetchUsers(); fetchMessages(); fetchConfig(); checkWebhook(); }, []);
  useEffect(() => { fetchUsers(); }, [userFilter, searchQuery]);
  useEffect(() => {
    if (selectedUserId) fetchUserMessages(selectedUserId);
  }, [selectedUserId, fetchUserMessages]);

  const statCards = stats ? [
    { label: 'المستخدمين', value: stats.totalUsers, icon: Users, color: C.accent },
    { label: 'المفعلين', value: stats.approvedUsers, icon: UserCheck, color: C.success },
    { label: 'المحظورين', value: stats.blockedUsers, icon: UserX, color: C.danger },
    { label: 'الرسائل', value: stats.totalMessages, icon: MessageSquare, color: '#60A5FA' },
    { label: 'رسائل اليوم', value: stats.messagesToday, icon: Activity, color: C.warn },
    { label: 'جدد اليوم', value: stats.newUsersToday, icon: Zap, color: '#A78BFA' },
  ] : [];

  return (
    <div style={{ background: C.bg, minHeight: '100vh', direction: 'rtl', color: C.text }}>
      {/* Header */}
      <header style={{ background: `linear-gradient(135deg, ${C.card} 0%, #0F2847 100%)`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ position: 'relative' }}>
              <Moon size={36} style={{ color: C.accent, filter: 'drop-shadow(0 0 12px rgba(212,168,83,0.5))' }} />
              <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle, rgba(212,168,83,0.2) 0%, transparent 70%)`, borderRadius: '50%', animation: 'pulse 3s ease-in-out infinite' }} />
            </div>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: C.accent, margin: 0, letterSpacing: '-0.5px' }}>مود شات</h1>
              <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>لوحة تحكم البوت الذكي</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Badge variant="outline" style={{ borderColor: webhookStatus === 'online' ? C.success : C.danger, color: webhookStatus === 'online' ? C.success : C.danger, background: 'transparent', fontSize: 12 }}>
              {webhookStatus === 'online' ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span style={{ marginRight: 6 }}>{webhookStatus === 'online' ? 'متصل' : webhookStatus === 'checking' ? 'يتحقق...' : 'غير متصل'}</span>
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => { fetchStats(); fetchUsers(); fetchMessages(); fetchConfig(); checkWebhook(); }} style={{ color: C.textSec }}>
              <RefreshCw size={16} />
            </Button>
          </div>
        </div>
      </header>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.1); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.3s ease-out; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: ${C.bg}; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
        .recharts-tooltip-wrapper { direction: ltr; }
      `}</style>

      {/* Main Content */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px' }}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 4, gap: 4, display: 'flex', width: 'fit-content' }}>
            {[
              { v: 'stats', l: 'الإحصائيات', i: BarChart3 },
              { v: 'users', l: 'المستخدمين', i: Users },
              { v: 'messages', l: 'المحادثات', i: MessageSquare },
              { v: 'settings', l: 'الإعدادات', i: Settings },
            ].map(t => (
              <TabsTrigger key={t.v} value={t.v} style={{ color: activeTab === t.v ? C.accent : C.textSec, background: activeTab === t.v ? `${C.accent}15` : 'transparent', borderRadius: 8, padding: '8px 20px', fontSize: 14, fontWeight: activeTab === t.v ? 700 : 400, display: 'flex', alignItems: 'center', gap: 8, border: 'none', transition: 'all 0.2s' }}>
                <t.i size={16} /> {t.l}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Stats Tab */}
          <TabsContent value="stats" className="fade-in">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginTop: 20 }}>
              {statCards.map((s, i) => (
                <Card key={i} style={{ background: `linear-gradient(145deg, ${C.card} 0%, ${C.cardHover} 100%)`, border: `1px solid ${C.border}`, borderRadius: 16 }}>
                  <CardContent style={{ padding: '20px 16px', textAlign: 'center' }}>
                    <s.icon size={28} style={{ color: s.color, margin: '0 auto 8px' }} />
                    <div style={{ fontSize: 32, fontWeight: 800, color: C.text, lineHeight: 1 }}>{s.value}</div>
                    <div style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>{s.label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Daily Chart */}
            {stats?.dailyMessages && (
              <Card style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, marginTop: 24 }}>
                <CardHeader><CardTitle style={{ color: C.text, fontSize: 16 }}>الرسائل اليومية</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={stats.dailyMessages}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                      <XAxis dataKey="date" tick={{ fill: C.textSec, fontSize: 12 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fill: C.textSec, fontSize: 12 }} />
                      <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }} />
                      <Bar dataKey="count" fill={C.accent} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Recent Joins */}
            {stats?.recentJoins && stats.recentJoins.length > 0 && (
              <Card style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, marginTop: 24 }}>
                <CardHeader><CardTitle style={{ color: C.text, fontSize: 16 }}>محاولات الدخول الأخيرة</CardTitle></CardHeader>
                <CardContent>
                  {stats.recentJoins.map((j, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.border}30` }}>
                      <span style={{ color: C.text }}>{j.user?.firstName || 'مجهول'}</span>
                      <Badge style={{ background: j.action === 'success' ? C.success + '20' : j.action === 'fail' ? C.danger + '20' : C.warn + '20', color: j.action === 'success' ? C.success : j.action === 'fail' ? C.danger : C.warn, border: 'none', fontSize: 11 }}>
                        {j.action === 'success' ? 'نجح' : j.action === 'fail' ? 'فشل' : 'محاولة'}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="fade-in">
            <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {['all', 'approved', 'blocked', 'pending'].map(f => (
                  <Button key={f} size="sm" onClick={() => setUserFilter(f)} style={{ background: userFilter === f ? C.accent : C.card, color: userFilter === f ? C.bg : C.textSec, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                    {f === 'all' ? 'الكل' : f === 'approved' ? 'مفعل' : f === 'blocked' ? 'محظور' : 'معلق'}
                  </Button>
                ))}
              </div>
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <Search size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: C.textSec }} />
                <Input placeholder="بحث..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, paddingRight: 36 }} />
              </div>
            </div>

            <Card style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, marginTop: 16, overflow: 'hidden' }}>
              <Table>
                <TableHeader>
                  <TableRow style={{ borderBottom: `1px solid ${C.border}` }}>
                    <TableHead style={{ color: C.textSec }}>الاسم</TableHead>
                    <TableHead style={{ color: C.textSec }}>المعرف</TableHead>
                    <TableHead style={{ color: C.textSec }}>الحالة</TableHead>
                    <TableHead style={{ color: C.textSec }}>الرسائل</TableHead>
                    <TableHead style={{ color: C.textSec }}>آخر نشاط</TableHead>
                    <TableHead style={{ color: C.textSec }}>إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(u => (
                    <TableRow key={u.id} style={{ borderBottom: `1px solid ${C.border}30` }}>
                      <TableCell style={{ color: C.text }}>{u.firstName || u.username || 'مجهول'}</TableCell>
                      <TableCell style={{ color: C.textSec, fontFamily: 'monospace', fontSize: 12 }}>{u.userId}</TableCell>
                      <TableCell>
                        <Badge style={{ background: u.isBlocked ? C.danger + '20' : u.isApproved ? C.success + '20' : C.warn + '20', color: u.isBlocked ? C.danger : u.isApproved ? C.success : C.warn, border: 'none', fontSize: 11 }}>
                          {u.isBlocked ? 'محظور' : u.isApproved ? 'مفعل' : 'معلق'}
                        </Badge>
                      </TableCell>
                      <TableCell style={{ color: C.textSec }}>{u.totalMessages}</TableCell>
                      <TableCell style={{ color: C.textSec, fontSize: 12 }}>{new Date(u.lastActive).toLocaleDateString('ar-EG')}</TableCell>
                      <TableCell>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Button variant="ghost" size="sm" onClick={() => { setSelectedUserId(u.userId); setActiveTab('messages'); }} style={{ color: '#60A5FA', padding: 4 }}><Eye size={16} /></Button>
                          {!u.isApproved && <Button variant="ghost" size="sm" onClick={() => approveUser(u.userId)} style={{ color: C.success, padding: 4 }}><CheckCircle size={16} /></Button>}
                          {!u.isBlocked && <Button variant="ghost" size="sm" onClick={() => blockUser(u.userId)} style={{ color: C.danger, padding: 4 }}><Ban size={16} /></Button>}
                          {u.isBlocked && <Button variant="ghost" size="sm" onClick={() => unblockUser(u.userId)} style={{ color: C.success, padding: 4 }}><CheckCircle size={16} /></Button>}
                          <Button variant="ghost" size="sm" onClick={() => { if (confirm('حذف هذا المستخدم؟')) deleteUser(u.userId); }} style={{ color: C.danger, padding: 4 }}><Trash2 size={16} /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && (
                    <TableRow><TableCell colSpan={6} style={{ color: C.textSec, textAlign: 'center', padding: 40 }}>لا يوجد مستخدمين</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Messages Tab */}
          <TabsContent value="messages" className="fade-in">
            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, marginTop: 20 }}>
              {/* Users list */}
              <Card style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
                <CardHeader style={{ padding: '12px 16px' }}><CardTitle style={{ color: C.text, fontSize: 14 }}>المستخدمين</CardTitle></CardHeader>
                <ScrollArea style={{ height: 500 }}>
                  {[...new Map(messages.filter(m => m.user).map(m => [m.user!.userId, m.user!])).values()].map(u => (
                    <button key={u!.userId} onClick={() => { setSelectedUserId(u!.userId); fetchUserMessages(u!.userId); }}
                      style={{ width: '100%', padding: '10px 16px', background: selectedUserId === u!.userId ? `${C.accent}15` : 'transparent', border: 'none', borderBottom: `1px solid ${C.border}30`, cursor: 'pointer', textAlign: 'right', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: selectedUserId === u!.userId ? C.accent : C.text, fontSize: 13 }}>{u!.firstName || u!.username || 'مجهول'}</span>
                      <ChevronLeft size={14} style={{ color: C.textSec }} />
                    </button>
                  ))}
                </ScrollArea>
              </Card>

              {/* Chat view */}
              <Card style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
                <CardHeader style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
                  <CardTitle style={{ color: C.text, fontSize: 14 }}>
                    {selectedUserId ? `محادثة المستخدم ${selectedUserId}` : 'اختر مستخدم لعرض المحادثة'}
                  </CardTitle>
                </CardHeader>
                <CardContent style={{ padding: 16 }}>
                  <ScrollArea style={{ height: 450 }}>
                    {selectedUserId ? userMessages.map(m => (
                      <div key={m.id} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-start' : 'flex-end', marginBottom: 12 }}>
                        <div style={{ maxWidth: '75%', padding: '10px 14px', borderRadius: 16, background: m.role === 'user' ? `${C.accent}20` : `${C.success}15`, border: `1px solid ${m.role === 'user' ? `${C.accent}30` : `${C.success}20`}` }}>
                          <p style={{ color: C.text, fontSize: 13, margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{m.content}</p>
                          <span style={{ fontSize: 10, color: C.textSec, marginTop: 4, display: 'block' }}>{new Date(m.timestamp).toLocaleTimeString('ar-EG')}</span>
                        </div>
                      </div>
                    )) : (
                      <div style={{ textAlign: 'center', padding: 60, color: C.textSec }}>
                        <MessageSquare size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                        <p>اختر مستخدم من القائمة لعرض محادثته</p>
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="fade-in">
            <div style={{ display: 'grid', gap: 20, marginTop: 20, maxWidth: 800 }}>

              {/* AI Provider Selection */}
              <Card style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16 }}>
                <CardHeader>
                  <CardTitle style={{ color: C.text, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Bot size={20} style={{ color: C.accent }} /> مزود الذكاء الاصطناعي
                  </CardTitle>
                </CardHeader>
                <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Z-AI SDK Option */}
                  <button onClick={() => setCfgProvider('zsdk')}
                    style={{ padding: 20, borderRadius: 12, border: `2px solid ${cfgProvider === 'zsdk' ? C.accent : C.border}`, background: cfgProvider === 'zsdk' ? `${C.accent}10` : 'transparent', cursor: 'pointer', textAlign: 'right', transition: 'all 0.2s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${cfgProvider === 'zsdk' ? C.accent : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {cfgProvider === 'zsdk' && <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.accent }} />}
                        </div>
                        <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>Z-AI SDK</span>
                      </div>
                      <Badge style={{ background: `${C.accent}20`, color: C.accent, border: 'none', fontWeight: 700 }}>مجاني ⚡</Badge>
                    </div>
                    <p style={{ color: C.textSec, fontSize: 13, marginTop: 8, margin: '8px 0 0 30px' }}>نظام Z-AI المدمج - سريع ومجاني بالكامل - الأفضل أداءً</p>
                  </button>

                  {/* Z-AI Config */}
                  {cfgProvider === 'zsdk' && (
                    <div style={{ marginRight: 30, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <label style={{ color: C.textSec, fontSize: 12, display: 'block', marginBottom: 4 }}>Chat ID</label>
                        <Input value={cfgZaiChatId} onChange={e => setCfgZaiChatId(e.target.value)} placeholder="chat-xxx..." style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8 }} />
                      </div>
                      <div>
                        <label style={{ color: C.textSec, fontSize: 12, display: 'block', marginBottom: 4 }}>User ID</label>
                        <Input value={cfgZaiUserId} onChange={e => setCfgZaiUserId(e.target.value)} placeholder="user-id..." style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8 }} />
                      </div>
                      <div>
                        <label style={{ color: C.textSec, fontSize: 12, display: 'block', marginBottom: 4 }}>Token</label>
                        <Input value={cfgZaiToken} onChange={e => setCfgZaiToken(e.target.value)} type="password" placeholder="eyJ..." style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8 }} />
                      </div>
                    </div>
                  )}

                  {/* API Token Option */}
                  <button onClick={() => setCfgProvider('api')}
                    style={{ padding: 20, borderRadius: 12, border: `2px solid ${cfgProvider === 'api' ? C.accent : C.border}`, background: cfgProvider === 'api' ? `${C.accent}10` : 'transparent', cursor: 'pointer', textAlign: 'right', transition: 'all 0.2s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${cfgProvider === 'api' ? C.accent : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {cfgProvider === 'api' && <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.accent }} />}
                        </div>
                        <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>API Token</span>
                      </div>
                      <Badge style={{ background: '#60A5FA20', color: '#60A5FA', border: 'none', fontWeight: 700 }}>موصى به لـ Vercel</Badge>
                    </div>
                    <p style={{ color: C.textSec, fontSize: 13, marginTop: 8, margin: '8px 0 0 30px' }}>استخدم أي مزود AI يدعم OpenAI API — يعمل من Vercel بشكل موثوق</p>
                  </button>

                  {/* API Config */}
                  {cfgProvider === 'api' && (
                    <div style={{ marginRight: 30, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* Quick Setup Buttons */}
                      <div style={{ background: `${C.bg}80`, borderRadius: 10, padding: 14, border: `1px solid ${C.border}40` }}>
                        <p style={{ color: C.accent, fontSize: 13, fontWeight: 700, margin: '0 0 10px' }}>⚡ إعداد سريع — مزودين مجانيين موصى بهم:</p>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button onClick={() => { setCfgApiUrl('https://api.groq.com/openai/v1'); setCfgApiModel('llama-3.3-70b-versatile'); }}
                            style={{ padding: '6px 14px', borderRadius: 8, background: `${C.accent}20`, border: `1px solid ${C.accent}40`, color: C.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            🚀 Groq (مجاني وسريع)
                          </button>
                          <button onClick={() => { setCfgApiUrl('https://openrouter.ai/api/v1'); setCfgApiModel('meta-llama/llama-3.3-70b-instruct:free'); }}
                            style={{ padding: '6px 14px', borderRadius: 8, background: '#A78BFA20', border: '1px solid #A78BFA40', color: '#A78BFA', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            🌐 OpenRouter (نماذج مجانية)
                          </button>
                        </div>
                        <p style={{ color: C.textSec, fontSize: 11, margin: '8px 0 0' }}>
                          Groq: سجّل في console.groq.com واحصل على مفتاح مجاني | OpenRouter: سجّل في openrouter.ai
                        </p>
                      </div>
                      <div>
                        <label style={{ color: C.textSec, fontSize: 12, display: 'block', marginBottom: 4 }}>رابط API (Base URL)</label>
                        <Input value={cfgApiUrl} onChange={e => setCfgApiUrl(e.target.value)} placeholder="https://api.groq.com/openai/v1" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, direction: 'ltr' }} />
                      </div>
                      <div>
                        <label style={{ color: C.textSec, fontSize: 12, display: 'block', marginBottom: 4 }}>مفتاح API</label>
                        <Input value={cfgApiKey} onChange={e => setCfgApiKey(e.target.value)} type="password" placeholder="gsk_... أو sk-..." style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, direction: 'ltr' }} />
                      </div>
                      <div>
                        <label style={{ color: C.textSec, fontSize: 12, display: 'block', marginBottom: 4 }}>اسم النموذج (Model)</label>
                        <Input value={cfgApiModel} onChange={e => setCfgApiModel(e.target.value)} placeholder="llama-3.3-70b-versatile" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, direction: 'ltr' }} />
                      </div>
                    </div>
                  )}

                  {/* Pollinations Fallback Info */}
                  <div style={{ background: `${C.bg}60`, borderRadius: 10, padding: 14, border: `1px solid ${C.border}30` }}>
                    <p style={{ color: C.textSec, fontSize: 12, margin: 0, lineHeight: 1.7 }}>
                      💡 <span style={{ color: C.text, fontWeight: 600 }}>ملاحظة:</span> البوت يستخدم Pollinations.ai كاحتياطي تلقائي مجاني (بدون مفتاح) عند فشل المزود الأساسي.
                      لضمان أفضل أداء وموثوقية، يُنصح باستخدام API Token مع Groq أو OpenRouter.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Password Settings */}
              <Card style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16 }}>
                <CardHeader>
                  <CardTitle style={{ color: C.text, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Key size={20} style={{ color: C.accent }} /> كلمة مرور الدخول
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ color: C.textSec, fontSize: 12, display: 'block', marginBottom: 4 }}>كلمة المرور</label>
                      <Input value={cfgPassword} onChange={e => setCfgPassword(e.target.value)} placeholder="كلمة المرور الجديدة" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8 }} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Save Button */}
              <Button onClick={saveConfig} disabled={savingConfig}
                style={{ background: C.accent, color: C.bg, fontWeight: 700, borderRadius: 12, padding: '12px 32px', fontSize: 15, alignSelf: 'flex-start', border: 'none' }}>
                <Save size={18} style={{ marginLeft: 8 }} />
                {savingConfig ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
