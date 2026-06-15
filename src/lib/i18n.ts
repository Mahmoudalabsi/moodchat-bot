/**
 * Internationalization System - MoodChat (مود شات)
 * نظام اللغات - عربي / English
 */

export type Lang = 'ar' | 'en';

export interface Translations {
  // General
  dir: 'rtl' | 'ltr';
  lang: Lang;
  langName: string;

  // App
  appName: string;
  appSubtitle: string;
  loading: string;
  protectedSystem: string;

  // Auth
  password: string;
  enterPassword: string;
  wrongPassword: string;
  connectionError: string;
  verifying: string;
  login: string;
  logout: string;

  // Nav Tabs
  tabStats: string;
  tabUsers: string;
  tabMessages: string;
  tabSettings: string;

  // Webhook Status
  online: string;
  offline: string;
  checking: string;

  // Theme
  lightMode: string;
  darkMode: string;

  // Stats
  totalUsers: string;
  approvedUsers: string;
  blockedUsers: string;
  totalMessages: string;
  messagesToday: string;
  newToday: string;
  active7d: string;
  pendingApproval: string;
  dailyMessages7d: string;
  topUsers: string;
  recentJoinAttempts: string;
  messages: string;
  anonymous: string;

  // Join Actions
  success: string;
  fail: string;
  attempt: string;

  // Users Tab
  all: string;
  approved: string;
  blocked: string;
  pending: string;
  searchUser: string;
  name: string;
  userId: string;
  status: string;
  msgs: string;
  lastActive: string;
  actions: string;
  noUsers: string;
  viewChat: string;
  approve: string;
  block: string;
  unblock: string;
  delete: string;

  // Delete Dialog
  confirmDelete: string;
  confirmDeleteMsg: string;
  cancel: string;

  // Messages Tab
  users: string;
  noMessagesYet: string;
  chatOf: string;
  chooseUser: string;
  loadMore: string;
  loadingMore: string;
  user: string;
  bot: string;

  // Settings
  aiProvider: string;
  chooseAiProvider: string;
  free: string;
  recommendedForVercel: string;
  zsdkDesc: string;
  apiTokenDesc: string;
  quickSetup: string;
  groqFree: string;
  openRouterFree: string;
  groqNote: string;
  apiBaseUrl: string;
  apiKey: string;
  modelName: string;
  pollinationsNote: string;
  joinPassword: string;
  joinPasswordDesc: string;
  newPassword: string;
  webhookStatus: string;
  check: string;
  saveSettings: string;
  saving: string;
  chatId: string;
  userIdLabel: string;
  token: string;

  // Footer
  footer: string;
}

const ar: Translations = {
  dir: 'rtl',
  lang: 'ar',
  langName: 'العربية',

  appName: 'مود شات',
  appSubtitle: 'لوحة تحكم البوت الذكي',
  loading: 'جاري التحميل...',
  protectedSystem: 'محمي بنظام مصادقة خاص',

  password: 'كلمة المرور',
  enterPassword: 'ادخل كلمة المرور',
  wrongPassword: 'كلمة المرور خاطئة',
  connectionError: 'حدث خطأ في الاتصال',
  verifying: 'جاري التحقق...',
  login: 'دخول',
  logout: 'خروج',

  tabStats: 'الاحصائيات',
  tabUsers: 'المستخدمين',
  tabMessages: 'المحادثات',
  tabSettings: 'الاعدادات',

  online: 'متصل',
  offline: 'غير متصل',
  checking: 'يتحقق...',

  lightMode: 'الوضع الفاتح',
  darkMode: 'الوضع الداكن',

  totalUsers: 'اجمالي المستخدمين',
  approvedUsers: 'المفعلين',
  blockedUsers: 'المحظورين',
  totalMessages: 'اجمالي الرسائل',
  messagesToday: 'رسائل اليوم',
  newToday: 'جدد اليوم',
  active7d: 'نشطون 7 ايام',
  pendingApproval: 'بانتظار الموافقة',
  dailyMessages7d: 'الرسائل اليومية - اخر 7 ايام',
  topUsers: 'اكثر المستخدمين نشاطا',
  recentJoinAttempts: 'محاولات الدخول الاخيرة',
  messages: 'رسالة',
  anonymous: 'مجهول',

  success: 'نجح',
  fail: 'فشل',
  attempt: 'محاولة',

  all: 'الكل',
  approved: 'مفعل',
  blocked: 'محظور',
  pending: 'معلق',
  searchUser: 'بحث عن مستخدم...',
  name: 'الاسم',
  userId: 'المعرف',
  status: 'الحالة',
  msgs: 'الرسائل',
  lastActive: 'اخر نشاط',
  actions: 'اجراءات',
  noUsers: 'لا يوجد مستخدمين',
  viewChat: 'عرض المحادثة',
  approve: 'موافقة',
  block: 'حظر',
  unblock: 'الغاء الحظر',
  delete: 'حذف',

  confirmDelete: 'تاكيد الحذف',
  confirmDeleteMsg: 'سيتم حذف المستخدم وجميع رسائله. هذا الاجراء لا يمكن التراجع عنه.',
  cancel: 'الغاء',

  users: 'المستخدمين',
  noMessagesYet: 'لا توجد رسائل بعد',
  chatOf: 'محادثة المستخدم',
  chooseUser: 'اختر مستخدم لعرض المحادثة',
  loadMore: 'تحميل المزيد',
  loadingMore: 'جاري التحميل...',
  user: 'المستخدم',
  bot: 'البوت',

  aiProvider: 'مزود الذكاء الاصطناعي',
  chooseAiProvider: 'اختر مزود الذكاء الاصطناعي للبوت',
  free: 'مجاني',
  recommendedForVercel: 'موصى به لـ Vercel',
  zsdkDesc: 'نظام Z-AI المدمج - سريع ومجاني بالكامل - الافضل اداء',
  apiTokenDesc: 'استخدم اي مزود AI يدعم OpenAI API - يعمل من Vercel بشكل موثوق',
  quickSetup: 'اعداد سريع - مزودين مجانيين موصى بهم',
  groqFree: 'Groq (مجاني وسريع)',
  openRouterFree: 'OpenRouter (نماذج مجانية)',
  groqNote: 'Groq: سجل في console.groq.com واحصل على مفتاح مجاني | OpenRouter: سجل في openrouter.ai',
  apiBaseUrl: 'رابط API (Base URL)',
  apiKey: 'مفتاح API',
  modelName: 'اسم النموذج (Model)',
  pollinationsNote: 'البوت يستخدم Pollinations.ai كاحتياطي تلقائي مجاني (بدون مفتاح) عند فشل المزود الاساسي. لضمان افضل اداء وموثوقية، ينصح باستخدام API Token مع Groq او OpenRouter.',
  joinPassword: 'كلمة مرور الدخول',
  joinPasswordDesc: 'كلمة المرور التي يستخدمها المستخدمون للانضمام للبوت',
  newPassword: 'كلمة المرور الجديدة',
  webhookStatus: 'حالة الـ Webhook',
  check: 'فحص',
  saveSettings: 'حفظ الاعدادات',
  saving: 'جاري الحفظ...',
  chatId: 'Chat ID',
  userIdLabel: 'User ID',
  token: 'Token',

  footer: 'مود شات - لوحة تحكم البوت الذكي',
};

const en: Translations = {
  dir: 'ltr',
  lang: 'en',
  langName: 'English',

  appName: 'MoodChat',
  appSubtitle: 'Smart Bot Dashboard',
  loading: 'Loading...',
  protectedSystem: 'Protected by authentication system',

  password: 'Password',
  enterPassword: 'Enter password',
  wrongPassword: 'Wrong password',
  connectionError: 'Connection error occurred',
  verifying: 'Verifying...',
  login: 'Login',
  logout: 'Logout',

  tabStats: 'Statistics',
  tabUsers: 'Users',
  tabMessages: 'Messages',
  tabSettings: 'Settings',

  online: 'Online',
  offline: 'Offline',
  checking: 'Checking...',

  lightMode: 'Light Mode',
  darkMode: 'Dark Mode',

  totalUsers: 'Total Users',
  approvedUsers: 'Approved',
  blockedUsers: 'Blocked',
  totalMessages: 'Total Messages',
  messagesToday: 'Messages Today',
  newToday: 'New Today',
  active7d: 'Active 7 Days',
  pendingApproval: 'Pending Approval',
  dailyMessages7d: 'Daily Messages - Last 7 Days',
  topUsers: 'Most Active Users',
  recentJoinAttempts: 'Recent Join Attempts',
  messages: 'messages',
  anonymous: 'Anonymous',

  success: 'Success',
  fail: 'Failed',
  attempt: 'Attempt',

  all: 'All',
  approved: 'Approved',
  blocked: 'Blocked',
  pending: 'Pending',
  searchUser: 'Search user...',
  name: 'Name',
  userId: 'User ID',
  status: 'Status',
  msgs: 'Messages',
  lastActive: 'Last Active',
  actions: 'Actions',
  noUsers: 'No users found',
  viewChat: 'View Chat',
  approve: 'Approve',
  block: 'Block',
  unblock: 'Unblock',
  delete: 'Delete',

  confirmDelete: 'Confirm Delete',
  confirmDeleteMsg: 'This user and all their messages will be deleted. This action cannot be undone.',
  cancel: 'Cancel',

  users: 'Users',
  noMessagesYet: 'No messages yet',
  chatOf: 'Chat of User',
  chooseUser: 'Select a user to view their chat',
  loadMore: 'Load More',
  loadingMore: 'Loading...',
  user: 'User',
  bot: 'Bot',

  aiProvider: 'AI Provider',
  chooseAiProvider: 'Choose the AI provider for the bot',
  free: 'Free',
  recommendedForVercel: 'Recommended for Vercel',
  zsdkDesc: 'Built-in Z-AI system - fast and completely free - best performance',
  apiTokenDesc: 'Use any AI provider supporting OpenAI API - works reliably from Vercel',
  quickSetup: 'Quick Setup - Recommended Free Providers',
  groqFree: 'Groq (Free & Fast)',
  openRouterFree: 'OpenRouter (Free Models)',
  groqNote: 'Groq: Sign up at console.groq.com for a free key | OpenRouter: Sign up at openrouter.ai',
  apiBaseUrl: 'API Base URL',
  apiKey: 'API Key',
  modelName: 'Model Name',
  pollinationsNote: 'The bot uses Pollinations.ai as a free automatic fallback (no key needed) when the primary provider fails. For best performance and reliability, using API Token with Groq or OpenRouter is recommended.',
  joinPassword: 'Join Password',
  joinPasswordDesc: 'The password users enter to join the bot',
  newPassword: 'New password',
  webhookStatus: 'Webhook Status',
  check: 'Check',
  saveSettings: 'Save Settings',
  saving: 'Saving...',
  chatId: 'Chat ID',
  userIdLabel: 'User ID',
  token: 'Token',

  footer: 'MoodChat - Smart Bot Dashboard',
};

export const translations: Record<Lang, Translations> = { ar, en };

export function getTranslation(lang: Lang): Translations {
  return translations[lang];
}
