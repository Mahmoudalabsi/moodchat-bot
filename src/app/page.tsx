'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, MessageSquare, Shield, Activity, Bot,
  UserCheck, UserX, Clock, Search, RefreshCw,
  Eye, Ban, Trash2, CheckCircle, BarChart3,
  Send, Key, AlertCircle, Wifi, WifiOff, Zap
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

// Types
interface Stats {
  totalUsers: number;
  approvedUsers: number;
  blockedUsers: number;
  pendingUsers: number;
  totalMessages: number;
  messagesToday: number;
  newUsersToday: number;
  activeUsers7d: number;
  topUsers: Array<{
    userId: number;
    firstName: string | null;
    username: string | null;
    totalMessages: number;
    lastActive: string;
  }>;
  recentJoins: Array<{
    id: string;
    action: string;
    passwordTried: string | null;
    timestamp: string;
    user: { firstName: string | null; username: string | null; userId: number } | null;
  }>;
  dailyMessages: Array<{ date: string; count: number }>;
}

interface User {
  id: string;
  userId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  isApproved: boolean;
  isBlocked: boolean;
  waitingForPassword: boolean;
  totalMessages: number;
  firstSeen: string;
  lastActive: string;
  joinAttempts: number;
  _count: { messages: number };
}

interface Message {
  id: string;
  userId: number;
  role: string;
  content: string;
  modelUsed: string | null;
  timestamp: string;
  user?: { firstName: string | null; username: string | null; userId: number } | null;
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
  const [webhookUrl, setWebhookUrl] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) setStats(await res.json());
    } catch (err) { console.error('Stats:', err); }
  }, []);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`/api/users?filter=${userFilter}&search=${searchQuery}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (err) { console.error('Users:', err); }
  }, [userFilter, searchQuery]);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/messages?limit=100');
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) { console.error('Messages:', err); }
  }, []);

  // Fetch user messages
  const fetchUserMessages = useCallback(async (userId: number) => {
    try {
      const res = await fetch(`/api/messages?userId=${userId}&limit=200`);
      if (res.ok) {
        const data = await res.json();
        setUserMessages(data.messages || []);
      }
    } catch (err) { console.error('User messages:', err); }
  }, []);

  // Check webhook status
  const checkWebhook = useCallback(async () => {
    try {
      setWebhookStatus('checking');
      const res = await fetch('/api/telegram', { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        const url = data?.result?.url;
        if (url) {
          setWebhookStatus('online');
          setWebhookUrl(url);
        } else {
          setWebhookStatus('offline');
          setWebhookUrl('');
        }
      } else {
        setWebhookStatus('offline');
      }
    } catch {
      setWebhookStatus('offline');
    }
  }, []);

  // User actions
  const blockUser = async (userId: number) => {
    await fetch('/api/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action: 'block' }),
    });
    fetchUsers(); fetchStats();
  };

  const unblockUser = async (userId: number) => {
    await fetch('/api/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action: 'unblock' }),
    });
    fetchUsers(); fetchStats();
  };

  const approveUser = async (userId: number) => {
    await fetch('/api/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action: 'approve' }),
    });
    fetchUsers(); fetchStats();
  };

  const deleteUser = async (userId: number) => {
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم وجميع رسائله؟ لا يمكن التراجع!')) return;
    await fetch(`/api/users?userId=${userId}`, { method: 'DELETE' });
    fetchUsers(); fetchStats();
  };

  const refreshAll = useCallback(() => {
    fetchStats(); fetchUsers(); fetchMessages(); checkWebhook();
  }, [fetchStats, fetchUsers, fetchMessages, checkWebhook]);

  // Initial load
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([fetchStats(), fetchUsers(), fetchMessages(), checkWebhook()]);
      setLoading(false);
    };
    loadAll();
  }, [fetchStats, fetchUsers, fetchMessages, checkWebhook]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchStats(); fetchMessages();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStats, fetchMessages]);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString('ar-EG', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return dateStr; }
  };

  const formatDateShort = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('ar-EG');
    } catch { return dateStr; }
  };

  if (loading && !stats) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <div className="text-center">
          <Bot className="w-16 h-16 text-emerald-400 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-400 text-lg">جاري تحميل لوحة التحكم...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-2.5 rounded-xl shadow-lg shadow-emerald-500/20">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-l from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                مود شات
              </h1>
              <p className="text-[11px] text-gray-500">لوحة تحكم بوت الذكاء الاصطناعي</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Webhook Status */}
            <Badge
              variant="outline"
              className={`text-xs border-0 ${
                webhookStatus === 'online' ? 'bg-emerald-500/15 text-emerald-400' :
                webhookStatus === 'checking' ? 'bg-yellow-500/15 text-yellow-400' :
                'bg-red-500/15 text-red-400'
              }`}
            >
              {webhookStatus === 'online' ? <Wifi className="w-3 h-3 ml-1" /> :
               webhookStatus === 'checking' ? <RefreshCw className="w-3 h-3 ml-1 animate-spin" /> :
               <WifiOff className="w-3 h-3 ml-1" />}
              {webhookStatus === 'online' ? 'متصل' :
               webhookStatus === 'checking' ? 'جاري الفحص...' : 'غير متصل'}
            </Badge>

            <Badge className="bg-emerald-500/15 text-emerald-400 border-0 text-xs">
              <Zap className="w-3 h-3 ml-1" /> Z-AI مجاني
            </Badge>

            <Button
              size="sm"
              variant="ghost"
              className="text-gray-400 hover:text-white h-8 w-8 p-0"
              onClick={refreshAll}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <StatCard icon={<Users className="w-5 h-5" />} label="إجمالي المستخدمين" value={stats?.totalUsers || 0} color="blue" />
          <StatCard icon={<UserCheck className="w-5 h-5" />} label="الموافق عليهم" value={stats?.approvedUsers || 0} color="emerald" />
          <StatCard icon={<MessageSquare className="w-5 h-5" />} label="إجمالي الرسائل" value={stats?.totalMessages || 0} color="amber" />
          <StatCard icon={<Activity className="w-5 h-5" />} label="نشطين (7 أيام)" value={stats?.activeUsers7d || 0} color="purple" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <MiniStat icon={<Ban className="w-4 h-4" />} label="محظورين" value={stats?.blockedUsers || 0} color="red" />
          <MiniStat icon={<Clock className="w-4 h-4" />} label="في الانتظار" value={stats?.pendingUsers || 0} color="yellow" />
          <MiniStat icon={<Send className="w-4 h-4" />} label="رسائل اليوم" value={stats?.messagesToday || 0} color="cyan" />
          <MiniStat icon={<Key className="w-4 h-4" />} label="كلمة السر" value="ai2024" color="pink" isText />
        </div>

        {/* Main Content */}
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="bg-gray-800/60 border border-gray-700/40 h-10">
            <TabsTrigger value="users" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 text-xs h-8">
              <Users className="w-3.5 h-3.5 ml-1" /> المستخدمين
            </TabsTrigger>
            <TabsTrigger value="messages" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 text-xs h-8">
              <MessageSquare className="w-3.5 h-3.5 ml-1" /> الرسائل
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 text-xs h-8">
              <BarChart3 className="w-3.5 h-3.5 ml-1" /> التحليلات
            </TabsTrigger>
            <TabsTrigger value="joins" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 text-xs h-8">
              <Shield className="w-3.5 h-3.5 ml-1" /> الانضمام
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 text-xs h-8">
              <Key className="w-3.5 h-3.5 ml-1" /> الإعدادات
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card className="bg-gray-800/40 border-gray-700/40">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <CardTitle className="text-base">إدارة المستخدمين</CardTitle>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-none">
                      <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
                      <Input
                        placeholder="بحث بالاسم أو المعرف..."
                        className="bg-gray-700/40 border-gray-600/50 pr-9 text-sm w-full sm:w-48 h-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <select
                      className="bg-gray-700/40 border border-gray-600/50 rounded-md px-2 py-1.5 text-sm text-gray-300 h-9"
                      value={userFilter}
                      onChange={(e) => setUserFilter(e.target.value)}
                    >
                      <option value="all">الكل</option>
                      <option value="approved">موافق عليهم</option>
                      <option value="pending">في الانتظار</option>
                      <option value="blocked">محظورين</option>
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-700/30 hover:bg-transparent">
                        <TableHead className="text-gray-500 text-xs">الحالة</TableHead>
                        <TableHead className="text-gray-500 text-xs">الاسم</TableHead>
                        <TableHead className="text-gray-500 text-xs">المعرف</TableHead>
                        <TableHead className="text-gray-500 text-xs">الرسائل</TableHead>
                        <TableHead className="text-gray-500 text-xs">آخر نشاط</TableHead>
                        <TableHead className="text-gray-500 text-xs">إجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-gray-600 py-10">
                            لا يوجد مستخدمين
                          </TableCell>
                        </TableRow>
                      ) : users.map((user) => (
                        <TableRow key={user.id} className="border-gray-700/20 hover:bg-gray-700/15">
                          <TableCell>
                            {user.isBlocked ? (
                              <Badge className="bg-red-500/15 text-red-400 border-0 text-[10px]">محظور</Badge>
                            ) : user.isApproved ? (
                              <Badge className="bg-emerald-500/15 text-emerald-400 border-0 text-[10px]">موافق</Badge>
                            ) : user.waitingForPassword ? (
                              <Badge className="bg-yellow-500/15 text-yellow-400 border-0 text-[10px]">ينتظر كلمة سر</Badge>
                            ) : (
                              <Badge className="bg-gray-500/15 text-gray-400 border-0 text-[10px]">انتظار</Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-medium text-sm">
                            {user.firstName || 'مجهول'} {user.lastName || ''}
                          </TableCell>
                          <TableCell className="text-gray-500 text-xs">
                            {user.username ? `@${user.username}` : `ID: ${user.userId}`}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="border-gray-700 text-gray-400 text-[10px]">
                              {user._count?.messages || user.totalMessages}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-[11px] text-gray-500">
                            {formatDateShort(user.lastActive)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-0.5">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button size="sm" variant="ghost"
                                    className="text-gray-500 hover:text-blue-400 h-7 w-7 p-0"
                                    onClick={() => { setSelectedUserId(user.userId); fetchUserMessages(user.userId); }}>
                                    <Eye className="w-3.5 h-3.5" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-gray-950 border-gray-800 max-w-2xl max-h-[85vh]">
                                  <DialogHeader>
                                    <DialogTitle className="text-white">
                                      💬 رسائل {user.firstName || user.userId}
                                    </DialogTitle>
                                  </DialogHeader>
                                  <ScrollArea className="max-h-[65vh]">
                                    <div className="space-y-2 p-1">
                                      {userMessages.length === 0 ? (
                                        <p className="text-gray-600 text-center py-6 text-sm">لا توجد رسائل</p>
                                      ) : userMessages.map((msg) => (
                                        <div key={msg.id}
                                          className={`p-2.5 rounded-lg text-sm ${
                                            msg.role === 'user'
                                              ? 'bg-blue-500/8 border border-blue-500/15'
                                              : 'bg-emerald-500/8 border border-emerald-500/15'
                                          }`}>
                                          <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                              msg.role === 'user' ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'
                                            }`}>
                                              {msg.role === 'user' ? '👤' : '🤖'}
                                            </span>
                                            <span className="text-[10px] text-gray-600">{formatDate(msg.timestamp)}</span>
                                          </div>
                                          <p className="text-gray-200 whitespace-pre-wrap text-xs leading-relaxed">{msg.content}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </ScrollArea>
                                </DialogContent>
                              </Dialog>

                              {!user.isApproved && (
                                <Button size="sm" variant="ghost"
                                  className="text-gray-500 hover:text-emerald-400 h-7 w-7 p-0"
                                  onClick={() => approveUser(user.userId)} title="موافقة">
                                  <CheckCircle className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {user.isBlocked ? (
                                <Button size="sm" variant="ghost"
                                  className="text-gray-500 hover:text-emerald-400 h-7 w-7 p-0"
                                  onClick={() => unblockUser(user.userId)} title="إلغاء الحظر">
                                  <UserCheck className="w-3.5 h-3.5" />
                                </Button>
                              ) : (
                                <Button size="sm" variant="ghost"
                                  className="text-gray-500 hover:text-red-400 h-7 w-7 p-0"
                                  onClick={() => blockUser(user.userId)} title="حظر">
                                  <Ban className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              <Button size="sm" variant="ghost"
                                className="text-gray-500 hover:text-red-500 h-7 w-7 p-0"
                                onClick={() => deleteUser(user.userId)} title="حذف نهائي">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Messages Tab */}
          <TabsContent value="messages">
            <Card className="bg-gray-800/40 border-gray-700/40">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">مراقبة الرسائل المباشرة</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-gray-700 text-gray-500 text-[10px]">
                      آخر 100 رسالة
                    </Badge>
                    <Button size="sm" variant="ghost" className="text-gray-500 h-7" onClick={fetchMessages}>
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[550px]">
                  <div className="space-y-1.5">
                    {messages.length === 0 ? (
                      <p className="text-gray-600 text-center py-10 text-sm">لا توجد رسائل بعد — عندما يتحدث المستخدمون مع البوت ستظهر رسائلهم هنا</p>
                    ) : messages.map((msg) => (
                      <div key={msg.id}
                        className={`p-2.5 rounded-lg border text-sm ${
                          msg.role === 'user'
                            ? 'bg-blue-500/5 border-blue-500/10'
                            : 'bg-emerald-500/5 border-emerald-500/10'
                        }`}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              msg.role === 'user' ? 'bg-blue-500/15 text-blue-300' : 'bg-emerald-500/15 text-emerald-300'
                            }`}>
                              {msg.role === 'user' ? '👤 مستخدم' : '🤖 مساعد'}
                            </span>
                            <span className="text-[11px] text-gray-500">
                              {msg.user?.firstName || msg.user?.username || `ID:${msg.userId}`}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-600">{formatDate(msg.timestamp)}</span>
                        </div>
                        <p className="text-gray-300 whitespace-pre-wrap text-xs leading-relaxed">{msg.content}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-gray-800/40 border-gray-700/40">
                <CardHeader><CardTitle className="text-sm">الرسائل اليومية (7 أيام)</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {stats?.dailyMessages.map((day) => {
                      const maxCount = Math.max(...(stats?.dailyMessages.map(d => d.count) || [1]), 1);
                      return (
                        <div key={day.date} className="flex items-center gap-3">
                          <span className="text-[11px] text-gray-500 w-16">{day.date.slice(5)}</span>
                          <div className="flex-1 bg-gray-700/20 rounded-full h-5 overflow-hidden">
                            <div
                              className="bg-gradient-to-l from-emerald-500 to-teal-400 h-full rounded-full flex items-center justify-end px-2 transition-all"
                              style={{ width: `${Math.max((day.count / maxCount) * 100, day.count > 0 ? 8 : 2)}%` }}
                            >
                              {day.count > 0 && <span className="text-[10px] font-bold text-white">{day.count}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    }) || <p className="text-gray-600 text-center py-4 text-sm">لا توجد بيانات</p>}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800/40 border-gray-700/40">
                <CardHeader><CardTitle className="text-sm">أكثر المستخدمين نشاطاً</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {stats?.topUsers.map((user, i) => (
                      <div key={user.userId} className="flex items-center gap-3 p-2 rounded-lg bg-gray-700/15">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          i === 0 ? 'bg-amber-500/20 text-amber-400' :
                          i === 1 ? 'bg-gray-400/20 text-gray-300' :
                          i === 2 ? 'bg-orange-500/20 text-orange-400' :
                          'bg-gray-600/20 text-gray-400'
                        }`}>{i + 1}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{user.firstName || user.username || `ID:${user.userId}`}</p>
                          <p className="text-[10px] text-gray-600">{user.userId}</p>
                        </div>
                        <Badge variant="outline" className="border-gray-700 text-emerald-400 text-[10px] shrink-0">
                          {user.totalMessages} رسالة
                        </Badge>
                      </div>
                    )) || <p className="text-gray-600 text-center py-4 text-sm">لا توجد بيانات</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Join Log Tab */}
          <TabsContent value="joins">
            <Card className="bg-gray-800/40 border-gray-700/40">
              <CardHeader><CardTitle className="text-sm">سجل محاولات الانضمام</CardTitle></CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[450px]">
                  <div className="space-y-1.5">
                    {stats?.recentJoins.length === 0 ? (
                      <p className="text-gray-600 text-center py-10 text-sm">لا توجد محاولات انضمام بعد</p>
                    ) : stats?.recentJoins.map((log) => (
                      <div key={log.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-700/15">
                        {log.action === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-400" /> :
                         log.action === 'fail' ? <AlertCircle className="w-4 h-4 text-red-400" /> :
                         <Clock className="w-4 h-4 text-yellow-400" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">
                            {log.user?.firstName || log.user?.username || `ID:${log.user?.userId || '?'}`}
                          </p>
                          <p className="text-[10px] text-gray-600">
                            {log.action === 'success' ? 'تم القبول ✅' :
                             log.action === 'fail' ? `كلمة سر خاطئة: "${log.passwordTried || '---'}"` :
                             'محاولة انضمام'}
                          </p>
                        </div>
                        <span className="text-[10px] text-gray-600 shrink-0">{formatDate(log.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-gray-800/40 border-gray-700/40">
                <CardHeader><CardTitle className="text-sm">معلومات البوت</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <InfoRow label="اسم البوت" value="@moodchatbot" />
                  <InfoRow label="مزود AI" value="Z-AI (GLM-4 Plus)" />
                  <InfoRow label="التكلفة" value="مجاني 100%" />
                  <InfoRow label="كلمة السر" value="ai2024" />
                  <InfoRow label="آيدي المدير" value="1429407129" />
                  <InfoRow label="وضع الاتصال" value={webhookStatus === 'online' ? 'Webhook ✅' : 'غير متصل ⚠️'} />
                  {webhookUrl && <InfoRow label="رابط Webhook" value={webhookUrl} />}
                </CardContent>
              </Card>

              <Card className="bg-gray-800/40 border-gray-700/40">
                <CardHeader><CardTitle className="text-sm">أوامر المدير في تيليجرام</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <CmdRow cmd="/dashboard" desc="عرض إحصائيات البوت" />
                  <CmdRow cmd="/users" desc="قائمة المستخدمين" />
                  <CmdRow cmd="/chatlog [ID]" desc="قراءة محادثة مستخدم" />
                  <CmdRow cmd="/block [ID]" desc="حظر مستخدم" />
                  <CmdRow cmd="/unblock [ID]" desc="إلغاء حظر" />
                  <CmdRow cmd="/kick [ID]" desc="حذف مستخدم نهائياً" />
                  <CmdRow cmd="/broadcast [نص]" desc="إرسال رسالة للجميع" />
                  <CmdRow cmd="/setpass [كلمة]" desc="تغيير كلمة السر" />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="mt-8 text-center text-[11px] text-gray-600 pb-4">
          🤖 مود شات — بوت تيليجرام الذكاء الاصطناعي | 🟣 Z-AI (GLM-4 Plus) مجاني
        </div>
      </main>
    </div>
  );
}

// ============================
// Sub Components
// ============================

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number | string; color: string;
}) {
  const colors: Record<string, string> = {
    blue: 'from-blue-500/10 to-blue-600/5 border-blue-500/20',
    emerald: 'from-emerald-500/10 to-emerald-600/5 border-emerald-500/20',
    amber: 'from-amber-500/10 to-amber-600/5 border-amber-500/20',
    purple: 'from-purple-500/10 to-purple-600/5 border-purple-500/20',
  };
  const iconColors: Record<string, string> = {
    blue: 'text-blue-400', emerald: 'text-emerald-400',
    amber: 'text-amber-400', purple: 'text-purple-400',
  };

  return (
    <Card className={`bg-gradient-to-br ${colors[color]} border`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-gray-500 mb-1">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <div className={iconColors[color]}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ icon, label, value, color, isText }: {
  icon: React.ReactNode; label: string; value: number | string; color: string; isText?: boolean;
}) {
  const iconColors: Record<string, string> = {
    red: 'text-red-400', yellow: 'text-yellow-400',
    cyan: 'text-cyan-400', pink: 'text-pink-400',
  };
  const valueColors: Record<string, string> = {
    red: 'text-red-400', yellow: 'text-yellow-400',
    cyan: 'text-cyan-400', pink: 'text-pink-400',
  };

  return (
    <Card className="bg-gray-800/25 border-gray-700/25">
      <CardContent className="p-3 flex items-center gap-3">
        <div className={iconColors[color]}>{icon}</div>
        <div>
          <p className="text-[10px] text-gray-500">{label}</p>
          <p className={`text-sm font-bold ${isText ? valueColors[color] : valueColors[color]}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-700/20 last:border-0">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className="text-white text-xs font-medium">{value}</span>
    </div>
  );
}

function CmdRow({ cmd, desc }: { cmd: string; desc: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <code className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[11px] font-mono">{cmd}</code>
      <span className="text-gray-500">{desc}</span>
    </div>
  );
}
