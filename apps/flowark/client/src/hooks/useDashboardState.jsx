import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Trash2, UserMinus, Ban, MessageSquare, Crown, ShieldOff, CheckCircle, Zap, Power, Square, RefreshCw } from 'lucide-react';
import { RCON_COMMANDS, PLAYER_COMMANDS, QUICK_ACTIONS, SETTINGS_CATEGORIES, normalizeDashboardTab, normalizeDashboardTabForRole } from '../constants/dashboard';
import { ADMIN_USERNAME_HELP, isValidAdminUsername } from '../constants/adminValidation';
import { toast } from 'sonner';

const API_BASE = '/api';
const LIVE_DATA_STALE_MS = 15000;
const TELEMETRY_POLL_MS = 10000;
const ONLINE_PLAYERS_POLL_MS = 30000;

function apiErrorMessage(err, fallback) {
  return err.response?.data?.error || err.userMessage || fallback;
}

async function requireServerAction(mapId, action) {
  const { data } = await axios.get(`${API_BASE}/servers/${encodeURIComponent(mapId)}/capabilities`);
  if (data.actions?.[action] !== true) {
      const error = new Error('server_action_unavailable');
      error.userMessage = `La operación ${action} no está disponible en esta instancia. Revisa su configuración y permisos.`;
      throw error;
  }
}

function isCanceledRequest(err) {
  return err?.name === 'CanceledError' || axios.isCancel?.(err);
}

function clearDashboardAuthCookies() {
  for (const cookieName of ['XSRF-TOKEN', 'session', '__Host-session']) {
      document.cookie = `${cookieName}=; Max-Age=0; path=/; SameSite=Strict`;
      document.cookie = `${cookieName}=; Max-Age=0; path=/; SameSite=Strict; Secure`;
  }
}

export function useDashboardState() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState('viewer');
  const [userPermissions, setUserPermissions] = useState([]);
  const [authChecked, setAuthChecked] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const sessionExpiredHandledRef = useRef(false);
  const [activeTab, setActiveTabState] = useState(() => {
      const hash = window.location.hash.replace('#/', '');
      return normalizeDashboardTab(hash);
  });
  const setActiveTab = useCallback((tab) => {
      const normalized = authChecked ? normalizeDashboardTabForRole(tab, userRole) : normalizeDashboardTab(tab);
      setActiveTabState(normalized);
  }, [authChecked, userRole]);

  // Handle URL hash changes (back/forward navigation)
  useEffect(() => {
      const handleHashChange = () => {
          const hash = window.location.hash.replace('#/', '');
          setActiveTab(hash);
      };
      window.addEventListener('hashchange', handleHashChange);
      return () => window.removeEventListener('hashchange', handleHashChange);
  }, [setActiveTab]);

  // Sync activeTab to URL hash
  useEffect(() => {
      if (!authChecked) return;
      const normalized = normalizeDashboardTabForRole(activeTab, userRole);
      if (activeTab !== normalized) {
          setActiveTabState(normalized);
          return;
      }
      window.history.replaceState(null, '', `#/${normalized}`);
  }, [activeTab, authChecked, userRole]);

  // Mobile Navigation State
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobilePlayersOpen, setMobilePlayersOpen] = useState(false);

  // Cluster State
  const [selectedMap, setSelectedMap] = useState('');
  const [clusterMaps, setClusterMaps] = useState([]);
  const [clusterMapsError, setClusterMapsError] = useState('');
  const [clusterStatus, setClusterStatus] = useState({ cpu: 0, ram: 0, maps: [] });
  const [clusterStatusError, setClusterStatusError] = useState('');
  const [mapSelectorOpen, setMapSelectorOpen] = useState(false);

  // Real-time State
  const [liveData, setLiveData] = useState({ cpu: 0, ram: 0, status: 'offline', players: 0, maxPlayers: 70, map: 'Unknown', playerList: [] });
  const [liveDataError, setLiveDataError] = useState('');
  const [liveDataUpdatedAt, setLiveDataUpdatedAt] = useState(0);
  const [powerLoading, setPowerLoading] = useState(null);
  const [chartData, setChartData] = useState([]);

  // Settings State
  const [multipliers, setMultipliers] = useState({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // RCON State
  const [rconCommand, setRconCommand] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [rconLog, setRconLog] = useState([]);
  const [rconSending, setRconSending] = useState(false);
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const rconLogRef = useRef(null);
  const rconSendingRef = useRef(false);
  const powerActionRef = useRef('');
  const powerRefreshTimerRef = useRef(null);
  const onlinePlayersRefreshTimerRef = useRef(null);
  const liveDataRequestRef = useRef(null);
  const clusterStatusRequestRef = useRef(null);
  const clusterMapsRequestRef = useRef(null);
  const onlinePlayersRequestRef = useRef(null);
  const playerHistoryRequestRef = useRef(null);
  const ingameAdminsRequestRef = useRef(null);
  const bansRequestRef = useRef(null);
  const auditRequestRef = useRef(null);
  const auditLogsCountRef = useRef(0);
  const settingsRequestRef = useRef(null);
  const fileListRequestRef = useRef(null);
  const fileReadRequestRef = useRef(null);
  const adminsRequestRef = useRef(null);
  const adminMutationRef = useRef('');
  const tasksRequestRef = useRef(null);
  const presetsRequestRef = useRef(null);

	  // Players State
	  const [onlinePlayers, setOnlinePlayers] = useState([]);
	  const [playersLoading, setPlayersLoading] = useState(false);
	  const [onlinePlayersError, setOnlinePlayersError] = useState('');
	  const [sidebarMapFilter, setSidebarMapFilter] = useState('all');
  const [playerHistory, setPlayerHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');
  const [ingameAdmins, setIngameAdmins] = useState([]);
  const [playerActionLoading, setPlayerActionLoading] = useState('');
  const playerActionRef = useRef('');

  // Bans State
  const [bans, setBans] = useState([]);
  const [bansLoading, setBansLoading] = useState(false);
  const [bansError, setBansError] = useState('');
  const [banSearch, setBanSearch] = useState('');

  // Audit State
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditFilterAction, setAuditFilterAction] = useState('');
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditLoaded, setAuditLoaded] = useState(false);
  const [auditError, setAuditError] = useState('');

  // Modal State
  const [modal, setModal] = useState(null);

  // File Manager State
  const [fileList, setFileList] = useState([]);
  const [fileListLoading, setFileListLoading] = useState(false);
  const [fileListError, setFileListError] = useState('');
  const [currentPath, setCurrentPath] = useState('.');
  const [editingFile, setEditingFile] = useState(null);
  const [editingContent, setEditingContent] = useState('');
  const [fileReadLoading, setFileReadLoading] = useState(false);
  const [fileReadError, setFileReadError] = useState('');
  const [fileReadTarget, setFileReadTarget] = useState('');
  const [savingFile, setSavingFile] = useState(false);
  const savingFileRef = useRef(false);
  const [fileType, setFileType] = useState('game');

  // Fibercraft Mode State
  const [presetLoading, setPresetLoading] = useState(false);
  const settingsMutationRef = useRef('');
  const [presets, setPresets] = useState([]);
  const [presetsError, setPresetsError] = useState('');
  const [presetsLoaded, setPresetsLoaded] = useState(false);

  // Admin State
  const [admins, setAdmins] = useState([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [adminsLoaded, setAdminsLoaded] = useState(false);
  const [adminsError, setAdminsError] = useState('');
  const [adminActionLoading, setAdminActionLoading] = useState(false);
  const [newAdmin, setNewAdmin] = useState({ username: '', discordId: '', role: 'operator' });

  // Tasks State
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskMutationLoading, setTaskMutationLoading] = useState(false);
  const taskMutationRef = useRef(false);
  const [tasksError, setTasksError] = useState('');
  const [taskScheduleContext, setTaskScheduleContext] = useState(null);
  const [newTaskAction, setNewTaskAction] = useState('Broadcast');
  const [newTaskCronMode, setNewTaskCronMode] = useState('hours'); // 'hours', 'minutes', 'daily', 'custom'
  const [newTaskCronValue, setNewTaskCronValue] = useState('4');
  const [newTaskCronTime, setNewTaskCronTime] = useState('04:00');
  const [newTaskCron, setNewTaskCron] = useState('0 */4 * * *');
  const [newTaskPayload, setNewTaskPayload] = useState('');
  const [newTaskMapId, setNewTaskMapId] = useState('all');

  // --- Toast System ---
  const addToast = useCallback((message, type = 'success') => {
      if (type === 'success') toast.success(message);
      else if (type === 'error') toast.error(message);
      else if (type === 'info') toast.info(message);
      else if (type === 'warning') toast.warning(message);
      else toast(message);
  }, []);

  useEffect(() => {
      const handleSessionExpired = () => {
          if (sessionExpiredHandledRef.current) return;
          sessionExpiredHandledRef.current = true;
          clearDashboardAuthCookies();
          setUser(null);
          setUserRole('viewer');
          setUserPermissions([]);
          setAuthChecked(true);
          setLogoutPending(false);
          setActiveTabState(normalizeDashboardTab('cluster'));
          addToast('Sesión caducada. Inicia sesión de nuevo.', 'warning');
      };
      window.addEventListener('dashboard:session-expired', handleSessionExpired);
      return () => window.removeEventListener('dashboard:session-expired', handleSessionExpired);
  }, [addToast]);

  useEffect(() => {
      const canOperate = Boolean(user && ['operator', 'owner'].includes(userRole));
      const canOwn = Boolean(user && userRole === 'owner');

      if (!canOperate) {
          if (onlinePlayersRefreshTimerRef.current) {
              clearTimeout(onlinePlayersRefreshTimerRef.current);
              onlinePlayersRefreshTimerRef.current = null;
          }
          playerHistoryRequestRef.current?.abort();
          playerHistoryRequestRef.current = null;
          bansRequestRef.current?.abort();
          bansRequestRef.current = null;
          tasksRequestRef.current?.abort();
          tasksRequestRef.current = null;
          setPlayerHistory([]);
          setHistoryError('');
          setBans([]);
          setBansError('');
          setTasks([]);
          setTasksError('');
          setTaskScheduleContext(null);
      }

      if (!canOwn) {
          adminsRequestRef.current?.abort();
          adminsRequestRef.current = null;
          auditRequestRef.current?.abort();
          auditRequestRef.current = null;
          fileListRequestRef.current?.abort();
          fileListRequestRef.current = null;
          fileReadRequestRef.current?.abort();
          fileReadRequestRef.current = null;
          setAdmins([]);
          setAdminsLoaded(false);
          setAdminsError('');
          setAuditLogs([]);
          setAuditLoaded(false);
          setAuditError('');
          setRconLog([]);
          setCommandHistory([]);
          setFileList([]);
          setFileListError('');
          setEditingFile(null);
          setEditingContent('');
          setFileReadError('');
          setFileReadTarget('');
          setMultipliers({});
          setSettingsLoaded(false);
      }
  }, [user, userRole]);

  // Auto-scroll RCON log
  useEffect(() => {
      if (rconLogRef.current) {
          rconLogRef.current.scrollTop = rconLogRef.current.scrollHeight;
      }
  }, [rconLog]);

  useEffect(() => () => {
      if (powerRefreshTimerRef.current) clearTimeout(powerRefreshTimerRef.current);
      if (onlinePlayersRefreshTimerRef.current) clearTimeout(onlinePlayersRefreshTimerRef.current);
  }, []);

  const verifyToken = useCallback(async () => {
      try {
          const res = await axios.get(`${API_BASE}/auth/verify`);
          setUser(res.data.user.username);
          setUserRole(res.data.user.role || 'viewer');
          setUserPermissions(Array.isArray(res.data.user.effectivePermissions) ? res.data.user.effectivePermissions : []);
          sessionExpiredHandledRef.current = false;
      } catch (err) {
          setUser(null);
          setUserRole('viewer');
          setUserPermissions([]);
      } finally {
          setAuthChecked(true);
      }
  }, []);

  const fetchLiveData = useCallback(async () => {
      liveDataRequestRef.current?.abort();
      if (!selectedMap) return;
      const controller = new AbortController();
      liveDataRequestRef.current = controller;
      try {
          const res = await axios.get(`${API_BASE}/server/live?mapId=${encodeURIComponent(selectedMap)}`, { signal: controller.signal });
          if (liveDataRequestRef.current !== controller) return;
          setLiveData(res.data);
          setLiveDataError(res.data.error || (res.data.status === 'error' ? 'No se pudo actualizar el estado del mapa' : ''));
          setLiveDataUpdatedAt(Date.now());
          setChartData(prev => {
              const newData = [...prev, { time: new Date().toLocaleTimeString().slice(0,5), cpu: res.data.cpu, ram: res.data.ram }];
              if (newData.length > 20) newData.shift();
              return newData;
          });
      } catch (err) {
          if (isCanceledRequest(err)) return;
          setLiveDataError(err.response?.data?.error || 'No se pudo actualizar el estado del mapa');
      } finally {
          if (liveDataRequestRef.current === controller) {
              liveDataRequestRef.current = null;
          }
      }
  }, [selectedMap]);

  const fetchClusterStatus = useCallback(async () => {
      clusterStatusRequestRef.current?.abort();
      const controller = new AbortController();
      clusterStatusRequestRef.current = controller;
      try {
          const res = await axios.get(`${API_BASE}/cluster/status`, { signal: controller.signal });
          if (clusterStatusRequestRef.current !== controller) return;
          setClusterStatus(res.data);
          setClusterStatusError(res.data.error || '');
      } catch (err) {
          if (isCanceledRequest(err)) return;
          setClusterStatusError(err.response?.data?.error || 'No se pudo actualizar el estado del clúster');
      } finally {
          if (clusterStatusRequestRef.current === controller) {
              clusterStatusRequestRef.current = null;
          }
      }
  }, []);

  const fetchClusterMaps = useCallback(async () => {
      clusterMapsRequestRef.current?.abort();
      const controller = new AbortController();
      clusterMapsRequestRef.current = controller;
      try {
          const res = await axios.get(`${API_BASE}/cluster/maps`, { signal: controller.signal });
          if (clusterMapsRequestRef.current !== controller) return;
          const maps = res.data.maps || [];
          setClusterMaps(maps);
          setClusterMapsError('');
          setSelectedMap(current => maps.some(map => map.id === current) ? current : (maps[0]?.id || ''));
      } catch (err) {
          if (isCanceledRequest(err)) return;
          setClusterMaps([]);
          setSelectedMap('');
          setClusterMapsError(err.response?.data?.error || 'No se pudo cargar el inventario de mapas');
      } finally {
          if (clusterMapsRequestRef.current === controller) {
              clusterMapsRequestRef.current = null;
          }
      }
  }, []);

  const loadCurrentSettings = useCallback(async () => {
      settingsRequestRef.current?.abort();
      if (!selectedMap) return;
      const controller = new AbortController();
      settingsRequestRef.current = controller;
      try {
          const [giRes, gusRes] = await Promise.all([
              axios.get(`${API_BASE}/config/gameini?mapId=${encodeURIComponent(selectedMap)}`, { signal: controller.signal }),
              axios.get(`${API_BASE}/config/gameusersettings?mapId=${encodeURIComponent(selectedMap)}`, { signal: controller.signal })
          ]);
          if (settingsRequestRef.current !== controller) return;
          const loaded = {};
          for (const keys of Object.values(SETTINGS_CATEGORIES)) {
              for (const [key, meta] of Object.entries(keys)) {
                  const source = meta.file === 'gi' ? giRes.data.content : gusRes.data.content;
                  const match = source.match(new RegExp(`^${key}=([\\d.]+)`, 'm'));
                  loaded[key] = match ? parseFloat(match[1]) : 1.0;
              }
          }
          setMultipliers(loaded);
          setSettingsLoaded(true);
      } catch(err) {
          if (isCanceledRequest(err)) return;
          addToast(apiErrorMessage(err, 'No se pudieron cargar los ajustes'), 'error');
      } finally {
          if (settingsRequestRef.current === controller) {
              settingsRequestRef.current = null;
          }
      }
  }, [addToast, selectedMap]);

  // --- Player Management ---
  const fetchOnlinePlayers = useCallback(async () => {
      onlinePlayersRequestRef.current?.abort();
      const controller = new AbortController();
      onlinePlayersRequestRef.current = controller;
      setPlayersLoading(true);
      try {
	          const res = await axios.get(`${API_BASE}/players/online?mapId=${encodeURIComponent(sidebarMapFilter)}`, { signal: controller.signal });
	          if (onlinePlayersRequestRef.current !== controller) return;
	          setOnlinePlayers(res.data.players || []);
	          setOnlinePlayersError(res.data.complete === false ? 'Consulta parcial: hay mapas sin lectura RCON. La lista no representa a todos los jugadores.' : '');
	      } catch (err) {
	          if (isCanceledRequest(err)) return;
	          setOnlinePlayers([]);
	          setOnlinePlayersError(err.response?.data?.error || 'No se pudo cargar la lista de jugadores conectados');
	      } finally {
          if (onlinePlayersRequestRef.current === controller) {
              onlinePlayersRequestRef.current = null;
              setPlayersLoading(false);
          }
      }
  }, [sidebarMapFilter]);

  const scheduleOnlinePlayersRefresh = useCallback(() => {
      if (onlinePlayersRefreshTimerRef.current) clearTimeout(onlinePlayersRefreshTimerRef.current);
      onlinePlayersRefreshTimerRef.current = setTimeout(() => {
          onlinePlayersRefreshTimerRef.current = null;
          fetchOnlinePlayers();
      }, 2000);
  }, [fetchOnlinePlayers]);

  const fetchPlayerHistory = useCallback(async () => {
      playerHistoryRequestRef.current?.abort();
      const controller = new AbortController();
      playerHistoryRequestRef.current = controller;
      setHistoryLoading(true);
      try {
          const res = await axios.get(`${API_BASE}/players/history`, { signal: controller.signal });
          if (playerHistoryRequestRef.current !== controller) return;
          setPlayerHistory(res.data.history || []);
          setHistoryError('');
      } catch (err) {
          if (isCanceledRequest(err)) return;
          if (playerHistoryRequestRef.current !== controller) return;
          setHistoryError(err.response?.data?.error || 'No se pudo cargar el historial de jugadores');
      } finally {
          if (playerHistoryRequestRef.current === controller) {
              playerHistoryRequestRef.current = null;
              setHistoryLoading(false);
          }
      }
  }, []);

  const fetchIngameAdmins = useCallback(async () => {
      ingameAdminsRequestRef.current?.abort();
      const controller = new AbortController();
      ingameAdminsRequestRef.current = controller;
      try {
          const res = await axios.get(`${API_BASE}/players/ingame-admins`, { signal: controller.signal });
          if (ingameAdminsRequestRef.current !== controller) return;
          setIngameAdmins(res.data.admins || []);
      } catch (err) {
          if (isCanceledRequest(err)) return;
          if (ingameAdminsRequestRef.current !== controller) return;
      } finally {
          if (ingameAdminsRequestRef.current === controller) {
              ingameAdminsRequestRef.current = null;
          }
      }
  }, []);

  const resolvePlayerActionMap = useCallback((record, actionLabel) => {
      const targetMap = record?.mapId || selectedMap;
      if (!targetMap || !clusterMaps.some(map => map.id === targetMap)) {
          addToast(`Selecciona un mapa válido antes de ${actionLabel}`, 'warning');
          return '';
      }
      return targetMap;
  }, [addToast, clusterMaps, selectedMap]);

  const runPlayerAction = useCallback(async (actionKey, action) => {
      if (playerActionRef.current) return false;

      playerActionRef.current = actionKey;
      setPlayerActionLoading(actionKey);
      try {
          await action();
          return true;
      } finally {
          if (playerActionRef.current === actionKey) {
              playerActionRef.current = '';
              setPlayerActionLoading('');
          }
      }
  }, []);

  const handleKickPlayer = (player) => {
      if (playerActionRef.current) return;
      const targetMap = resolvePlayerActionMap(player, 'expulsar jugadores');
      if (!targetMap) return;
      setModal({
          type: 'confirm',
          title: 'Expulsar jugador',
          message: `Vas a expulsar a ${player.name} del mapa ${targetMap}.`,
          Icon: UserMinus,
          color: 'orange',
          hasInput: true,
          inputLabel: 'Motivo (opcional)',
          confirmText: 'Expulsar',
          onConfirm: async (reason) => {
              setModal(null);
              await runPlayerAction(`kick:${player.steamId}`, async () => {
                  try {
	                  await requireServerAction(targetMap, 'kick');
	                  await axios.post(`${API_BASE}/players/kick`, { steamId: player.steamId, reason, mapId: targetMap });
	                  addToast(`${player.name} expulsado`, 'success');
	                  scheduleOnlinePlayersRefresh();
                  } catch (err) {
	                  addToast(apiErrorMessage(err, 'No se pudo expulsar al jugador'), 'error');
                  }
              });
          }
      });
  };

  const handleBanPlayer = (player) => {
      if (playerActionRef.current) return;
      const targetMap = resolvePlayerActionMap(player, 'banear jugadores');
      if (!targetMap) return;
      setModal({
          type: 'confirm',
          title: 'Banear jugador',
          message: `Vas a banear a ${player.name} en ${targetMap}. Esta acción lo expulsará permanentemente del servidor.`,
          Icon: Ban,
          color: 'red',
          hasInput: true,
          inputLabel: 'Motivo del baneo',
          inputRequired: true,
          confirmText: 'Banear',
          onConfirm: async (reason) => {
              setModal(null);
              await runPlayerAction(`ban:${player.steamId}`, async () => {
                  try {
	                  await requireServerAction(targetMap, 'ban');
	                  await axios.post(`${API_BASE}/players/ban`, { steamId: player.steamId, playerName: player.name, reason, mapId: targetMap });
	                  addToast(`${player.name} baneado`, 'success');
	                  scheduleOnlinePlayersRefresh();
                  } catch (err) {
	                  addToast(apiErrorMessage(err, 'No se pudo banear al jugador'), 'error');
                  }
              });
          }
      });
  };

  const handleMessagePlayer = (player) => {
      if (playerActionRef.current) return;
      const targetMap = resolvePlayerActionMap(player, 'enviar mensajes');
      if (!targetMap) return;
      setModal({
          type: 'confirm',
          title: 'Enviar mensaje',
          message: `Envía un mensaje privado a ${player.name} en ${targetMap}.`,
          Icon: MessageSquare,
          color: 'purple',
          hasInput: true,
          inputLabel: 'Mensaje',
          inputRequired: true,
          confirmText: 'Enviar',
          onConfirm: async (message) => {
              setModal(null);
              await runPlayerAction(`message:${player.steamId}`, async () => {
                  try {
	                  await requireServerAction(targetMap, 'message');
	                  await axios.post(`${API_BASE}/players/message`, { steamId: player.steamId, message, mapId: targetMap });
	                  addToast(`Mensaje enviado a ${player.name}`, 'success');
                  } catch (err) {
	                  addToast(apiErrorMessage(err, 'No se pudo enviar el mensaje'), 'error');
                  }
              });
          }
      });
  };

  const handleMakeAdmin = async (player) => {
      if (playerActionRef.current) return;
      const targetMap = resolvePlayerActionMap(player, 'dar admin in-game');
      if (!targetMap) return;
      setModal({
          type: 'confirm',
          title: 'Dar admin in-game',
          message: `Vas a dar privilegios de admin in-game a ${player.name} (${player.steamId}) en ${targetMap}. Puede requerir reinicio del servidor.`,
          Icon: Crown,
          color: 'yellow',
          confirmText: 'Dar admin',
          onConfirm: async () => {
              setModal(null);
              await runPlayerAction(`make-admin:${player.steamId}`, async () => {
                  try {
	                  await requireServerAction(targetMap, 'admin');
	                  await axios.post(`${API_BASE}/players/make-admin`, { steamId: player.steamId, playerName: player.name, mapId: targetMap });
	                  addToast(`Allowlist Steam de ${player.name} guardada. Reinicio pendiente; concesión nativa sin confirmar.`, 'success');
	                  fetchIngameAdmins();
                  } catch (err) {
	                  addToast(apiErrorMessage(err, 'No se pudo dar admin'), 'error');
                  }
              });
          }
      });
  };

  const handleRemoveAdmin = async (player) => {
      if (playerActionRef.current) return;
      const targetMap = resolvePlayerActionMap(player, 'quitar admin in-game');
      if (!targetMap) return;
      setModal({
          type: 'confirm',
          title: 'Quitar admin in-game',
          message: `Vas a quitar privilegios de admin in-game a ${player.name} (${player.steamId}) en ${targetMap}.`,
          Icon: ShieldOff,
          color: 'red',
          confirmText: 'Quitar admin',
          onConfirm: async () => {
              setModal(null);
              await runPlayerAction(`remove-admin:${player.steamId}`, async () => {
                  try {
	                  await requireServerAction(targetMap, 'admin');
	                  await axios.post(`${API_BASE}/players/remove-admin`, { steamId: player.steamId, playerName: player.name, mapId: targetMap });
	                  addToast(`Allowlist Steam de ${player.name} actualizada. Revisa permisos tras reiniciar.`, 'success');
	                  fetchIngameAdmins();
                  } catch (err) {
	                  addToast(apiErrorMessage(err, 'No se pudo quitar admin'), 'error');
                  }
              });
          }
      });
  };

  // --- Bans ---
  const fetchBans = useCallback(async () => {
      bansRequestRef.current?.abort();
      const controller = new AbortController();
      bansRequestRef.current = controller;
      setBansLoading(true);
      try {
          const res = await axios.get(`${API_BASE}/players/bans`, { signal: controller.signal });
          if (bansRequestRef.current !== controller) return;
          setBans(res.data.bans || []);
          setBansError('');
      } catch (err) {
          if (isCanceledRequest(err)) return;
          if (bansRequestRef.current !== controller) return;
          setBansError(err.response?.data?.error || 'No se pudo cargar la lista de baneos');
      } finally {
          if (bansRequestRef.current === controller) {
              bansRequestRef.current = null;
              setBansLoading(false);
          }
      }
  }, []);

  const handleUnban = (ban) => {
      if (playerActionRef.current) return;
      const targetMap = resolvePlayerActionMap(ban, 'desbanear jugadores');
      if (!targetMap) return;
      const steamId = String(ban?.steamId || '');
      const playerName = ban?.playerName || 'jugador';
      setModal({
          type: 'confirm',
          title: 'Desbanear jugador',
          message: `Vas a retirar el baneo de ${playerName} (${steamId}) en ${targetMap}. Escribe el Steam ID para confirmar.`,
          Icon: CheckCircle,
          color: 'green',
          hasInput: true,
          inputLabel: `Escribe ${steamId}`,
          expectedInput: steamId,
          confirmText: 'Desbanear',
          onConfirm: async () => {
              setModal(null);
              await runPlayerAction(`unban:${steamId}`, async () => {
                  try {
	                  await axios.post(`${API_BASE}/players/unban`, { steamId, mapId: targetMap });
	                  addToast(`${playerName} ha sido desbaneado`, 'success');
	                  fetchBans();
                  } catch (err) {
	                  addToast(apiErrorMessage(err, 'No se pudo desbanear al jugador'), 'error');
                  }
              });
          }
      });
  };

  // --- Audit ---
  const fetchAuditLog = useCallback(async () => {
      auditRequestRef.current?.abort();
      const controller = new AbortController();
      auditRequestRef.current = controller;
      if (auditLogsCountRef.current === 0) setAuditLoaded(false);
      setAuditLoading(true);
      try {
          const params = new URLSearchParams({ page: auditPage, limit: 30 });
          if (auditFilterAction) params.append('action', auditFilterAction);
          const res = await axios.get(`${API_BASE}/audit/log?${params.toString()}`, { signal: controller.signal });
          if (auditRequestRef.current !== controller) return;
          const nextLogs = res.data.logs || [];
          auditLogsCountRef.current = nextLogs.length;
          setAuditLogs(nextLogs);
          setAuditTotal(res.data.total || 0);
          setAuditTotalPages(res.data.totalPages || 1);
          setAuditLoaded(true);
          setAuditError('');
      } catch (err) {
          if (isCanceledRequest(err)) return;
          if (auditRequestRef.current !== controller) return;
          setAuditLoaded(true);
          setAuditError(err.response?.data?.error || 'No se pudo cargar el registro de auditoría');
      } finally {
          if (auditRequestRef.current === controller) {
              auditRequestRef.current = null;
              setAuditLoading(false);
          }
      }
  }, [auditFilterAction, auditPage]);

  // --- RCON ---
  const runRconCommand = async (cmd) => {
      if (rconSendingRef.current) return false;

      const timestamp = new Date().toLocaleTimeString();
      if (!selectedMap) {
          setRconLog(prev => [...prev.slice(-999), { mapId: selectedMap, type: 'error', text: 'Selecciona un mapa antes de enviar comandos RCON.', time: timestamp }]);
          return false;
      }
      if (liveDataStale) {
          setRconLog(prev => [...prev.slice(-999), { mapId: selectedMap, type: 'error', text: 'Telemetría del mapa sin actualizar. RCON queda bloqueado hasta recuperar una lectura reciente.', time: timestamp }]);
          return false;
      }

      rconSendingRef.current = true;
      setRconSending(true);
      setRconLog(prev => [...prev.slice(-999), { mapId: selectedMap, type: 'cmd', text: cmd, time: timestamp }]);
      try {
          await requireServerAction(selectedMap, 'console');
          const res = await axios.post(`${API_BASE}/rcon/command`, { command: cmd, mapId: selectedMap });
          setRconLog(prev => [...prev.slice(-999), { mapId: selectedMap, type: 'response', text: res.data.response || 'Solicitud enviada; respuesta vacía. Comprueba el resultado antes de repetir.', time: new Date().toLocaleTimeString() }]);
          return true;
      } catch(err) {
          setRconLog(prev => [...prev.slice(-999), { mapId: selectedMap, type: 'error', text: apiErrorMessage(err, 'Respuesta RCON sin confirmar. Comprueba el servidor antes de repetir.'), time: new Date().toLocaleTimeString() }]);
          return false;
      } finally {
          rconSendingRef.current = false;
          setRconSending(false);
      }
  };

  const handleRconSubmit = async (e) => {
      e.preventDefault();
      if(!rconCommand.trim()) return;
      const cmd = rconCommand;
      if (rconSendingRef.current) return;
      if (!selectedMap) {
          await runRconCommand(cmd);
          return;
      }
      setRconCommand('');
      setShowAutocomplete(false);
      setCommandHistory(prev => [cmd, ...prev.slice(0, 49)]);
      setHistoryIndex(-1);
      await runRconCommand(cmd);
  };

  const handleRconKeyDown = (e) => {
      if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (commandHistory.length > 0) {
              const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
              setHistoryIndex(newIndex);
              setRconCommand(commandHistory[newIndex]);
          }
      } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (historyIndex > 0) {
              const newIndex = historyIndex - 1;
              setHistoryIndex(newIndex);
              setRconCommand(commandHistory[newIndex]);
          } else {
              setHistoryIndex(-1);
              setRconCommand('');
          }
      } else if (e.key === 'Tab') {
          e.preventDefault();
          const parts = rconCommand.trim().split(' ');
          const baseCmd = parts[0];
          if (PLAYER_COMMANDS.includes(baseCmd) && onlinePlayers.length > 0) {
              const partial = parts.slice(1).join(' ').toLowerCase();
              const match = onlinePlayers.find(p => p.steamId.startsWith(partial) || p.name.toLowerCase().startsWith(partial));
              if (match) {
                  setRconCommand(`${baseCmd} ${match.steamId}`);
              }
          } else {
              const filtered = RCON_COMMANDS.filter(c => c.toLowerCase().startsWith(rconCommand.toLowerCase()));
              if (filtered.length === 1) {
                  setRconCommand(filtered[0]);
                  setShowAutocomplete(false);
              }
          }
      }
  };

  const handleQuickAction = async (cmd) => {
      const quickAction = QUICK_ACTIONS.find(action => action.cmd === cmd);
      if (quickAction?.confirm) {
          const targetMap = clusterMaps.find(map => map.id === selectedMap)?.name || selectedMap || 'mapa seleccionado';
          setModal({
              type: 'danger',
              title: quickAction.confirmTitle || 'Confirmar comando RCON',
              message: `${quickAction.confirmMessage || 'Este comando puede afectar al servidor.'}\n\nMapa objetivo: ${targetMap}\nComando exacto: ${cmd}`,
              confirmText: 'Ejecutar RCON',
              hasInput: true,
              inputLabel: `Escribe ${quickAction.expectedInput}`,
              expectedInput: quickAction.expectedInput,
              onConfirm: async () => {
                  const sent = await runRconCommand(cmd);
                  if (sent) setModal(null);
              }
          });
          return;
      }
      await runRconCommand(cmd);
  };

  const getAutocompleteSuggestions = () => {
      const parts = rconCommand.trim().split(' ');
      const baseCmd = parts[0];

      if (parts.length >= 1 && PLAYER_COMMANDS.includes(baseCmd)) {
          const partial = parts.slice(1).join(' ').toLowerCase();
          return onlinePlayers
              .filter(p => !partial || p.name.toLowerCase().includes(partial) || p.steamId.includes(partial))
              .map(p => ({
                  label: `${baseCmd} ${p.steamId}`,
                  hint: p.name,
                  value: `${baseCmd} ${p.steamId}`
              }));
      }

      return RCON_COMMANDS
          .filter(c => !rconCommand || c.toLowerCase().includes(rconCommand.toLowerCase()))
          .map(c => ({ label: c, hint: '', value: c }));
  };

  const sendPowerAction = async (action, targetMapId = selectedMap) => {
      if (powerActionRef.current) return;
      const mapName = clusterMaps.find(m => m.id === targetMapId)?.name || targetMapId;
      const isAll = targetMapId === 'all';
      const actionLabels = {
          start: 'Arrancar',
          stop: 'Detener',
          restart: 'Reiniciar',
      };
      const actionLabel = actionLabels[action] || action;
      const validSingleMap = clusterMaps.some(map => map.id === targetMapId);
      if (!isAll && !validSingleMap) {
          addToast('Selecciona un mapa válido antes de ejecutar acciones del servidor', 'warning');
          return;
      }
      if (isAll && clusterMaps.length === 0) {
          addToast('No hay mapas gestionados para ejecutar acciones del clúster', 'warning');
          return;
      }
      const expectedInput = isAll
          ? `${action.toUpperCase()} CLUSTER`
          : (['stop', 'restart'].includes(action) ? `${action.toUpperCase()} ${mapName}` : '');
      const message = isAll
          ? `${actionLabel} afectará a ${clusterMaps.length} mapas del clúster. Los jugadores pueden perder conexión o progreso no guardado.`
          : `${actionLabel} se ejecutará solo sobre ${mapName}. Comprueba que este es el mapa seleccionado antes de continuar.`;
      setModal({
          type: 'confirm',
          title: `${actionLabel} ${isAll ? 'todo el clúster' : mapName}`,
          message,
          hasInput: Boolean(expectedInput),
          inputLabel: expectedInput ? `Escribe ${expectedInput}` : undefined,
          expectedInput,
          confirmText: `${actionLabel}${isAll ? ' clúster' : ''}`,
          Icon: action === 'start' ? Power : action === 'stop' ? Square : RefreshCw,
          color: action === 'start' ? 'green' : action === 'stop' ? 'red' : (isAll ? 'orange' : 'blue'),
          onConfirm: async () => {
              if (powerActionRef.current) return;
              setModal(null);
              powerActionRef.current = `${action}-${targetMapId}`;
              setPowerLoading(`${action}-${targetMapId}`);
              try {
                  const targets = isAll ? clusterMaps.map(map => map.id) : [targetMapId];
                  await Promise.all(targets.map(mapId => requireServerAction(mapId, action)));
                  await axios.post(`${API_BASE}/server/action`, { action, mapId: targetMapId });
                  addToast(`Comando ${action} enviado a ${isAll ? 'todo el clúster' : mapName}`, 'success');
                  await Promise.allSettled([fetchClusterStatus(), fetchLiveData()]);
                  if (powerRefreshTimerRef.current) clearTimeout(powerRefreshTimerRef.current);
                  powerRefreshTimerRef.current = setTimeout(() => {
                      fetchClusterStatus();
                      fetchLiveData();
                      powerRefreshTimerRef.current = null;
                  }, 5000);
              } catch (err) {
                  addToast(apiErrorMessage(err, `Error al ejecutar ${action}`), 'error');
              } finally {
                  powerActionRef.current = '';
                  setPowerLoading(null);
              }
          }
      });
  };

  const handleSaveSettings = async () => {
      if (settingsMutationRef.current) return;
      if (!selectedMap) {
          addToast('Selecciona un mapa antes de guardar ajustes', 'warning');
          return;
      }
      settingsMutationRef.current = 'settings';
      setSavingSettings(true);
      try {
          await axios.post(`${API_BASE}/config/parsed`, { settings: multipliers, mapId: selectedMap });
          addToast('Ajustes guardados. Reinicia el servidor para aplicarlos.', 'success');
      } catch(err) {
          addToast(apiErrorMessage(err, 'No se pudieron guardar los ajustes'), 'error');
      } finally {
          settingsMutationRef.current = '';
          setSavingSettings(false);
      }
  };

  const handleApplyPreset = (preset) => {
      if (settingsMutationRef.current) return;
      if (!selectedMap) {
          addToast('Selecciona un mapa antes de aplicar presets', 'warning');
          return;
      }
      setModal({
          type: 'confirm',
          title: `Aplicar ${preset.name}`,
          message: `Esto sobrescribirá los multiplicadores y configuraciones de crafteo/drops. Las contraseñas, nombres y puertos se conservarán. ¿Continuar?`,
          Icon: Zap,
          color: 'purple',
          onConfirm: async () => {
              if (settingsMutationRef.current) return;
              settingsMutationRef.current = `preset:${preset.id}`;
              setModal(null);
              setPresetLoading(true);
              try {
                  await axios.post(`${API_BASE}/presets/apply`, { presetId: preset.id, mapId: selectedMap });
                  addToast(`Preset ${preset.name} aplicado. Reinicia el servidor.`, 'success');
                  loadCurrentSettings();
              } catch(err) {
                  addToast(apiErrorMessage(err, 'Error al aplicar el preset'), 'error');
              } finally {
                  settingsMutationRef.current = '';
                  setPresetLoading(false);
              }
          }
      });
  };

  // File Manager functions
  const fetchFiles = useCallback(async (dirPath, typeOverride = null) => {
      fileListRequestRef.current?.abort();
      const targetType = typeOverride || fileType;
      const controller = new AbortController();
      fileListRequestRef.current = controller;
      setFileListLoading(true);
      try {
          const res = await axios.get(`${API_BASE}/files/list?path=${encodeURIComponent(dirPath)}&type=${encodeURIComponent(targetType)}`, { signal: controller.signal });
          if (fileListRequestRef.current !== controller) return;
          setFileList(res.data.files);
          setCurrentPath(res.data.currentPath);
          setEditingFile(null);
          setFileListError('');
      } catch(err) {
          if (isCanceledRequest(err)) return;
          if (fileListRequestRef.current !== controller) return;
          setFileListError(apiErrorMessage(err, 'No se pudieron cargar los archivos'));
          addToast(apiErrorMessage(err, 'No se pudieron cargar los archivos'), 'error');
      } finally {
          if (fileListRequestRef.current === controller) {
              fileListRequestRef.current = null;
              setFileListLoading(false);
          }
      }
  }, [addToast, fileType]);

  const openFile = useCallback(async (filePath) => {
      fileReadRequestRef.current?.abort();
      const controller = new AbortController();
      fileReadRequestRef.current = controller;
      setFileReadTarget(filePath);
      setFileReadLoading(true);
      setFileReadError('');
      setEditingFile(null);
      setEditingContent('');
      try {
          const targetType = fileType;
          const res = await axios.get(`${API_BASE}/files/read?path=${encodeURIComponent(filePath)}&type=${encodeURIComponent(targetType)}`, { signal: controller.signal });
          if (fileReadRequestRef.current !== controller) return;
          setEditingFile({ path: filePath, type: targetType, name: res.data.name, redacted: !!res.data.redacted });
          setEditingContent(res.data.content);
          setFileReadTarget('');
          if (res.data.redacted) {
              addToast('Los secretos se han redactado. Usa la rotación segura para cambiarlos.', 'info');
          }
      } catch(err) {
          if (isCanceledRequest(err)) return;
          if (fileReadRequestRef.current !== controller) return;
          const message = apiErrorMessage(err, 'No se pudo leer el archivo');
          setFileReadError(message);
          addToast(message, 'error');
      } finally {
          if (fileReadRequestRef.current === controller) {
              fileReadRequestRef.current = null;
              setFileReadLoading(false);
          }
      }
  }, [addToast, fileType]);

  const saveFile = async () => {
      if (!editingFile || savingFileRef.current) return;
      if (editingFile.redacted) {
          addToast('Este archivo contiene secretos redactados. Usa la rotación segura de secretos.', 'warning');
          return;
      }
      savingFileRef.current = true;
      setSavingFile(true);
      try {
          await axios.post(`${API_BASE}/files/write`, { filePath: editingFile.path, content: editingContent, type: editingFile.type });
          addToast('Archivo guardado', 'success');
      } catch(err) {
          addToast(err.response?.data?.error || 'No se pudo guardar el archivo', 'error');
      } finally {
          savingFileRef.current = false;
          setSavingFile(false);
      }
  };

  const fetchAdmins = useCallback(async () => {
      adminsRequestRef.current?.abort();
      const controller = new AbortController();
      adminsRequestRef.current = controller;
      setAdminsLoading(true);
      try {
          const res = await axios.get(`${API_BASE}/admins`, { signal: controller.signal });
          if (adminsRequestRef.current !== controller) return;
          setAdmins(res.data);
          setAdminsLoaded(true);
          setAdminsError('');
      } catch(err) {
          if (isCanceledRequest(err)) return;
          if (adminsRequestRef.current !== controller) return;
          setAdminsLoaded(true);
          setAdminsError(apiErrorMessage(err, 'No se pudo cargar la lista de administradores'));
      } finally {
          if (adminsRequestRef.current === controller) {
              adminsRequestRef.current = null;
              setAdminsLoading(false);
          }
      }
  }, []);

  const addAdmin = async (confirmation) => {
      if (adminMutationRef.current) return false;
      const username = newAdmin.username.trim();
      if (!username || !/^[0-9]{17,20}$/.test(newAdmin.discordId)) return addToast('Completa el alias y un ID de Discord válido (17-20 dígitos)', 'warning');
      if (!isValidAdminUsername(username)) return addToast(ADMIN_USERNAME_HELP, 'warning');
      if (admins.some(admin => String(admin.username || '').toLowerCase() === username.toLowerCase())) {
          return addToast('Ese usuario ya existe', 'warning');
      }
      adminMutationRef.current = 'create';
      setAdminActionLoading(true);
      try {
          const payload = { username, discordId: newAdmin.discordId, role: newAdmin.role || 'operator' };
          if (confirmation) payload.confirmation = confirmation;
          await axios.post(`${API_BASE}/admins`, payload);
          setNewAdmin({ username: '', discordId: '', role: 'operator' });
          await fetchAdmins();
          addToast('Administrador creado', 'success');
          return true;
      } catch(err) {
          addToast(err.response?.data?.error || 'No se pudo añadir el administrador', 'error');
          return false;
      } finally {
          adminMutationRef.current = '';
          setAdminActionLoading(false);
      }
  };

  const updateAdmin = async (id, updates, confirmation) => {
      if (adminMutationRef.current) return false;
      if (updates?.username && admins.some(admin => String(admin.id) !== String(id) && String(admin.username || '').toLowerCase() === String(updates.username).toLowerCase())) {
          addToast('Ese usuario ya existe', 'warning');
          return false;
      }
      adminMutationRef.current = `update:${id}`;
      setAdminActionLoading(true);
      try {
          await axios.patch(`${API_BASE}/admins/${id}`, confirmation ? { ...updates, confirmation } : updates);
          await fetchAdmins();
          addToast('Administrador actualizado', 'success');
          return true;
      } catch(err) {
          addToast(err.response?.data?.error || 'No se pudo actualizar el administrador', 'error');
          return false;
      } finally {
          adminMutationRef.current = '';
          setAdminActionLoading(false);
      }
  };

  const deleteAdmin = async (admin) => {
      if (adminMutationRef.current) return false;
      const id = typeof admin === 'object' ? admin.id : admin;
      const username = typeof admin === 'object' ? admin.username : 'este admin';
      setModal({
          type: 'confirm',
          title: 'Borrar admin',
          message: `Esta acción eliminará el acceso al panel de ${username}. Escribe el usuario para confirmar.`,
          Icon: Trash2,
          color: 'red',
          hasInput: true,
          inputRequired: true,
          inputLabel: `Escribe ${username}`,
          expectedInput: username,
          confirmText: 'Borrar admin',
          onConfirm: async (inputValue = '') => {
              if (adminMutationRef.current) return;
              adminMutationRef.current = `delete:${id}`;
              setModal(null);
              setAdminActionLoading(true);
              try {
                  await axios.delete(`${API_BASE}/admins/${id}`, { data: { confirmation: inputValue } });
                  await fetchAdmins();
                  addToast('Administrador borrado', 'success');
              } catch(err) {
                  addToast(err.response?.data?.error || 'No se pudo borrar el administrador', 'error');
              } finally {
                  adminMutationRef.current = '';
                  setAdminActionLoading(false);
              }
          }
      });
  };

  // --- Tasks functions ---
  const fetchTasks = useCallback(async () => {
      tasksRequestRef.current?.abort();
      const controller = new AbortController();
      tasksRequestRef.current = controller;
      setTasksLoading(true);
      try {
          const res = await axios.get(`${API_BASE}/tasks`, { signal: controller.signal });
          if (tasksRequestRef.current !== controller) return;
          setTasks(res.data.tasks || []);
          setTaskScheduleContext(res.data.scheduleContext || null);
          setTasksError('');
      } catch (err) {
          if (isCanceledRequest(err)) return;
          if (tasksRequestRef.current !== controller) return;
          setTasksError(apiErrorMessage(err, 'Error cargando las tareas programadas'));
      } finally {
          if (tasksRequestRef.current === controller) {
              tasksRequestRef.current = null;
              setTasksLoading(false);
          }
      }
  }, []);

  const fetchPresets = useCallback(async () => {
      presetsRequestRef.current?.abort();
      const controller = new AbortController();
      presetsRequestRef.current = controller;
      setPresetsLoaded(false);
      try {
          const res = await axios.get(`${API_BASE}/presets`, { signal: controller.signal });
          if (presetsRequestRef.current !== controller) return;
          setPresets(res.data.presets || []);
          setPresetsError('');
          setPresetsLoaded(true);
      } catch (err) {
          if (isCanceledRequest(err)) return;
          if (presetsRequestRef.current !== controller) return;
          setPresetsError(apiErrorMessage(err, 'No se pudieron cargar los presets'));
          setPresetsLoaded(true);
      } finally {
          if (presetsRequestRef.current === controller) {
              presetsRequestRef.current = null;
          }
      }
  }, []);

	  const handleCreateTask = async (taskInputOrEvent) => {
	      taskInputOrEvent?.preventDefault?.();
	      if (taskMutationRef.current) return false;
	      const taskInput = taskInputOrEvent && typeof taskInputOrEvent === 'object' && !taskInputOrEvent.preventDefault ? taskInputOrEvent : null;
	      const action = taskInput?.action || newTaskAction;
	      const targetTaskMapId = taskInput?.mapId || newTaskMapId || 'all';
	      if (action === 'DoExit' && targetTaskMapId === 'all') {
	          addToast('Selecciona un mapa concreto antes de programar DoExit', 'warning');
	          return false;
	      }
	      if (action === 'DoExit' && userRole !== 'owner') {
	          addToast('DoExit programado requiere rol owner', 'error');
	          return false;
	      }

	      let finalCron = taskInput?.cronExpr || newTaskCron;
	      if (!taskInput) {
	          if (newTaskCronMode === 'hours') finalCron = `0 */${newTaskCronValue || 1} * * *`;
	          else if (newTaskCronMode === 'minutes') {
	              if (action === 'DoExit') {
	                  addToast('DoExit programado debe usar una frecuencia de al menos una hora', 'warning');
	                  return false;
	              }
	              finalCron = `*/${Math.max(5, Number.parseInt(newTaskCronValue, 10) || 10)} * * * *`;
	          }
	          else if (newTaskCronMode === 'daily') {
	              const [h, m] = newTaskCronTime.split(':');
	              finalCron = `${parseInt(m || 0)} ${parseInt(h || 0)} * * *`;
	          }
	      }

	      taskMutationRef.current = true;
	      setTaskMutationLoading(true);
	      try {
	          const finalPayload = taskInput?.payload ?? (action === 'Broadcast' ? newTaskPayload.trim() : '');
	          await axios.post(`${API_BASE}/tasks`, { action, cronExpr: finalCron, payload: finalPayload, mapId: targetTaskMapId });
          addToast('Tarea programada creada con éxito', 'success');
          setNewTaskPayload('');
          await fetchTasks();
          return true;
      } catch (err) {
          addToast(err.response?.data?.error || 'Error al crear la tarea', 'error');
          return false;
      } finally {
          taskMutationRef.current = false;
          setTaskMutationLoading(false);
      }
  };

  const handleToggleTask = async (id, currentStatus) => {
      if (taskMutationRef.current) return false;
      taskMutationRef.current = true;
      setTaskMutationLoading(true);
      try {
          await axios.post(`${API_BASE}/tasks/${id}/toggle`, { active: !currentStatus });
          await fetchTasks();
          return true;
      } catch (err) {
          addToast(err.response?.data?.error || 'Error al actualizar la tarea', 'error');
          return false;
      } finally {
          taskMutationRef.current = false;
          setTaskMutationLoading(false);
      }
  };

  const handleUpdateTask = async (id, taskInput) => {
      if (taskMutationRef.current) return false;
      taskMutationRef.current = true;
      setTaskMutationLoading(true);
      try {
          await axios.patch(`${API_BASE}/tasks/${id}`, taskInput);
          await fetchTasks();
          addToast('Tarea actualizada', 'success');
          return true;
      } catch (err) {
          addToast(err.response?.data?.error || 'Error al actualizar la tarea', 'error');
          return false;
      } finally {
          taskMutationRef.current = false;
          setTaskMutationLoading(false);
      }
  };

  const handleDeleteTask = (task) => {
      if (taskMutationRef.current) return;
      const taskId = typeof task === 'object' ? task.id : task;
      const action = typeof task === 'object' ? String(task.action || 'Tarea') : 'Tarea';
      const cron = typeof task === 'object' ? String(task.cron || '') : '';
      const target = typeof task === 'object' ? String(task.mapId || 'all') : 'all';
      const shortTaskId = String(taskId || '').slice(0, 8);
      const targetLabel = target === 'all' ? 'cluster' : target;
      const expectedInput = `BORRAR ${action} ${targetLabel} ${shortTaskId}`.trim();
      setModal({
          type: 'confirm',
          title: 'Borrar Tarea',
          message: `Vas a eliminar la tarea ${action} (${cron || 'sin cron'}) para ${target === 'all' ? 'todo el clúster' : target}. Id: ${shortTaskId || 'sin id'}. Esta acción no se puede deshacer.`,
          Icon: Trash2,
          color: 'red',
          hasInput: true,
          inputLabel: `Escribe ${expectedInput}`,
          expectedInput,
          confirmText: 'Borrar tarea',
          onConfirm: async () => {
              if (taskMutationRef.current) return;
              taskMutationRef.current = true;
              setTaskMutationLoading(true);
              try {
                  await axios.delete(`${API_BASE}/tasks/${taskId}`);
                  await fetchTasks();
                  addToast('Tarea borrada', 'success');
                  setModal(null);
                  return true;
              } catch (err) {
                  addToast(err.response?.data?.error || 'Error al borrar la tarea', 'error');
                  return false;
              } finally {
                  taskMutationRef.current = false;
                  setTaskMutationLoading(false);
              }
          }
      });
  };

  const handleLogout = async () => {
      if (logoutPending) return;
      setLogoutPending(true);
      try {
          await axios.post(`${API_BASE}/auth/logout`);
      } catch(err) { /* ignore */ }
      clearDashboardAuthCookies();
      setUser(null);
      setUserRole('viewer');
      setUserPermissions([]);
      setActiveTabState(normalizeDashboardTab('cluster'));
      window.location.replace('/');
  };

  const copyToClipboard = async (text) => {
      const content = String(text ?? '');
      try {
          if (navigator.clipboard?.writeText && window.isSecureContext) {
              await navigator.clipboard.writeText(content);
          } else {
              const textArea = document.createElement('textarea');
              try {
                  textArea.value = content;
                  textArea.setAttribute('readonly', '');
                  textArea.className = 'fixed left-[-9999px] top-0 opacity-0';
                  document.body.appendChild(textArea);
                  textArea.select();
                  const copied = document.execCommand('copy');
                  if (!copied) throw new Error('copy command rejected');
              } finally {
                  if (textArea.parentNode) textArea.parentNode.removeChild(textArea);
              }
          }
          addToast('Copiado al portapapeles', 'success');
          return true;
      } catch {
          addToast('No se pudo copiar al portapapeles. Revisa permisos del navegador.', 'error');
          return false;
      }
  };

  // Auth
  useEffect(() => { verifyToken(); }, [verifyToken]);

  // Poll real-time data — always active when logged in
  useEffect(() => {
      let interval;
      if (user) {
          fetchClusterStatus();
          fetchLiveData();
          interval = setInterval(() => { fetchLiveData(); fetchClusterStatus(); }, TELEMETRY_POLL_MS);
      }
      return () => {
          clearInterval(interval);
          liveDataRequestRef.current?.abort();
          liveDataRequestRef.current = null;
          clusterStatusRequestRef.current?.abort();
          clusterStatusRequestRef.current = null;
      };
  }, [user, fetchClusterStatus, fetchLiveData]);

  // Load cluster maps on login
  useEffect(() => {
      if (user) {
          fetchClusterMaps();
      }
      return () => {
          clusterMapsRequestRef.current?.abort();
          clusterMapsRequestRef.current = null;
      };
  }, [user, fetchClusterMaps]);

  // Load settings when switching to settings tab
  useEffect(() => {
      if (user && activeTab === 'settings' && !settingsLoaded) {
          loadCurrentSettings();
      }
      return () => {
          settingsRequestRef.current?.abort();
          settingsRequestRef.current = null;
      };
  }, [user, activeTab, settingsLoaded, loadCurrentSettings]);

  // Load files when switching to files tab
  useEffect(() => {
      if (user && activeTab === 'files') {
          fetchFiles(currentPath);
      }
      return () => {
          fileListRequestRef.current?.abort();
          fileListRequestRef.current = null;
          fileReadRequestRef.current?.abort();
          fileReadRequestRef.current = null;
      };
  }, [user, activeTab, currentPath, fetchFiles]);

  // Load admins when switching to admins tab
  useEffect(() => {
      if (user && activeTab === 'admins') {
          fetchAdmins();
      }
      return () => {
          adminsRequestRef.current?.abort();
          adminsRequestRef.current = null;
          setAdminsLoading(false);
      };
  }, [user, activeTab, fetchAdmins]);

  // Load tasks when switching to tasks tab
  useEffect(() => {
      if (user && activeTab === 'tasks') {
          fetchTasks();
      }
      return () => {
          tasksRequestRef.current?.abort();
          tasksRequestRef.current = null;
      };
  }, [user, activeTab, fetchTasks]);

  // Global online players polling
  useEffect(() => {
      let interval;
      const canOperate = ['operator', 'owner'].includes(userRole);
      if (user && canOperate) {
          fetchOnlinePlayers();
          if (userRole === 'owner') fetchIngameAdmins();
          else setIngameAdmins([]);
          interval = setInterval(fetchOnlinePlayers, ONLINE_PLAYERS_POLL_MS);
      } else {
          onlinePlayersRequestRef.current?.abort();
          onlinePlayersRequestRef.current = null;
          ingameAdminsRequestRef.current?.abort();
          ingameAdminsRequestRef.current = null;
	          setPlayersLoading(false);
	          setOnlinePlayers([]);
	          setOnlinePlayersError('');
	          setIngameAdmins([]);
      }
      return () => {
          clearInterval(interval);
          if (onlinePlayersRefreshTimerRef.current) {
              clearTimeout(onlinePlayersRefreshTimerRef.current);
              onlinePlayersRefreshTimerRef.current = null;
          }
          onlinePlayersRequestRef.current?.abort();
          onlinePlayersRequestRef.current = null;
          ingameAdminsRequestRef.current?.abort();
          ingameAdminsRequestRef.current = null;
      };
  }, [user, userRole, fetchOnlinePlayers, fetchIngameAdmins]);

  // Load player history when switching to players tab
  useEffect(() => {
      if (user && activeTab === 'players') {
          fetchPlayerHistory();
      }
      return () => {
          playerHistoryRequestRef.current?.abort();
          playerHistoryRequestRef.current = null;
      };
  }, [user, activeTab, fetchPlayerHistory]);

  // Load bans when switching to bans tab
  useEffect(() => {
      if (user && activeTab === 'bans') {
          fetchBans();
      }
      return () => {
          bansRequestRef.current?.abort();
          bansRequestRef.current = null;
      };
  }, [user, activeTab, fetchBans]);

  // Load audit when switching to audit tab
  useEffect(() => {
      if (user && activeTab === 'audit') {
          fetchAuditLog();
      }
      return () => {
          auditRequestRef.current?.abort();
          auditRequestRef.current = null;
      };
  }, [user, activeTab, fetchAuditLog]);

  // Load presets
  useEffect(() => {
      const canOperate = ['operator', 'owner'].includes(userRole);
      if (user && canOperate) {
          fetchPresets();
      } else {
          presetsRequestRef.current?.abort();
          presetsRequestRef.current = null;
          setPresets([]);
          setPresetsError('');
          setPresetsLoaded(false);
      }
      return () => {
          presetsRequestRef.current?.abort();
          presetsRequestRef.current = null;
      };
  }, [user, userRole, fetchPresets]);


  const autocompleteSuggestions = getAutocompleteSuggestions();
  const filteredPlayers = onlinePlayers.filter(p =>
      !playerSearch || p.name.toLowerCase().includes(playerSearch.toLowerCase()) || p.steamId.includes(playerSearch)
  );
  const activeBans = bans.filter(b => b.active);
  const filteredBans = bans.filter(b =>
      !banSearch || (b.playerName || '').toLowerCase().includes(banSearch.toLowerCase()) || b.steamId.includes(banSearch)
  );
  const liveDataStale = Boolean(selectedMap && (liveDataError || !liveDataUpdatedAt || Date.now() - liveDataUpdatedAt > LIVE_DATA_STALE_MS));


  return { autocompleteSuggestions, filteredPlayers, activeBans, filteredBans,
    user, setUser, userRole, setUserRole, userPermissions, setUserPermissions, authChecked, setAuthChecked, logoutPending, setLogoutPending, activeTab, setActiveTab, selectedMap, setSelectedMap, clusterMaps, setClusterMaps, clusterMapsError, setClusterMapsError,
    clusterStatus, setClusterStatus, clusterStatusError, setClusterStatusError, mapSelectorOpen, setMapSelectorOpen, liveData, setLiveData, liveDataError, setLiveDataError, liveDataUpdatedAt, liveDataStale,
    powerLoading, setPowerLoading, chartData, setChartData, multipliers, setMultipliers,
    savingSettings, setSavingSettings, settingsLoaded, setSettingsLoaded, rconCommand, setRconCommand,
    showAutocomplete, setShowAutocomplete, rconLog, setRconLog, rconSending, setRconSending, commandHistory, setCommandHistory,
	    historyIndex, setHistoryIndex, rconLogRef, onlinePlayers, setOnlinePlayers, playersLoading, setPlayersLoading, onlinePlayersError, setOnlinePlayersError,
    sidebarMapFilter, setSidebarMapFilter, playerHistory, setPlayerHistory, historyLoading, setHistoryLoading, historyError, setHistoryError,
    playerSearch, setPlayerSearch, ingameAdmins, setIngameAdmins, playerActionLoading, setPlayerActionLoading, bans, setBans, bansLoading, setBansLoading,
    bansError, setBansError, banSearch, setBanSearch, auditLogs, setAuditLogs, auditPage, setAuditPage, auditTotal, setAuditTotal,
    auditTotalPages, setAuditTotalPages, auditFilterAction, setAuditFilterAction, auditLoading, setAuditLoading, auditLoaded, setAuditLoaded,
    auditError, setAuditError,
    modal, setModal, fileList, setFileList, fileListLoading, setFileListLoading, fileListError, setFileListError, currentPath, setCurrentPath, editingFile, setEditingFile,
    fileReadLoading, setFileReadLoading, fileReadError, setFileReadError, fileReadTarget, setFileReadTarget,
    editingContent, setEditingContent, savingFile, setSavingFile, presetLoading, setPresetLoading, presets, setPresets, presetsError, setPresetsError, presetsLoaded, setPresetsLoaded,
    fileType, setFileType, admins, setAdmins, adminsLoading, setAdminsLoading, adminsLoaded, setAdminsLoaded, adminsError, setAdminsError, adminActionLoading, setAdminActionLoading, newAdmin, setNewAdmin, addAdmin, updateAdmin, deleteAdmin,
    tasks, tasksLoading, taskMutationLoading, tasksError, setTasksError, taskScheduleContext, newTaskAction, setNewTaskAction, newTaskCronMode, setNewTaskCronMode,
    newTaskCronValue, setNewTaskCronValue, newTaskCronTime, setNewTaskCronTime, newTaskCron, setNewTaskCron,
    newTaskPayload, setNewTaskPayload, newTaskMapId, setNewTaskMapId, handleCreateTask, handleUpdateTask, handleToggleTask, handleDeleteTask, fetchTasks,
    addToast, verifyToken, loadCurrentSettings, fetchFiles, openFile, saveFile, fetchAdmins, fetchPresets,
    handleLogout,
    copyToClipboard, handleRconSubmit, handleRconKeyDown, handleQuickAction, fetchClusterStatus, fetchOnlinePlayers, fetchIngameAdmins,
    fetchPlayerHistory, fetchBans, handleUnban, fetchAuditLog, handleKickPlayer, handleBanPlayer, handleMessagePlayer,
    handleMakeAdmin, handleRemoveAdmin, sendPowerAction, handleSaveSettings, handleApplyPreset,
    mobileNavOpen, setMobileNavOpen, mobilePlayersOpen, setMobilePlayersOpen
  };
}
