/**
 * Unified Trading Configuration
 * Combines all trading bot settings in one place
 * Adapted from Polymarket-bot architecture
 */

import type { RiskConfig } from './risk-manager';
import type { SmartMoneyFilter } from './smart-money-tracker';

export interface StrategyAllocation {
  aiSignals: number;       // % of capital for AI-generated signals
  smartMoney: number;      // % of capital for smart money copy trading
  arbitrage: number;       // % of capital for arbitrage opportunities
  manual: number;          // % of capital reserved for manual trades
}

export interface TradingMode {
  paper: boolean;          // Paper trading mode (no real trades)
  testnet: boolean;        // Use exchange testnet
  autoTrading: boolean;    // Automatically execute signals
  confirmLargeTrades: boolean; // Require confirmation for large trades
  largeTradeThreshold: number; // $ threshold for large trade confirmation
}

export interface TradingConfig {
  // Strategy Settings
  strategy: {
    allocation: StrategyAllocation;
    defaultTimeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
    signalCooldown: number; // Seconds between signals for same symbol
    maxOpenPositions: number;
    defaultLeverage: number;
    maxLeverage: number;
  };

  // Risk Management Settings
  risk: RiskConfig;

  // Smart Money Settings
  smartMoney: {
    enabled: boolean;
    filter: SmartMoneyFilter;
    minTradersForSignal: number;
    copyTradeRatio: number; // % of original trade size to copy
    maxCopySize: number;    // Max $ amount per copy trade
  };

  // Execution Settings
  execution: {
    slippageTolerance: number; // Max slippage %
    defaultOrderType: 'MARKET' | 'LIMIT';
    limitOrderTTL: number;     // Seconds until limit order expires
    retryAttempts: number;
    retryDelay: number;        // Ms between retries
  };

  // Notifications
  notifications: {
    enabled: boolean;
    onSignal: boolean;
    onTrade: boolean;
    onRiskAlert: boolean;
    onWhaleAlert: boolean;
    channels: ('telegram' | 'discord' | 'webhook' | 'email')[];
  };

  // API Settings
  api: {
    bybit: {
      testnet: boolean;
      apiKey: string | null;
      apiSecret: string | null;
    };
    newsApis: {
      cryptoPanic: string | null;
      coinGecko: string | null;
      cryptoCompare: string | null;
    };
  };

  // Mode Settings
  mode: TradingMode;
}

// Default configuration
export const DEFAULT_TRADING_CONFIG: TradingConfig = {
  strategy: {
    allocation: {
      aiSignals: 0.50,
      smartMoney: 0.25,
      arbitrage: 0.15,
      manual: 0.10,
    },
    defaultTimeframe: '1h',
    signalCooldown: 300,  // 5 minutes
    maxOpenPositions: 5,
    defaultLeverage: 1,
    maxLeverage: 5,
  },

  risk: {
    dailyMaxLossPct: 0.05,
    monthlyMaxLossPct: 0.15,
    maxDrawdownFromPeak: 0.25,
    totalMaxLossPct: 0.40,
    enableDynamicSizing: true,
    basePositionSizePct: 0.02,
    maxSinglePositionPct: 0.10,
    maxTotalExposurePct: 0.50,
  },

  smartMoney: {
    enabled: true,
    filter: {
      minWinRate: 0.55,
      minProfitFactor: 1.3,
      minTrades: 20,
      minConsistencyScore: 0.5,
      maxRiskScore: 0.7,
      maxAvgLeverage: 5,
      minTradesLast7d: 3,
      maxInactiveDays: 14,
      maxSingleTradeExposure: 0.3,
    },
    minTradersForSignal: 2,
    copyTradeRatio: 0.5,
    maxCopySize: 1000,
  },

  execution: {
    slippageTolerance: 0.5,
    defaultOrderType: 'MARKET',
    limitOrderTTL: 300,
    retryAttempts: 3,
    retryDelay: 1000,
  },

  notifications: {
    enabled: false,
    onSignal: true,
    onTrade: true,
    onRiskAlert: true,
    onWhaleAlert: true,
    channels: [],
  },

  api: {
    bybit: {
      testnet: true,
      apiKey: null,
      apiSecret: null,
    },
    newsApis: {
      cryptoPanic: null,
      coinGecko: null,
      cryptoCompare: null,
    },
  },

  mode: {
    paper: true,
    testnet: true,
    autoTrading: false,
    confirmLargeTrades: true,
    largeTradeThreshold: 1000,
  },
};

// Configuration Manager
export class ConfigManager {
  private config: TradingConfig;
  private listeners: Map<string, Array<(config: TradingConfig) => void>> = new Map();

  constructor(initialConfig: Partial<TradingConfig> = {}) {
    this.config = this.mergeConfig(initialConfig);
  }

  /**
   * Merge user config with defaults
   */
  private mergeConfig(userConfig: Partial<TradingConfig>): TradingConfig {
    return {
      ...DEFAULT_TRADING_CONFIG,
      ...userConfig,
      strategy: {
        ...DEFAULT_TRADING_CONFIG.strategy,
        ...userConfig.strategy,
        allocation: {
          ...DEFAULT_TRADING_CONFIG.strategy.allocation,
          ...userConfig.strategy?.allocation,
        },
      },
      risk: {
        ...DEFAULT_TRADING_CONFIG.risk,
        ...userConfig.risk,
      },
      smartMoney: {
        ...DEFAULT_TRADING_CONFIG.smartMoney,
        ...userConfig.smartMoney,
        filter: {
          ...DEFAULT_TRADING_CONFIG.smartMoney.filter,
          ...userConfig.smartMoney?.filter,
        },
      },
      execution: {
        ...DEFAULT_TRADING_CONFIG.execution,
        ...userConfig.execution,
      },
      notifications: {
        ...DEFAULT_TRADING_CONFIG.notifications,
        ...userConfig.notifications,
      },
      api: {
        ...DEFAULT_TRADING_CONFIG.api,
        ...userConfig.api,
        bybit: {
          ...DEFAULT_TRADING_CONFIG.api.bybit,
          ...userConfig.api?.bybit,
        },
        newsApis: {
          ...DEFAULT_TRADING_CONFIG.api.newsApis,
          ...userConfig.api?.newsApis,
        },
      },
      mode: {
        ...DEFAULT_TRADING_CONFIG.mode,
        ...userConfig.mode,
      },
    };
  }

  /**
   * Get full configuration
   */
  getConfig(): TradingConfig {
    return { ...this.config };
  }

  /**
   * Get specific config section
   */
  getSection<K extends keyof TradingConfig>(section: K): TradingConfig[K] {
    return { ...this.config[section] };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<TradingConfig>): void {
    this.config = this.mergeConfig({ ...this.config, ...updates });
    this.emit('config_updated', this.config);
  }

  /**
   * Update a specific section
   */
  updateSection<K extends keyof TradingConfig>(
    section: K,
    updates: Partial<TradingConfig[K]>
  ): void {
    this.config = {
      ...this.config,
      [section]: {
        ...this.config[section],
        ...updates,
      } as TradingConfig[K],
    };
    this.emit('section_updated', this.config);
  }

  /**
   * Reset to defaults
   */
  resetToDefaults(): void {
    this.config = { ...DEFAULT_TRADING_CONFIG };
    this.emit('config_reset', this.config);
  }

  /**
   * Validate configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate strategy allocation totals 100%
    const allocation = this.config.strategy.allocation;
    const totalAllocation = Object.values(allocation).reduce((sum, v) => sum + v, 0);
    if (Math.abs(totalAllocation - 1) > 0.001) {
      errors.push(`Strategy allocation must total 1.0 (currently ${totalAllocation})`);
    }

    // Validate risk thresholds
    const risk = this.config.risk;
    if (risk.dailyMaxLossPct <= 0 || risk.dailyMaxLossPct > 1) {
      errors.push('Daily max loss must be between 0 and 1');
    }
    if (risk.monthlyMaxLossPct < risk.dailyMaxLossPct) {
      errors.push('Monthly max loss must be >= daily max loss');
    }
    if (risk.totalMaxLossPct < risk.monthlyMaxLossPct) {
      errors.push('Total max loss must be >= monthly max loss');
    }

    // Validate leverage
    if (this.config.strategy.defaultLeverage > this.config.strategy.maxLeverage) {
      errors.push('Default leverage cannot exceed max leverage');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Export configuration as JSON
   */
  toJSON(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration from JSON
   */
  fromJSON(json: string): void {
    try {
      const config = JSON.parse(json);
      this.config = this.mergeConfig(config);
      this.emit('config_imported', this.config);
    } catch (error) {
      throw new Error(`Failed to parse config JSON: ${(error as Error).message}`);
    }
  }

  /**
   * Add event listener
   */
  on(event: string, callback: (config: TradingConfig) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  /**
   * Emit event
   */
  private emit(event: string, config: TradingConfig): void {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(cb => cb(config));
  }
}

// Singleton instance
let configManagerInstance: ConfigManager | null = null;

export function getConfigManager(initialConfig?: Partial<TradingConfig>): ConfigManager {
  if (!configManagerInstance) {
    configManagerInstance = new ConfigManager(initialConfig);
  }
  return configManagerInstance;
}

export function resetConfigManager(): void {
  configManagerInstance = null;
}
