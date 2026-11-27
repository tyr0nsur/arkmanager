import {useEffect} from "react";
import { FaDiscord } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
export enum LogoutReasonHash { NONE='',EXPIRED='#expired',LOGOUT='#logout',UPDATED='#updated',SHUTDOWN='#shutdown' }
export default function Login(){
 const unavailable=window.txConsts.arkCluster?.backendAvailable===false;
 useEffect(()=>{if(!unavailable)return;const timer=setTimeout(()=>location.reload(),10000);return()=>clearTimeout(timer);},[unavailable]);
 const query=new URLSearchParams(location.search);const error=query.has('sso_error')||(query.get('r')||'').includes('sso_error=');
 return <div className="w-full px-6 py-8 text-center"><h1 className="text-xl font-semibold">Accede a ObeliskPanel</h1>{unavailable&&<p role="status" className="mt-4 text-sm text-warning-inline">El servicio de administración está reiniciándose. Volveremos a comprobarlo automáticamente.</p>}<p className="mt-3 text-sm text-muted-foreground">Gestiona tus mapas y recursos de ARK desde el clúster.</p>{error&&<p role="alert" className="mt-4 text-sm text-destructive-inline">No se ha completado el acceso. Utiliza una cuenta de Discord autorizada por un propietario.</p>}<Button asChild className="mt-7 w-full gap-3" size="lg"><a href="/api/auth/oidc/start"><FaDiscord className="size-5"/>Acceder con Discord</a></Button><p className="mt-5 text-xs leading-relaxed text-muted-foreground">Tu cuenta se vincula automáticamente al entrar.<br/>Un propietario debe autorizar tu ID de Discord.</p></div>;
}
