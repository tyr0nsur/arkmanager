import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Server, Menu, ShieldCheck, LogOut, ChevronDown } from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext.jsx';
import { PLAYER_PANEL_DESKTOP_TABS, canAccessDashboardTab } from '../../constants/dashboard';
import { roleInfo } from '../../constants/roles';


export function TopNavbar() {
    const { activeTab, setActiveTab, user, userRole, handleLogout, logoutPending, mobileNavOpen, setMobileNavOpen, mobilePlayersOpen, setMobilePlayersOpen } = useDashboard();
    const [profileOpen, setProfileOpen] = useState(false);

    const dropdownRef = useRef(null);
    const canOperate = ['operator', 'owner'].includes(userRole);
    const canOwn = userRole === 'owner';
    const currentRole = roleInfo(userRole);
    const currentTab = canAccessDashboardTab(activeTab, userRole) ? activeTab : 'cluster';
    const playersDockedOnCurrentTab = PLAYER_PANEL_DESKTOP_TABS.has(currentTab);
    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setProfileOpen(false);
            }
        }
        function handleEscape(event) {
            if (event.key === 'Escape') {
                setProfileOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, []);

    const closeNavigationOverlays = () => {
        setProfileOpen(false);
        setMobileNavOpen(false);
        setMobilePlayersOpen(false);
    };

    const navigateTopTab = tab => {
        setActiveTab(tab);
        closeNavigationOverlays();
    };

    return (
        <header className="w-full h-14 bg-[#18181b] border-b border-zinc-800 flex items-center justify-between px-4 sm:px-6 shrink-0 z-[80]">
            {/* Logo area */}
            <div className="flex items-center gap-3">
                {/* Mobile Menu Button */}
		                <button
		                    onClick={() => { setMobilePlayersOpen(false); setMobileNavOpen(!mobileNavOpen); }}
		                    className="xl:hidden flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
	                    aria-label={mobileNavOpen ? 'Cerrar navegación de servidor' : 'Abrir navegación de servidor'}
	                    aria-controls="server-navigation-drawer"
	                    aria-expanded={mobileNavOpen}
	                >
                    <Menu size={20} />
                </button>

                <div className="hidden sm:flex w-8 h-8 rounded-lg bg-cyan-500 items-center justify-center shadow-sm">
                    <Server size={16} className="text-[#09090b]" />
                </div>
                <div>
                    <h1 className="font-bold text-[16px] tracking-tight text-white leading-none flex items-center gap-1.5">
                        Obelisk<span className="text-cyan-400">Panel</span>
                    </h1>
                </div>
            </div>

            <div className="hidden min-w-0 flex-1 items-center justify-center px-6 text-xs text-zinc-400 sm:flex">ObeliskNative · ARK Linux</div>

            {/* User Area */}
	            <div className="flex items-center gap-2 relative sm:gap-3" ref={dropdownRef}>
                {canOperate && (
                    <button
                        onClick={() => { setMobileNavOpen(false); setMobilePlayersOpen(!mobilePlayersOpen); }}
	                        className={`flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors relative ${playersDockedOnCurrentTab ? '2xl:hidden' : ''}`}
                        title="Jugadores"
                        aria-label={mobilePlayersOpen ? 'Cerrar panel de jugadores' : 'Abrir panel de jugadores'}
                        aria-controls="players-navigation-drawer"
                        aria-expanded={mobilePlayersOpen}
                    >
                        <Users size={18} />
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-cyan-500 rounded-full border border-[#18181b]"></span>
                    </button>
                )}

	                <button
	                    onClick={handleLogout}
	                    disabled={logoutPending}
		                    className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-500/10 hover:text-red-300 transition-colors disabled:cursor-not-allowed disabled:opacity-45"
	                    title="Cerrar Sesión"
	                    aria-label="Cerrar Sesión"
	                >
                    <LogOut size={18} />
                </button>

                {/* Profile Dropdown Trigger */}
                <button
                    onClick={() => {
                        setProfileOpen(!profileOpen);
                    }}
	                    className="flex min-h-11 items-center gap-1.5 rounded-lg border border-transparent p-1.5 transition-colors hover:border-zinc-700 hover:bg-zinc-800/50 sm:gap-3 group"
                    aria-label="Abrir perfil"
                    aria-haspopup="menu"
                    aria-expanded={profileOpen}
                >
                    <div className="hidden sm:block text-right">
                        <div className="text-sm font-semibold text-white leading-none">{user}</div>
                        <div className="text-[10px] text-cyan-500 mt-1 uppercase tracking-wider" title={`Permiso verificado: ${currentRole.description}`}>{currentRole.label}</div>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 group-hover:border-cyan-500/50 transition-colors">
                        <Users size={16} className="text-zinc-400 group-hover:text-cyan-400 transition-colors" />
                    </div>
	                    <ChevronDown size={14} className={`hidden text-zinc-500 transition-transform sm:block ${profileOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                <AnimatePresence>
                    {profileOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
	                            className="absolute right-0 top-full z-50 mt-2 max-h-[calc(100dvh-4rem)] w-[min(22rem,calc(100vw-1rem))] origin-top-right overflow-y-auto rounded-lg border border-zinc-800 bg-[#18181b] shadow-2xl shadow-black/50 custom-scrollbar"
                        >
                            <div className="p-3 border-b border-zinc-800 bg-[#09090b]">
                                <p className="text-xs text-zinc-500 font-medium">Sesión Iniciada como</p>
                                <p className="text-sm text-white font-bold truncate mt-0.5">{user}</p>
                                <p className="text-[10px] text-cyan-500 uppercase tracking-wider mt-1">{currentRole.label}</p>
                                <p className="mt-1 text-[11px] leading-snug text-zinc-500">{currentRole.description}</p>
                            </div>
                            <div className="p-1.5 flex flex-col gap-0.5">
                                <p className="px-3 py-2 text-xs text-zinc-500">Sesión verificada con Discord</p>
                                {canOwn && <button onClick={() => navigateTopTab('global_settings')} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
                                    <ShieldCheck size={15} className="text-emerald-400" /> Seguridad del Panel
                                </button>}
                            </div>
                            <div className="p-1.5 border-t border-zinc-800">
	                                <button
	                                    onClick={handleLogout}
	                                    disabled={logoutPending}
	                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-45"
	                                >
                                    <LogOut size={15} /> Cerrar Sesión
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </header>
    );
}
