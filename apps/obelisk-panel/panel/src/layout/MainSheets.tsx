import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ServerSidebar } from "./ServerSidebar/ServerSidebar";
import { useGlobalMenuSheet, usePlayerlistSheet, useServerSheet } from "@/hooks/sheets";
import { MenuNavLink, NavLink } from "@/components/MainPageLink";
import { ClipboardCheckIcon, DoorOpenIcon, ListIcon, PieChartIcon, ScrollIcon, SettingsIcon, UserSquare2Icon, UsersIcon, ZapIcon } from 'lucide-react';
import { PlayerlistSidebar } from "./PlayerlistSidebar/PlayerlistSidebar";
import { useAdminPerms } from "@/hooks/auth";
import { LogoFullSquareGreen } from "@/components/Logos";


export function GlobalMenuSheet() {
    const { isSheetOpen, setIsSheetOpen } = useGlobalMenuSheet();
    const { hasPerm } = useAdminPerms();

    return (
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetContent
                side='left'
                className="p-0 flex flex-col gap-0 w-full xs:w-3/4 select-none"
            >
                <ScrollArea className="h-full px-6 [&_svg]:shrink-0">
                    <SheetHeader>
                        <SheetTitle className="py-6">
                            <NavLink href="/">
                                <LogoFullSquareGreen className="h-9 hover:scale-105 hover:brightness-110" />
                            </NavLink>
                        </SheetTitle>
                    </SheetHeader>

                    <div className="mb-4">
                        <h2 className="mb-1.5 text-lg font-semibold tracking-tight">
                            Menú del clúster
                        </h2>
                        <div className="flex flex-wrap flex-row xs:grid grid-cols-2 gap-4">
                            <MenuNavLink href="/cluster"><ListIcon className="mr-2 h-4 w-4"/>Clúster</MenuNavLink>
                            <MenuNavLink href="/hub" disabled={!hasPerm('resources.view')}>Hub de recursos</MenuNavLink>
                            <MenuNavLink href="/players" disabled={!hasPerm('players.view')}>
                                <UsersIcon className="mr-2 h-4 w-4" />Jugadores
                            </MenuNavLink>
                            <MenuNavLink href="/history">
                                <ScrollIcon className="mr-2 h-4 w-4" />Historial
                            </MenuNavLink>
                            <MenuNavLink href="/insights/player-drops">
                                <DoorOpenIcon className="mr-2 h-4 w-4" />Actividad
                            </MenuNavLink>
                            <MenuNavLink href="/allowlist">
                                <ClipboardCheckIcon className="mr-2 h-4 w-4" />Baneos
                            </MenuNavLink>
                            <MenuNavLink href="/admins" disabled={!hasPerm('manage.admins')}>
                                <UserSquare2Icon className="mr-2 h-4 w-4" />Admins
                            </MenuNavLink>
                            <MenuNavLink href="/settings" disabled={!hasPerm('settings.view')}>
                                <SettingsIcon className="mr-2 h-4 w-4" />Ajustes
                            </MenuNavLink>
                        </div>
                    </div>
                    <div className="mb-4">
                        <h2 className="mb-1.5 text-lg font-semibold tracking-tight">
                            Sistema
                        </h2>
                        <div className="flex flex-wrap flex-row xs:grid grid-cols-2 gap-4">
                            <MenuNavLink href="/tasks">
                                <ZapIcon className="mr-2 h-4 w-4" />Programación
                            </MenuNavLink>
                            <MenuNavLink href="/system/diagnostics">
                                <PieChartIcon className="mr-2 h-4 w-4" />Diagnóstico
                            </MenuNavLink>
                            <MenuNavLink href="/system/console-log" disabled={!hasPerm('txadmin.log.view')}>
                                <ListIcon className="mr-2 h-4 w-4" />Registro del juego
                            </MenuNavLink>
                            <MenuNavLink href="/system/action-log" disabled={!hasPerm('txadmin.log.view')}>
                                <ListIcon className="mr-2 h-4 w-4" />Auditoría
                            </MenuNavLink>
                        </div>
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}

export function ServerSidebarSheet() {
    const { isSheetOpen, setIsSheetOpen } = useServerSheet();
    return (
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetContent
                side='left'
                className="w-full xs:w-3/4 p-0"
            >
                <SheetHeader className="sr-only"><SheetTitle>Mapa del clúster y controles</SheetTitle></SheetHeader>
                <ScrollArea className="h-full">
                    <ServerSidebar isSheet />
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}

export function PlayersSidebarSheet() {
    const { isSheetOpen, setIsSheetOpen } = usePlayerlistSheet();
    return (
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetContent
                side='right'
                className="w-full xs:w-3/4 p-0"
            >
                <SheetHeader className="sr-only"><SheetTitle>Actividad de jugadores del clúster</SheetTitle></SheetHeader>
                <ScrollArea className="h-full">
                    <PlayerlistSidebar isSheet />
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}

export default function MainSheets() {
    return <>
        <GlobalMenuSheet />
        <ServerSidebarSheet />
        <PlayersSidebarSheet />
    </>;
}
