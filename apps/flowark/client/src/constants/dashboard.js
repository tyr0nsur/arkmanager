import {
  Server, Settings, Users, Terminal, Box, Save, Trash2, MessageSquare, Megaphone, Gamepad2, Wheat, Egg, Sun, Swords, Beef, Crown, Hash, Volume2, Key, UserMinus, Ban, CheckCircle, UserPlus, ShieldOff, Zap, FileEdit, FileText, Package, ShieldAlert, Layers, LayoutDashboard, CalendarClock, ShieldCheck, Activity, Rocket, Plug, FolderOpen
} from 'lucide-react';

export const DEFAULT_TAB = 'cluster';

export const PLAYER_PANEL_DESKTOP_TABS = new Set([
    'cluster',
    'dashboard',
    'players',
    'bans',
    'tasks',
    'rcon',
    'settings',
    'files',
]);

export const VALID_TABS = [
    'cluster',
    'dashboard',
    'players',
    'bans',
    'audit',
    'rcon',
    'settings',
    'files',
    'admins',
    'tasks',
    'plugins',
    'hub',
    'game_modes',
    'deploy',
    'global_settings',
    'system_health'
];

export function normalizeDashboardTab(tab) {
    return VALID_TABS.includes(tab) ? tab : DEFAULT_TAB;
}

export const ROLE_LEVELS = { viewer: 0, operator: 1, owner: 2 };

export const TAB_ROLE_REQUIREMENTS = {
    cluster: 'viewer',
    dashboard: 'viewer',
    players: 'operator',
    bans: 'operator',
    audit: 'owner',
    rcon: 'owner',
    settings: 'owner',
    files: 'owner',
    admins: 'owner',
    tasks: 'operator',
    plugins: 'owner',
    hub: 'operator',
    game_modes: 'owner',
    deploy: 'owner',
    global_settings: 'owner',
    system_health: 'owner',
};

export function canAccessDashboardTab(tab, role = 'viewer') {
    const normalized = normalizeDashboardTab(tab);
    const requiredRole = TAB_ROLE_REQUIREMENTS[normalized] || 'owner';
    return (ROLE_LEVELS[role] || 0) >= ROLE_LEVELS[requiredRole];
}

export function normalizeDashboardTabForRole(tab, role = 'viewer') {
    const normalized = normalizeDashboardTab(tab);
    return canAccessDashboardTab(normalized, role) ? normalized : DEFAULT_TAB;
}

export const DASHBOARD_NAV_SECTIONS = [
    {
        id: 'operation',
        label: 'Operación diaria',
        shortLabel: 'Operación',
        description: 'Estado, jugadores, sanciones y tareas visibles para operación.',
        tabs: ['cluster', 'dashboard', 'players', 'bans', 'tasks'],
    },
    {
        id: 'instance',
        label: 'Instancia seleccionada',
        shortLabel: 'Instancia',
        description: 'Consola, archivos y configuración del mapa activo.',
        tabs: ['rcon', 'files', 'settings', 'game_modes'],
    },
    {
        id: 'panel_admin',
        label: 'Administración del panel',
        shortLabel: 'Panel',
        description: 'Usuarios, seguridad global y auditoría.',
        tabs: ['admins', 'global_settings', 'audit'],
    },
    {
        id: 'system',
        label: 'Sistema y despliegue',
        shortLabel: 'Sistema',
        description: 'Diagnóstico del host, plugins y despliegues.',
        tabs: ['hub', 'system_health', 'plugins', 'deploy'],
    },
];

export const DASHBOARD_TAB_META = {
    cluster: {
        label: 'Cluster',
        shortLabel: 'Cluster',
        section: 'Operación diaria',
        description: 'Estado agregado de todos los mapas gestionados.',
        Icon: Layers,
    },
    dashboard: {
        label: 'Mapa activo',
        shortLabel: 'Instancia',
        section: 'Operación diaria',
        description: 'Telemetría y resumen del mapa seleccionado.',
        Icon: LayoutDashboard,
    },
    players: {
        label: 'Jugadores',
        shortLabel: 'Jugadores',
        section: 'Operación diaria',
        description: 'Jugadores conectados, historial y acciones permitidas.',
        Icon: Users,
    },
    bans: {
        label: 'Baneos',
        shortLabel: 'Baneos',
        section: 'Operación diaria',
        description: 'Baneos activos y removals con confirmación.',
        Icon: Ban,
    },
    tasks: {
        label: 'Automatización',
        shortLabel: 'Tareas',
        section: 'Operación diaria',
        description: 'Tareas programadas y acciones recurrentes.',
        Icon: CalendarClock,
    },
    rcon: {
        label: 'Consola RCON',
        shortLabel: 'Consola',
        section: 'Instancia seleccionada',
        description: 'Comandos manuales y logs del mapa seleccionado.',
        Icon: Terminal,
    },
    files: {
        label: 'Editor CFG',
        shortLabel: 'Archivos',
        section: 'Instancia seleccionada',
        description: 'Archivos gestionados dentro de las rutas permitidas.',
        Icon: FolderOpen,
    },
    settings: {
        label: 'Ajustes de mapa',
        shortLabel: 'Ajustes mapa',
        section: 'Instancia seleccionada',
        description: 'Multiplicadores y presets del mapa seleccionado.',
        Icon: Settings,
    },
    admins: {
        label: 'Administradores',
        shortLabel: 'Admins',
        section: 'Administración del panel',
        description: 'Cuentas, roles y protección de propietarios.',
        Icon: ShieldCheck,
    },
    global_settings: {
        label: 'Ajustes globales',
        shortLabel: 'Seguridad',
        section: 'Administración del panel',
        description: 'Reglas globales, Discord y rotación de secretos ARK.',
        Icon: Key,
    },
    audit: {
        label: 'Auditoría',
        shortLabel: 'Auditoría',
        section: 'Administración del panel',
        description: 'Historial de actividad administrativa.',
        Icon: FileText,
    },
    system_health: {
        label: 'Diagnóstico',
        shortLabel: 'Diagnóstico',
        section: 'Sistema y despliegue',
        description: 'Salud del host y checklist de producción.',
        Icon: Activity,
    },
    hub: { label: 'ObeliskNative Hub', shortLabel: 'Hub', section: 'Ecosistema', description: 'Módulos nativos, artifacts y referencias ASE.', Icon: Package },
    game_modes: { label: 'Modos de juego', shortLabel: 'Modos', section: 'Instancia seleccionada', description: 'Perfiles PvE, PvP y Hardcore con revisión de cambios.', Icon: Gamepad2 },
    plugins: {
        label: 'Plugins Runtime',
        shortLabel: 'Plugins',
        section: 'Sistema y despliegue',
        description: 'Inventario de componentes detectados en el host.',
        Icon: Plug,
    },
    deploy: {
        label: 'Deployer',
        shortLabel: 'Deploy',
        section: 'Sistema y despliegue',
        description: 'Mantenimiento disponible y capacidades de despliegue.',
        Icon: Rocket,
    },
};

export function dashboardTabMeta(tab) {
    return DASHBOARD_TAB_META[normalizeDashboardTab(tab)] || DASHBOARD_TAB_META[DEFAULT_TAB];
}

export function dashboardNavSectionsForRole(role = 'viewer') {
    return DASHBOARD_NAV_SECTIONS
        .map(section => ({
            ...section,
            items: section.tabs
                .filter(tab => canAccessDashboardTab(tab, role))
                .map(tab => ({
                    id: tab,
                    ...dashboardTabMeta(tab),
                    requiredRole: TAB_ROLE_REQUIREMENTS[tab],
                })),
        }))
        .filter(section => section.items.length > 0);
}

export const RCON_COMMANDS = [
    'DestroyWildDinos', 'SaveWorld', 'Broadcast ',
    'KickPlayer ', 'BanPlayer ', 'UnbanPlayer ',
    'Slomo ', 'DoTame', 'ForceTame', 'GiveItemNum ',
    'ListPlayers', 'SetMessageOfTheDay ', 'ShowMessageOfTheDay',
    'SetTimeOfDay ', 'God', 'Fly', 'Walk', 'Ghost',
    'GiveEngrams', 'GiveColors ', 'ClearPlayerInventory ',
    'GetChat', 'ServerChat ', 'ServerChatTo ', 'ServerChatToPlayer ',
    'RenamePlayer ', 'RenameTribe ', 'TribeStructureAudit ',
    'GetPlayerIDForSteamID ', 'GetSteamIDForPlayerID '
];

export const PLAYER_COMMANDS = ['KickPlayer', 'BanPlayer', 'UnbanPlayer', 'ServerChatToPlayer', 'ServerChatTo', 'ClearPlayerInventory', 'RenamePlayer', 'GetPlayerIDForSteamID', 'GetSteamIDForPlayerID'];

export const QUICK_ACTIONS = [
    { label: 'Guardar mundo', cmd: 'SaveWorld', Icon: Save, color: 'green', group: 'maintenance' },
    {
        label: 'Limpiar dinos salvajes',
        cmd: 'DestroyWildDinos',
        Icon: Trash2,
        color: 'red',
        group: 'danger',
        confirm: true,
        riskLabel: 'Destructiva',
        expectedInput: 'DESTROY WILD DINOS',
        confirmTitle: 'Confirmar limpieza de dinos salvajes',
        confirmMessage: 'Este comando elimina todos los dinos salvajes del mapa objetivo. Puede afectar al gameplay inmediatamente.',
    },
    { label: 'Listar jugadores', cmd: 'ListPlayers', Icon: Users, color: 'blue', group: 'read' },
    { label: 'Leer chat', cmd: 'GetChat', Icon: MessageSquare, color: 'purple', group: 'read' },
    { label: 'Mostrar MOTD', cmd: 'ShowMessageOfTheDay', Icon: Megaphone, color: 'yellow', group: 'read' },
    {
        label: 'Tame forzado',
        cmd: 'ForceTame',
        Icon: Gamepad2,
        color: 'cyan',
        group: 'danger',
        confirm: true,
        riskLabel: 'Admin',
        expectedInput: 'FORCE TAME',
        confirmTitle: 'Confirmar ForceTame',
        confirmMessage: 'Este comando aplica tame forzado al objetivo actual del admin. Ejecutalo solo si estas seguro del contexto in-game.',
    },
];

export const ARK_ITEMS = {
    'Resources (Basic)': {
        'Wood': 'PrimalItemResource_Wood_C',
        'Stone': 'PrimalItemResource_Stone_C',
        'Flint': 'PrimalItemResource_Flint_C',
        'Thatch': 'PrimalItemResource_Thatch_C',
        'Hide': 'PrimalItemResource_Hide_C',
        'Fiber': 'PrimalItemResource_Fiber_C',
    },
    'Resources (Advanced)': {
        'Metal Ingot': 'PrimalItemResource_MetalIngot_C',
        'Crystal': 'PrimalItemResource_Crystal_C',
        'Obsidian': 'PrimalItemResource_Obsidian_C',
        'Polymer': 'PrimalItemResource_Polymer_C',
        'Organic Polymer': 'PrimalItemResource_Polymer_Organic_C',
        'Oil': 'PrimalItemResource_Oil_C',
        'Element': 'PrimalItemResource_Element_C',
        'Element Shard': 'PrimalItemResource_ElementShard_C',
        'Black Pearl': 'PrimalItemResource_BlackPearl_C',
        'Electronics': 'PrimalItemResource_Electronics_C',
        'Cementing Paste': 'PrimalItemResource_CementingPaste_C',
        'Gasoline': 'PrimalItemResource_Gasoline_C',
    },
    'Consumables': {
        'Cooked Meat': 'PrimalItemConsumable_CookedMeat_C',
        'Narcotic': 'PrimalItemConsumable_Narcotic_C',
        'Stimulant': 'PrimalItemConsumable_Stimulant_C',
        'Medical Brew': 'PrimalItemConsumable_MedBrew_C',
        'Energy Brew': 'PrimalItemConsumable_EnergyBrew_C',
        'Sweet Veggie Cake': 'PrimalItemConsumable_SweetVeggieCake_C',
    },
    'Ammo': {
        'Stone Arrow': 'PrimalItemAmmo_ArrowStone_C',
        'Tranq Arrow': 'PrimalItemAmmo_ArrowTranq_C',
        'Tranq Dart': 'PrimalItemAmmo_TranqDart_C',
        'Shocking Tranq Dart': 'PrimalItemAmmo_RefinedTranqDart_C',
        'Simple Bullet': 'PrimalItemAmmo_SimpleBullet_C',
        'Advanced Rifle Bullet': 'PrimalItemAmmo_AdvancedRifleBullet_C',
        'Advanced Sniper Bullet': 'PrimalItemAmmo_AdvancedSniperBullet_C',
        'C4 Charge': 'PrimalItemC4Ammo_C',
        'Rocket': 'PrimalItemAmmo_Rocket_C',
    },
    'Weapons': {
        'Pike': 'PrimalItemWeapon_Pike_C',
        'Sword': 'PrimalItemWeapon_Sword_C',
        'Crossbow': 'PrimalItemWeapon_Crossbow_C',
        'Compound Bow': 'PrimalItemWeapon_CompoundBow_C',
        'Fabricated Pistol': 'PrimalItemWeapon_MachinedPistol_C',
        'Pump-Action Shotgun': 'PrimalItemWeapon_MachinedShotgun_C',
        'Assault Rifle': 'PrimalItemWeapon_AssaultRifle_C',
        'Fabricated Sniper': 'PrimalItemWeapon_SniperRifle_Machined_C',
        'Tek Rifle': 'PrimalItemWeapon_TekRifle_C',
    },
    'Armor (Flak)': {
        'Flak Helmet': 'PrimalItemArmor_FlakHelmet_C',
        'Flak Chestpiece': 'PrimalItemArmor_FlakShirt_C',
        'Flak Leggings': 'PrimalItemArmor_FlakPants_C',
        'Flak Boots': 'PrimalItemArmor_FlakBoots_C',
        'Flak Gauntlets': 'PrimalItemArmor_FlakGloves_C',
    },
    'Armor (Tek)': {
        'Tek Helmet': 'PrimalItemArmor_TekHelmet_C',
        'Tek Chestpiece': 'PrimalItemArmor_TekShirt_C',
        'Tek Leggings': 'PrimalItemArmor_TekPants_C',
        'Tek Boots': 'PrimalItemArmor_TekBoots_C',
        'Tek Gauntlets': 'PrimalItemArmor_TekGloves_C',
    },
    'Structures (Defense)': {
        'Auto Turret': 'PrimalItemStructure_TurretAuto_C',
        'Heavy Auto Turret': 'PrimalItemStructure_HeavyTurret_C',
        'Tek Turret': 'PrimalItemStructure_TurretTek_C',
    }
};

export const SETTINGS_CATEGORY_ICONS = {
    'Multiplicadores': Wheat,
    'Crianza': Egg,
    'Mundo': Sun,
    'Combate': Swords,
    'Supervivencia': Beef,
    'Construcción': Box,
    'Dificultad y Dinos': Crown,
    'Reglas de Juego': Hash,
    'Comunicaciones': Volume2,
    'Tribus': Users,
    'Servidor': Server
};

export const SETTINGS_CATEGORIES = {
    'Multiplicadores': {
        HarvestAmountMultiplier: { label: 'Cantidad de Farmeo', max: 1000, file: 'gus' },
        TamingSpeedMultiplier: { label: 'Velocidad de Tameo', max: 1000, file: 'gus' },
        XPMultiplier: { label: 'Multiplicador de EXP', max: 1000, file: 'gus' },
        HarvestHealthMultiplier: { label: 'Vida de los Recursos', max: 10, file: 'gus' },
        ResourcesRespawnPeriodMultiplier: { label: 'Respawn de Recursos', max: 10, file: 'gus' },
    },
    'Crianza': {
        MatingIntervalMultiplier: { label: 'Intervalo de Apareamiento', max: 100, file: 'gi' },
        MatingSpeedMultiplier: { label: 'Velocidad de Apareamiento', max: 100, file: 'gi' },
        EggHatchSpeedMultiplier: { label: 'Velocidad de Incubación', max: 100, file: 'gi' },
        BabyMatureSpeedMultiplier: { label: 'Velocidad de Crecimiento', max: 100, file: 'gi' },
        BabyCuddleIntervalMultiplier: { label: 'Intervalo de Impronta', max: 100, file: 'gi' },
        BabyImprintAmountMultiplier: { label: 'Cantidad de Impronta', max: 100, file: 'gi' },
        BabyFoodConsumptionSpeedMultiplier: { label: 'Consumo de Comida (Bebés)', max: 100, file: 'gi' },
    },
    'Mundo': {
        DayTimeSpeedScale: { label: 'Velocidad del Día', max: 10, file: 'gus' },
        NightTimeSpeedScale: { label: 'Velocidad de la Noche', max: 10, file: 'gus' },
        DayCycleSpeedScale: { label: 'Velocidad del Ciclo 24h', max: 10, file: 'gus' },
        CropGrowthSpeedMultiplier: { label: 'Crecimiento de Cultivos', max: 100, file: 'gi' },
        HexagonRewardMultiplier: { label: 'Recompensa de Hexágonos', max: 100, file: 'gi' },
    },
    'Combate': {
        PlayerDamageMultiplier: { label: 'Daño del Jugador', max: 10, file: 'gus' },
        DinoDamageMultiplier: { label: 'Daño de los Dinos', max: 10, file: 'gus' },
        StructureDamageMultiplier: { label: 'Daño a Estructuras', max: 10, file: 'gus' },
        PlayerResistanceMultiplier: { label: 'Resistencia del Jugador', max: 10, file: 'gus' },
        DinoResistanceMultiplier: { label: 'Resistencia de los Dinos', max: 10, file: 'gus' },
        StructureResistanceMultiplier: { label: 'Resistencia de Estructuras', max: 10, file: 'gus' },
    },
    'Supervivencia': {
        PlayerCharacterFoodDrainMultiplier: { label: 'Consumo de Comida (Jugador)', max: 10, file: 'gus' },
        PlayerCharacterWaterDrainMultiplier: { label: 'Consumo de Agua (Jugador)', max: 10, file: 'gus' },
        PlayerCharacterStaminaDrainMultiplier: { label: 'Consumo de Energía (Jugador)', max: 10, file: 'gus' },
        PlayerCharacterHealthRecoveryMultiplier: { label: 'Regeneración Vida (Jugador)', max: 10, file: 'gus' },
        DinoCharacterFoodDrainMultiplier: { label: 'Consumo Comida (Dino)', max: 10, file: 'gus' },
        DinoCharacterStaminaDrainMultiplier: { label: 'Consumo Energía (Dino)', max: 10, file: 'gus' },
        DinoCharacterHealthRecoveryMultiplier: { label: 'Regeneración Vida (Dino)', max: 10, file: 'gus' },
        PreventDiseases: { label: 'Prevenir Enfermedades', isBoolean: true, max: 1, file: 'gi' },
        NonPermanentDiseases: { label: 'Enfermedades No Permanentes', isBoolean: true, max: 1, file: 'gi' },
    },
    'Construcción': {
        bDisableStructurePlacementCollision: { label: 'Desactivar Colisiones', isBoolean: true, max: 1, file: 'gus' },
        AllowCaveBuildingPvE: { label: 'Construir en Cuevas', isBoolean: true, max: 1, file: 'gus' },
        PvEAllowBuildingAtSupplyDrops: { label: 'Construir en Drops', isBoolean: true, max: 1, file: 'gus' },
        EnableExtraStructurePreventionVolumes: { label: 'Prevenir Zonas de Misión', isBoolean: true, max: 1, file: 'gus' },
        PerPlatformMaxStructuresMultiplier: { label: 'Límite Estructuras en Plataforma', max: 100, file: 'gus' },
        bAllowPlatformSaddleMultiFloors: { label: 'Múltiples Pisos Plataformas', isBoolean: true, max: 1, file: 'gi' },
        TheMaxStructuresInRange: { label: 'Máx. Estructuras en el Área', max: 10000, file: 'gus' },
        OverrideStructurePlatformPrevention: { label: 'Torretas en Plataformas', isBoolean: true, max: 1, file: 'gi' },
        AutoDestroyOldStructuresMultiplier: { label: 'Destrucción de Antiguas (Auto)', max: 10, file: 'gus' },
    },
    'Dificultad y Dinos': {
        DifficultyOffset: { label: 'Difficulty Offset', max: 5, file: 'gus' },
        OverrideOfficialDifficulty: { label: 'Override Official Difficulty', max: 20, file: 'gus' },
        DinoCountMultiplier: { label: 'Cant. de Dinos Salvajes', max: 10, file: 'gus' },
        MaxTamedDinos: { label: 'Límite Dinos del Servidor', max: 10000, file: 'gus' },
        MaxPersonalTamedDinos: { label: 'Límite Dinos por Tribu', max: 10000, file: 'gus' },
        bAutoDestroyDecayedDinos: { label: 'Limpiar Dinos Abandonados', isBoolean: true, max: 1, file: 'gi' },
    },
    'Reglas de Juego': {
        ShowMapPlayerLocation: { label: 'Ubicación en el Mapa', isBoolean: true, max: 1, file: 'gus' },
        AllowThirdPersonPlayer: { label: 'Permitir 3ª Persona', isBoolean: true, max: 1, file: 'gus' },
        EnableCrosshair: { label: 'Activar Cruceta', isBoolean: true, max: 1, file: 'gus' },
        AllowFlyerCarryPvE: { label: 'Agarrar Salvajes PvE', isBoolean: true, max: 1, file: 'gus' },
        bAllowFlyerSpeedLeveling: { label: 'Velocidad en Voladores', isBoolean: true, max: 1, file: 'gi' },
        DisablePvEGamma: { label: 'Desactivar Gamma PvE', isBoolean: true, max: 1, file: 'gus' },
        EnablePvPGamma: { label: 'Activar Gamma PvP', isBoolean: true, max: 1, file: 'gus' },
        PreventOfflinePvP: { label: 'Protección Offline - ORP', isBoolean: true, max: 1, file: 'gus' },
        bDisableFriendlyFire: { label: 'Desactivar Fuego Amigo', isBoolean: true, max: 1, file: 'gus' },
    },
    'Comunicaciones': {
        GlobalVoiceChat: { label: 'Chat de Voz Global', isBoolean: true, max: 1, file: 'gus' },
        ProximityChat: { label: 'Chat de Proximidad', isBoolean: true, max: 1, file: 'gus' },
        AlwaysNotifyPlayerJoined: { label: 'Avisar Conexiones', isBoolean: true, max: 1, file: 'gus' },
        AlwaysNotifyPlayerLeft: { label: 'Avisar Desconexiones', isBoolean: true, max: 1, file: 'gus' },
    },
    'Tribus': {
        MaxNumberOfPlayersInTribe: { label: 'Límite Jugadores por Tribu', max: 100, file: 'gi' },
    },
    'Servidor': {
        bAllowUnlimitedRespecs: { label: 'Reseteo Infinito Engramas', isBoolean: true, max: 1, file: 'gi' },
        AutoSavePeriodMinutes: { label: 'Autoguardado (mins)', max: 120, file: 'gus' },
        NoTributeDownloads: { label: 'Bloquear Descargas General', isBoolean: true, max: 1, file: 'gus' },
        PreventDownloadSurvivors: { label: 'Bloquear Traer Personajes', isBoolean: true, max: 1, file: 'gus' },
        PreventDownloadItems: { label: 'Bloquear Traer Objetos', isBoolean: true, max: 1, file: 'gus' },
        PreventDownloadDinos: { label: 'Bloquear Traer Dinos', isBoolean: true, max: 1, file: 'gus' },
    }
};

export const AUDIT_ACTION_META = {
    LOGIN:              { Icon: Key,        color: 'text-blue-400',   bg: 'bg-blue-500/10' },
    LOGIN_FAILED:       { Icon: ShieldAlert,color: 'text-red-400',    bg: 'bg-red-500/10' },
    RCON_COMMAND:       { Icon: Terminal,    color: 'text-cyan-400',   bg: 'bg-cyan-500/10' },
    PLAYER_KICK:        { Icon: UserMinus,   color: 'text-orange-400', bg: 'bg-orange-500/10' },
    PLAYER_BAN:         { Icon: Ban,         color: 'text-red-400',    bg: 'bg-red-500/10' },
    PLAYER_UNBAN:       { Icon: CheckCircle, color: 'text-green-400',  bg: 'bg-green-500/10' },
    PLAYER_MESSAGE:     { Icon: MessageSquare,color:'text-purple-400', bg: 'bg-purple-500/10' },
    PLAYER_MAKE_ADMIN:  { Icon: Crown,       color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    PLAYER_REMOVE_ADMIN:{ Icon: ShieldOff,   color: 'text-red-400',    bg: 'bg-red-500/10' },
    BROADCAST:          { Icon: Megaphone,   color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    SERVER_ACTION:      { Icon: Zap,         color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    ADMIN_CREATED:      { Icon: UserPlus,    color: 'text-green-400',  bg: 'bg-green-500/10' },
    ADMIN_DELETED:      { Icon: Trash2,      color: 'text-red-400',    bg: 'bg-red-500/10' },
    CONFIG_CHANGE:      { Icon: Settings,    color: 'text-gray-400',   bg: 'bg-gray-500/10' },
    CONFIG_EDIT:        { Icon: FileEdit,    color: 'text-gray-400',   bg: 'bg-gray-500/10' },
    FILE_EDIT:          { Icon: FileText,    color: 'text-gray-400',   bg: 'bg-gray-500/10' },
    LOOT_CRATE:         { Icon: Package,     color: 'text-purple-400', bg: 'bg-purple-500/10' },
};
