import Login from '../pages/auth/Login';
import { Card } from '@/components/ui/card';
import { LogoFullSquareGreen } from '@/components/Logos';
export default function AuthShell(){return <div className="min-h-screen flex items-center justify-center pattern-dots px-4"><div className="w-full max-w-[25rem]"><LogoFullSquareGreen className="h-16 mx-auto"/><Card className="mt-8 mb-5 flex items-center justify-center bg-card/40"><Login/></Card><p className="text-center text-xs text-muted-foreground">ObeliskNative · Adaptación de txAdmin para ARK</p></div></div>;}
