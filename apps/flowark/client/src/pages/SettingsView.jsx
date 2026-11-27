import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Save, Zap, Settings, Search, ChevronRight, Shield, Users, TreePine, Flame, AlertTriangle, RefreshCw } from 'lucide-react';
import { useDashboard } from '../context/DashboardContext.jsx';
import { SETTINGS_CATEGORIES, SETTINGS_CATEGORY_ICONS } from '../constants/dashboard.js';

export function SettingsView() {
  const { multipliers, setMultipliers, savingSettings, handleSaveSettings, presets, presetsError, presetLoading, presetsLoaded, handleApplyPreset, fetchPresets, selectedMap, clusterMaps } = useDashboard();
  const [activeCategory, setActiveCategory] = useState('Modos de Juego');
  const [searchQuery, setSearchQuery] = useState('');
  const selectedMapMeta = clusterMaps.find(map => map.id === selectedMap);
  const selectedMapName = selectedMapMeta?.name || selectedMap || '';
  const settingsEditingDisabled = savingSettings || !selectedMap;

  // Collect all categories including our hardcoded "Modos de Juego"
  const categories = ['Modos de Juego', ...Object.keys(SETTINGS_CATEGORIES)];

  // Flat list of all settings for search
  const allSettings = useMemo(() => {
      let flat = [];
      Object.entries(SETTINGS_CATEGORIES).forEach(([category, keys]) => {
          Object.entries(keys).forEach(([key, meta]) => {
              flat.push({ key, category, ...meta });
          });
      });
      return flat;
  }, []);

  const filteredSettings = useMemo(() => {
      if (!searchQuery) return [];
      return allSettings.filter(s => s.label.toLowerCase().includes(searchQuery.toLowerCase()) || s.key.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [searchQuery, allSettings]);

  const handleNumberInput = (key, value, min, max) => {
      if (settingsEditingDisabled) return;
      let num = parseFloat(value);
      if (isNaN(num)) num = min;
      if (num < min) num = min;
      if (num > max) num = max;
      setMultipliers({ ...multipliers, [key]: num });
  };

  const incrementValue = (key, current, meta) => {
      if (settingsEditingDisabled) return;
      const step = meta.max > 100 ? 1 : 0.1;
      const next = (parseFloat(current) + step).toFixed(2);
      handleNumberInput(key, next, 0.01, meta.max);
  };

  const decrementValue = (key, current, meta) => {
      if (settingsEditingDisabled) return;
      const step = meta.max > 100 ? 1 : 0.1;
      const next = (parseFloat(current) - step).toFixed(2);
      handleNumberInput(key, next, 0.01, meta.max);
  };

  // Renderiza una tarjeta de ajuste
  const renderSettingCard = (key, meta, val) => {
      return (
          <div key={key} className="bg-[#18181b] border border-zinc-800 p-4 rounded-xl hover:border-zinc-700 transition-colors flex flex-col justify-center min-h-[100px]">
              {meta.isBoolean ? (
                  <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-zinc-300">{meta.label}</span>
                      <button
                          type="button"
                          onClick={() => { if (!settingsEditingDisabled) setMultipliers({...multipliers, [key]: val ? 0 : 1}); }}
                          disabled={settingsEditingDisabled}
                          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400/50 disabled:cursor-not-allowed disabled:opacity-50 ${val ? 'bg-cyan-500' : 'bg-gray-600'}`}
                          aria-label={`${val ? 'Desactivar' : 'Activar'} ${meta.label}`}
                      >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${val ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                  </div>
              ) : (
                  <>
                      <label className="flex justify-between text-xs font-medium text-zinc-400 mb-3">
                          {meta.label}
                          <span className="text-zinc-500 font-mono text-[10px]">Max: {meta.max}</span>
                      </label>
                      <div className="flex items-center gap-2">
                          <button type="button" onClick={() => decrementValue(key, val, meta)} disabled={settingsEditingDisabled} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-2 text-zinc-400 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9 sm:min-w-9 sm:py-1.5" aria-label={`Reducir ${meta.label}`}>-</button>

                          <div className="relative flex-1">
                              <input
                                  type="number"
                                  min="0.01"
                                  max={meta.max}
                                  step={meta.max > 100 ? 1 : 0.1}
                                  value={val}
                                  onChange={(e) => handleNumberInput(key, e.target.value, 0.01, meta.max)}
                                  disabled={settingsEditingDisabled}
                                  className="w-full bg-[#09090b] border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-center text-indigo-400 font-mono font-bold focus:border-indigo-500 outline-none disabled:cursor-not-allowed disabled:opacity-50"
                              />
                          </div>

                          <button type="button" onClick={() => incrementValue(key, val, meta)} disabled={settingsEditingDisabled} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-2 text-zinc-400 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9 sm:min-w-9 sm:py-1.5" aria-label={`Incrementar ${meta.label}`}>+</button>
                      </div>
                  </>
              )}
          </div>
      );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="flex h-full min-h-0 flex-col"
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col">
            {/* Cabecera */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 shrink-0">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">Ajustes de Instancia</h2>
                    <p className="text-sm text-zinc-500 mt-1">Configuración avanzada de multiplicadores y físicas del servidor.</p>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input
                            type="text"
                            placeholder="Buscar ajuste..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[#18181b] border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-300 focus:border-cyan-500 outline-none"
                        />
                    </div>
                    <button
                        onClick={handleSaveSettings}
                        disabled={savingSettings || !selectedMap}
                        className="bg-indigo-500 hover:bg-[#4f7aff] px-5 py-2 rounded-lg font-medium shadow-lg shadow-[#638cff]/20 disabled:opacity-50 transition-colors flex items-center gap-2 text-sm whitespace-nowrap"
                    >
                        <Save size={16} /> {savingSettings ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                </div>
            </div>

            <div className={`mb-5 rounded-lg border px-4 py-3 text-sm ${selectedMap ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-100' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-semibold">{selectedMap ? `Mapa objetivo: ${selectedMapName}` : 'Sin mapa objetivo'}</span>
                    {selectedMap && <span className="font-mono text-[11px] text-cyan-300/80">{selectedMap}</span>}
                </div>
                <p className="mt-1 text-xs opacity-80">
                    {selectedMap ? 'Los cambios y presets se aplican solo a esta instancia.' : 'Selecciona un mapa del clúster para editar sus ajustes.'}
                </p>
            </div>

            {/* Layout Principal Dividido */}
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden lg:flex-row lg:gap-6">

                {/* Menú Lateral de Categorías */}
                {!searchQuery && (
                    <div
                        className="flex w-full shrink-0 gap-2 overflow-x-auto pb-2 no-scrollbar lg:min-h-0 lg:w-64 lg:flex-col lg:gap-1 lg:overflow-y-auto lg:overflow-x-hidden lg:pb-4 lg:pr-2"
                        role="tablist"
                        aria-label="Categorías de ajustes"
                    >
                        {categories.map(category => {
                            const CatIcon = category === 'Modos de Juego' ? Zap : (SETTINGS_CATEGORY_ICONS[category] || Settings);
                            const isActive = activeCategory === category;
                            return (
                                <button
                                    key={category}
                                    type="button"
                                    role="tab"
                                    aria-selected={isActive}
                                    onClick={() => setActiveCategory(category)}
                                    className={`flex min-h-11 min-w-[12rem] shrink-0 items-center justify-between rounded-lg border px-4 py-2.5 text-sm font-medium transition-all lg:min-w-0 ${
                                        isActive
                                            ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.05)]'
                                            : 'bg-[#18181b] border-zinc-800/50 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
                                    }`}
                                >
                                    <div className="flex min-w-0 items-center gap-3">
                                        <CatIcon size={16} className={isActive ? 'text-indigo-400' : 'text-zinc-500'} />
                                        <span className="truncate">{category}</span>
                                    </div>
                                    {isActive && <ChevronRight size={14} className="hidden shrink-0 lg:block" />}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Contenido de la Categoría Activa o Búsqueda */}
                <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-zinc-800/50 bg-[#09090b] p-4 custom-scrollbar sm:p-5">
                    {searchQuery ? (
                        <div>
                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <Search size={20} className="text-cyan-400" />
                                Resultados para "{searchQuery}"
                            </h3>
                            {filteredSettings.length === 0 ? (
                                <div className="text-center py-10 text-zinc-500">No se encontraron ajustes.</div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {filteredSettings.map(s => {
                                        const val = multipliers[s.key] !== undefined ? multipliers[s.key] : (s.isBoolean ? 0 : 1.0);
                                        return renderSettingCard(s.key, s, val);
                                    })}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div>
                            <h3 className="text-xl font-bold mb-6 text-zinc-100 flex items-center gap-2 border-b border-zinc-800 pb-3">
                                {activeCategory === 'Modos de Juego' ? <Zap className="text-purple-400"/> : <Settings className="text-indigo-400" />}
                                {activeCategory}
                            </h3>

                            {activeCategory === 'Modos de Juego' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                    {presetsError ? (
                                        <div className="col-span-full flex flex-col items-center justify-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-8 text-center text-sm text-amber-100">
                                            <AlertTriangle size={22} className="text-amber-300" />
                                            <p>{presetsError}</p>
                                            <button
                                                type="button"
                                                onClick={fetchPresets}
                                                disabled={presetLoading}
                                                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-amber-400/30 px-3 text-xs font-semibold text-amber-100 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                <RefreshCw size={13} className={presetLoading ? 'animate-spin' : ''} />
                                                {presetLoading ? 'Reintentando...' : 'Reintentar'}
                                            </button>
                                        </div>
                                    ) : !presetsLoaded ? (
                                        <div className="text-zinc-500 col-span-full py-10 text-center">Cargando presets...</div>
                                    ) : presets.length === 0 ? (
                                        <div className="text-zinc-500 col-span-full py-10 text-center">No hay presets configurados.</div>
                                    ) : (
                                        presets.map(preset => {
                                            const Icons = { Zap, Users, TreePine, Shield, Flame };
                                            const PresetIcon = Icons[preset.icon] || Zap;
                                            const isCurrent = preset.id === 'fibercraft_x1000'; // Just as an example for highlighting

                                            return (
                                                <div key={preset.id} className={`bg-[#18181b] border ${isCurrent ? 'border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.1)]' : 'border-zinc-800'} rounded-xl p-6 relative overflow-hidden flex flex-col`}>
                                                    {isCurrent && <div className="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>}
                                                    <div className="flex items-center gap-3 mb-3">
                                                        <div className={`p-2 rounded-lg ${isCurrent ? 'bg-purple-500/20 text-purple-400' : 'bg-zinc-800 text-zinc-400'}`}>
                                                            <PresetIcon size={20} />
                                                        </div>
                                                        <h4 className="text-lg font-bold text-white">{preset.name}</h4>
                                                    </div>
                                                    <p className="text-sm text-zinc-400 leading-relaxed mb-6 flex-1">
                                                        {preset.description}
                                                    </p>
                                                    <button
                                                        onClick={() => handleApplyPreset(preset)}
                                                        disabled={presetLoading || !selectedMap}
                                                        className={`w-full py-2.5 rounded-lg font-bold transition-all text-sm disabled:opacity-50 ${isCurrent ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/20' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'}`}
                                                    >
                                                        Aplicar {preset.name}
                                                    </button>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {Object.entries(SETTINGS_CATEGORIES[activeCategory] || {}).map(([key, meta]) => {
                                        const val = multipliers[key] !== undefined ? multipliers[key] : (meta.isBoolean ? 0 : 1.0);
                                        return renderSettingCard(key, meta, val);
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

            </div>
      </div>
    </motion.div>
  );
}
