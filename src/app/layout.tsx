import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MoodChat - لوحة تحكم بوت التليجرام",
  description: "Smart Telegram Bot Dashboard - لوحة تحكم بوت التليجرام الذكاء الاصطناعي",
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              try{
                // Theme
                var t=localStorage.getItem('moodchat_theme');
                if(t!=='light')document.documentElement.classList.add('dark');
                // Language direction
                var l=localStorage.getItem('moodchat_lang');
                if(l==='en'){
                  document.documentElement.dir='ltr';
                  document.documentElement.lang='en';
                } else {
                  document.documentElement.dir='rtl';
                  document.documentElement.lang='ar';
                }
              }catch{
                document.documentElement.classList.add('dark');
                document.documentElement.dir='rtl';
                document.documentElement.lang='ar';
              }
            })()`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
