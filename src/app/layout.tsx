import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Tajawal } from "next/font/google";
import "./globals.css";
import Sidebar from '../components/Sidebar';
import PwaInstallPrompt from '../components/PwaInstallPrompt';

const tajawal = Tajawal({ subsets: ["arabic"], weight: ['400', '500', '700', '900'] });

export const metadata: Metadata = {
  title: {
    default: 'إنجازات المدرسة',
    template: '%s | إنجازات المدرسة',
  },
  description: 'منصة عرض إنجازات الطلاب والأنشطة المدرسية — تتبع التقييمات وال.equivalencies والأنشطة التعليمية.',
  keywords: ['إنجازات مدرسية', 'طلاب', 'أنشطة تعليمية', 'تقييمات', 'شهادات', ' school achievements', 'student awards', 'education'],
  applicationName: 'School Achievements',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'إنجازات المدرسة',
  },
  openGraph: {
    type: 'website',
    locale: 'ar_SA',
    siteName: 'إنجازات المدرسة',
    title: 'إنجازات المدرسة — منصة عرض إنجازات الطلاب',
    description: 'منصة عرض إنجازات الطلاب والأنشطة المدرسية مع تقييمات ومتابعة.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'إنجازات المدرسة - منصة عرض إنجازات الطلاب',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'إنجازات المدرسة',
    description: 'منصة عرض إنجازات الطلاب والأنشطة المدرسية.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://school-achievements-six.vercel.app',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#46178F',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className={tajawal.className}>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:right-4 focus:z-[999] focus:bg-white focus:text-[#46178f] focus:px-4 focus:py-2 focus:rounded-xl focus:font-black focus:shadow-lg">
          انتقال إلى المحتوى الرئيسي
        </a>
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
          <main id="main-content" className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6 lg:p-8 print:p-0 print:overflow-visible w-full max-w-full min-w-0 z-10 scroll-smooth">
            {children}
          </main>
          
        </div>

        <PwaInstallPrompt />

        {process.env.NEXT_PUBLIC_CF_BEACON_TOKEN && (
          <Script
            defer
            strategy="afterInteractive"
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: process.env.NEXT_PUBLIC_CF_BEACON_TOKEN })}
          />
        )}
      </body>
    </html>
  );
}
