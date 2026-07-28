import type { Metadata } from "next";
import { Tajawal } from "next/font/google";
import "./globals.css";
import Sidebar from '../components/Sidebar';

const tajawal = Tajawal({ subsets: ["arabic"], weight: ['400', '500', '700', '900'] });

export const metadata: Metadata = {
  title: "منصة إنجازات المدرسة",
  description: "تطبيق لتوثيق وتحفيز الإنجازات المدرسية",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className={tajawal.className}>
        <div className="flex h-screen overflow-hidden bg-gray-100">
          <Sidebar />
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6 lg:p-8 print:p-0 print:overflow-visible w-full max-w-full min-w-0">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
