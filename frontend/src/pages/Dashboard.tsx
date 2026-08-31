import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Shell from '../components/Shell';
import ChatPanel from '../components/ChatPanel';
import CatalogsPanel from '../components/CatalogsPanel';
import { AuditPanel, OverviewPanel, UsersPanel } from '../components/AdminPanels';
import AdminFeedbackPanel from '../components/AdminFeedbackPanel';
import QualityPanel from '../components/QualityPanel';
import HomePanel from '../components/HomePanel';
import PartSearchPanel from '../components/PartSearchPanel';
import { FavoritesPanel, HistoryPanel } from '../components/SavedItemsPanels';
import { apiJson, clearSession, getToken, SESSION_EXPIRED_EVENT } from '../lib';
import type { Section, SessionUser } from '../types';

export default function Dashboard(){
 const navigate=useNavigate();
 const [user,setUser]=useState<SessionUser|null>(null);
 const [section,setSection]=useState<Section>('home');
 const [globalQuery,setGlobalQuery]=useState('');
 const [searchVersion,setSearchVersion]=useState(0);
 const [error,setError]=useState('');

 useEffect(()=>{
   let active=true;
   if(!getToken()){navigate('/login',{replace:true});return;}
   void apiJson<{user:SessionUser}>('/api/me')
     .then(data=>{if(active){setUser(data.user);setSection('home')}})
     .catch(e=>{if(active){setError(e instanceof Error?e.message:'Sessão inválida');clearSession();navigate('/login',{replace:true})}});
   return()=>{active=false};
 },[navigate]);

 useEffect(()=>{
   const expired=()=>navigate('/login',{replace:true});
   window.addEventListener(SESSION_EXPIRED_EVENT,expired);
   return()=>window.removeEventListener(SESSION_EXPIRED_EVENT,expired);
 },[navigate]);
 const logout=()=>{clearSession();navigate('/login')};
 const search=(query:string)=>{
   setGlobalQuery(query);
   setSearchVersion(version=>version+1);
   setSection('parts');
 };

 if(error)return <main className="grid min-h-screen place-items-center bg-[#f4f7fb] p-6"><div role="alert" className="max-w-md rounded-[22px] border border-rose-200 bg-white p-6 text-center shadow-xl shadow-slate-900/5"><div className="text-sm font-semibold text-rose-700">Não foi possível abrir o CogniVault</div><p className="mt-2 text-xs leading-5 text-slate-500">{error}</p></div></main>;
 if(!user)return <main className="grid min-h-screen place-items-center bg-[#f4f7fb] p-6"><div className="text-center"><img src="/vardao-logo-transparent.png" alt="Vardão Máquinas" className="mx-auto w-40"/><div className="mx-auto mt-6 h-1 w-28 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-1/2 animate-pulse rounded-full bg-[#1d4f91]"/></div><p className="mt-3 text-xs font-medium text-slate-400">Preparando sua área de trabalho…</p></div></main>;

 return <Shell user={user} section={section} onSection={setSection} onLogout={logout} onSearch={search}>
   {section==='home'&&<HomePanel onSearch={search} onCatalogs={()=>setSection('catalogs')}/>}
   {section==='overview'&&user.role==='ADMIN'&&<OverviewPanel/>}
   {section==='assistant'&&<ChatPanel storageScope={user.id}/>}
   {section==='parts'&&<PartSearchPanel key={`${searchVersion}:${globalQuery||'empty-search'}`} initialQuery={globalQuery} onQueryChange={setGlobalQuery} admin={user.role==='ADMIN'}/>}
   {section==='catalogs'&&<CatalogsPanel admin={user.role==='ADMIN'} onQuality={user.role==='ADMIN'?()=>setSection('quality'):undefined}/>}
   {section==='history'&&<HistoryPanel onSearch={search}/>} 
   {section==='favorites'&&<FavoritesPanel onSearch={search}/>} 
   {section==='users'&&user.role==='ADMIN'&&<UsersPanel/>}
   {section==='feedback'&&user.role==='ADMIN'&&<AdminFeedbackPanel/>}
   {section==='quality'&&user.role==='ADMIN'&&<QualityPanel onSearch={search}/>}
   {section==='audit'&&user.role==='ADMIN'&&<AuditPanel/>}
 </Shell>;
}
