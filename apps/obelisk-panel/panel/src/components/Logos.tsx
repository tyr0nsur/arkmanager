// Obelisk branding for the ARK port. txAdmin's code license is retained in LICENSE.
import type { CSSProperties } from 'react';
type LogoProps={className?:string;style?:CSSProperties};
export function LogoSquareGreen({className,style}:LogoProps){return <svg className={className} style={style} viewBox="0 0 48 56" role="img" aria-label="ObeliskNative"><path fill="currentColor" d="M24 2 39 13 42 43 24 54 6 43 9 13Zm0 7-8 9-2 21 10 7 10-7-2-21Z"/><path fill="currentColor" opacity=".45" d="M24 17 29 23 30 35 24 39 18 35 19 23Z"/></svg>;}
export function LogoFullSquareGreen({className,style}:LogoProps){return <div className={`flex items-center justify-center gap-3 text-primary ${className||''}`} style={style}><LogoSquareGreen className="h-full max-h-14 w-10 shrink-0"/><span className="text-2xl font-bold tracking-tight text-foreground">Obelisk<span className="text-primary">Panel</span></span></div>;}
export const LogoFullSolidThin=LogoFullSquareGreen;
