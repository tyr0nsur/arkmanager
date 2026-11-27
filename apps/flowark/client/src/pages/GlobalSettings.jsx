import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarClock, Globe, Webhook, ShieldCheck, Save, Sliders, Dna, Settings2, KeyRound, AlertTriangle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { toast } from 'sonner';
import { useDashboard } from '../context/DashboardContext.jsx';

function isCanceledRequest(err) {
  return err?.name === 'CanceledError' || axios.isCancel?.(err);
}

function isValidDiscordWebhook(value) {
  const webhook = String(value || '').trim();
  if (!webhook) return true;
  try {
      const url = new URL(webhook);
      const allowedHost = url.hostname === 'discord.com' || url.hostname === 'discordapp.com';
      return url.protocol === 'https:' && allowedHost && /^\/api\/webhooks\/\d{17,25}\/[A-Za-z0-9._-]{20,}$/.test(url.pathname);
  } catch (_) {
      return false;
  }
}

function isValidIpAddress(value) {
  const ip = String(value || '').trim();
  if (!ip) return true;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
      return ip.split('.').every(part => Number.parseInt(part, 10) <= 255);
  }
  return /^[0-9A-Fa-f:]+$/.test(ip) && ip.includes(':') && ip.length <= 45;
}

export function GlobalSettings() {
  const { clusterMaps, selectedMap, setActiveTab: setDashboardTab, setModal } = useDashboard();
  const [activeTab, setActiveTab] = useState('security');
  const [settings, setSettings] = useState({
      discordWebhookAlerts: '',
      discordWebhookBans: '',
      adminIpWhitelist: '',
      // Multipliers
      TamingSpeedMultiplier: '1.0',
      HarvestAmountMultiplier: '1.0',
      XPMultiplier: '1.0',
      MatingIntervalMultiplier: '1.0',
      EggHatchSpeedMultiplier: '1.0',
      BabyMatureSpeedMultiplier: '1.0',
      // Rules
      serverPvE: false,
      crossplay: true,
      maxPlayersDefault: '70'
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [secretMapId, setSecretMapId] = useState(selectedMap || '');
  const [secretValues, setSecretValues] = useState({
      ServerAdminPassword: '',
      ServerPassword: '',
      SpectatorPassword: ''
  });
  const [savingSecrets, setSavingSecrets] = useState(false);
  const settingsRequestRef = useRef(null);
  const savingSettingsRef = useRef(false);
  const savingSecretsRef = useRef(false);
  const hasPendingSecret = Object.values(secretValues).some(value => value.trim().length > 0);
  const secretFieldLabels = {
      ServerAdminPassword: 'RCON/Admin',
      ServerPassword: 'Contraseña de servidor',
      SpectatorPassword: 'Spectator'
  };
  const webhookAlertsInvalid = !isValidDiscordWebhook(settings.discordWebhookAlerts);
  const webhookBansInvalid = !isValidDiscordWebhook(settings.discordWebhookBans);
  const adminIpEntries = String(settings.adminIpWhitelist || '').split(',').map(ip => ip.trim()).filter(Boolean);
  const adminIpWhitelistInvalid = adminIpEntries.some(ip => !isValidIpAddress(ip));
  const settingsValidationMessage = (() => {
      if (webhookAlertsInvalid) return 'El webhook de alertas debe ser una URL HTTPS válida de Discord.';
      if (webhookBansInvalid) return 'El webhook de baneos debe ser una URL HTTPS válida de Discord.';
      if (adminIpWhitelistInvalid) return 'La IP blanca debe contener solo IPs válidas separadas por comas.';
      return '';
  })();

  const fetchSettings = useCallback(async () => {
      settingsRequestRef.current?.abort();
      const controller = new AbortController();
      settingsRequestRef.current = controller;
      setLoading(true);
      try {
          const res = await axios.get('/api/settings/global', { signal: controller.signal });
          if (settingsRequestRef.current !== controller) return;
          // Merge defaults in case backend doesn't have them yet
          setSettings(prev => ({...prev, ...res.data}));
          setLoadError('');
      } catch (err) {
          if (isCanceledRequest(err)) return;
          if (settingsRequestRef.current !== controller) return;
          setLoadError(err.response?.data?.error || 'Error al cargar ajustes globales');
      } finally {
          if (settingsRequestRef.current === controller) {
              settingsRequestRef.current = null;
              setLoading(false);
          }
      }
  }, []);

  useEffect(() => {
      fetchSettings();
      return () => {
          const request = settingsRequestRef.current;
          request?.abort();
          if (settingsRequestRef.current === request) {
              settingsRequestRef.current = null;
          }
      };
  }, [fetchSettings]);

  useEffect(() => {
      if (secretMapId && clusterMaps.some(map => map.id === secretMapId)) return;
      setSecretMapId(selectedMap || clusterMaps[0]?.id || '');
  }, [clusterMaps, secretMapId, selectedMap]);

  const handleSave = async () => {
      if (savingSettingsRef.current) return;
      if (settingsValidationMessage) {
          toast.error(settingsValidationMessage);
          return;
      }
      savingSettingsRef.current = true;
      setSaving(true);
      try {
          await axios.post('/api/settings/global', settings);
          toast.success('Ajustes globales guardados exitosamente');
      } catch (err) {
          toast.error(err.response?.data?.error || 'Error al guardar ajustes globales');
      } finally {
          savingSettingsRef.current = false;
          setSaving(false);
      }
  };

  const handleChange = (key, value) => {
      setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSecretChange = (key, value) => {
      setSecretValues(prev => ({ ...prev, [key]: value }));
  };

  const rotateSecrets = async ({ mapId, secrets }) => {
      if (savingSecretsRef.current) return false;
      savingSecretsRef.current = true;
      setSavingSecrets(true);
      try {
          await axios.post('/api/config/secrets', { mapId, secrets });
          setSecretValues({ ServerAdminPassword: '', ServerPassword: '', SpectatorPassword: '' });
          setModal(null);
          toast.success('Secretos actualizados. Reinicia el servidor si es necesario.');
          return true;
      } catch (err) {
          toast.error(err.response?.data?.error || 'Error al actualizar secretos');
          return false;
      } finally {
          savingSecretsRef.current = false;
          setSavingSecrets(false);
      }
  };

  const handleRotateSecrets = () => {
      if (savingSecretsRef.current) return;
      if (!secretMapId) {
          toast.warning('No hay ningún mapa gestionado disponible');
          return;
      }
      const secrets = Object.fromEntries(
          Object.entries(secretValues)
              .map(([key, value]) => [key, value.trim()])
              .filter(([, value]) => value.length > 0)
      );
      if (Object.keys(secrets).length === 0) {
          toast.warning('Introduce al menos un secreto para rotar');
          return;
      }

      const mapName = clusterMaps.find(map => map.id === secretMapId)?.name || secretMapId;
      const secretNames = Object.keys(secrets).map(key => secretFieldLabels[key] || key).join(', ');
      setModal({
          type: 'danger',
          title: 'Confirmar rotación de secretos',
          message: `Vas a actualizar secretos ARK en ${mapName} (${secretMapId}): ${secretNames}. Esto puede afectar RCON, acceso con contraseña y conexiones de espectadores hasta que el servidor use los nuevos valores.`,
          Icon: AlertTriangle,
          color: 'amber',
          hasInput: true,
          inputLabel: `Escribe ROTAR SECRETOS ${secretMapId}`,
          expectedInput: `ROTAR SECRETOS ${secretMapId}`,
          confirmText: 'Rotar secretos',
          onConfirm: () => rotateSecrets({ mapId: secretMapId, secrets }),
      });
  };

  if (loading && !loadError) {
      return (
          <div className="mx-auto flex h-full min-h-[260px] w-full max-w-6xl flex-col items-center justify-center gap-3 text-zinc-500">
              <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
              <p>Cargando configuraciones globales...</p>
          </div>
      );
  }

  if (loadError) {
      return (
          <div className="mx-auto flex h-full min-h-[320px] w-full max-w-3xl items-center justify-center">
              <div className="dashboard-card w-full rounded-lg border border-amber-500/20 bg-[#18181b] p-6 shadow-lg">
                  <div className="flex items-start gap-3">
                      <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={20} />
                      <div className="flex-1">
                          <h2 className="text-lg font-bold text-white">Ajustes globales no disponibles</h2>
                          <p className="text-sm text-zinc-400 mt-1">{loadError}</p>
                          <button
                              onClick={fetchSettings}
                              disabled={loading}
                              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 text-sm font-medium text-amber-200 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                              {loading ? 'Reintentando...' : 'Reintentar'}
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  const tabs = [
      { id: 'security', label: 'Seguridad & Alertas', icon: <ShieldCheck size={18} />, activeClass: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-lg' },
      { id: 'multipliers', label: 'Multiplicadores Base', icon: <Dna size={18} />, activeClass: 'bg-purple-500/10 text-purple-400 border border-purple-500/30 shadow-lg' },
      { id: 'rules', label: 'Reglas del Clúster', icon: <Sliders size={18} />, activeClass: 'bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-lg' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-4"
    >
      <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
              <h2 className="text-2xl font-bold flex items-center gap-2 text-white">
                  <Globe className="text-blue-400" />
                  Ajustes Globales (Clúster)
              </h2>
              <p className="text-sm text-zinc-500 mt-1">Configuración a nivel de panel que afectará a todos los mapas.</p>
          </div>
              <button
                  type="button"
                  onClick={handleSave}
	              disabled={saving || Boolean(settingsValidationMessage)}
	              title={settingsValidationMessage || undefined}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-indigo-500 px-5 text-sm font-bold text-white shadow-[0_0_15px_rgba(99,102,241,0.25)] transition-all hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-10"
              >
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={16} />}
              {saving ? 'Guardando...' : 'Guardar ajustes globales'}
          </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden lg:flex-row lg:gap-6">
          {/* Sidebar Navigation */}
          <div
              className="flex w-full shrink-0 gap-2 overflow-x-auto pb-2 custom-scrollbar lg:w-72 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:pb-0 lg:pr-1"
              role="tablist"
              aria-label="Categorías de ajustes globales"
          >
              {tabs.map(tab => {
                  const isActive = activeTab === tab.id;
                  return (
                  <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex min-h-11 min-w-[13rem] items-center gap-3 rounded-lg px-4 py-3 text-left font-medium transition-all lg:w-full lg:min-w-0 ${
                          isActive
                            ? tab.activeClass
                            : 'bg-[#18181b] text-zinc-400 border border-zinc-800 hover:bg-zinc-800/80 hover:text-zinc-200'
                      }`}
                  >
                      {tab.icon} {tab.label}
                  </button>
                  );
              })}
              <div className="min-w-[16rem] rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-zinc-400 lg:min-w-0">
                  <div className="flex items-start gap-3">
                      <CalendarClock size={18} className="mt-0.5 shrink-0 text-cyan-300" />
                      <div className="min-w-0">
                          <p className="font-semibold text-zinc-200">Automatización</p>
                          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                              Las tareas programadas se gestionan en una página operativa separada.
                          </p>
                          <button
                              type="button"
                              onClick={() => setDashboardTab('tasks')}
                              className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg border border-cyan-500/30 px-3 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/10"
                          >
                              Abrir tareas programadas
                          </button>
                      </div>
                  </div>
              </div>
          </div>

          {/* Main Content Area */}
          <div className="dashboard-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-[#18181b]">
            <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar sm:p-6">
              <AnimatePresence mode="wait">

                  {activeTab === 'security' && (
                      <motion.div key="security" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                          <div className="flex items-center gap-3 mb-6 border-b border-zinc-800 pb-4">
                              <Webhook className="text-emerald-400" size={24} />
                              <div>
                                  <h3 className="font-bold text-lg text-white">Integración Discord & Seguridad</h3>
                                  <p className="text-xs text-zinc-500">Conecta tu panel con tus canales de Discord para recibir notificaciones.</p>
                              </div>
	                          </div>
	                          <div className="space-y-5 max-w-2xl">
	                              {settingsValidationMessage && (
	                                  <div id="global-settings-validation" className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
	                                      <div className="flex items-start gap-2">
	                                          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" />
	                                          <span>{settingsValidationMessage}</span>
	                                      </div>
	                                  </div>
	                              )}
	                              <div className="space-y-1.5">
	                                  <label htmlFor="global-webhook-alerts" className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Webhook URL (Alertas y Arranques)</label>
	                                  <input
	                                      id="global-webhook-alerts"
	                                      type="text"
	                                      placeholder={'https://discord.com/' + 'api/webhooks/...'}
	                                      value={settings.discordWebhookAlerts || ''}
	                                      onChange={e => handleChange('discordWebhookAlerts', e.target.value)}
	                                      aria-invalid={webhookAlertsInvalid ? 'true' : undefined}
	                                      aria-describedby={webhookAlertsInvalid ? 'global-settings-validation' : undefined}
	                                      className="w-full bg-[#09090b] border border-zinc-800 focus:border-emerald-500 rounded-lg px-3 py-2.5 text-sm text-white outline-none transition-colors"
	                                  />
	                              </div>
	                              <div className="space-y-1.5">
	                                  <label htmlFor="global-webhook-bans" className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Webhook URL (Baneos Públicos)</label>
	                                  <input
	                                      id="global-webhook-bans"
	                                      type="text"
	                                      placeholder={'https://discord.com/' + 'api/webhooks/...'}
	                                      value={settings.discordWebhookBans || ''}
	                                      onChange={e => handleChange('discordWebhookBans', e.target.value)}
	                                      aria-invalid={webhookBansInvalid ? 'true' : undefined}
	                                      aria-describedby={webhookBansInvalid ? 'global-settings-validation' : undefined}
	                                      className="w-full bg-[#09090b] border border-zinc-800 focus:border-emerald-500 rounded-lg px-3 py-2.5 text-sm text-white outline-none transition-colors"
	                                  />
	                              </div>

                              <div className="h-px bg-zinc-800 my-6"></div>

	                              <div className="space-y-1.5">
	                                  <label htmlFor="global-admin-ip-whitelist" className="text-xs font-bold text-zinc-400 uppercase tracking-wider">IP Blanca (Panel Admin)</label>
	                                  <input
	                                      id="global-admin-ip-whitelist"
	                                      type="text"
	                                      placeholder="192.168.1.1, 8.8.8.8"
	                                      value={settings.adminIpWhitelist || ''}
	                                      onChange={e => handleChange('adminIpWhitelist', e.target.value)}
	                                      aria-invalid={adminIpWhitelistInvalid ? 'true' : undefined}
	                                      aria-describedby={adminIpWhitelistInvalid ? 'global-settings-validation global-admin-ip-help' : 'global-admin-ip-help'}
	                                      className="w-full bg-[#09090b] border border-zinc-800 focus:border-emerald-500 rounded-lg px-3 py-2.5 text-sm text-white outline-none transition-colors"
	                                  />
	                                  <p id="global-admin-ip-help" className="text-[10px] text-zinc-500">Separar IPs por comas. Debe incluir tu IP actual; en blanco permite cualquier conexión segura.</p>
	                              </div>

                              <div className="h-px bg-zinc-800 my-6"></div>

                              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-4">
                                  <div className="flex items-center gap-3">
                                      <KeyRound className="text-amber-400" size={20} />
                                      <div>
                                          <h4 className="text-sm font-bold text-zinc-200">Rotación de Secretos ARK</h4>
                                          <p className="text-xs text-zinc-500">Los valores actuales no se muestran. Solo se actualizan los campos rellenados.</p>
                                      </div>
                                  </div>

                                  <div className="space-y-1.5">
	                                      <label htmlFor="secret-map-id" className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Mapa objetivo</label>
	                                      <select
	                                          id="secret-map-id"
	                                          value={secretMapId}
	                                          onChange={e => setSecretMapId(e.target.value)}
                                          disabled={savingSecrets}
                                          className="w-full bg-[#09090b] border border-zinc-800 focus:border-amber-500 rounded-lg px-3 py-2.5 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                          {!secretMapId && <option value="">Sin mapas disponibles</option>}
                                          {clusterMaps.map(map => (
                                              <option key={map.id} value={map.id}>{map.name}</option>
                                          ))}
                                      </select>
                                  </div>

	                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
	                                      <div className="space-y-1.5">
	                                          <label htmlFor="secret-admin-password" className="text-xs font-bold text-zinc-400 uppercase tracking-wider">RCON/Admin</label>
	                                          <input
	                                              id="secret-admin-password"
	                                              type="password"
                                              value={secretValues.ServerAdminPassword}
                                              onChange={e => handleSecretChange('ServerAdminPassword', e.target.value)}
                                              autoComplete="new-password"
                                              placeholder="Nuevo valor"
                                              disabled={savingSecrets}
                                              className="w-full bg-[#09090b] border border-zinc-800 focus:border-amber-500 rounded-lg px-3 py-2.5 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                          />
	                                      </div>
	                                      <div className="space-y-1.5">
	                                          <label htmlFor="secret-server-password" className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Server Password</label>
	                                          <input
	                                              id="secret-server-password"
	                                              type="password"
                                              value={secretValues.ServerPassword}
                                              onChange={e => handleSecretChange('ServerPassword', e.target.value)}
                                              autoComplete="new-password"
                                              placeholder="Nuevo valor"
                                              disabled={savingSecrets}
                                              className="w-full bg-[#09090b] border border-zinc-800 focus:border-amber-500 rounded-lg px-3 py-2.5 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                          />
	                                      </div>
	                                      <div className="space-y-1.5">
	                                          <label htmlFor="secret-spectator-password" className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Spectator</label>
	                                          <input
	                                              id="secret-spectator-password"
	                                              type="password"
                                              value={secretValues.SpectatorPassword}
                                              onChange={e => handleSecretChange('SpectatorPassword', e.target.value)}
                                              autoComplete="new-password"
                                              placeholder="Nuevo valor"
                                              disabled={savingSecrets}
                                              className="w-full bg-[#09090b] border border-zinc-800 focus:border-amber-500 rounded-lg px-3 py-2.5 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                          />
                                      </div>
                                  </div>

                                  <div className="flex justify-end">
                                      <button
                                          type="button"
                                          onClick={handleRotateSecrets}
                                          disabled={savingSecrets || !secretMapId || !hasPendingSecret}
                                          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[#09090b] px-4 py-2 rounded-lg font-bold text-sm transition-colors"
                                      >
                                          {savingSecrets ? 'Actualizando...' : 'Actualizar Secretos'}
                                      </button>
                                  </div>
                              </div>
                          </div>
                      </motion.div>
                  )}

                  {activeTab === 'multipliers' && (
                      <motion.div key="multipliers" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                          <div className="flex items-center gap-3 mb-6 border-b border-zinc-800 pb-4">
                              <Dna className="text-purple-400" size={24} />
                              <div>
                                  <h3 className="font-bold text-lg text-white">Multiplicadores Base</h3>
                                  <p className="text-xs text-zinc-500">Valores por defecto que se inyectarán en todos los mapas del clúster.</p>
                              </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl">
                              <div className="space-y-1.5">
                                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Taming Speed (Vel. Tameo)</label>
                                  <input
                                      type="number" step="0.1" min="0.1"
                                      value={settings.TamingSpeedMultiplier || '1.0'}
                                      onChange={e => handleChange('TamingSpeedMultiplier', e.target.value)}
                                      className="w-full bg-[#09090b] border border-zinc-800 focus:border-purple-500 rounded-lg px-3 py-2 text-sm text-white outline-none"
                                  />
                              </div>
                              <div className="space-y-1.5">
                                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Harvest Amount (Farmeo)</label>
                                  <input
                                      type="number" step="0.1" min="0.1"
                                      value={settings.HarvestAmountMultiplier || '1.0'}
                                      onChange={e => handleChange('HarvestAmountMultiplier', e.target.value)}
                                      className="w-full bg-[#09090b] border border-zinc-800 focus:border-purple-500 rounded-lg px-3 py-2 text-sm text-white outline-none"
                                  />
                              </div>
                              <div className="space-y-1.5">
                                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">XP Multiplier (Experiencia)</label>
                                  <input
                                      type="number" step="0.1" min="0.1"
                                      value={settings.XPMultiplier || '1.0'}
                                      onChange={e => handleChange('XPMultiplier', e.target.value)}
                                      className="w-full bg-[#09090b] border border-zinc-800 focus:border-purple-500 rounded-lg px-3 py-2 text-sm text-white outline-none"
                                  />
                              </div>
                              <div className="space-y-1.5">
                                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Mating Interval (Vel. Apareamiento)</label>
                                  <input
                                      type="number" step="0.1" min="0.01"
                                      value={settings.MatingIntervalMultiplier || '1.0'}
                                      onChange={e => handleChange('MatingIntervalMultiplier', e.target.value)}
                                      className="w-full bg-[#09090b] border border-zinc-800 focus:border-purple-500 rounded-lg px-3 py-2 text-sm text-white outline-none"
                                  />
                                  <p className="text-[9px] text-zinc-500">Valores menores = Más rápido (ej. 0.1 = 10x más rápido)</p>
                              </div>
                              <div className="space-y-1.5">
                                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Egg Hatch Speed (Eclosión)</label>
                                  <input
                                      type="number" step="0.1" min="0.1"
                                      value={settings.EggHatchSpeedMultiplier || '1.0'}
                                      onChange={e => handleChange('EggHatchSpeedMultiplier', e.target.value)}
                                      className="w-full bg-[#09090b] border border-zinc-800 focus:border-purple-500 rounded-lg px-3 py-2 text-sm text-white outline-none"
                                  />
                              </div>
                              <div className="space-y-1.5">
                                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Baby Mature Speed (Maduración)</label>
                                  <input
                                      type="number" step="0.1" min="0.1"
                                      value={settings.BabyMatureSpeedMultiplier || '1.0'}
                                      onChange={e => handleChange('BabyMatureSpeedMultiplier', e.target.value)}
                                      className="w-full bg-[#09090b] border border-zinc-800 focus:border-purple-500 rounded-lg px-3 py-2 text-sm text-white outline-none"
                                  />
                              </div>
                          </div>
                      </motion.div>
                  )}

                  {activeTab === 'rules' && (
                      <motion.div key="rules" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                          <div className="flex items-center gap-3 mb-6 border-b border-zinc-800 pb-4">
                              <Settings2 className="text-amber-400" size={24} />
                              <div>
                                  <h3 className="font-bold text-lg text-white">Reglas del Clúster</h3>
                                  <p className="text-xs text-zinc-500">Comportamiento general de los servidores de juego.</p>
                              </div>
                          </div>

                          <div className="space-y-4 max-w-2xl">
                              <div className="bg-[#09090b] border border-zinc-800 rounded-lg p-4 flex items-center justify-between hover:border-amber-500/30 transition-colors">
                                  <div>
                                      <p className="font-bold text-sm text-zinc-200">Modo PvE Global</p>
                                      <p className="text-xs text-zinc-500 mt-0.5">Si se activa, todos los servidores operarán en modo Jugador vs Entorno.</p>
                                  </div>
                                  <label className="relative inline-flex items-center cursor-pointer">
                                      <input type="checkbox" className="sr-only peer" checked={settings.serverPvE || false} onChange={e => handleChange('serverPvE', e.target.checked)} />
                                      <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                                  </label>
                              </div>

                              <div className="bg-[#09090b] border border-zinc-800 rounded-lg p-4 flex items-center justify-between hover:border-amber-500/30 transition-colors">
                                  <div>
                                      <p className="font-bold text-sm text-zinc-200">Activar Crossplay (Steam / Epic)</p>
                                      <p className="text-xs text-zinc-500 mt-0.5">Permite a los jugadores de Epic Games conectarse al servidor con -crossplay.</p>
                                  </div>
                                  <label className="relative inline-flex items-center cursor-pointer">
                                      <input type="checkbox" className="sr-only peer" checked={settings.crossplay || false} onChange={e => handleChange('crossplay', e.target.checked)} />
                                      <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                                  </label>
                              </div>

                              <div className="space-y-1.5 pt-4">
                                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Max Players (Por defecto)</label>
                                  <input
                                      type="number" min="10" max="150"
                                      value={settings.maxPlayersDefault || '70'}
                                      onChange={e => handleChange('maxPlayersDefault', e.target.value)}
                                      className="w-full max-w-xs bg-[#09090b] border border-zinc-800 focus:border-amber-500 rounded-lg px-3 py-2.5 text-sm text-white outline-none"
                                  />
                              </div>
                          </div>
                      </motion.div>
                  )}

              </AnimatePresence>
            </div>
          </div>
      </div>
    </motion.div>
  );
}
