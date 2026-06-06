'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Settings, Shield, Bell, Save } from 'lucide-react';
import { toast } from 'sonner';

interface SettingsState {
  tradingMode: 'demo' | 'live';
  riskLevel: 'Conservative' | 'Moderate' | 'Aggressive';
  maxPositionSize: number;
  maxLeverage: number;
  autoTrading: boolean;
  telegramEnabled: boolean;
  telegramChatId: string;
}

const defaultSettings: SettingsState = {
  tradingMode: 'demo',
  riskLevel: 'Moderate',
  maxPositionSize: 1000,
  maxLeverage: 10,
  autoTrading: false,
  telegramEnabled: false,
  telegramChatId: '',
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/settings');
      if (res.ok) {
        const data = await res.json();
        // Settings API returns exchange accounts — use localStorage for trading prefs
        const mode = typeof window !== 'undefined'
          ? (localStorage.getItem('mantle_trading_mode') as 'demo' | 'live') || 'demo'
          : 'demo';
        setSettings((prev) => ({ ...prev, tradingMode: mode }));
      }
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      localStorage.setItem('mantle_trading_mode', settings.tradingMode);
      localStorage.setItem('mantle_risk_level', settings.riskLevel);
      localStorage.setItem('mantle_max_position', String(settings.maxPositionSize));
      localStorage.setItem('mantle_max_leverage', String(settings.maxLeverage));
      localStorage.setItem('mantle_auto_trading', String(settings.autoTrading));
      localStorage.setItem('mantle_telegram_enabled', String(settings.telegramEnabled));
      localStorage.setItem('mantle_telegram_chat_id', settings.telegramChatId);

      toast.success('Settings saved successfully');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 bg-gray-800 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Settings className="w-7 h-7 text-blue-400" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {/* Trading Mode */}
      <Card className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            Trading Mode
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Demo Mode</p>
              <p className="text-xs text-gray-500">Trade with simulated funds</p>
            </div>
            <Switch
              checked={settings.tradingMode === 'live'}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({
                  ...prev,
                  tradingMode: checked ? 'live' : 'demo',
                }))
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`px-3 py-1 rounded-lg text-xs font-medium ${
                settings.tradingMode === 'demo'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-green-500/20 text-green-400'
              }`}
            >
              {settings.tradingMode.toUpperCase()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Risk Settings */}
      <Card className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-yellow-400" />
            Risk Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Risk Level */}
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-400">Risk Level</Label>
            <Select
              value={settings.riskLevel}
              onValueChange={(val) =>
                setSettings((prev) => ({
                  ...prev,
                  riskLevel: val as SettingsState['riskLevel'],
                }))
              }
            >
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="Conservative">Conservative</SelectItem>
                <SelectItem value="Moderate">Moderate</SelectItem>
                <SelectItem value="Aggressive">Aggressive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Max Position Size */}
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-400">
              Max Position Size: ${settings.maxPositionSize}
            </Label>
            <Input
              type="number"
              value={settings.maxPositionSize}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  maxPositionSize: parseInt(e.target.value) || 0,
                }))
              }
              className="bg-gray-800 border-gray-700 text-white"
              min="100"
              step="100"
            />
          </div>

          {/* Max Leverage */}
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-400">
              Max Leverage: {settings.maxLeverage}x
            </Label>
            <Slider
              value={[settings.maxLeverage]}
              onValueChange={([val]) =>
                setSettings((prev) => ({ ...prev, maxLeverage: val }))
              }
              min={1}
              max={100}
              step={1}
              className="py-2"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>1x</span>
              <span>25x</span>
              <span>50x</span>
              <span>75x</span>
              <span>100x</span>
            </div>
          </div>

          {/* Auto Trading */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Auto Trading</p>
              <p className="text-xs text-gray-500">Automatically execute signals</p>
            </div>
            <Switch
              checked={settings.autoTrading}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, autoTrading: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-purple-400" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Telegram Alerts</p>
              <p className="text-xs text-gray-500">Receive trade alerts via Telegram</p>
            </div>
            <Switch
              checked={settings.telegramEnabled}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, telegramEnabled: checked }))
              }
            />
          </div>
          {settings.telegramEnabled && (
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-400">Telegram Chat ID</Label>
              <Input
                value={settings.telegramChatId}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, telegramChatId: e.target.value }))
                }
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="Enter your Telegram chat ID"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          className="bg-blue-600 hover:bg-blue-700 min-w-[120px]"
          disabled={saving}
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
