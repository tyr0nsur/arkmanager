import { motion } from 'framer-motion';
import { useState } from 'react';
import { AlertTriangle, Check, Crown, Pencil, RefreshCw, ShieldAlert, Trash2, UserPlus, Users, X } from 'lucide-react';
import { useDashboard } from '../context/DashboardContext.jsx';
import { ADMIN_USERNAME_HELP, isValidAdminUsername } from '../constants/adminValidation';
import { ROLE_OPTIONS, roleInfo } from '../constants/roles';
import { PERMISSION_OPTIONS, ROLE_PERMISSION_DEFAULTS, normalizePermissionOverrides } from '../constants/permissions';

export function AdminsView() {
  const { user, admins, adminsLoading, adminsLoaded, adminsError, adminActionLoading, newAdmin, setNewAdmin, addAdmin, updateAdmin, deleteAdmin, fetchAdmins, setModal } = useDashboard();
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ username: '', role: 'operator', permissions: { allow: [], deny: [] } });
  const isInitialAdminsLoading = adminsLoading && admins.length === 0 && !adminsError;
  const adminsReadyForMutation = adminsLoaded && !adminsLoading && !adminsError;
  const ownerCount = admins.filter(admin => (admin.role || 'owner') === 'owner').length;
  const currentUsername = String(user || '').toLowerCase();
  const newAdminUsername = newAdmin.username.trim();
  const newUsernameExists = admins.some(admin => String(admin.username || '').toLowerCase() === newAdminUsername.toLowerCase());
  const canSubmitNewAdmin = adminsReadyForMutation && isValidAdminUsername(newAdminUsername) && /^[0-9]{17,20}$/.test(newAdmin.discordId) && !newUsernameExists && !admins.some(admin => admin.discordId === newAdmin.discordId) && !adminActionLoading;
  const selectedNewRole = roleInfo(newAdmin.role || 'operator');
  const operatorCount = admins.filter(admin => (admin.role || 'owner') === 'operator').length;
  const viewerCount = admins.filter(admin => (admin.role || 'owner') === 'viewer').length;
  const renderAdminCount = count => (isInitialAdminsLoading ? '...' : count);

  const startEdit = (admin) => {
    setEditingId(admin.id);
    setEditForm({ username: admin.username, role: admin.role || 'owner', permissions: normalizePermissionOverrides(admin.permissions) });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ username: '', role: 'operator', permissions: { allow: [], deny: [] } });
  };

  const permissionState = (permissions, permission) => {
    const normalized = normalizePermissionOverrides(permissions);
    if (normalized.allow.includes(permission)) return 'allow';
    if (normalized.deny.includes(permission)) return 'deny';
    return 'inherit';
  };

  const cyclePermission = (permission) => {
    setEditForm(current => {
      const normalized = normalizePermissionOverrides(current.permissions);
      const state = permissionState(normalized, permission);
      const withoutPermission = {
        allow: normalized.allow.filter(item => item !== permission),
        deny: normalized.deny.filter(item => item !== permission),
      };
      if (state === 'inherit') return { ...current, permissions: { ...withoutPermission, allow: [...withoutPermission.allow, permission].sort() } };
      if (state === 'allow') return { ...current, permissions: { ...withoutPermission, deny: [...withoutPermission.deny, permission].sort() } };
      return { ...current, permissions: withoutPermission };
    });
  };

  const openAdminRoleConfirmation = ({ title, message, expectedInput, confirmText, onConfirm }) => {
    setModal({
      type: 'danger',
      title,
      message,
      Icon: AlertTriangle,
      color: 'amber',
      hasInput: true,
      inputLabel: `Escribe ${expectedInput}`,
      expectedInput,
      confirmText,
      onConfirm: async () => {
        await onConfirm();
        setModal(null);
      },
    });
  };

  const handleAddAdminClick = () => {
    const username = newAdmin.username.trim();
    if ((newAdmin.role || 'operator') !== 'owner') {
      addAdmin();
      return;
    }

    openAdminRoleConfirmation({
      title: 'Crear owner del panel',
      message: `Vas a crear ${username} con rol owner. Este rol puede gestionar secretos, cuentas, plugins, despliegue y acciones destructivas del clúster.`,
      expectedInput: `OWNER ${username}`,
      confirmText: 'Crear owner',
      onConfirm: () => addAdmin(`OWNER ${username}`),
    });
  };

  const saveEdit = async (admin) => {
    if (!isValidAdminUsername(editForm.username)) return;
    const currentRole = admin.role || 'owner';
    const nextRole = editForm.role || 'operator';
    if (currentRole === 'owner' && nextRole !== 'owner' && ownerCount <= 1) return;
    const updates = {};
    if (editForm.username.trim() !== admin.username) updates.username = editForm.username.trim();
    if (nextRole !== currentRole) updates.role = editForm.role;
    if (JSON.stringify(normalizePermissionOverrides(editForm.permissions)) !== JSON.stringify(normalizePermissionOverrides(admin.permissions))) {
      updates.permissions = normalizePermissionOverrides(editForm.permissions);
    }
    if (Object.keys(updates).length === 0) {
      cancelEdit();
      return;
    }

    if (updates.role) {
      const targetUsername = editForm.username.trim() || admin.username;
      openAdminRoleConfirmation({
        title: updates.role === 'owner' ? 'Promover a owner' : (currentRole === 'owner' ? 'Cambiar rol de owner' : 'Cambiar rol'),
        message: `${admin.username} pasará de ${roleInfo(currentRole).label} a ${roleInfo(nextRole).label}. Este cambio invalida sesiones del usuario y afecta sus permisos operativos.`,
        expectedInput: `ROL ${targetUsername}`,
        confirmText: 'Guardar rol',
        onConfirm: async () => {
          const ok = await updateAdmin(admin.id, updates, `ROL ${targetUsername}`);
          if (ok) cancelEdit();
        },
      });
      return;
    }

    const ok = await updateAdmin(admin.id, updates);
    if (ok) cancelEdit();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-4 overflow-hidden"
    >
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto custom-scrollbar md:overflow-hidden">
                <div className="shrink-0">
                    <h2 className="text-2xl font-bold">Administradores del Panel</h2>
                    <p className="text-sm text-zinc-500 mt-1">Autoriza cuentas de Discord, asigna roles y revoca el acceso al panel.</p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:shrink-0">
                    <div className="dashboard-card rounded-lg border border-zinc-800 bg-[#18181b] p-4">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500"><Crown size={14} className="text-amber-300" /> Owners</div>
                        <p className="mt-2 text-2xl font-bold text-white">{renderAdminCount(ownerCount)}</p>
                    </div>
                    <div className="dashboard-card rounded-lg border border-zinc-800 bg-[#18181b] p-4">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500"><ShieldAlert size={14} className="text-cyan-300" /> Operadores</div>
                        <p className="mt-2 text-2xl font-bold text-white">{renderAdminCount(operatorCount)}</p>
                    </div>
                    <div className="dashboard-card rounded-lg border border-zinc-800 bg-[#18181b] p-4">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500"><Users size={14} className="text-zinc-300" /> Lectura</div>
                        <p className="mt-2 text-2xl font-bold text-white">{renderAdminCount(viewerCount)}</p>
                    </div>
                </div>

                <div className="dashboard-card rounded-lg border border-zinc-800 bg-[#18181b] p-4 sm:p-5 md:shrink-0">
                    <p className="mb-3 text-xs leading-5 text-zinc-500">Copia el ID de usuario con el modo desarrollador de Discord. La cuenta quedará preparada y se vinculará al primer acceso.</p>
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><UserPlus size={14} className="text-indigo-400" /> Autorizar administrador con Discord</h3>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_170px_auto]">
		                        <label htmlFor="new-admin-username" className="sr-only">Alias del nuevo administrador</label>
		                        <input
                                    id="new-admin-username"
		                            type="text" placeholder="Alias (3-32 caracteres)" value={newAdmin.username}
		                            onChange={e => setNewAdmin({...newAdmin, username: e.target.value})}
	                            disabled={adminActionLoading}
	                            pattern="[A-Za-z0-9_.-]{3,32}"
	                            title={ADMIN_USERNAME_HELP}
	                            className="bg-[#09090b] border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
	                        />
		                        <label htmlFor="new-admin-discord" className="sr-only">ID de usuario de Discord</label>
		                        <input
                                    id="new-admin-discord"
		                            type="text" inputMode="numeric" placeholder="ID de Discord (17-20 dígitos)" value={newAdmin.discordId}
	                            onChange={e => setNewAdmin({...newAdmin, discordId: e.target.value})}
	                            autoComplete="off"
	                            maxLength={20}
	                            disabled={adminActionLoading}
	                            title="Discord: Ajustes → Avanzado → Modo desarrollador. Copia el ID del usuario."
	                            className="bg-[#09090b] border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
	                        />
		                        <label htmlFor="new-admin-role" className="sr-only">Rol del nuevo administrador</label>
		                        <select
                                    id="new-admin-role"
		                            value={newAdmin.role || 'operator'}
	                            onChange={e => setNewAdmin({...newAdmin, role: e.target.value})}
	                            disabled={adminActionLoading}
	                            className="bg-[#09090b] border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
	                        >
                            {ROLE_OPTIONS.map(role => (
                                <option key={role.value} value={role.value}>{role.label}</option>
                            ))}
                        </select>
		                        <button
                                    type="button"
		                            onClick={handleAddAdminClick}
		                            disabled={!canSubmitNewAdmin}
                                    title={!adminsReadyForMutation ? 'Espera a que cargue la lista de administradores' : 'Añadir administrador'}
		                            className="flex min-h-11 items-center justify-center rounded-lg bg-indigo-500 px-5 text-sm font-medium transition-colors hover:bg-[#4f7aff] disabled:cursor-not-allowed disabled:opacity-45"
		                        >
		                            {adminActionLoading ? 'Guardando...' : 'Añadir'}
		                        </button>
		                        {newUsernameExists && (
		                            <p className="lg:col-span-4 text-[11px] text-amber-300">Ese usuario ya existe.</p>
		                        )}
                            <p className="lg:col-span-4 text-[11px] text-zinc-500">
	                                {!adminsReadyForMutation ? 'Cargando inventario antes de permitir altas.' : <>Rol seleccionado: <span className="font-medium text-zinc-300">{selectedNewRole.label}</span>. {selectedNewRole.description}</>}
	                            </p>
	                    </div>
                </div>

                {adminsError && (
                    <div className="mb-5 flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-2">
                            <ShieldAlert size={16} className="shrink-0 text-amber-300" />
                            <span className="break-words">{adminsError}</span>
                        </div>
                        <button onClick={fetchAdmins} disabled={adminsLoading} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-amber-400/30 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-50">
                            <RefreshCw size={13} className={adminsLoading ? 'animate-spin' : ''} />
                            {adminsLoading ? 'Reintentando...' : 'Reintentar'}
                        </button>
                    </div>
                )}

                <div className="dashboard-card rounded-lg border border-zinc-800 bg-[#18181b] md:min-h-0 md:flex-1 md:overflow-y-auto md:custom-scrollbar">
                    {isInitialAdminsLoading && (
                        <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 py-10 text-center text-zinc-500">
                            <RefreshCw size={22} className="animate-spin text-indigo-400" />
                            <div>
                                <p className="text-sm font-medium text-zinc-400">Cargando administradores...</p>
                                <p className="mt-1 text-xs text-zinc-600">Los contadores y acciones se habilitarán cuando el backend devuelva el inventario actual.</p>
                            </div>
                        </div>
                    )}
                    {admins.length > 0 && (
                    <>
		                    {admins.map(admin => {
	                        const isEditing = editingId === admin.id;
                            const adminRole = roleInfo(admin.role || 'owner');
                            const editingRole = roleInfo(editForm.role);
	                        const isFinalOwner = (admin.role || 'owner') === 'owner' && ownerCount <= 1;
	                        const isCurrentUser = String(admin.username || '').toLowerCase() === currentUsername;
		                        const deleteDisabled = isFinalOwner || isCurrentUser || adminActionLoading;
			                        const editUsernameValid = isValidAdminUsername(editForm.username);
			                        const editUsernameExists = admins.some(other => String(other.id) !== String(admin.id) && String(other.username || '').toLowerCase() === editForm.username.trim().toLowerCase());
                                    const wouldDowngradeLastOwner = isFinalOwner && (editForm.role || 'operator') !== 'owner';
			                        const canSaveEdit = editUsernameValid && !editUsernameExists && !wouldDowngradeLastOwner && !adminActionLoading;
		                        const deleteTitle = isFinalOwner
	                            ? 'No se puede borrar el último owner'
	                            : (isCurrentUser ? 'No puedes borrar tu propia cuenta' : 'Borrar');
	                        return (
		                        <div key={admin.id} className="border-b border-zinc-800/50 px-4 py-3.5 transition-colors hover:bg-[#27272a] sm:px-5">
	                            {!isEditing ? (
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/[0.08] text-xs font-bold text-indigo-400">{admin.username[0].toUpperCase()}</div>
	                                        <div className="min-w-0">
	                                            <span className="block truncate text-sm">{admin.username}</span>
	                                            <span className="text-[10px] uppercase tracking-wider text-zinc-500">{adminRole.label}{isCurrentUser ? ' · Tú' : ''}</span>
                                                <span className="block truncate text-[11px] text-zinc-600">{adminRole.description}</span>
                                                <span className="block break-all text-xs text-zinc-400">Discord: {admin.discordId || 'Sin vincular'}</span>
                                                <span className="block text-xs text-zinc-500">{admin.status === 'active' ? 'Cuenta vinculada' : admin.status === 'invited' ? 'Pendiente del primer acceso' : 'Sin acceso por Discord'}</span>
	                                        </div>
	                                    </div>
	                                    <div className="flex flex-wrap gap-2 sm:justify-end">
	                                        <button onClick={() => startEdit(admin)} disabled={adminActionLoading} className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-cyan-300 transition-colors hover:bg-cyan-500/10 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-45">
                                            <Pencil size={12} /> Editar
                                        </button>
	                                        <button
	                                            onClick={() => deleteAdmin(admin)}
	                                            disabled={deleteDisabled}
	                                            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-45"
	                                            title={deleteTitle}
	                                        >
	                                            <Trash2 size={12} /> Borrar
	                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_160px_1fr_auto]">
                                    <input
	                                        type="text"
	                                        value={editForm.username}
		                                        onChange={e => setEditForm({...editForm, username: e.target.value})}
		                                        disabled={adminActionLoading}
		                                        pattern="[A-Za-z0-9_.-]{3,32}"
		                                        title={ADMIN_USERNAME_HELP}
			                                        className="bg-[#09090b] border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
	                                        aria-label={`Editar usuario ${admin.username}`}
	                                    />
	                                    {editUsernameExists && (
	                                        <p className="text-[11px] text-amber-300 lg:col-span-4">Ese usuario ya existe.</p>
	                                    )}
		                                    <select
	                                        value={editForm.role}
	                                        onChange={e => setEditForm({...editForm, role: e.target.value})}
	                                        disabled={isCurrentUser || adminActionLoading}
	                                        className="bg-[#09090b] border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
	                                        aria-label={`Editar rol ${admin.username}`}
	                                        title={isCurrentUser ? 'No puedes cambiar tu propio rol' : 'Editar rol'}
	                                    >
                                        {ROLE_OPTIONS.map(role => (
                                            <option key={role.value} value={role.value}>{role.label}</option>
                                        ))}
                                    </select>
                                    <div className="grid grid-cols-2 gap-2 lg:flex">
		                                        <button onClick={() => saveEdit(admin)} disabled={!canSaveEdit} className="flex items-center justify-center gap-1.5 rounded-lg bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-45">
	                                            <Check size={14} /> {adminActionLoading ? 'Guardando...' : 'Guardar'}
                                        </button>
                                        <button onClick={cancelEdit} className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white">
                                            <X size={14} /> Cancelar
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-zinc-500 lg:col-span-4">
                                        Rol editado: <span className="font-medium text-zinc-300">{editingRole.label}</span>. {editingRole.description}
                                    </p>
                                    <div className="rounded-lg border border-zinc-800 bg-[#09090b] p-3 lg:col-span-4">
                                        <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Permisos por usuario</p>
                                            <p className="text-[11px] text-zinc-600">Click: heredado {'->'} concedido {'->'} denegado</p>
                                        </div>
                                        <div className="grid gap-2 md:grid-cols-2">
                                            {PERMISSION_OPTIONS.map(permission => {
                                                const state = permissionState(editForm.permissions, permission.value);
                                                const inherited = (ROLE_PERMISSION_DEFAULTS[editForm.role] || []).includes(permission.value);
                                                const stateLabel = state === 'allow' ? 'Concedido' : state === 'deny' ? 'Denegado' : (inherited ? 'Heredado: sí' : 'Heredado: no');
                                                return (
                                                    <button
                                                        key={permission.value}
                                                        type="button"
                                                        onClick={() => cyclePermission(permission.value)}
                                                        disabled={isCurrentUser || adminActionLoading}
                                                        className={`rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${state === 'allow' ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100' : state === 'deny' ? 'border-red-500/30 bg-red-500/10 text-red-100' : 'border-zinc-800 bg-[#18181b] text-zinc-300'}`}
                                                    >
                                                        <span className="block text-xs font-semibold">{permission.label}</span>
                                                        <span className="mt-0.5 block text-[11px] text-zinc-500">{permission.description}</span>
                                                        <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider">{stateLabel}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    {wouldDowngradeLastOwner && (
                                        <p className="flex items-start gap-1.5 text-[11px] text-amber-300 lg:col-span-4">
                                            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                                            <span>No puedes degradar al último owner del panel.</span>
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )})}
                    </>
                    )}
                    {admins.length === 0 && adminsLoaded && !adminsError && !adminsLoading && <div className="p-6 text-center text-zinc-600 italic text-xs">No hay administradores</div>}
                </div>
                </div>
		    </motion.div>
  );
}
