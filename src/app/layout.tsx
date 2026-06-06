import type { Metadata, Viewport } from "next";
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

// SEO-optimized metadata for maximum exposure
export const metadata: Metadata = {
  metadataBase: new URL('https://github.com/roman-ryzenadvanced/mantle-ai-trader'),
  title: {
    default: "Mantle AI Trader | AI-Powered Crypto Trading Bot with News Analysis",
    template: "%s | Mantle AI Trader"
  },
  description: "Advanced AI trading bot for cryptocurrency markets. Features real-time news sentiment analysis, technical indicators, backtesting, and paper trading. Built for Mantle Turing Test Hackathon with Bybit integration.",
  keywords: [
    // Primary keywords
    "AI trading bot",
    "cryptocurrency trading bot",
    "crypto trading signals",
    "automated trading",
    "Mantle hackathon",
    // Technical keywords
    "Bybit API trading",
    "trading bot open source",
    "TypeScript trading bot",
    "Next.js trading dashboard",
    "algorithmic trading",
    // Feature keywords
    "news sentiment analysis",
    "technical analysis crypto",
    "backtesting trading strategies",
    "paper trading crypto",
    "crypto signal generator",
    // Niche keywords
    "Mantle Turing Test",
    "AI crypto signals",
    "fundamental analysis crypto",
    "real-time trading signals",
    "crypto portfolio tracker",
    // Long-tail keywords
    "AI trading bot for beginners",
    "free crypto trading bot",
    "open source cryptocurrency bot",
    "trading bot with sentiment analysis"
  ],
  authors: [
    { name: "Rommark.Dev", url: "https://rommark.dev" },
    { name: "Roman | RyzenAdvanced", url: "https://github.com/roman-ryzenadvanced" }
  ],
  creator: "Rommark.Dev",
  publisher: "Rommark.Dev",
  applicationName: "Mantle AI Trader",
  generator: "Next.js 16",
  referrer: "origin-when-cross-origin",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/logo.svg", type: "image/svg+xml" }
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  alternates: {
    canonical: "https://github.com/roman-ryzenadvanced/mantle-ai-trader",
  },
  openGraph: {
    title: "Mantle AI Trader | AI-Powered Crypto Trading Bot",
    description: "Advanced AI trading bot with news sentiment analysis, technical indicators, backtesting, and paper trading. Built for Mantle Turing Test Hackathon.",
    url: "https://github.com/roman-ryzenadvanced/mantle-ai-trader",
    siteName: "Mantle AI Trader",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Mantle AI Trader - AI Crypto Trading Bot Dashboard",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mantle AI Trader | AI-Powered Crypto Trading Bot",
    description: "Advanced AI trading bot with news sentiment analysis, technical indicators, and backtesting.",
    images: ["/og-image.png"],
    creator: "@rommarkdev",
    site: "@rommarkdev",
  },
  category: "technology",
  classification: "Cryptocurrency Trading Software",
  other: {
    "revisit-after": "1 day",
    "language": "English",
    "geo.region": "US",
    "geo.placename": "Global",
    "distribution": "global",
    "rating": "general",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  colorScheme: "dark light",
};

// JSON-LD Structured Data for SEO
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Mantle AI Trader",
  "description": "AI-powered cryptocurrency trading bot with news sentiment analysis, technical indicators, backtesting, and paper trading capabilities.",
  "url": "https://github.com/roman-ryzenadvanced/mantle-ai-trader",
  "applicationCategory": "FinanceApplication",
  "operatingSystem": "Web, Linux, macOS, Windows",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD",
    "description": "Open source - Free to use"
  },
  "author": {
    "@type": "Organization",
    "name": "Rommark.Dev",
    "url": "https://rommark.dev"
  },
  "creator": {
    "@type": "Person",
    "name": "Roman | RyzenAdvanced",
    "url": "https://github.com/roman-ryzenadvanced"
  },
  "keywords": [
    "AI trading bot",
    "cryptocurrency trading",
    "crypto signals",
    "trading automation",
    "Bybit API",
    "Mantle hackathon"
  ],
  "featureList": [
    "AI Signal Generation",
    "News Sentiment Analysis",
    "Technical Analysis Indicators",
    "Backtesting Engine",
    "Paper Trading Mode",
    "Real-time Dashboard",
    "Bybit Exchange Integration"
  ],
  "screenshot": "https://github.com/roman-ryzenadvanced/mantle-ai-trader/raw/main/public/dashboard-screenshot.png",
  "license": "https://opensource.org/licenses/MIT",
  "codeRepository": "https://github.com/roman-ryzenadvanced/mantle-ai-trader",
  "programmingLanguage": "TypeScript",
  "runtimePlatform": "Node.js",
  "isAccessibleForFree": true,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Additional SEO Meta Tags */}
        <meta name="msvalidate.01" content="AI Trading Bot, Cryptocurrency, Mantle" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="author" href="https://rommark.dev" />
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
