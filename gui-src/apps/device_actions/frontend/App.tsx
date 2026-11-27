import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useReadOnly } from '@/contexts/ReadOnlyContext';
import { useBackendAPI, BACKEND_STATE_CHANGED_EVENT } from '@shared/hooks/useBackendAPI';
import {
  Home,
  Globe,
  Search,
  Camera,
  Video,
  Image,
  Power,
  RotateCw,
  Phone,
  Smartphone,
  LayoutGrid,
  ChevronRight,
  AlertTriangle,
  X,
  Check,
  Play,
  Square,
  ExternalLink,
  Monitor,
  Zap,
  Grid,
  Sun,
  Moon,
  Wifi,
  Bluetooth,
  Volume2,
  Plane,
  Clock
} from 'lucide-react';

// --- Types ---

interface AppInfo {
  name: string;
}

interface ToolStatus {
  available: boolean;
  lastError?: string;
}

interface ActionLogEntry {
  id: number;
  action: string;
  timestamp: Date;
  status: 'success' | 'error';
}

type ActiveTab = 'quick' | 'apps' | 'camera' | 'media';

// --- Components ---

const SectionCard = ({
  title,
  children,
  icon: Icon,
  className = ''
}: {
  title: string;
  children: React.ReactNode;
  icon?: React.ElementType;
  className?: string;
}) => (
  <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden ${className}`}>
    <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 flex items-center gap-2">
      {Icon && <Icon size={16} className="text-gray-500 dark:text-gray-400" />}
      <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">{title}</h3>
    </div>
    <div className="p-4">{children}</div>
  </div>
);

const ActionButton = ({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  variant = 'default',
  loading = false,
  unavailable = false,
  unavailableMessage = ''
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger' | 'warning' | 'success';
  loading?: boolean;
  unavailable?: boolean;
  unavailableMessage?: string;
}) => {
  const baseClasses = "flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-200 min-w-[100px] gap-2";

  const variantClasses = {
    default: disabled || unavailable
      ? 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
      : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:shadow-md cursor-pointer',
    danger: disabled || unavailable
      ? 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
      : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 hover:shadow-md cursor-pointer',
    warning: disabled || unavailable
      ? 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
      : 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/40 hover:shadow-md cursor-pointer',
    success: disabled || unavailable
      ? 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
      : 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 hover:shadow-md cursor-pointer',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading || unavailable}
      className={`${baseClasses} ${variantClasses[variant]}`}
      title={unavailable ? unavailableMessage : label}
    >
      {loading ? (
        <RotateCw size={24} className="animate-spin" />
      ) : (
        <Icon size={24} />
      )}
      <span className="text-xs font-medium text-center">{label}</span>
      {unavailable && (
        <span className="text-[10px] text-gray-400 dark:text-gray-500">Unavailable</span>
      )}
    </button>
  );
};

const ConfirmDialog = ({
  isOpen,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  variant = 'danger'
}: {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning';
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="confirm-dialog">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-sm w-full mx-4 overflow-hidden">
        <div className="p-6">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${
            variant === 'danger' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-orange-100 dark:bg-orange-900/30'
          }`}>
            <AlertTriangle size={24} className={variant === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'} />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
          <p className="text-gray-600 dark:text-gray-300 text-sm">{message}</p>
        </div>
        <div className="flex border-t border-gray-100 dark:border-slate-700">
          <button
            onClick={onCancel}
            className="flex-1 py-3 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-3 font-medium transition-colors ${
              variant === 'danger'
                ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                : 'text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20'
            }`}
            data-testid="confirm-button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

const StatusBadge = ({ status, label }: { status: 'success' | 'warning' | 'error' | 'info'; label: string }) => {
  const colors = {
    success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status]}`}>
      {label}
    </span>
  );
};

const UnavailableMessage = ({ toolName }: { toolName: string }) => (
  <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg text-sm text-gray-500 dark:text-gray-400" data-testid="unavailable-message">
    <AlertTriangle size={16} className="text-amber-500" />
    <span>Backend tool not available: {toolName}</span>
  </div>
);

const ToggleSwitch = ({
  enabled,
  onChange,
  disabled = false,
  loading = false
}: {
  enabled: boolean | undefined;
  onChange: (val: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
}) => enabled === undefined ? <span className="text-xs text-gray-500">Not stored in snapshot</span> : (
  <button
    onClick={() => !disabled && !loading && onChange(!enabled)}
    disabled={disabled || loading}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
      enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-600'
    } ${disabled || loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    data-testid="toggle-switch"
  >
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
      enabled ? 'translate-x-6' : 'translate-x-1'
    }`} />
  </button>
);

// --- Main App ---

interface AppProps {
  onClose?: () => void;
  setRefreshHandler?: (handler: (() => void) | null) => void;
}

export default function App({ setRefreshHandler }: AppProps) {
  const api = useBackendAPI('device_actions');
  const readOnly = useReadOnly();
  const settingsApi = useBackendAPI('device_setting');

  // State
  const [activeTab, setActiveTab] = useState<ActiveTab>('quick');
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // App Management
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);

  // Navigation
  const [urlInput, setUrlInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Camera
  const [cameraType, setCameraType] = useState<'DEFAULT' | 'FRONT' | 'REAR'>('DEFAULT');
  const [cameraOperation, setCameraOperation] = useState<'PHOTO' | 'VIDEO'>('PHOTO');
  const [cameraMode, setCameraMode] = useState<'DEFAULT' | 'PORTRAIT'>('DEFAULT');
  const [videoDuration, setVideoDuration] = useState('');

  // Screenshots/Media
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);

  // Power confirmations
  const [showPowerOffConfirm, setShowPowerOffConfirm] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);

  // Tool availability tracking
  const [toolStatus, setToolStatus] = useState<Record<string, ToolStatus>>({});

  // Device settings state
  const [bluetoothEnabled, setBluetoothEnabled] = useState<boolean | undefined>(undefined);
  const [wifiEnabled, setWifiEnabled] = useState<boolean | undefined>(undefined);
  const [airplaneModeEnabled, setAirplaneModeEnabled] = useState<boolean | undefined>(undefined);
  const [volume, setVolume] = useState<number | undefined>(undefined);
  const [brightness, setBrightness] = useState<number | undefined>(undefined);

  // Action history
  const [actionHistory, setActionHistory] = useState<ActionLogEntry[]>([]);
  const actionIdRef = useRef(0);

  const addActionLog = (action: string, status: 'success' | 'error') => {
    actionIdRef.current += 1;
    setActionHistory(prev => [{
      id: actionIdRef.current,
      action,
      timestamp: new Date(),
      status,
    }, ...prev].slice(0, 50));
  };

  // Device settings availability
  const [deviceSettingAvailable, setDeviceSettingAvailable] = useState<boolean | null>(null);

  // Fetch device_actions state (actions history + media) from the backend
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('./api/services/device_actions/state', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const state = data.state || data;

      // Load action history from database, merging with local entries
      if (Array.isArray(state.actions)) {
        const dbActions: ActionLogEntry[] = state.actions.map((a: any, idx: number) => ({
          id: -(idx + 1), // Negative IDs for DB-sourced entries
          action: formatActionDescription(a),
          timestamp: new Date(a.timestamp),
          status: 'success' as const,
        }));

        setActionHistory(prev => {
          // Preserve locally-added entries (positive IDs) that don't have a
          // matching DB entry (same action text within 30s window)
          const localEntries = prev.filter(e => e.id > 0).filter(local =>
            !dbActions.some(db =>
              db.action === local.action &&
              Math.abs(db.timestamp.getTime() - local.timestamp.getTime()) < 30000
            )
          );
          const merged = [...localEntries, ...dbActions];
          merged.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
          return merged.slice(0, 50);
        });
      }

      // Load media from phone_state
      const ps = state.phone_state;
      if (ps) {
        if (Array.isArray(ps.photos)) {
          setPhotos(ps.photos.map((p: any) => p.name || p));
        }
        if (Array.isArray(ps.videos)) {
          setVideos(ps.videos.map((v: any) => v.name || v));
        }
        if (Array.isArray(ps.screenshots)) {
          setScreenshots(ps.screenshots.map((s: any) => s.name || s));
        }
      }
    } catch (e) {
      console.error('Failed to fetch device actions state:', e);
    }
  }, []);

  // Format action description from database action entry
  const formatActionDescription = (action: any): string => {
    const type = action.action_type || action.type || 'unknown';
    switch (type) {
      case 'open_app':
        return `Opened app: ${action.app_name || 'unknown'}`;
      case 'open_url':
        return `Opened URL: ${action.url || action.website_name || 'unknown'}`;
      case 'take_screenshot':
        return 'Screenshot captured';
      case 'take_photo':
        return 'Photo captured';
      case 'record_video':
        return 'Video recorded';
      case 'set_brightness':
        return `Brightness set to ${action.brightness_level ?? 'unknown'}%`;
      case 'clipboard_copy':
        return `Clipboard: ${(action.content || '').slice(0, 50)}`;
      case 'open_home_screen':
        return 'Navigated to home screen';
      case 'open_websearch':
        return `Web search: ${action.query || 'unknown'}`;
      case 'open_camera':
        return 'Opened camera';
      case 'ring_phone':
        return 'Phone ringing';
      case 'power_off_device':
        return 'Power off initiated';
      case 'restart_device':
        return 'Restart initiated';
      default:
        return type.replace(/_/g, ' ');
    }
  };

  // Check if a tool is available (for graceful degradation)
  const isToolAvailable = (toolName: string) => {
    if (toolStatus[toolName] === undefined) return true; // Assume available until proven otherwise
    return toolStatus[toolName].available;
  };

  const markToolUnavailable = (toolName: string, error: string) => {
    setToolStatus(prev => ({
      ...prev,
      [toolName]: { available: false, lastError: error }
    }));
  };

  const showStatus = (type: 'success' | 'error' | 'info', message: string) => {
    setStatusMessage({ type, message });
    setTimeout(() => setStatusMessage(null), 5000);
  };

  const setToolLoading = (tool: string, isLoading: boolean) => {
    setLoading(prev => ({ ...prev, [tool]: isLoading }));
  };

  // Check if device_setting service is available
  const checkDeviceSettingAvailable = useCallback(async () => {
    try {
      const res = await fetch('./api/services/device_setting');
      if (res.ok) {
        setDeviceSettingAvailable(true);
        return true;
      }
      setDeviceSettingAvailable(false);
      return false;
    } catch {
      setDeviceSettingAvailable(false);
      return false;
    }
  }, []);

  // Fetch device settings from device_setting backend
  const fetchDeviceSettings = useCallback(async () => {
    try {
      const available = await checkDeviceSettingAvailable();
      if (!available) return;

      const [btRes, wifiRes, airplaneRes, volRes, brightRes] = await Promise.allSettled([
        settingsApi.callTool('get', { setting_type: 'BLUETOOTH' }),
        settingsApi.callTool('get', { setting_type: 'WIFI' }),
        settingsApi.callTool('get', { setting_type: 'AIRPLANE_MODE' }),
        settingsApi.callTool('get', { setting_type: 'VOLUME' }),
        settingsApi.callTool('get', { setting_type: 'BRIGHTNESS' }),
      ]);

      if (btRes.status === 'fulfilled') {
        const r = btRes.value as any;
        if (r?.on_or_off) setBluetoothEnabled(r.on_or_off === 'on');
      }
      if (wifiRes.status === 'fulfilled') {
        const r = wifiRes.value as any;
        if (r?.on_or_off) setWifiEnabled(r.on_or_off === 'on');
      }
      if (airplaneRes.status === 'fulfilled') {
        const r = airplaneRes.value as any;
        if (r?.on_or_off) setAirplaneModeEnabled(r.on_or_off === 'on');
      }
      if (volRes.status === 'fulfilled') {
        const r = volRes.value as any;
        if (r?.percentage_value !== undefined && r.percentage_value !== null) setVolume(r.percentage_value);
      }
      if (brightRes.status === 'fulfilled') {
        const r = brightRes.value as any;
        if (r?.percentage_value !== undefined && r.percentage_value !== null) setBrightness(r.percentage_value);
      }
    } catch (e) {
      console.error('Failed to fetch device settings:', e);
    }
  }, []);

  // Helper: detect service-not-found errors and mark device_setting as unavailable
  const handleDeviceSettingError = (error: any, settingName: string): void => {
    const msg = error?.message || '';
    if (msg.includes('not found') || msg.includes('not available') || msg.includes('404')) {
      setDeviceSettingAvailable(false);
      showStatus('error', `Device settings service is not available`);
    } else {
      showStatus('error', msg || `Failed to change ${settingName}`);
    }
  };

  // Bluetooth toggle calls backend API
  const toggleBluetooth = async (enabled: boolean) => {
    if (!deviceSettingAvailable) return;
    setBluetoothEnabled(enabled);
    setToolLoading('bluetooth', true);
    try {
      const toolName = enabled ? 'on' : 'off';
      const result: any = await settingsApi.callTool(toolName, { setting: 'BLUETOOTH' });
      showStatus('success', result?.result || `Bluetooth turned ${enabled ? 'on' : 'off'}`);
      addActionLog(`Bluetooth ${enabled ? 'enabled' : 'disabled'}`, 'success');
    } catch (error: any) {
      console.error('Failed to toggle bluetooth:', error);
      setBluetoothEnabled(!enabled);
      handleDeviceSettingError(error, 'Bluetooth');
      addActionLog(`Bluetooth toggle failed`, 'error');
    }
    setToolLoading('bluetooth', false);
  };

  // WiFi toggle calls backend API
  const toggleWifi = async (enabled: boolean) => {
    if (!deviceSettingAvailable) return;
    setWifiEnabled(enabled);
    setToolLoading('wifi', true);
    try {
      const toolName = enabled ? 'on' : 'off';
      const result: any = await settingsApi.callTool(toolName, { setting: 'WIFI' });
      showStatus('success', result?.result || `WiFi turned ${enabled ? 'on' : 'off'}`);
      addActionLog(`WiFi ${enabled ? 'enabled' : 'disabled'}`, 'success');
    } catch (error: any) {
      console.error('Failed to toggle wifi:', error);
      setWifiEnabled(!enabled);
      handleDeviceSettingError(error, 'WiFi');
      addActionLog(`WiFi toggle failed`, 'error');
    }
    setToolLoading('wifi', false);
  };

  // Airplane mode toggle calls backend API
  const toggleAirplaneMode = async (enabled: boolean) => {
    if (!deviceSettingAvailable) return;
    setAirplaneModeEnabled(enabled);
    setToolLoading('airplane', true);
    try {
      const toolName = enabled ? 'on' : 'off';
      const result: any = await settingsApi.callTool(toolName, { setting: 'AIRPLANE_MODE' });
      showStatus('success', result?.result || `Airplane mode turned ${enabled ? 'on' : 'off'}`);
      addActionLog(`Airplane mode ${enabled ? 'enabled' : 'disabled'}`, 'success');
    } catch (error: any) {
      console.error('Failed to toggle airplane mode:', error);
      setAirplaneModeEnabled(!enabled);
      handleDeviceSettingError(error, 'Airplane Mode');
      addActionLog(`Airplane mode toggle failed`, 'error');
    }
    setToolLoading('airplane', false);
  };

  // Volume slider calls backend API
  const volumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (!deviceSettingAvailable) return;
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    volumeTimeoutRef.current = setTimeout(async () => {
      setToolLoading('volume', true);
      try {
        const result: any = await settingsApi.callTool('set_volume', { to: newVolume });
        showStatus('success', result?.result || `Volume set to ${newVolume}%`);
        addActionLog(`Volume set to ${newVolume}%`, 'success');
      } catch (error: any) {
        console.error('Failed to set volume:', error);
        handleDeviceSettingError(error, 'volume');
        addActionLog(`Volume change failed`, 'error');
      }
      setToolLoading('volume', false);
    }, 300);
  };

  // Brightness slider calls backend API
  const brightnessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleBrightnessChange = (newBrightness: number) => {
    setBrightness(newBrightness);
    if (!deviceSettingAvailable) return;
    if (brightnessTimeoutRef.current) clearTimeout(brightnessTimeoutRef.current);
    brightnessTimeoutRef.current = setTimeout(async () => {
      setToolLoading('brightness', true);
      try {
        await settingsApi.callTool('open', { setting_type: 'BRIGHTNESS' });
        showStatus('info', `Opened brightness settings (set to ${newBrightness}% locally)`);
        addActionLog(`Brightness settings opened (${newBrightness}% local)`, 'success');
      } catch (error: any) {
        console.error('Failed to open brightness settings:', error);
        handleDeviceSettingError(error, 'brightness');
        addActionLog(`Brightness settings open failed`, 'error');
      }
      setToolLoading('brightness', false);
    }, 300);
  };

  // API Calls
  const loadApps = async () => {
    if (!isToolAvailable('get_installed_apps')) return;
    setAppsLoading(true);
    try {
      const result = await api.callTool('get_installed_apps', {});
      console.log('get_installed_apps result:', result);
      // Handle both array format and wrapped format
      if (Array.isArray(result)) {
        setApps(result);
      } else if (result && typeof result === 'object') {
        // Try common wrapper property names
        const apps = (result as any).apps || (result as any).installed_apps || (result as any).data || [];
        setApps(Array.isArray(apps) ? apps : []);
      } else {
        setApps([]);
      }
    } catch (error: any) {
      console.error('Failed to load apps:', error);
      if (error?.message?.includes('not found') || error?.message?.includes('not available')) {
        markToolUnavailable('get_installed_apps', error.message);
      }
      showStatus('error', 'Failed to load apps');
    }
    setAppsLoading(false);
  };

  const openApp = async (appName: string) => {
    if (!isToolAvailable('open_app')) return;
    setToolLoading('open_app', true);
    try {
      const result: any = await api.callTool('open_app', { app_name: appName });
      const resultMsg = result?.result || `Opened ${appName}`;
      showStatus('success', resultMsg);
      addActionLog(resultMsg, 'success');
    } catch (error: any) {
      console.error('Failed to open app:', error);
      if (error?.message?.includes('not found') || error?.message?.includes('not available')) {
        markToolUnavailable('open_app', error.message);
      }
      showStatus('error', error?.message || 'Failed to open app');
      addActionLog(`Open app failed: ${appName}`, 'error');
    }
    setToolLoading('open_app', false);
  };

  const openHomeScreen = async () => {
    if (!isToolAvailable('open_home_screen')) return;
    setToolLoading('open_home_screen', true);
    try {
      const result: any = await api.callTool('open_home_screen', {});
      showStatus('success', result?.result || 'Navigated to home screen');
      addActionLog('Navigated to home screen', 'success');
    } catch (error: any) {
      console.error('Failed to open home screen:', error);
      if (error?.message?.includes('not found') || error?.message?.includes('not available')) {
        markToolUnavailable('open_home_screen', error.message);
      }
      showStatus('error', error?.message || 'Failed to open home screen');
      addActionLog('Navigate home failed', 'error');
    }
    setToolLoading('open_home_screen', false);
  };

  const openUrl = async () => {
    if (!isToolAvailable('open_url') || !urlInput.trim()) return;
    setToolLoading('open_url', true);
    const url = urlInput.trim();
    try {
      const result: any = await api.callTool('open_url', { url });
      showStatus('success', result?.result || `Opened ${url}`);
      addActionLog(`Opened URL: ${url}`, 'success');
      setUrlInput('');
    } catch (error: any) {
      console.error('Failed to open URL:', error);
      if (error?.message?.includes('not found') || error?.message?.includes('not available')) {
        markToolUnavailable('open_url', error.message);
      }
      showStatus('error', error?.message || 'Failed to open URL');
      addActionLog(`Open URL failed: ${url}`, 'error');
    }
    setToolLoading('open_url', false);
  };

  const openWebSearch = async () => {
    if (!isToolAvailable('open_websearch') || !searchQuery.trim()) return;
    setToolLoading('open_websearch', true);
    try {
      const result: any = await api.callTool('open_websearch', { query: searchQuery.trim() });
      showStatus('success', result?.result || `Searching for "${searchQuery}"`);
      addActionLog(`Web search: ${searchQuery.trim()}`, 'success');
      setSearchQuery('');
    } catch (error: any) {
      console.error('Failed to open web search:', error);
      if (error?.message?.includes('not found') || error?.message?.includes('not available')) {
        markToolUnavailable('open_websearch', error.message);
      }
      showStatus('error', error?.message || 'Failed to open web search');
      addActionLog('Web search failed', 'error');
    }
    setToolLoading('open_websearch', false);
  };

  const openCamera = async () => {
    if (!isToolAvailable('open_camera')) return;
    setToolLoading('open_camera', true);
    try {
      const result: any = await api.callTool('open_camera', {
        camera_type: cameraType !== 'DEFAULT' ? cameraType : undefined,
        camera_operation: cameraOperation
      });
      showStatus('success', result?.result || 'Camera opened');
      addActionLog('Opened camera', 'success');
    } catch (error: any) {
      console.error('Failed to open camera:', error);
      if (error?.message?.includes('not found') || error?.message?.includes('not available')) {
        markToolUnavailable('open_camera', error.message);
      }
      showStatus('error', error?.message || 'Failed to open camera');
      addActionLog('Open camera failed', 'error');
    }
    setToolLoading('open_camera', false);
  };

  const takePhoto = async () => {
    if (!isToolAvailable('take_photo')) return;
    setToolLoading('take_photo', true);
    try {
      const result: any = await api.callTool('take_photo', {
        camera_type: cameraType !== 'DEFAULT' ? cameraType : undefined,
        self_timer_delay: '3 seconds',
        camera_mode: cameraMode !== 'DEFAULT' ? cameraMode : undefined
      });
      showStatus('success', result?.result || 'Photo captured');
      setPhotos(prev => [...prev, `Photo_${Date.now()}`]);
      addActionLog('Photo captured', 'success');
    } catch (error: any) {
      console.error('Failed to take photo:', error);
      if (error?.message?.includes('not found') || error?.message?.includes('not available')) {
        markToolUnavailable('take_photo', error.message);
      }
      showStatus('error', error?.message || 'Failed to take photo');
      addActionLog('Take photo failed', 'error');
    }
    setToolLoading('take_photo', false);
  };

  const recordVideo = async () => {
    if (!isToolAvailable('record_video')) return;
    setToolLoading('record_video', true);
    try {
      const result: any = await api.callTool('record_video', {
        camera_type: cameraType !== 'DEFAULT' ? cameraType : undefined,
        video_duration: videoDuration || undefined
      });
      showStatus('success', result?.result || 'Video recorded');
      setVideos(prev => [...prev, `Video_${Date.now()}`]);
      addActionLog('Video recorded', 'success');
    } catch (error: any) {
      console.error('Failed to record video:', error);
      if (error?.message?.includes('not found') || error?.message?.includes('not available')) {
        markToolUnavailable('record_video', error.message);
      }
      showStatus('error', error?.message || 'Failed to record video');
      addActionLog('Record video failed', 'error');
    }
    setToolLoading('record_video', false);
  };

  const takeScreenshot = async () => {
    if (!isToolAvailable('take_screenshot')) return;
    setToolLoading('take_screenshot', true);
    try {
      const result: any = await api.callTool('take_screenshot', {});
      showStatus('success', result?.result || 'Screenshot captured');
      setScreenshots(prev => [...prev, `Screenshot_${Date.now()}`]);
      addActionLog('Screenshot captured', 'success');
    } catch (error: any) {
      console.error('Failed to take screenshot:', error);
      if (error?.message?.includes('not found') || error?.message?.includes('not available')) {
        markToolUnavailable('take_screenshot', error.message);
      }
      showStatus('error', error?.message || 'Failed to take screenshot');
      addActionLog('Take screenshot failed', 'error');
    }
    setToolLoading('take_screenshot', false);
  };

  const ringPhone = async () => {
    if (!isToolAvailable('ring_phone')) return;
    setToolLoading('ring_phone', true);
    try {
      const result: any = await api.callTool('ring_phone', {});
      showStatus('success', result?.result || 'Phone is ringing');
      addActionLog('Phone ringing', 'success');
    } catch (error: any) {
      console.error('Failed to ring phone:', error);
      if (error?.message?.includes('not found') || error?.message?.includes('not available')) {
        markToolUnavailable('ring_phone', error.message);
      }
      showStatus('error', error?.message || 'Failed to ring phone');
      addActionLog('Ring phone failed', 'error');
    }
    setToolLoading('ring_phone', false);
  };

  const powerOffDevice = async () => {
    if (!isToolAvailable('power_off_device')) return;
    setShowPowerOffConfirm(false);
    setToolLoading('power_off_device', true);
    try {
      const result: any = await api.callTool('power_off_device', {});
      showStatus('success', result?.result || 'Device powering off...');
      addActionLog('Power off initiated', 'success');
    } catch (error: any) {
      console.error('Failed to power off:', error);
      if (error?.message?.includes('not found') || error?.message?.includes('not available')) {
        markToolUnavailable('power_off_device', error.message);
      }
      showStatus('error', error?.message || 'Failed to power off');
      addActionLog('Power off failed', 'error');
    }
    setToolLoading('power_off_device', false);
  };

  const restartDevice = async () => {
    if (!isToolAvailable('restart_device')) return;
    setShowRestartConfirm(false);
    setToolLoading('restart_device', true);
    try {
      const result: any = await api.callTool('restart_device', {});
      showStatus('success', result?.result || 'Device restarting...');
      addActionLog('Restart initiated', 'success');
    } catch (error: any) {
      console.error('Failed to restart:', error);
      if (error?.message?.includes('not found') || error?.message?.includes('not available')) {
        markToolUnavailable('restart_device', error.message);
      }
      showStatus('error', error?.message || 'Failed to restart');
      addActionLog('Restart failed', 'error');
    }
    setToolLoading('restart_device', false);
  };

  const refreshAll = useCallback(() => {
    loadApps();
    fetchDeviceSettings();
    fetchState();
  }, [fetchState, fetchDeviceSettings]);

  useEffect(() => {
    if (setRefreshHandler) {
      setRefreshHandler(refreshAll);
    }
    return () => {
      if (setRefreshHandler) setRefreshHandler(null);
    };
  }, [refreshAll, setRefreshHandler]);

  // Load apps, device settings, and state on mount
  useEffect(() => {
    loadApps();
    fetchDeviceSettings();
    fetchState();
  }, []);

  // Rate-limited fetchState to avoid redundant API calls from multiple triggers
  const lastFetchRef = useRef(0);
  const throttledFetchState = useCallback(() => {
    const now = Date.now();
    if (now - lastFetchRef.current < 500) return;
    lastFetchRef.current = now;
    fetchState();
  }, [fetchState]);

  // Auto-refresh state when backend state changes (e.g., DB uploaded), debounced
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const handleStateChanged = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => throttledFetchState(), 500);
    };
    window.addEventListener(BACKEND_STATE_CHANGED_EVENT, handleStateChanged);
    return () => {
      window.removeEventListener(BACKEND_STATE_CHANGED_EVENT, handleStateChanged);
      if (timeout) clearTimeout(timeout);
    };
  }, [throttledFetchState]);

  // Refresh state when window regains visibility (e.g., after admin panel closes)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') throttledFetchState();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [throttledFetchState]);

  // Render functions for each tab
  const renderQuickActions = () => (
    <div className="space-y-6">
      {/* Status Display */}
      <SectionCard title="Device Status" icon={Smartphone}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <Zap size={20} className="text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-200">Device Active</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Ready to receive commands</p>
            </div>
          </div>
          <StatusBadge status="success" label="Online" />
        </div>
      </SectionCard>

      {/* Device Settings */}
      <SectionCard title="Device Settings" icon={Smartphone}>
        {deviceSettingAvailable === false ? <p className="text-sm text-gray-500 dark:text-gray-400" data-testid="device-settings-unavailable">Device settings not included in this task snapshot</p> : deviceSettingAvailable === null ? <p className="text-sm text-gray-500">Loading stored device settings…</p> : <div className="space-y-4" data-testid="device-settings">
          {/* Bluetooth Toggle */}
          <div className="flex items-center justify-between" data-testid="bluetooth-toggle">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Bluetooth size={16} className="text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Bluetooth</span>
            </div>
            <ToggleSwitch
              enabled={bluetoothEnabled}
              onChange={toggleBluetooth}
              loading={loading['bluetooth']}
              disabled={readOnly || !deviceSettingAvailable}
            />
          </div>

          {/* WiFi Toggle */}
          <div className="flex items-center justify-between" data-testid="wifi-toggle">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <Wifi size={16} className="text-green-600 dark:text-green-400" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">WiFi</span>
            </div>
            <ToggleSwitch
              enabled={wifiEnabled}
              onChange={toggleWifi}
              loading={loading['wifi']}
              disabled={readOnly || !deviceSettingAvailable}
            />
          </div>

          {/* Airplane Mode Toggle */}
          <div className="flex items-center justify-between" data-testid="airplane-mode-toggle">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                <Plane size={16} className="text-orange-600 dark:text-orange-400" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Airplane Mode</span>
            </div>
            <ToggleSwitch
              enabled={airplaneModeEnabled}
              onChange={toggleAirplaneMode}
              loading={loading['airplane']}
              disabled={readOnly || !deviceSettingAvailable}
            />
          </div>

          {/* Volume Slider */}
          <div data-testid="volume-slider">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                  <Volume2 size={16} className="text-purple-600 dark:text-purple-400" />
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Volume</span>
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400">{volume === undefined ? 'Not stored in snapshot' : `${volume}%`}</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={volume ?? 0}
              hidden={volume === undefined}
              disabled={readOnly || volume === undefined}
              onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-purple-600"
              data-testid="volume-range"
            />
          </div>

          {/* Brightness Slider */}
          <div data-testid="brightness-slider">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                  <Sun size={16} className="text-yellow-600 dark:text-yellow-400" />
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Brightness</span>
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400">{brightness === undefined ? 'Not stored in snapshot' : `${brightness}%`}</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={brightness ?? 0}
              hidden={brightness === undefined}
              disabled={readOnly || brightness === undefined}
              onChange={(e) => handleBrightnessChange(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-yellow-500"
              data-testid="brightness-range"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Opens brightness settings on device (manual adjustment required)</p>
          </div>
        </div>}
      </SectionCard>

      {/* Quick Action Buttons */}
      <SectionCard title="Quick Actions" icon={Zap}>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3" data-testid="quick-actions">
          <ActionButton
            icon={Home}
            label="Home"
            onClick={openHomeScreen}
            loading={loading['open_home_screen']}
            unavailable={!isToolAvailable('open_home_screen')}
            unavailableMessage="Backend tool not available: open_home_screen"
          />
          <ActionButton
            icon={Image}
            label="Screenshot"
            onClick={takeScreenshot}
            loading={loading['take_screenshot']}
            unavailable={!isToolAvailable('take_screenshot')}
            unavailableMessage="Backend tool not available: take_screenshot"
          />
          <ActionButton
            icon={Phone}
            label="Ring Phone"
            onClick={ringPhone}
            variant="success"
            loading={loading['ring_phone']}
            unavailable={!isToolAvailable('ring_phone')}
            unavailableMessage="Backend tool not available: ring_phone"
          />
          <ActionButton
            icon={RotateCw}
            label="Restart"
            onClick={() => setShowRestartConfirm(true)}
            variant="warning"
            loading={loading['restart_device']}
            unavailable={!isToolAvailable('restart_device')}
            unavailableMessage="Backend tool not available: restart_device"
          />
          <ActionButton
            icon={Power}
            label="Power Off"
            onClick={() => setShowPowerOffConfirm(true)}
            variant="danger"
            loading={loading['power_off_device']}
            unavailable={!isToolAvailable('power_off_device')}
            unavailableMessage="Backend tool not available: power_off_device"
          />
        </div>
      </SectionCard>

      {/* Navigation Controls */}
      <SectionCard title="Navigation" icon={Globe}>
        <div className="space-y-4" data-testid="navigation-controls">
          {/* Open URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Open URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && urlInput.trim()) openUrl(); }}
                placeholder="Enter URL (e.g., example.com)"
                className="flex-1 px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                disabled={!isToolAvailable('open_url')}
                data-testid="url-input"
              />
              <button
                onClick={openUrl}
                disabled={!urlInput.trim() || loading['open_url'] || !isToolAvailable('open_url')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                data-testid="open-url-button"
              >
                {loading['open_url'] ? <RotateCw size={16} className="animate-spin" /> : <ExternalLink size={16} />}
                Open
              </button>
            </div>
            {!isToolAvailable('open_url') && <UnavailableMessage toolName="open_url" />}
          </div>

          {/* Web Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Web Search</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && searchQuery.trim()) openWebSearch(); }}
                placeholder="Enter search query"
                className="flex-1 px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                disabled={!isToolAvailable('open_websearch')}
                data-testid="search-input"
              />
              <button
                onClick={openWebSearch}
                disabled={!searchQuery.trim() || loading['open_websearch'] || !isToolAvailable('open_websearch')}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                data-testid="search-button"
              >
                {loading['open_websearch'] ? <RotateCw size={16} className="animate-spin" /> : <Search size={16} />}
                Search
              </button>
            </div>
            {!isToolAvailable('open_websearch') && <UnavailableMessage toolName="open_websearch" />}
          </div>
        </div>
      </SectionCard>

      {/* Action History */}
      <SectionCard title="Action History" icon={Clock}>
        <div data-testid="action-history">
          {actionHistory.length === 0 ? (
            <div className="text-center py-6 text-gray-500 dark:text-gray-400">
              <Clock size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No actions performed yet</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {actionHistory.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    {entry.status === 'success' ? (
                      <Check size={14} className="text-green-500" />
                    ) : (
                      <X size={14} className="text-red-500" />
                    )}
                    <span className="text-sm text-gray-700 dark:text-gray-300">{entry.action}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{entry.id}]</span></span>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {entry.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );

  const renderAppsTab = () => (
    <div className="space-y-6">
      <SectionCard title="Installed Apps" icon={LayoutGrid}>
        <div data-testid="app-list">
          {!isToolAvailable('get_installed_apps') ? (
            <UnavailableMessage toolName="get_installed_apps" />
          ) : appsLoading ? (
            <div className="flex items-center justify-center py-8">
              <RotateCw size={24} className="animate-spin text-gray-400" />
            </div>
          ) : apps.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <LayoutGrid size={48} className="mx-auto mb-4 opacity-20" />
              <p>No apps installed</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {apps.map((app, idx) => (
                <button
                  key={idx}
                  onClick={() => openApp(app.name)}
                  disabled={loading['open_app'] || !isToolAvailable('open_app')}
                  className="p-4 bg-gray-50 dark:bg-slate-700 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="app-button"
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold mb-2">
                    {app.name.charAt(0).toUpperCase()}
                  </div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{app.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{app.name}]</span></p>
                </button>
              ))}
            </div>
          )}
        </div>
        {!isToolAvailable('open_app') && apps.length > 0 && (
          <div className="mt-4">
            <UnavailableMessage toolName="open_app" />
          </div>
        )}
      </SectionCard>
    </div>
  );

  const renderCameraTab = () => (
    <div className="space-y-6">
      <SectionCard title="Camera Controls" icon={Camera}>
        <div className="space-y-6" data-testid="camera-controls">
          {/* Camera Settings */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Camera Type</label>
              <select
                value={cameraType}
                onChange={(e) => setCameraType(e.target.value as any)}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-gray-800 dark:text-gray-200"
                data-testid="camera-type-select"
              >
                <option value="DEFAULT">Default</option>
                <option value="FRONT">Front</option>
                <option value="REAR">Rear</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Camera Operation</label>
              <select
                value={cameraOperation}
                onChange={(e) => setCameraOperation(e.target.value as 'PHOTO' | 'VIDEO')}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-gray-800 dark:text-gray-200"
                data-testid="camera-operation-select"
              >
                <option value="PHOTO">Photo</option>
                <option value="VIDEO">Video</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Camera Mode</label>
              <select
                value={cameraMode}
                onChange={(e) => setCameraMode(e.target.value as any)}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-gray-800 dark:text-gray-200"
                data-testid="camera-mode-select"
              >
                <option value="DEFAULT">Default</option>
                <option value="PORTRAIT">Portrait</option>
              </select>
            </div>
          </div>

          {/* Camera Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={openCamera}
              disabled={loading['open_camera'] || !isToolAvailable('open_camera')}
              className="flex items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
              data-testid="open-camera-button"
            >
              {loading['open_camera'] ? <RotateCw size={18} className="animate-spin" /> : <Camera size={18} />}
              Open Camera
            </button>
            <button
              onClick={takePhoto}
              disabled={loading['take_photo'] || !isToolAvailable('take_photo')}
              className="flex items-center gap-2 px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:bg-gray-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
              data-testid="take-photo-button"
            >
              {loading['take_photo'] ? <RotateCw size={18} className="animate-spin" /> : <Image size={18} />}
              Take Photo
            </button>
          </div>

          {!isToolAvailable('open_camera') && <UnavailableMessage toolName="open_camera" />}
          {!isToolAvailable('take_photo') && <UnavailableMessage toolName="take_photo" />}
        </div>
      </SectionCard>

      {/* Video Recording */}
      <SectionCard title="Video Recording" icon={Video}>
        <div className="space-y-4" data-testid="video-controls">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Video Duration (optional)</label>
            <input
              type="text"
              value={videoDuration}
              onChange={(e) => setVideoDuration(e.target.value)}
              placeholder="e.g., 15 seconds"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              disabled={!isToolAvailable('record_video')}
              data-testid="video-duration-input"
            />
          </div>
          <button
            onClick={recordVideo}
            disabled={loading['record_video'] || !isToolAvailable('record_video')}
            className="flex items-center gap-2 px-4 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:bg-gray-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
            data-testid="record-video-button"
          >
            {loading['record_video'] ? <RotateCw size={18} className="animate-spin" /> : <Video size={18} />}
            Record Video
          </button>
          {!isToolAvailable('record_video') && <UnavailableMessage toolName="record_video" />}
        </div>
      </SectionCard>
    </div>
  );

  const renderMediaTab = () => (
    <div className="space-y-6">
      {/* Screenshots */}
      <SectionCard title="Screenshots" icon={Monitor}>
        <div data-testid="screenshots-container">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Captured screenshots</p>
            <button
              onClick={takeScreenshot}
              disabled={loading['take_screenshot'] || !isToolAvailable('take_screenshot')}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
              data-testid="take-screenshot-button"
            >
              {loading['take_screenshot'] ? <RotateCw size={14} className="animate-spin" /> : <Image size={14} />}
              Take Screenshot
            </button>
          </div>
          {!isToolAvailable('take_screenshot') && <UnavailableMessage toolName="take_screenshot" />}
          {screenshots.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
              <Monitor size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No screenshots captured yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {screenshots.map((name, idx) => (
                <div key={idx} className="aspect-video bg-gray-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <Monitor size={24} className="mx-auto text-gray-400 mb-1" />
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate px-1">{name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{name}]</span></p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      {/* Photos */}
      <SectionCard title="Photos" icon={Camera}>
        <div data-testid="photos-container">
          {photos.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
              <Camera size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No photos captured yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {photos.map((name, idx) => (
                <div key={idx} className="aspect-square bg-gray-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <Image size={24} className="mx-auto text-gray-400 mb-1" />
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate px-1">{name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{name}]</span></p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      {/* Videos */}
      <SectionCard title="Videos" icon={Video}>
        <div data-testid="videos-container">
          {videos.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
              <Video size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No videos recorded yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {videos.map((name, idx) => (
                <div key={idx} className="aspect-video bg-gray-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <Video size={24} className="mx-auto text-gray-400 mb-1" />
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate px-1">{name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{name}]</span></p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );

  const tabs = [
    { id: 'quick' as const, label: 'Quick Actions', icon: Zap },
    { id: 'apps' as const, label: 'Apps', icon: LayoutGrid },
    { id: 'camera' as const, label: 'Camera', icon: Camera },
    { id: 'media' as const, label: 'Media', icon: Image },
  ];

  return (
    <div className="h-full w-full bg-gray-50 dark:bg-slate-900 font-sans text-gray-800 dark:text-gray-100 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
            <Smartphone size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Device Actions</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Control panel</p>
          </div>
        </div>
        <button
          onClick={refreshAll}
          className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          title="Refresh"
        >
          <RotateCw size={20} />
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-4">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); if (tab.id === 'media' || tab.id === 'quick') throttledFetchState(); }}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                  : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              data-testid={`tab-${tab.id}`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'quick' && renderQuickActions()}
        {activeTab === 'apps' && renderAppsTab()}
        {activeTab === 'camera' && renderCameraTab()}
        {activeTab === 'media' && renderMediaTab()}
      </div>

      {/* Status Message Toast */}
      {statusMessage && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 ${
          statusMessage.type === 'success'
            ? 'bg-green-600 text-white'
            : statusMessage.type === 'info'
            ? 'bg-blue-600 text-white'
            : 'bg-red-600 text-white'
        }`}>
          {statusMessage.type === 'success' ? <Check size={18} /> : statusMessage.type === 'info' ? <AlertTriangle size={18} /> : <X size={18} />}
          <span className="text-sm font-medium">{statusMessage.message}</span>
        </div>
      )}

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={showPowerOffConfirm}
        title="Power Off Device"
        message="Are you sure you want to power off the device? This will open the power options menu."
        confirmLabel="Power Off"
        onConfirm={powerOffDevice}
        onCancel={() => setShowPowerOffConfirm(false)}
        variant="danger"
      />
      <ConfirmDialog
        isOpen={showRestartConfirm}
        title="Restart Device"
        message="Are you sure you want to restart the device? This will open the power options menu."
        confirmLabel="Restart"
        onConfirm={restartDevice}
        onCancel={() => setShowRestartConfirm(false)}
        variant="warning"
      />
    </div>
  );
}
