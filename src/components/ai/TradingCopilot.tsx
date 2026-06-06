'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, X, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

const SUGGESTION_CHIPS = ['Analyze BTC', 'Risk Check', 'Explain Signal', 'Market Overview'];

const PLACEHOLDER_RESPONSES: Record<string, string> = {
  'Analyze BTC':
    '## BTCUSDT Analysis\n\nBased on current conditions:\n\n- **RSI (4H):** 55 — neutral zone\n- **MACD:** Crossing above signal line → bullish crossover\n- **Volume:** 12% above 24h average\n- **Key Resistance:** $68,500\n- **Key Support:** $64,200\n\n> Overall sentiment: **Bullish** with moderate confidence.',
  'Risk Check':
    '## Risk Assessment\n\n- **Daily P&L:** +2.3% (within limits)\n- **Drawdown:** 4.1% (safe zone)\n- **Open Positions:** 3 (well diversified)\n- **Margin Usage:** 32% of available\n- **Consecutive Losses:** 0\n\nRisk status: **All clear**. No action needed.',
  'Explain Signal':
    '## Signal Breakdown\n\nThe latest signal was a **BUY** on BTCUSDT with **78% confidence**.\n\n### Technical Factors\n- Momentum indicators showing upward trend\n- Price above 200 EMA\n- Bollinger Band squeeze detected\n\n### Sentiment Factors\n- Positive news flow (score: 0.72)\n- Social volume spike (+45%)\n\nThe signal combines technical strength with favorable sentiment.',
  'Market Overview':
    '## Market Overview\n\n| Metric | Value |\n|--------|-------|\n| BTC Dominance | 52.3% |\n| Fear & Greed | 61 (Greed) |\n| Total Volume (24h) | $142B |\n| BTC Price | $67,800 |\n| ETH Price | $3,620 |\n\nTop movers: **SOL +8.2%**, **AVAX +5.1%**, **DOGE +3.8%**',
};

const DEFAULT_RESPONSE =
  'Analyzing market data... Based on current conditions, BTCUSDT shows bullish momentum with RSI at 55 and MACD crossing above signal line. Volume is slightly elevated, suggesting increasing institutional interest.';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Server-safe loader that only renders on client
export function TradingCopilotLoader() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return <TradingCopilot />;
}

export function TradingCopilot() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: generateId(),
      role: 'system',
      content: 'Mantle AI Copilot initialized. How can I help you today?',
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const addAssistantMessage = useCallback((userContent: string) => {
    const responseText =
      PLACEHOLDER_RESPONSES[userContent] ||
      DEFAULT_RESPONSE;

    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: responseText,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, assistantMessage]);
    setIsLoading(false);

    if (!isOpen) {
      setUnreadCount((prev) => prev + 1);
    }
  }, [isOpen]);

  const handleSend = useCallback(
    (text?: string) => {
      const content = text || input.trim();
      if (!content || isLoading) return;

      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setIsLoading(true);

      setTimeout(() => addAssistantMessage(content), 1000);
    },
    [input, isLoading, addAssistantMessage]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    setUnreadCount(0);
  };

  const handleSuggestionClick = (chip: string) => {
    handleSend(chip);
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  return (
    <>
      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="fixed bottom-24 right-6 z-50 flex flex-col overflow-hidden bg-gray-900/95 backdrop-blur-xl border border-gray-700 rounded-2xl shadow-2xl"
            style={{ width: 380, height: 500 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-semibold text-white">AI Trading Copilot</h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.role === 'user'
                      ? 'justify-end'
                      : msg.role === 'assistant'
                        ? 'justify-start'
                        : 'justify-center'
                  }`}
                >
                  <div
                    className={`max-w-[85%] px-3 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-2xl rounded-br-md'
                        : msg.role === 'assistant'
                          ? 'bg-gray-800 text-gray-100 rounded-2xl rounded-bl-md'
                          : 'bg-gray-900 text-gray-400 text-xs rounded-xl px-4 py-1.5'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-invert prose-sm max-w-none [&>p]:mb-1 [&>ul]:mb-1 [&>ol]:mb-1 [&>table]:text-xs [&>th]:p-1 [&>td]:p-1">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <span>{msg.content}</span>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-800 text-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex gap-1.5">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Suggestion Chips */}
            <div className="px-3 pb-2 flex gap-1.5 overflow-x-auto">
              {SUGGESTION_CHIPS.map((chip) => (
                <button
                  key={chip}
                  onClick={() => handleSuggestionClick(chip)}
                  className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 hover:text-white transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="border-t border-gray-700 p-3">
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about trading..."
                  rows={1}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isLoading}
                  className="p-2 bg-blue-600 rounded-xl text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={isOpen ? undefined : handleOpen}
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg shadow-blue-600/25 transition-colors"
      >
        <Brain className="w-6 h-6 text-white" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </motion.button>
    </>
  );
}
