import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/components/auth-provider";

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
    default: "Mantle AI Trader | Multi-Exchange Crypto Trading Platform",
    template: "%s | Mantle AI Trader"
  },
  description: "AI-powered cryptocurrency trading platform with multi-exchange volume monitoring, professional order management, backtesting, demo/live trading, news sentiment analysis, and 10+ technical indicators. FOR EDUCATIONAL PURPOSES ONLY.",
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
    title: "Mantle AI Trader | Multi-Exchange Crypto Trading Platform",
    description: "AI-powered cryptocurrency trading platform with multi-exchange volume monitoring, professional order management, backtesting, and demo/live trading. FOR EDUCATIONAL PURPOSES ONLY.",
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
    title: "Mantle AI Trader | Multi-Exchange Crypto Trading Platform",
    description: "AI-powered cryptocurrency trading platform with multi-exchange volume monitoring, professional order management, backtesting, and demo/live trading. FOR EDUCATIONAL PURPOSES ONLY.",
    images: ["/og-image.png"],
    creator: "@rommarkdev",
    site: "@rommarkdev",
  },
  category: "technology",
  classification: "Educational Cryptocurrency Trading Software",
  other: {
    "revisit-after": "1 day",
    "language": "English",
    "geo.region": "US",
    "geo.placename": "Global",
    "distribution": "global",
    "rating": "general",
    // Financial disclaimer meta tags
    "financial-disclaimer": "This software is for educational purposes only. Trading involves substantial risk of loss.",
    "investment-disclaimer": "NOT financial advice. Past performance does not guarantee future results.",
    "risk-warning": "Cryptocurrency trading carries high risk. Never trade with money you cannot afford to lose.",
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
  "description": "AI-powered cryptocurrency trading bot with news sentiment analysis, technical indicators, backtesting, and paper trading capabilities. FOR EDUCATIONAL PURPOSES ONLY.",
  "url": "https://github.com/roman-ryzenadvanced/mantle-ai-trader",
  "applicationCategory": "EducationalApplication",
  "operatingSystem": "Web, Linux, macOS, Windows",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD",
    "description": "Open source - Free to use for educational purposes"
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
    "Mantle hackathon",
    "educational trading software"
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
  "disclaimer": "This software is for educational and demonstration purposes only. Trading cryptocurrencies involves substantial risk of loss. Past performance does not guarantee future results. AI signals are NOT financial advice. Never trade with money you cannot afford to lose.",
  "riskWarning": "Cryptocurrency trading carries a high level of risk and may not be suitable for all investors. You could lose all your investment."
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
        {/* Financial Disclaimer Meta Tags */}
        <meta name="financial-disclaimer" content="This software is for educational purposes only. Trading involves substantial risk of loss. Not financial advice." />
        <meta name="risk-warning" content="Cryptocurrency trading carries high risk. Never trade with money you cannot afford to lose. Past performance does not guarantee future results." />
        <meta name="investment-disclaimer" content="AI signals are algorithmic suggestions only. This is NOT financial advice. Consult a professional before investing." />
        <meta name="educational-purpose" content="This software is designed for educational and demonstration purposes for the Mantle Turing Test Hackathon." />
        {/* Legal Meta Tags */}
        <meta name="no-liability" content="The creators are not responsible for any financial losses. Use at your own risk." />
        <meta name="jurisdiction-warning" content="Cryptocurrency trading may be illegal in your jurisdiction. Ensure compliance with local laws." />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
