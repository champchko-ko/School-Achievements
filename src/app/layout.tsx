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
        {/* Main Wrapper with original gradient */}
        <div className="flex h-screen overflow-hidden bg-[#46178f] bg-gradient-to-br from-[#46178f] via-[#380e6e] to-[#2a0a54] relative">
          
          {/* 
            Kahoot Touch: A subtle gamified dotted pattern overlay!
            It sits quietly in the background using Tailwind's radial-gradient.
            pointer-events-none ensures it doesn't block clicks.
          */}
          <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(#ffffff_1.5px,transparent_1.5px)] [background-size:24px_24px]"></div>

          <Sidebar />
          
          {/* Main Content Area - Added z-10 to stay above pattern, and scroll-smooth */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6 lg:p-8 print:p-0 print:overflow-visible w-full max-w-full min-w-0 z-10 scroll-smooth">
            {children}
          </main>
          
        </div>
      </body>
    </html>
