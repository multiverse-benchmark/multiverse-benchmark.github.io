import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useBackendAPI } from '@shared/hooks/useBackendAPI';
import { useTheme } from '@/contexts/ThemeContext';
import { useReadOnly } from '@/contexts/ReadOnlyContext';
import { 
  Wifi, 
  Bluetooth, 
  Moon, 
  Sun, 
  Volume2, 
  Bell, 
  Phone, 
  Clock, 
  Smartphone, 
  LayoutGrid, 
  ChevronRight, 
  ArrowLeft,
  Signal,
  Battery,
  Zap,
  RotateCw,
  Flashlight,
  Navigation,
  Globe,
  Monitor,
  Check,
  X,
  Headphones,
  Laptop,
  Watch,
  Trash2,
  Settings,
  Vibrate,
  MessageSquare,
  MinusCircle,
  Search,
  HardDrive,
  PieChart,
  Activity,
  Cpu,
  Shield,
  Lock,
  User,
  Calendar,
  Languages,
  Cast,
  Share2,
  MapPin,
  Download,
  Eye,
  Radio,
  Nfc,
  Mic,
  Camera,
  Plus
} from 'lucide-react';


// --- Types ---

type View = 'MAIN' | 'DISPLAY' | 'WIFI' | 'BLUETOOTH' | 'SOUND' | 'APPS' | 'NETWORK' | 'BATTERY' | 'STORAGE' | 'SYSTEM_INSIGHTS' | 'LOCATION' | 'SECURITY' | 'ACCESSIBILITY' | 'LANGUAGE';

interface WifiNetwork {
  ssid: string;
  strength?: number;
}

interface BluetoothDevice {
  name: string;
  type: 'HEADPHONES' | 'PHONE' | 'LAPTOP' | 'WATCH' | 'OTHER';
  paired: boolean;
}

interface AppInfo {
  name: string;
  package_name?: string;
  notification_enabled?: boolean;
}

interface DeviceState {
  airplane_mode: boolean;
  bluetooth: boolean;
  do_not_disturb: boolean;
  flashlight: boolean;
  wifi: boolean;
  location: boolean; // NETWORK
  bluetooth_connected: boolean;
}

// --- Components ---

const Header = ({ title, onBack, rightAction }: { title: string; onBack?: () => void, rightAction?: React.ReactNode }) => (
  <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 shadow-sm sticky top-0 z-10 transition-colors duration-200">
    <div className="flex items-center gap-3">
      {onBack && (
        <button 
          onClick={onBack}
          className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-300 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
      )}
      <h1 className="text-xl font-semibold text-gray-800 dark:text-white">{title}</h1>
    </div>
    {rightAction}
  </div>
);

const ToggleRow = ({ 
  icon: Icon, 
  label, 
  subLabel,
  checked, 
  onChange, 
  colorClass = "bg-blue-500"
}: { 
  icon?: React.ElementType; 
  label: string; 
  subLabel?: string;
  checked: boolean | undefined; 
  onChange: (checked: boolean) => void;
  colorClass?: string;
}) => {
  const readOnly = useReadOnly();
  return (
  <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-750 transition-colors duration-200 cursor-pointer border-b border-gray-50 dark:border-slate-700 last:border-0" onClick={() => { if (!readOnly && checked !== undefined) onChange(!checked); }}>
    <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
      {Icon && (
        <div className={`p-2 rounded-lg shrink-0 ${checked ? colorClass.replace('bg-', 'bg-opacity-10 text-') : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400'}`}>
          <Icon size={20} className={checked ? colorClass.replace('bg-', 'text-') : ''} />
        </div>
      )}
      <div className="flex flex-col min-w-0">
        <span className="text-base font-medium text-gray-700 dark:text-gray-200 truncate">{label}</span>
        {subLabel && <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{subLabel}</span>}
      </div>
    </div>
    {checked === undefined ? <span className="max-w-28 text-right text-xs text-gray-500 dark:text-gray-400">Not stored in snapshot</span> : <button type="button" role="switch" aria-label={label} aria-checked={checked} disabled={readOnly} className={`w-12 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out shrink-0 ${checked ? colorClass : 'bg-gray-300 dark:bg-gray-600'}`} onClick={(e) => { e.stopPropagation(); onChange(!checked); }}>
      <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${checked ? 'translate-x-6' : ''}`} />
    </button>}
  </div>
);
};

const Section = ({ title, children }: { title?: string; children: React.ReactNode }) => (
  <div className="mb-6">
    {title && <h2 className="px-4 py-2 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{title}</h2>}
    <div className="bg-white dark:bg-slate-800 rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-slate-700 mx-4">
      {children}
    </div>
  </div>
);

const NavItem = ({ 
  icon: Icon, 
  label, 
  value, 
  onClick,
  colorClass = "text-gray-600 bg-gray-100" 
}: { 
  icon: React.ElementType; 
  label: string; 
  value?: string; 
  onClick: () => void;
  colorClass?: string;
}) => (
  <button 
    onClick={onClick}
    className="w-full flex items-center justify-between p-4 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-750 transition-colors duration-200 border-b border-gray-50 dark:border-slate-700 last:border-0 text-left"
  >
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg ${colorClass}`}>
        <Icon size={20} />
      </div>
      <span className="text-base font-medium text-gray-700 dark:text-gray-200">{label}</span>
    </div>
    <div className="flex items-center gap-2 text-gray-400">
      {value && <span className="text-sm">{value}</span>}
      <ChevronRight size={18} />
    </div>
  </button>
);

const SliderRow = ({
  icon: Icon,
  label,
  value,
  onChange,
  onMuteToggle,
  isMuted,
  onAdjust
}: {
  icon?: React.ElementType;
  label: string;
  value: number | undefined;
  onChange: (val: number) => void;
  onMuteToggle?: () => void;
  isMuted?: boolean;
  onAdjust?: (by: number) => void;
}) => {
  const readOnly = useReadOnly();
  return (
  <div className="p-4 bg-white dark:bg-slate-800 border-b border-gray-50 dark:border-slate-700 last:border-0">
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={18} className="text-gray-500 dark:text-gray-400" />}
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
      </div>
      <span className="text-xs text-gray-400">{value === undefined ? 'Not stored in snapshot' : `${Math.round(value)}%`}</span>
    </div>
    <div className="flex items-center gap-2">
        {onAdjust && (
          <button
            disabled={readOnly || value === undefined}
            onClick={() => onAdjust(-10)}
            className="p-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600 text-xs font-bold flex-shrink-0"
            title="Decrease volume"
          >−</button>
        )}
        <input
        type="range"
        min="0"
        max="100"
        value={value ?? 0}
        disabled={readOnly || value === undefined}
        hidden={value === undefined}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-2 bg-gray-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:accent-blue-500"
        />
        {onAdjust && (
          <button
            disabled={readOnly || value === undefined}
            onClick={() => onAdjust(10)}
            className="p-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600 text-xs font-bold flex-shrink-0"
            title="Increase volume"
          >+</button>
        )}
        {onMuteToggle && (
            <button disabled={readOnly || value === undefined} onClick={onMuteToggle} className={`p-2 rounded-full ${isMuted ? 'bg-red-100 text-red-500 dark:bg-red-900/30 dark:text-red-400' : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-gray-400'}`}>
                {isMuted ? <Volume2 size={16} className="opacity-50" /> : <Volume2 size={16} />}
            </button>
        )}
    </div>
  </div>
);
};

// --- Main App ---

interface AppProps {
  onClose?: () => void;
  setRefreshHandler?: (handler: (() => void) | null) => void;
}

export default function App({ setRefreshHandler }: AppProps) {
  const api = useBackendAPI('device_setting');
  const readOnly = useReadOnly();
  const { theme, setTheme } = useTheme();
  const [view, setView] = useState<View>('MAIN');
  const [loading, setLoading] = useState(false);
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [brightness, setBrightness] = useState<number | undefined>(undefined);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [wifiList, setWifiList] = useState<string[]>([]);
  const [connectedWifi, setConnectedWifi] = useState<string | null>(null);
  const [connectingWifi, setConnectingWifi] = useState<string | null>(null);
  
  const [bluetoothList, setBluetoothList] = useState<BluetoothDevice[]>([]);
  const [connectedBluetooth, setConnectedBluetooth] = useState<string[]>([]);
  const [connectingBluetooth, setConnectingBluetooth] = useState<string | null>(null);

  const [appList, setAppList] = useState<AppInfo[]>([]);
  const [insights, setInsights] = useState<{battery: string[], storage: string[], general: string[]}>({
      battery: [],
      storage: [],
      general: []
  });
  const [wifiPassword, setWifiPassword] = useState('');
  const [selectedWifi, setSelectedWifi] = useState<string | null>(null);
  const [appSearch, setAppSearch] = useState('');
  const [subView, setSubView] = useState<string | null>(null);

  // Ref to track fetch validity and prevent stale overwrites
  const fetchIdRef = useRef(0);

  // Ref for setRefreshHandler to avoid infinite re-render (parent passes inline arrow)
  const setRefreshHandlerRef = useRef(setRefreshHandler);
  setRefreshHandlerRef.current = setRefreshHandler;

  const navigate = (newView: View, settingType?: string) => {
    setView(newView);
    setSubView(null);
    if (settingType && !readOnly) {
        // Fire and forget - just informing the backend
        api.callTool('open', { setting_type: settingType }).catch(e => console.warn('Navigation log failed', e));
    }
    // Persist settings so they appear in DB viewer
    if (!readOnly && newView === 'SECURITY') {
        persistSettingViaState('SECURITY', { on_or_off: 'on' });
    } else if (!readOnly && newView === 'ACCESSIBILITY') {
        persistSettingViaState('ACCESSIBILITY', { on_or_off: 'on' });
    } else if (!readOnly && newView === 'LANGUAGE') {
        persistSettingViaState('LANGUAGE', { on_or_off: 'on' });
    }
  };

  const fetchToggles = useCallback(async () => {
    // Increment ID for this new fetch
    const myId = ++fetchIdRef.current;
    try {
      const keys = [
          'WIFI', 'BLUETOOTH', 'AIRPLANE_MODE', 'DO_NOT_DISTURB', 'FLASHLIGHT', 'NIGHT_MODE', 'VIBRATION',
          'HOT_SPOT', 'NETWORK', 'NFC', 'AUTO_ROTATE', 'BATTERY_SAVER', 'TALK_BACK'
      ];
      const results: Record<string, boolean> = {};
      await Promise.all(keys.map(async (key) => {
        try {
            const res = await api.callTool('get', { setting_type: key });
             // SettingInfo returns on_or_off: 'on' | 'off'
             if (res && typeof res === 'object') {
                 if ('on_or_off' in res) results[key] = res.on_or_off === 'on';
                 else if ('value' in res) results[key] = res.value === 'ON' || res.value === true;
             }
        } catch (e) {
            console.warn(`Failed to fetch ${key}`, e);
        }
      }));
      
      // Check for staleness before updating state
      if (myId !== fetchIdRef.current) return;

      setToggles(prev => ({...Object.fromEntries(Object.entries(prev).filter(([key]) => !keys.includes(key))), ...results}));
    } catch (error) {
      console.error('Error fetching toggles', error);
    }
  }, [api.callTool]);

  const fetchBrightness = useCallback(async () => {
      try {
          const res = await api.callTool('get', { setting_type: 'BRIGHTNESS' });
          if ((res as any)?.percentage_value !== undefined) {
              setBrightness((res as any).percentage_value);
          }
      } catch (e) { setBrightness(undefined); console.warn('Brightness is not stored in this snapshot', e); }
  }, [api.callTool]);

  const fetchDataSaver = useCallback(async () => {
      try {
          const stateRes = await fetch('./api/services/device_setting/state');
          const stateData = await stateRes.json();
          const dataSaver = stateData?.state?.device_settings?.settings?.DATA_SAVER;
          if (dataSaver) {
              setToggles(prev => ({...prev, DATA_SAVER: dataSaver.on_or_off === 'on'}));
          }
      } catch (e) { console.error('Failed to fetch data saver', e); }
  }, []);

  const fetchVolumes = useCallback(async () => {
     // Get volumes (including master VOLUME)
     const types = ['VOLUME', 'MEDIA_VOLUME', 'CALL_VOLUME', 'RING_VOLUME', 'ALARM_VOLUME', 'NOTIFICATION_VOLUME'];
     // Note: `get` enum uses keys like MEDIA_VOLUME. `set_volume` uses keys like MEDIA, CALL (VolumeSettingType vs GetableDeviceSettingType)
     try {
        const results: Record<string, number> = {};
        await Promise.all(types.map(async (t) => {
             try {
             const res = await api.callTool('get', { setting_type: t });
             // SettingInfo returns percentage_value
             const level = (res as any)?.percentage_value ?? (res as any)?.level ?? (res as any)?.value;
             if (typeof level === 'number') {
                 // Map Getable to VolumeType for state: MEDIA_VOLUME -> MEDIA, VOLUME -> VOLUME
                 const shortKey = t === 'VOLUME' ? 'VOLUME' : t.replace('_VOLUME', '');
                 results[shortKey] = level;
             }
             } catch (e) { console.warn(`${t} is not stored in this snapshot`, e); }
        }));
        setVolumes(results);
     } catch (e) { console.error(e); }
  }, [api.callTool]);

  const refreshAll = useCallback(() => {
    fetchToggles();
    fetchVolumes();
    fetchBrightness();
  }, [fetchToggles, fetchVolumes, fetchBrightness]);

  const refreshAllRef = useRef(refreshAll);
  refreshAllRef.current = refreshAll;

  useEffect(() => {
    if (setRefreshHandlerRef.current) {
      setRefreshHandlerRef.current(() => refreshAllRef.current());
    }
    return () => {
      if (setRefreshHandlerRef.current) setRefreshHandlerRef.current(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchToggles();
    fetchVolumes();
    fetchBrightness();
    fetchDataSaver();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No mock data for Bluetooth
  
  const handleToggle = async (key: string, value: boolean) => {
    if (readOnly || toggles[key] === undefined) return;
    // Invalidate any pending fetches immediately to protect the optimistic update
    fetchIdRef.current++;

    if (key === 'NIGHT_MODE') {
      setTheme(value ? 'dark' : 'light');
    }
    // Optimistic update
    setToggles(prev => {
        const next = { ...prev, [key]: value };
        // Airplane Mode Logic: Turning ON disables radios
        if (key === 'AIRPLANE_MODE' && value === true) {
            next['WIFI'] = false;
            next['BLUETOOTH'] = false;
        }
        return next;
    });

    if (key === 'AIRPLANE_MODE' && value === true) {
        setConnectedWifi(null);
        setConnectedBluetooth([]);
    }

    try {
      // Backend expects 'setting' for on/off tools
      await api.callTool(value ? 'on' : 'off', { setting: key });

      // Trigger backend side effects for Airplane Mode
      if (key === 'AIRPLANE_MODE' && value === true) {
          // Await these to ensure database consistency before fetching
          await api.callTool('off', { setting: 'WIFI' });
          await api.callTool('off', { setting: 'BLUETOOTH' });
      }

      setTimeout(fetchToggles, 500); // Refresh to ensure sync
    } catch (error) {
      console.error('Toggle failed', error);
      fetchToggles(); // Revert by fetching truth
    }
  };

  const persistSettingViaState = useCallback(async (settingName: string, value: Record<string, any>) => {
      try {
          const stateRes = await fetch('./api/services/device_setting/state');
          const stateData = await stateRes.json();
          const state = stateData.state;
          if (!state) return;
          if (!state.device_settings) state.device_settings = {};
          if (!state.device_settings.settings) state.device_settings.settings = {};
          state.device_settings.settings[settingName] = {
              ...(state.device_settings.settings[settingName] || {}),
              ...value,
              last_updated: new Date().toISOString()
          };
          await fetch('./api/services/device_setting/state', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ state })
          });
      } catch (e) {
          console.error('Failed to persist setting via state API', e);
      }
  }, []);

  const handleDataSaverToggle = useCallback(async (value: boolean) => {
      setToggles(prev => ({...prev, DATA_SAVER: value}));
      await persistSettingViaState('DATA_SAVER', { on_or_off: value ? 'on' : 'off' });
  }, [persistSettingViaState]);

  // Persist SECURITY, ACCESSIBILITY, LANGUAGE settings on mount so they appear in DB viewer
  useEffect(() => {
    const persistCategorySettings = async () => {
      try {
        const stateRes = await fetch('./api/services/device_setting/state');
        const stateData = await stateRes.json();
        const settings = stateData?.state?.device_settings?.settings || {};
        const missing = ['SECURITY', 'ACCESSIBILITY', 'LANGUAGE'].filter(k => !settings[k]);
        await Promise.all(missing.map(k => persistSettingViaState(k, { on_or_off: 'on' })));
      } catch (e) { /* ignore */ }
    };
    persistCategorySettings();
  }, [persistSettingViaState]);

  const brightnessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleBrightnessChange = (val: number) => {
      setBrightness(val);
      if (brightnessTimerRef.current) clearTimeout(brightnessTimerRef.current);
      brightnessTimerRef.current = setTimeout(() => {
          persistSettingViaState('BRIGHTNESS', { percentage_value: val });
      }, 300);
  };
  useEffect(() => {
    return () => { if (brightnessTimerRef.current) clearTimeout(brightnessTimerRef.current); };
  }, []);

  const loadWifi = async () => {
    setLoading(true);
    try {
        // Fetch WiFi status and available networks in parallel
        const [res, listRes] = await Promise.all([
            api.callTool('get', { setting_type: 'WIFI' }).catch(() => null),
            api.callTool('list_all_available_wifi', {}).catch(() => null),
        ]);

        // Parse available networks from list_all_available_wifi response
        let availableNetworks: string[] = [];
        if (listRes) {
            try {
                const cardData = listRes.action_card_content_passthrough
                    ? JSON.parse(listRes.action_card_content_passthrough)
                    : listRes;
                if (cardData.available_networks && Array.isArray(cardData.available_networks)) {
                    availableNetworks = cardData.available_networks;
                }
            } catch { /* use fallback from get */ }
        }

        if (res) {
            if (availableNetworks.length === 0 && res.available_networks && Array.isArray(res.available_networks)) {
                availableNetworks = res.available_networks;
            }
            if (res.connected_network) {
                setConnectedWifi(res.connected_network);
            } else {
                setConnectedWifi(null);
            }
            if (res.on_or_off) {
                setToggles(prev => ({ ...prev, 'WIFI': res.on_or_off === 'on' }));
            }
        }
        setWifiList(availableNetworks);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const connectWifi = async (ssid: string) => {
      if (ssid === connectedWifi) return; // Already connected
      setConnectingWifi(ssid);
      try {
          const res: any = await api.callTool('connect_wifi', { network_name: ssid });
          
          // Try to update from response if possible to be faster
          if (res && res.action_card_content_passthrough) {
             try {
                 const card = JSON.parse(res.action_card_content_passthrough);
                 if (card.connected_network) {
                     setConnectedWifi(card.connected_network);
                 }
             } catch (e) {
                 console.error("Error parsing wifi card", e);
             }
          }
          
          // Always refresh source of truth
          await loadWifi();
      } catch (e) { 
          console.error(e); 
          alert('Failed to connect'); 
      }
      setConnectingWifi(null);
  };

  const loadBluetooth = async () => {
      setLoading(true);
      try {
          // Sync toggle state
          const res: any = await api.callTool('get', { setting_type: 'BLUETOOTH' });
          const isOn = res && res.on_or_off === 'on';
          
          if (res && res.on_or_off) {
               setToggles(prev => ({ ...prev, 'BLUETOOTH': isOn }));
          }
      } catch(e) { console.error(e); }
      setLoading(false);
  };

  const connectBluetooth = async (device: BluetoothDevice) => {
      const isConnected = connectedBluetooth.includes(device.name);
      
      if (isConnected) {
          // Disconnect
          setConnectedBluetooth(prev => prev.filter(name => name !== device.name));
          return;
      }
      
      setConnectingBluetooth(device.name);
      
      // Simulation delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setConnectedBluetooth(prev => [...prev, device.name]);
      setBluetoothList(prev => prev.map(d => 
          d.name === device.name ? { ...d, paired: true } : d
      ));
      setConnectingBluetooth(null);
  };

  const forgetBluetooth = (device: BluetoothDevice) => {
      // Unpair locally
      setBluetoothList(prev => prev.map(d => 
          d.name === device.name ? { ...d, paired: false } : d
      ));
      // Disconnect if connected
      setConnectedBluetooth(prev => prev.filter(name => name !== device.name));
  };

  const confirmWifiConnect = async () => {
      // Deprecated in favor of direct connect for simulation
  };

  const loadApps = async () => {
      setLoading(true);
      try {
          // @ts-ignore
          const res = await api.callTool('get_installed_apps', {});
          const apps = (res as any)?.apps || [];
          
          const appsWithStatus = await Promise.all(apps.map(async (name: string) => {
              try {
                  const statusRes = await api.callTool('get_app_notification_status', { app_name: name });
                  return { name, notification_enabled: (statusRes as any)?.notifications === 'on' };
              } catch (e) {
                  return { name, notification_enabled: true };
              }
          }));
          setAppList(appsWithStatus);
      } catch (e) { console.error('Failed to load apps', e); }
      setLoading(false);
  };

  const toggleAppNotif = async (appName: string, current: boolean) => {
      // Optimistic
      setAppList(prev => prev.map(a => a.name === appName ? {...a, notification_enabled: !current} : a));
      try {
          await api.callTool('set_app_notification_status', { app_name: appName, notifications: !current ? 'on' : 'off' });
      } catch (e) {
         setAppList(prev => prev.map(a => a.name === appName ? {...a, notification_enabled: current} : a)); 
      }
  };

  const loadInsight = async (type: 'BATTERY' | 'STORAGE' | 'UNCATEGORIZED') => {
      setLoading(true);
      try {
          // @ts-ignore
          const res = await api.callTool('get_device_insights', { device_state_type: type });
          
          const extract = (r: any) => {
             if (!r || !r.action_card_content_passthrough) return [];
             try {
                 const card = JSON.parse(r.action_card_content_passthrough);
                 return card.insights || []; // Returns array of strings
             } catch(e) { return []; }
          };

          const data = extract(res);
          setInsights((prev: any) => {
              const newState = prev ? { ...prev } : { battery: [], storage: [], general: [] };
              if (type === 'BATTERY') newState.battery = data;
              if (type === 'STORAGE') newState.storage = data;
              if (type === 'UNCATEGORIZED') newState.general = data;
              return newState;
          });
      } catch (e) { console.error(e); }
      setLoading(false);
  };


  const parseInsightData = (items: string[]) => {
      const res: any = { raw: [], kv: {}, json: {} };
      if (!items || !Array.isArray(items)) return res;
      items.forEach(item => {
          if (typeof item !== 'string') return;
          res.raw.push(item);
          // Check for JSON-like content for breakdown
          if (item.includes('{')) {
               try {
                  const start = item.indexOf('{');
                  const jsonPart = item.substring(start);
                  const parsed = JSON.parse(jsonPart);
                  res.json = { ...res.json, ...parsed };
               } catch (e) {}
          } 
          // key-value parsing
          if (item.includes(':')) {
              const parts = item.split(':');
              const k = parts[0];
              const v = parts.slice(1).join(':');
              if (k && v !== undefined) res.kv[k.trim().toLowerCase()] = v.trim();
          }
      });
      return res;
  };

  const renderBattery = () => {
      const data = parseInsightData(insights.battery);
      const percentageStr = data.kv['percentage'];
      const percentage = percentageStr ? parseInt(percentageStr) : 0;
      const state = data.kv['charging status'] || data.kv['status'] || 'Not Charging';
      const breakdown = data.json;
      const formattedState = state.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      
      if (loading) {
          return (
              <>
                  <Header title="Battery" onBack={() => navigate('MAIN', 'UNSPECIFIED')} />
                  <div className="flex h-full items-center justify-center p-6 text-gray-400">
                      <RotateCw className="animate-spin" size={32} />
                  </div>
              </>
          )
      }

      return (
        <>
            <Header title="Battery" onBack={() => navigate('MAIN', 'UNSPECIFIED')} />
            <div className="p-6 space-y-6 overflow-y-auto bg-gray-50 dark:bg-slate-900 h-full pb-20">
                
                {/* Status Card */}
                <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-slate-700 flex flex-col items-center">
                    <div className="relative w-32 h-32 flex items-center justify-center mb-4">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="64" cy="64" r="60" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-200 dark:text-slate-700" />
                            <circle cx="64" cy="64" r="60" stroke={percentage < 20 ? '#EF4444' : '#10B981'} strokeWidth="8" fill="transparent" 
                                strokeDasharray={377} strokeDashoffset={377 - (377 * percentage) / 100} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-4xl font-bold text-gray-800 dark:text-white">{percentageStr ? percentage : '--'}%</span>
                            <Zap size={20} className={`mt-1 ${state && state.toLowerCase().includes('not') ? 'text-gray-300' : 'text-yellow-500'}`} fill="currentColor" />
                        </div>
                    </div>
                    <div className="text-lg font-medium text-gray-700 dark:text-gray-200">{formattedState}</div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-slate-700">
                     <ToggleRow 
                        icon={Battery} 
                        label="Battery Saver" 
                        subLabel="Reduces performance to save power"
                        checked={toggles['BATTERY_SAVER']} 
                        onChange={(v) => handleToggle('BATTERY_SAVER', v)} 
                        colorClass="bg-orange-500"
                    />
                </div>

                {Object.keys(breakdown).length > 0 && (
                    <Section title="Usage Details">
                        <div className="bg-white dark:bg-slate-800 rounded-xl overflow-hidden border border-gray-100 dark:border-slate-700">
                        {Object.entries(breakdown).map(([k, v]: any, idx) => (
                            <div key={idx} className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-700 last:border-0">
                                <span className="text-gray-700 dark:text-gray-300 font-medium">{k}</span>
                                <span className="text-gray-500 dark:text-gray-400">{v}</span>
                            </div>
                        ))}
                        </div>
                    </Section>
                )}
            </div>
        </>
      );
  };

  const renderStorage = () => {
    const data = parseInsightData(insights.storage);
    const totalStr = data.kv['total gb'] || data.kv['total'];
    const availStr = data.kv['available gb'] || data.kv['available'];
    
    // Parse helper
    const parse = (s: string | undefined) => s ? (parseFloat(s.replace(/[^\d.]/g, '')) || 0) : 0;
    
    const total = parse(totalStr);
    const avail = parse(availStr);
    const used = total > 0 ? total - avail : 0;
    const usedPercent = total > 0 ? (used / total) * 100 : 0;
    
    if (loading) {
        return (
            <>
                <Header title="Storage" onBack={() => navigate('MAIN', 'UNSPECIFIED')} />
                <div className="flex h-full items-center justify-center p-6 text-gray-400">
                    <RotateCw className="animate-spin" size={32} />
                </div>
            </>
        )
    }

    return (
        <>
            <Header title="Storage" onBack={() => navigate('MAIN', 'UNSPECIFIED')} />
            <div className="p-6 space-y-6 overflow-y-auto bg-gray-50 dark:bg-slate-900 h-full pb-20">
                
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
                    <div className="flex justify-between items-end mb-2">
                         <div>
                            <span className="text-3xl font-bold text-gray-800 dark:text-white">{total > 0 ? used.toFixed(1) : '--'} GB</span>
                            <span className="text-gray-400 ml-2">used</span>
                         </div>
                         <div className="text-gray-500 dark:text-gray-400 text-sm">{total > 0 ? totalStr : '--'} GB total</div>
                    </div>
                    <div className={`h-3 w-full bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden`}>
                        <div className="h-full bg-blue-500 rounded-full" style={{width: `${usedPercent}%`}} />
                    </div>
                </div>

                {data.json && Object.keys(data.json).length > 0 && (
                     <div className="grid grid-cols-2 gap-3">
                         {Object.entries(data.json).map(([k,v]: any, i) => {
                             let Icon = PieChart;
                             let colorClass = "text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400";
                            
                             const key = k.toLowerCase();
                             if (key.includes('photo') || key.includes('image') || key.includes('camera')) {
                                 Icon = Camera;
                                 colorClass = "text-pink-500 bg-pink-100 dark:bg-pink-900/30 dark:text-pink-400";
                             } else if (key.includes('app')) {
                                 Icon = LayoutGrid;
                                 colorClass = "text-blue-500 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400";
                             } else if (key.includes('system')) {
                                 Icon = Cpu;
                                 colorClass = "text-purple-500 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400";
                             } else if (key.includes('other') || key.includes('misc')) {
                                 Icon = HardDrive;
                                 colorClass = "text-amber-500 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400";
                             }

                             return (
                             <div key={i} className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 flex flex-col justify-between hover:bg-gray-50 dark:hover:bg-slate-750 transition-colors">
                                 <div className="flex items-center gap-2 mb-2">
                                     <div className={`p-1.5 rounded-lg ${colorClass}`}>
                                        <Icon size={16} />
                                     </div>
                                     <div className="text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider font-semibold truncate">{k}</div>
                                 </div>
                                 <div className="text-xl font-bold text-gray-800 dark:text-white mt-1">
                                     {v} <span className="text-sm font-normal text-gray-400 ml-0.5">GB</span>
                                 </div>
                             </div>
                         )})}
                     </div>
                )}
            </div>
        </>
    );
  };

  const renderSystem = () => {
      const data = parseInsightData(insights.general);
      
      const cpu = parseInt(data.kv['cpu usage'] || '0');
      const memory = parseInt(data.kv['memory usage'] || '0');
      const wifiStrength = parseInt(data.kv['wifi strength'] || '0');
      const cellularSignal = parseInt(data.kv['cellular signal'] || '0');
      const networkState = data.kv['network signal'] || 'Unknown';

      // Helper to determine color based on load/strength
      const getLoadColor = (val: number) => val < 50 ? 'bg-green-500' : val < 80 ? 'bg-yellow-500' : 'bg-red-500';
      const getSignalColor = (val: number) => val > 75 ? 'text-green-500' : val > 40 ? 'text-yellow-500' : 'text-red-500';
      
      if (loading) {
          return (
              <>
                  <Header title="System Status" onBack={() => navigate('MAIN', 'UNSPECIFIED')} />
                  <div className="flex h-full items-center justify-center p-6 text-gray-400">
                      <RotateCw className="animate-spin" size={32} />
                  </div>
              </>
          )
      }

      const hasMetrics = data.kv['cpu usage'] || data.kv['memory usage'];

      return (
        <>
            <Header title="System Status" onBack={() => navigate('MAIN', 'UNSPECIFIED')} />
            <div className="p-6 space-y-6 overflow-y-auto bg-gray-50 dark:bg-slate-900 h-full pb-20">
                
                {hasMetrics && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* CPU Card */}
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                                    <Cpu size={20} />
                                </div>
                                <span className="font-semibold text-gray-700 dark:text-gray-200">CPU Usage</span>
                            </div>
                            <div className="flex items-end justify-between mb-2">
                                <span className="text-3xl font-bold text-gray-800 dark:text-white">{cpu}%</span>
                                <span className="text-xs text-gray-400 mb-1">Load</span>
                            </div>
                            <div className="h-2 w-full bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-1000 ${getLoadColor(cpu)}`} style={{width: `${cpu}%`}} />
                            </div>
                        </div>

                        {/* Memory Card */}
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg">
                                    <Activity size={20} />
                                </div>
                                <span className="font-semibold text-gray-700 dark:text-gray-200">Memory</span>
                            </div>
                            <div className="flex items-end justify-between mb-2">
                                <span className="text-3xl font-bold text-gray-800 dark:text-white">{memory}%</span>
                                <span className="text-xs text-gray-400 mb-1">Used</span>
                            </div>
                            <div className="h-2 w-full bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-1000 ${getLoadColor(memory)}`} style={{width: `${memory}%`}} />
                            </div>
                        </div>

                        {/* Network Card */}
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg">
                                    <Signal size={20} />
                                </div>
                                <span className="font-semibold text-gray-700 dark:text-gray-200">Network</span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-end">
                                    <span className="text-gray-500 dark:text-gray-400 text-sm mb-1">Signal Strength</span>
                                    <div className="flex gap-1 items-end h-8">
                                        {[1,2,3,4].map(b => {
                                            const h = b === 1 ? 'h-3' : b === 2 ? 'h-4' : b === 3 ? 'h-6' : 'h-8';
                                            return (
                                              <div key={b} className={`w-1.5 ${h} rounded-sm ${cellularSignal >= b ? 'bg-green-500' : 'bg-gray-200 dark:bg-slate-700'}`} />
                                            )
                                        })}
                                    </div>
                                </div>
                                <div className="text-lg font-medium text-gray-800 dark:text-gray-200 mt-1 capitalize">{networkState}</div>
                            </div>
                        </div>

                        {/* WiFi Card */}
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 rounded-lg">
                                    <Wifi size={20} />
                                </div>
                                <span className="font-semibold text-gray-700 dark:text-gray-200">Wi-Fi</span>
                            </div>
                            <div className="flex items-end justify-between mb-2">
                                <span className="text-3xl font-bold text-gray-800 dark:text-white">{wifiStrength}%</span>
                                <span className="text-xs text-gray-400 mb-1">Strength</span>
                            </div>
                            <div className="h-2 w-full bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-1000 ${getSignalColor(wifiStrength)} bg-current`} style={{width: `${wifiStrength}%`}} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Raw logs fall back if needed, or other fields */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-slate-700">
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/50">
                        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Detailed Logs</h3>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-slate-700">
                        {data.raw.map((item: string, i: number) => (
                             <div key={i} className="p-4 text-sm text-gray-600 dark:text-gray-300 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-slate-750 transition-colors">
                                 <div className="mt-0.5 text-gray-400 opacity-50">•</div>
                                 <div className="leading-relaxed">{item}</div>
                             </div>
                        ))}
                         {data.raw.length === 0 && <div className="p-8 text-center text-gray-400">No system details available</div>}
                    </div>
                </div>
            </div>
        </>
      );
  };

  const renderSidebar = () => (
    <div className="h-full overflow-y-auto bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 w-full transition-colors duration-200">
      <Header title="Settings" />
      <div className="p-4 space-y-6">
        
        {/* Connectivity */}
        <Section title="Connectivity">
             <ToggleRow 
                icon={toggles['AIRPLANE_MODE'] ? Smartphone : Signal} 
                label="Airplane Mode" 
                checked={toggles['AIRPLANE_MODE']} 
                onChange={(v) => handleToggle('AIRPLANE_MODE', v)} 
                colorClass="bg-orange-500"
            />
            
            <div onClick={() => { navigate('NETWORK', 'NETWORK'); }} className={`cursor-pointer transition-colors ${view === 'NETWORK' ? 'bg-green-50 dark:bg-green-900/20 ring-2 ring-inset ring-green-100 dark:ring-green-800 rounded-xl' : ''}`}>
                <NavItem 
                    icon={Globe} 
                    label="Mobile Network" 
                    value={toggles['NETWORK'] === undefined ? 'Not stored in snapshot' : toggles['NETWORK'] ? 'On' : 'Off'}
                    onClick={() => navigate('NETWORK', 'NETWORK')} 
                    colorClass="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                />
            </div>

             {/* Wi-Fi: Click to Navigate. Toggle handles its own logic. */}
             <div onClick={() => { navigate('WIFI', 'WIFI'); loadWifi(); }} className={`cursor-pointer transition-colors ${view === 'WIFI' ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-inset ring-blue-100 dark:ring-blue-800 rounded-xl' : ''}`}>
               <ToggleRow 
                  icon={Wifi} 
                  label="Wi-Fi" 
                  checked={toggles['WIFI']} 
                  onChange={(v) => {
                      handleToggle('WIFI', v);
                  }} 
                  colorClass="bg-blue-500"
              />
            </div>

            <div onClick={() => { navigate('BLUETOOTH', 'BLUETOOTH'); loadBluetooth(); }} className={`cursor-pointer transition-colors ${view === 'BLUETOOTH' ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-inset ring-blue-100 dark:ring-blue-800 rounded-xl' : ''}`}>
                <ToggleRow 
                    icon={Bluetooth} 
                    label="Bluetooth" 
                    checked={toggles['BLUETOOTH']} 
                    onChange={(v) => handleToggle('BLUETOOTH', v)} 
                    colorClass="bg-blue-600"
                />
            </div>
            
            <ToggleRow
                icon={Nfc}
                label="NFC"
                subLabel="Allow data exchange"
                checked={toggles['NFC']}
                onChange={(v) => handleToggle('NFC', v)}
                colorClass="bg-indigo-500"
            />
            <div className={`cursor-pointer transition-colors ${view === 'LOCATION' ? 'bg-green-50 dark:bg-green-900/20 ring-2 ring-inset ring-green-100 dark:ring-green-800 rounded-xl' : ''}`}>
                <NavItem
                    icon={MapPin}
                    label="Location"
                    value={toggles['NETWORK'] === undefined ? 'Not stored in snapshot' : toggles['NETWORK'] ? 'On' : 'Off'}
                    onClick={() => navigate('LOCATION', 'LOCATION')}
                    colorClass="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                />
            </div>
        </Section>

        {/* Device */}
        <Section title="Device">
            <div onClick={() => navigate('DISPLAY', 'DISPLAY')} className={`cursor-pointer transition-colors ${view === 'DISPLAY' ? 'bg-orange-50 dark:bg-orange-900/20 ring-2 ring-inset ring-orange-100 dark:ring-orange-800 rounded-xl' : ''}`}>
                 <NavItem 
                    icon={Sun} 
                    label="Display & Brightness" 
                    value={brightness === undefined ? 'Not stored in snapshot' : `${brightness}%`}
                    onClick={() => navigate('DISPLAY', 'DISPLAY')} 
                    colorClass="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
                />
            </div>
            <div className={`cursor-pointer transition-colors ${view === 'SOUND' ? 'bg-pink-50 dark:bg-pink-900/20 ring-2 ring-inset ring-pink-100 dark:ring-pink-800 rounded-xl' : ''}`}>
                <NavItem 
                    icon={Volume2} 
                    label="Sound & Vibration" 
                    onClick={() => { navigate('SOUND', 'VOLUME'); fetchVolumes(); }} 
                    colorClass="bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400"
                />
            </div>
            <div className={`cursor-pointer transition-colors ${view === 'STORAGE' ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-inset ring-blue-100 dark:ring-blue-800 rounded-xl' : ''}`}>
             <NavItem 
                icon={HardDrive} 
                label="Storage" 
                onClick={() => { navigate('STORAGE', 'INTERNAL_STORAGE'); loadInsight('STORAGE'); }} 
                colorClass="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
            />
            </div>
             <ToggleRow 
                icon={Bell} 
                label="Do Not Disturb" 
                checked={toggles['DO_NOT_DISTURB']} 
                onChange={(v) => handleToggle('DO_NOT_DISTURB', v)} 
                colorClass="bg-indigo-500"
            />
        </Section>
        
        {/* Battery - Dedicated Section */}
        <Section title="Battery">
            <div className={`cursor-pointer transition-colors ${view === 'BATTERY' ? 'bg-green-50 dark:bg-green-900/20 ring-2 ring-inset ring-green-100 dark:ring-green-800 rounded-xl' : ''}`}>
                <NavItem 
                    icon={Battery} 
                    label="Battery" 
                    onClick={() => { navigate('BATTERY', 'BATTERY'); loadInsight('BATTERY'); }} 
                    colorClass="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                />
            </div>
        </Section>

        {/* System */}
        <Section title="System">
            <div className={`cursor-pointer transition-colors ${view === 'APPS' ? 'bg-green-50 dark:bg-green-900/20 ring-2 ring-inset ring-green-100 dark:ring-green-800 rounded-xl' : ''}`}>
                <NavItem 
                    icon={LayoutGrid} 
                    label="Apps & Notifications" 
                    onClick={() => { navigate('APPS', 'APPLICATION'); loadApps(); }} 
                    colorClass="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                />
            </div>
            <div className={`cursor-pointer transition-colors ${view === 'SYSTEM_INSIGHTS' ? 'bg-purple-50 dark:bg-purple-900/20 ring-2 ring-inset ring-purple-100 dark:ring-purple-800 rounded-xl' : ''}`}>
             <NavItem 
                icon={Monitor} 
                label="System Performance" 
                onClick={() => { navigate('SYSTEM_INSIGHTS', 'DEVICE_INFO'); loadInsight('UNCATEGORIZED'); }} 
                colorClass="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
            />
            </div>
             <ToggleRow
                icon={Activity}
                label="TalkBack"
                checked={toggles['TALK_BACK']}
                onChange={(v) => handleToggle('TALK_BACK', v)}
                colorClass="bg-teal-500"
            />
             <ToggleRow
                icon={Flashlight}
                label="Flashlight"
                checked={toggles['FLASHLIGHT']}
                onChange={(v) => handleToggle('FLASHLIGHT', v)}
                colorClass="bg-yellow-500"
            />
            <div className={`cursor-pointer transition-colors ${view === 'SECURITY' ? 'bg-red-50 dark:bg-red-900/20 ring-2 ring-inset ring-red-100 dark:ring-red-800 rounded-xl' : ''}`}>
                <NavItem
                    icon={Shield}
                    label="Security & Privacy"
                    onClick={() => navigate('SECURITY', 'SECURITY')}
                    colorClass="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                />
            </div>
            <div className={`cursor-pointer transition-colors ${view === 'ACCESSIBILITY' ? 'bg-teal-50 dark:bg-teal-900/20 ring-2 ring-inset ring-teal-100 dark:ring-teal-800 rounded-xl' : ''}`}>
                <NavItem
                    icon={Eye}
                    label="Accessibility"
                    onClick={() => navigate('ACCESSIBILITY', 'ACCESSIBILITY')}
                    colorClass="bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400"
                />
            </div>
            <div className={`cursor-pointer transition-colors ${view === 'LANGUAGE' ? 'bg-indigo-50 dark:bg-indigo-900/20 ring-2 ring-inset ring-indigo-100 dark:ring-indigo-800 rounded-xl' : ''}`}>
                <NavItem
                    icon={Languages}
                    label="Language & Input"
                    onClick={() => navigate('LANGUAGE', 'LANGUAGE')}
                    colorClass="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
                />
            </div>
        </Section>
      </div>
    </div>
  );



  const renderLocation = () => (
    <>
      <Header title="Location" onBack={() => navigate('MAIN', 'UNSPECIFIED')} />
      <div className="p-4 overflow-y-auto flex-1 bg-gray-50 dark:bg-slate-900 pb-20">
          <Section title="Location Services">
              <ToggleRow
                  icon={MapPin}
                  label="Use Location"
                  subLabel="Allow apps to access your location"
                  checked={toggles['NETWORK']}
                  onChange={(v) => handleToggle('NETWORK', v)}
                  colorClass="bg-green-500"
              />
          </Section>
      </div>
    </>
  );

  const renderSubPage = (title: string, IconComp: React.ElementType = Settings, subtitle = 'Settings page opened') => (
    <>
      <Header title={title} onBack={() => setSubView(null)} />
      <div className="p-4 overflow-y-auto flex-1 bg-gray-50 dark:bg-slate-900 pb-20">
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <IconComp size={48} className="mb-4 opacity-20" />
              <p className="text-lg font-medium text-gray-600 dark:text-gray-300">{title}</p>
              <p className="text-sm text-gray-400 mt-2">{subtitle}</p>
          </div>
      </div>
    </>
  );

  const renderSecurity = () => {
    if (subView === 'LOCK_SCREEN') return renderSubPage('Screen Lock');
    if (subView === 'BIOMETRIC') return renderSubPage('Biometrics');
    if (subView === 'PRIVACY') return renderSubPage('Privacy Dashboard');
    if (subView === 'PASSWORD') return renderSubPage('Passwords');
    if (subView === 'VPN') return renderSubPage('VPN');

    return (
    <>
      <Header title="Security & Privacy" onBack={() => navigate('MAIN', 'UNSPECIFIED')} />
      <div className="p-4 overflow-y-auto flex-1 bg-gray-50 dark:bg-slate-900 pb-20">
          <Section title="Device Security">
              <NavItem
                  icon={Lock}
                  label="Screen Lock"
                  value="PIN"
                  onClick={() => { setSubView('LOCK_SCREEN'); api.callTool('open', { setting_type: 'LOCK_SCREEN' }).catch(() => {}); }}
                  colorClass="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
              />
              <NavItem
                  icon={User}
                  label="Biometrics"
                  onClick={() => { setSubView('BIOMETRIC'); api.callTool('open', { setting_type: 'BIOMETRIC' }).catch(() => {}); }}
                  colorClass="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
              />
          </Section>
          <Section title="Privacy">
              <NavItem
                  icon={Shield}
                  label="Privacy Dashboard"
                  onClick={() => { setSubView('PRIVACY'); api.callTool('open', { setting_type: 'PRIVACY' }).catch(() => {}); }}
                  colorClass="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
              />
              <NavItem
                  icon={Eye}
                  label="Passwords"
                  onClick={() => { setSubView('PASSWORD'); api.callTool('open', { setting_type: 'PASSWORD' }).catch(() => {}); }}
                  colorClass="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
              />
              <NavItem
                  icon={Globe}
                  label="VPN"
                  onClick={() => { setSubView('VPN'); api.callTool('open', { setting_type: 'VPN' }).catch(() => {}); }}
                  colorClass="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
              />
          </Section>
      </div>
    </>
    );
  };

  const renderAccessibility = () => {
    if (subView === 'TEXT_TO_SPEECH') return renderSubPage('Text-to-Speech', Mic);

    return (
    <>
      <Header title="Accessibility" onBack={() => navigate('MAIN', 'UNSPECIFIED')} />
      <div className="p-4 overflow-y-auto flex-1 bg-gray-50 dark:bg-slate-900 pb-20">
          <Section title="Vision">
              <ToggleRow
                  icon={Activity}
                  label="TalkBack"
                  subLabel="Screen reader for visually impaired"
                  checked={toggles['TALK_BACK']}
                  onChange={(v) => handleToggle('TALK_BACK', v)}
                  colorClass="bg-teal-500"
              />
              <NavItem
                  icon={Eye}
                  label="Text-to-Speech"
                  onClick={() => { setSubView('TEXT_TO_SPEECH'); api.callTool('open', { setting_type: 'TEXT_TO_SPEECH' }).catch(() => {}); }}
                  colorClass="bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400"
              />
          </Section>
      </div>
    </>
    );
  };

  const renderLanguage = () => {
    if (subView === 'LANGUAGE_DETAIL') return renderSubPage('System Language', Languages, 'Current: English');
    if (subView === 'DATE_TIME') return renderSubPage('Date & Time', Calendar);

    return (
    <>
      <Header title="Language & Input" onBack={() => navigate('MAIN', 'UNSPECIFIED')} />
      <div className="p-4 overflow-y-auto flex-1 bg-gray-50 dark:bg-slate-900 pb-20">
          <Section title="Languages">
              <NavItem
                  icon={Languages}
                  label="System Language"
                  value="English"
                  onClick={() => { setSubView('LANGUAGE_DETAIL'); api.callTool('open', { setting_type: 'LANGUAGE' }).catch(() => {}); }}
                  colorClass="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
              />
          </Section>
          <Section title="Date & Time">
              <NavItem
                  icon={Calendar}
                  label="Date & Time"
                  onClick={() => { setSubView('DATE_TIME'); api.callTool('open', { setting_type: 'DATE_TIME' }).catch(() => {}); }}
                  colorClass="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
              />
          </Section>
      </div>
    </>
    );
  };

  const renderContent = () => {
      switch(view) {
          case 'DISPLAY': return renderDisplay();
          case 'WIFI': return renderWifi();
          case 'BLUETOOTH': return renderBluetooth();
          case 'SOUND': return renderSound();
          case 'APPS': return renderApps();
          case 'BATTERY': return renderBattery();
          case 'STORAGE': return renderStorage();
          case 'SYSTEM_INSIGHTS': return renderSystem();
          case 'NETWORK': return renderNetwork();
          case 'LOCATION': return renderLocation();
          case 'SECURITY': return renderSecurity();
          case 'ACCESSIBILITY': return renderAccessibility();
          case 'LANGUAGE': return renderLanguage();
          default: return (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <LayoutGrid size={48} className="mb-4 opacity-20" />
                  <p>Select a setting from the left menu</p>
              </div>
          );
      }
  };

  const renderNetwork = () => (
    <>
      <Header title="Mobile Network" onBack={() => navigate('MAIN', 'UNSPECIFIED')} />
      <div className="p-4 overflow-y-auto flex-1 bg-gray-50 dark:bg-slate-900 pb-20">
          <Section title="Data & Network">
               <ToggleRow 
                  icon={Signal} 
                  label="Mobile Data" 
                  checked={toggles['NETWORK']} 
                  onChange={(v) => handleToggle('NETWORK', v)} 
                  colorClass="bg-green-500"
              />
               <ToggleRow
                  icon={PieChart}
                  label="Data Saver"
                  checked={toggles['DATA_SAVER']}
                  onChange={(v) => handleDataSaverToggle(v)}
                  colorClass="bg-indigo-500"
              />
               <ToggleRow 
                  icon={Share2} 
                  label="Hotspot & Tethering" 
                  checked={toggles['HOT_SPOT']} 
                  onChange={(v) => handleToggle('HOT_SPOT', v)} 
                  colorClass="bg-orange-500"
              />
          </Section>
      </div>
    </>
  );

  const renderDisplay = () => (
    <>
      <Header title="Display & Brightness" onBack={() => navigate('MAIN', 'UNSPECIFIED')} />
      <div className="p-4 bg-gray-50 dark:bg-slate-900 flex-1 overflow-y-auto pb-20">
          
          <Section title="Brightness">
              <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 mb-2">
                  <div className="flex justify-between items-center mb-4">
                      <span className="text-gray-900 dark:text-gray-100 font-medium">Brightness Level</span>
                      <span className="text-gray-500 font-medium">{brightness === undefined ? 'Not stored in snapshot' : `${brightness}%`}</span>
                  </div>
                  <div className="flex items-center gap-4">
                      <Sun size={20} className="text-gray-400 dark:text-gray-500" />
                      <input
                          type="range"
                          min="0"
                          max="100"
                          value={brightness ?? 0}
                          disabled={readOnly || brightness === undefined}
                          hidden={brightness === undefined}
                          onChange={(e) => handleBrightnessChange(parseInt(e.target.value))}
                          className="w-full h-2 bg-gray-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:accent-blue-500"
                      />
                      <Sun size={24} className="text-blue-500 dark:text-blue-400 fill-current" />
                  </div>
              </div>
          </Section>

          <Section title="Appearance">
               <ToggleRow 
                  icon={Moon} 
                  label="Dark Theme" 
                  subLabel="Use darker colors for less eye strain"
                  checked={toggles['NIGHT_MODE']} 
                  onChange={(v) => handleToggle('NIGHT_MODE', v)} 
                  colorClass="bg-purple-600"
              />
          </Section>

          <Section title="Screen">
             <ToggleRow 
                icon={RotateCw} 
                label="Auto-Rotate Screen" 
                checked={toggles['AUTO_ROTATE']} 
                onChange={(v) => handleToggle('AUTO_ROTATE', v)} 
                colorClass="bg-blue-500"
            />
          </Section>

      </div>
    </>
  );

  const renderWifi = () => (
      <>
        <Header title="Wi-Fi Networks" onBack={() => navigate('MAIN', 'UNSPECIFIED')} />
        <div className="p-4 overflow-y-auto flex-1">
            <div className="flex justify-between items-center mb-4 px-2">
                <span className="text-gray-500 dark:text-gray-400 text-sm">
                    {toggles['WIFI'] === undefined ? 'Not stored in snapshot' : toggles['WIFI'] ? 'Available Networks' : 'Wi-Fi is off'}
                </span>
                <button onClick={loadWifi} className="text-blue-500 text-sm hover:underline"><RotateCw size={14} className={loading ? "animate-spin" : ""} /></button>
            </div>
            
            {toggles['WIFI'] === false && (
                 <div className="text-center py-10">
                    <div className="inline-block p-4 bg-gray-100 dark:bg-slate-800 rounded-full mb-4">
                        <Wifi size={32} className="text-gray-400 dark:text-gray-500" />
                    </div>
                    <p className="text-gray-500 dark:text-gray-400">Turn on Wi-Fi to see available networks</p>
                    <button 
                        onClick={() => handleToggle('WIFI', true)} 
                        className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                    >
                        Turn On
                    </button>
                 </div>
            )}

            {toggles['WIFI'] && (
                <div className="space-y-2">
                    {wifiList.map((ssid, idx) => {
                        const isConnected = ssid === connectedWifi;
                        const isConnecting = ssid === connectingWifi;
                        
                        return (
                            <div 
                                key={idx + ssid} 
                                className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all
                                    ${isConnected 
                                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 shadow-sm' 
                                        : 'bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-750'}`}
                                onClick={() => !isConnected && !isConnecting && connectWifi(ssid)}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-full ${isConnected ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400'}`}>
                                        <Wifi size={20} />
                                    </div>
                                    <div>
                                        <div className={`font-medium ${isConnected ? 'text-blue-700 dark:text-blue-400' : 'text-gray-800 dark:text-gray-200'}`}>{ssid}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{ssid}]</span></div>
                                        {isConnected ? (
                                             <div className="text-xs text-blue-500 dark:text-blue-400 flex items-center gap-1 font-medium">Connected</div>
                                        ) : (
                                             isConnecting && <div className="text-xs text-blue-500 dark:text-blue-400 flex items-center gap-1">Connecting...</div>
                                        )}
                                    </div>
                                </div>
                                
                                {isConnected ? (
                                    <Check size={20} className="text-blue-500 dark:text-blue-400" />
                                ) : (
                                    isConnecting ? <RotateCw size={20} className="text-blue-500 dark:text-blue-400 animate-spin" /> : <ChevronRight size={18} className="text-gray-300 dark:text-slate-600" />
                                )}
                            </div>
                        );
                    })}
                    
                    {wifiList.length === 0 && !loading && (
                        <div className="text-center text-gray-400 dark:text-gray-500 py-10 flex flex-col items-center">
                            <Wifi size={48} className="mb-4 opacity-20" />
                            <span>No networks found</span>
                        </div>
                    )}
                </div>
            )}
        </div>
      </>
  );

  const renderBluetooth = () => {
      const paired = bluetoothList.filter(d => d.paired);
      const available = bluetoothList.filter(d => !d.paired);

      const getIcon = (type: string) => {
          switch(type) {
              case 'HEADPHONES': return Headphones;
              case 'LAPTOP': return Laptop;
              case 'WATCH': return Watch;
              default: return Bluetooth;
          }
      };

      return (
          <>
            <Header title="Bluetooth" onBack={() => navigate('MAIN', 'UNSPECIFIED')} />
            <div className="p-4 overflow-y-auto flex-1">
                <div className="flex justify-between items-center mb-6 px-4 pt-1">
                    <span className="text-gray-900 dark:text-gray-100 font-medium">Use Bluetooth{toggles['BLUETOOTH'] === undefined && <small className="ml-2 text-gray-500">Not stored in snapshot</small>}</span>
                    
                    {/* Custom Toggle Switch */}
                    <button 
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${toggles['BLUETOOTH'] ? 'bg-blue-600' : 'bg-gray-200 dark:bg-slate-700'}`}
                        disabled={readOnly || toggles['BLUETOOTH'] === undefined}
                        hidden={toggles['BLUETOOTH'] === undefined}
                        onClick={() => handleToggle('BLUETOOTH', !toggles['BLUETOOTH'])}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${toggles['BLUETOOTH'] ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>

                {toggles['BLUETOOTH'] === false && (
                     <div className="text-center py-10">
                        <div className="inline-block p-4 bg-gray-100 dark:bg-slate-800 rounded-full mb-4">
                            <Bluetooth size={32} className="text-gray-400 dark:text-gray-500" />
                        </div>
                        <p className="text-gray-500 dark:text-gray-400">Turn on Bluetooth to connect to devices</p>
                     </div>
                )}

                {toggles['BLUETOOTH'] && (
                <div className="space-y-6">
                    {paired.length > 0 && (
                        <Section title="Paired Devices">
                            {paired.map((device, idx) => {
                                const isConnected = connectedBluetooth.includes(device.name);
                                const isConnecting = device.name === connectingBluetooth;
                                const Icon = getIcon(device.type);
                                
                                return (
                                    <div 
                                        key={idx} 
                                        className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border-b border-gray-50 dark:border-slate-700 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-750 group"
                                        onClick={() => connectBluetooth(device)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-full ${isConnected ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400'}`}>
                                                <Icon size={20} />
                                            </div>
                                            <div>
                                                <div className="font-medium text-gray-800 dark:text-gray-200">{device.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{device.name}]</span></div>
                                                {isConnected ? (
                                                    <div className="text-xs text-blue-500 dark:text-blue-400 font-medium line-clamp-1">Connected {device.type === 'HEADPHONES' ? '| active media' : ''}</div>
                                                ) : isConnecting ? (
                                                    <div className="text-xs text-blue-500 dark:text-blue-400">Connecting...</div>
                                                ) : (
                                                    <div className="text-xs text-gray-400 dark:text-gray-500">Paired</div>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center">
                                            {isConnected ? (
                                                <button onClick={(e) => { e.stopPropagation(); connectBluetooth(device); }} className="text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 p-2"><X size={16} /></button>
                                            ) : isConnecting ? (
                                                <RotateCw size={18} className="text-blue-500 dark:text-blue-400 animate-spin mr-2" />
                                            ) : (
                                                 <button 
                                                    onClick={(e) => { e.stopPropagation(); forgetBluetooth(device); }} 
                                                    className="text-gray-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 p-2 opacity-0 group-hover:opacity-100 transition-all"
                                                    title="Forget device"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </Section>
                    )}
                    
                    <Section title="Available Devices">
                        {available.map((device, idx) => {
                                const isConnecting = device.name === connectingBluetooth;
                                const Icon = getIcon(device.type);
                                return (
                                <div 
                                    key={idx} 
                                    className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border-b border-gray-50 dark:border-slate-700 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-750"
                                    onClick={() => connectBluetooth(device)}
                                >
                                    <div className="flex items-center gap-3">
                                        <Icon size={20} className="text-gray-400 dark:text-gray-500" />
                                        <div className="font-medium text-gray-700 dark:text-gray-300">{device.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{device.name}]</span></div>
                                    </div>
                                        {isConnecting && <RotateCw size={18} className="text-blue-500 dark:text-blue-400 animate-spin" />}
                                </div>
                                )
                        })}
                        {available.length === 0 && <div className="p-4 text-gray-400 dark:text-gray-500 text-center text-sm">No new devices found</div>}
                    </Section>
                </div>
            )}
            </div>
          </>
      );
  };

  const renderSound = () => (
      <>
        <Header title="Sound & Vibration" onBack={() => navigate('MAIN', 'UNSPECIFIED')} />
        <div className="p-4 space-y-6 max-w-md mx-auto overflow-y-auto flex-1 w-full bg-gray-50 dark:bg-slate-900">
            <Section title="General">
                 <ToggleRow 
                    icon={Vibrate} 
                    label="Vibration & Haptics" 
                    checked={toggles['VIBRATION']} 
                    onChange={(v) => handleToggle('VIBRATION', v)} 
                    colorClass="bg-pink-500"
                />
            </Section>

            <Section title="Volume Levels">
                <SliderRow
                    icon={Volume2}
                    label="Master Volume"
                    value={volumes['VOLUME']}
                    onChange={async (v) => {
                        setVolumes(p => ({...p, 'VOLUME': v}));
                        await api.callTool('set_volume', { setting: 'VOLUME', to: v });
                    }}
                    onAdjust={async (by) => {
                        const newVal = Math.max(0, Math.min(100, (volumes['VOLUME'] || 0) + by));
                        setVolumes(p => ({...p, 'VOLUME': newVal}));
                        await api.callTool('adjust_volume', { by, setting: 'VOLUME' });
                    }}
                    onMuteToggle={async () => {
                        const current = volumes['VOLUME'] || 0;
                        if (current > 0) {
                            await api.callTool('mute', { setting: 'VOLUME' });
                            setVolumes(p => ({...p, 'VOLUME': 0}));
                        } else {
                            await api.callTool('unmute', { setting: 'VOLUME' });
                            fetchVolumes();
                        }
                    }}
                    isMuted={volumes['VOLUME'] === 0}
                />
                <SliderRow
                    icon={Volume2}
                    label="Media Volume"
                    value={volumes['MEDIA']}
                    onChange={async (v) => {
                        setVolumes(p => ({...p, 'MEDIA': v}));
                        await api.callTool('set_volume', { setting: 'MEDIA', to: v });
                    }}
                    onAdjust={async (by) => {
                        const newVal = Math.max(0, Math.min(100, (volumes['MEDIA'] || 0) + by));
                        setVolumes(p => ({...p, 'MEDIA': newVal}));
                        await api.callTool('adjust_volume', { by, setting: 'MEDIA' });
                    }}
                    onMuteToggle={async () => {
                        const current = volumes['MEDIA'] || 0;
                        if (current > 0) {
                            await api.callTool('mute', { setting: 'MEDIA' });
                            setVolumes(p => ({...p, 'MEDIA': 0}));
                        } else {
                            await api.callTool('unmute', { setting: 'MEDIA' });
                            fetchVolumes();
                        }
                    }}
                    isMuted={volumes['MEDIA'] === 0}
                />
                 <SliderRow
                    icon={Phone}
                    label="Call Volume"
                    value={volumes['CALL']}
                    onChange={async (v) => {
                         setVolumes(p => ({...p, 'CALL': v}));
                         await api.callTool('set_volume', { setting: 'CALL', to: v });
                    }}
                    onAdjust={async (by) => {
                        const newVal = Math.max(0, Math.min(100, (volumes['CALL'] || 0) + by));
                        setVolumes(p => ({...p, 'CALL': newVal}));
                        await api.callTool('adjust_volume', { by, setting: 'CALL' });
                    }}
                    onMuteToggle={async () => {
                        const current = volumes['CALL'] || 0;
                        if (current > 0) {
                            await api.callTool('mute', { setting: 'CALL' });
                            setVolumes(p => ({...p, 'CALL': 0}));
                        } else {
                            await api.callTool('unmute', { setting: 'CALL' });
                            fetchVolumes();
                        }
                    }}
                    isMuted={volumes['CALL'] === 0}
                />
                 <SliderRow
                    icon={Bell}
                    label="Ring Volume"
                    value={volumes['RING']}
                    onChange={async (v) => {
                         setVolumes(p => ({...p, 'RING': v}));
                         await api.callTool('set_volume', { setting: 'RING', to: v });
                    }}
                    onAdjust={async (by) => {
                        const newVal = Math.max(0, Math.min(100, (volumes['RING'] || 0) + by));
                        setVolumes(p => ({...p, 'RING': newVal}));
                        await api.callTool('adjust_volume', { by, setting: 'RING' });
                    }}
                    onMuteToggle={async () => {
                        const current = volumes['RING'] || 0;
                        if (current > 0) {
                            await api.callTool('mute', { setting: 'RING' });
                            setVolumes(p => ({...p, 'RING': 0}));
                        } else {
                            await api.callTool('unmute', { setting: 'RING' });
                            fetchVolumes();
                        }
                    }}
                    isMuted={volumes['RING'] === 0}
                />
                <SliderRow
                    icon={MessageSquare}
                    label="Notification Volume"
                    value={volumes['NOTIFICATION']}
                    onChange={async (v) => {
                         setVolumes(p => ({...p, 'NOTIFICATION': v}));
                         await api.callTool('set_volume', { setting: 'NOTIFICATION', to: v });
                    }}
                    onAdjust={async (by) => {
                        const newVal = Math.max(0, Math.min(100, (volumes['NOTIFICATION'] || 0) + by));
                        setVolumes(p => ({...p, 'NOTIFICATION': newVal}));
                        await api.callTool('adjust_volume', { by, setting: 'NOTIFICATION' });
                    }}
                    onMuteToggle={async () => {
                        const current = volumes['NOTIFICATION'] || 0;
                        if (current > 0) {
                            await api.callTool('mute', { setting: 'NOTIFICATION' });
                            setVolumes(p => ({...p, 'NOTIFICATION': 0}));
                        } else {
                            await api.callTool('unmute', { setting: 'NOTIFICATION' });
                            fetchVolumes();
                        }
                    }}
                    isMuted={volumes['NOTIFICATION'] === 0}
                />
                 <SliderRow
                    icon={Clock}
                    label="Alarm Volume"
                    value={volumes['ALARM']}
                    onChange={async (v) => {
                         setVolumes(p => ({...p, 'ALARM': v}));
                         await api.callTool('set_volume', { setting: 'ALARM', to: v });
                    }}
                    onAdjust={async (by) => {
                        const newVal = Math.max(0, Math.min(100, (volumes['ALARM'] || 0) + by));
                        setVolumes(p => ({...p, 'ALARM': newVal}));
                        await api.callTool('adjust_volume', { by, setting: 'ALARM' });
                    }}
                    onMuteToggle={async () => {
                        const current = volumes['ALARM'] || 0;
                        if (current > 0) {
                            await api.callTool('mute', { setting: 'ALARM' });
                            setVolumes(p => ({...p, 'ALARM': 0}));
                        } else {
                            await api.callTool('unmute', { setting: 'ALARM' });
                            fetchVolumes();
                        }
                    }}
                    isMuted={volumes['ALARM'] === 0}
                />
            </Section>
        </div>
      </>
  );

  const renderApps = () => {
    const filteredApps = appList.filter(app => 
         app.name.toLowerCase().includes(appSearch.toLowerCase()) || 
         (app.package_name && app.package_name.toLowerCase().includes(appSearch.toLowerCase()))
    );

    return (
    <>
      <Header title="Apps & Notifications" onBack={() => navigate('MAIN', 'UNSPECIFIED')} />
      <div className="p-4 overflow-y-auto flex-1 pb-20 bg-gray-50 dark:bg-slate-900">
          
          <div className="mb-6 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={18} className="text-gray-400" />
              </div>
              <input
                  type="text"
                  placeholder="Search apps..."
                  value={appSearch}
                  onChange={(e) => setAppSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:ring-2 focus:ring-blue-500/50 outline-none shadow-sm transition-all"
              />
          </div>

          <Section title={`Installed Apps (${filteredApps.length})`}>
              {filteredApps.map((app, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border-b border-gray-50 dark:border-slate-700 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-750 transition-colors">
                      <div className="flex items-center gap-3 overflow-hidden">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shadow-sm
                                ${app.notification_enabled ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-500 dark:text-gray-400'}
                          `}>
                              {app.name.substring(0,1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-gray-800 dark:text-gray-200 truncate">{app.name}{app.package_name && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{app.package_name}]</span>}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{app.package_name || 'Application'}</div>
                          </div>
                      </div>
                      
                      <div className="flex items-center gap-3 pl-2">
                        <div className="text-xs text-gray-400 hidden sm:block">
                            {app.notification_enabled ? 'Allowed' : 'Blocked'}
                        </div>
                        <button 
                            onClick={() => toggleAppNotif(app.name, !!app.notification_enabled)}
                            className={`w-11 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out cursor-pointer ${app.notification_enabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-slate-600'}`}
                        >
                            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${app.notification_enabled ? 'translate-x-5' : ''}`} />
                        </button>
                      </div>
                  </div>
              ))}
              {filteredApps.length === 0 && !loading && (
                  <div className="p-8 text-center flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                      <Search size={48} className="mb-4 opacity-10" />
                      <p>No apps found matching "{appSearch}"</p>
                  </div>
              )}
              {appList.length === 0 && !loading && !appSearch && <div className="p-4 text-center text-gray-400 dark:text-gray-500">No apps found</div>}
          </Section>
      </div>
    </>
  );
  };



  // Brightness overlay: map 0-100 to a visual filter (0.3 to 1.0 brightness)
  const brightnessFilter = 0.3 + (brightness / 100) * 0.7;

  return (
    <div className="h-full w-full bg-[#f2f4f6] dark:bg-slate-950 font-sans text-slate-800 dark:text-gray-100 overflow-hidden flex flex-row relative transition-colors duration-200" style={{ filter: `brightness(${brightnessFilter})`, transition: 'filter 0.3s ease' }}>
        {/* Sidebar */}
        <div className="w-1/3 min-w-[320px] max-w-sm h-full flex flex-col z-20 border-r border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm transition-colors duration-200">
            {renderSidebar()}
        </div>

        {/* Content */}
        <div className="flex-1 h-full relative bg-gray-50 dark:bg-slate-900 overflow-hidden flex flex-col transition-colors duration-200">
             {renderContent()}
        </div>
        
        {loading && (
            <div className="absolute top-4 right-4 animate-spin text-gray-400 pointer-events-none z-50">
                <RotateCw size={16} />
            </div>
        )}
    </div>
  );
}
