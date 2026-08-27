import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Shell from '../components/Shell';
import ChatPanel from '../components/ChatPanel';
import CatalogsPanel from '../components/CatalogsPanel';
import { AuditPanel, FeedbackPanel, OverviewPanel, UsersPanel } from '../components/AdminPanels';
import { FavoritesPanel, HistoryPanel, HomePanel, PartsPanel } from '../components/OperationalPanels';
import { api, clearSession, getToken, json } from '../lib';
import type { Section, SessionUser } from '../types';

export default function Dashboard(){
 const navigate=useNavigate();
 const [user,setUser]=useState<SessionUser|null>(null);
 const [section,setSection]=useState<Section>('home');
 const [globalQuery,setGlobalQuery]=useState('');
 const [error,setError]=useState('');

 useEffect(()=>{if(!getToken()){navigate('/login');return;}void (async()=>{try{const d=await json<{user:SessionUser}>(await api('/api/me'));setUser(d.user);setSection('home')}catch(e){setError(e instanceof Error?e.message:'Sessão inválida');clearSession();navigate('/login')}})()},[navigate]);
 const logout=()=>{clearSession();navigate('/login')};
 const search=(query:string)=>{setGlobalQuery(query);setSection('parts')};

 if(error)return <div className="p-8 text-rose-600">{error}</div>;
 if(!user)return <div className="min-h-screen grid place-items-center text-slate-400">Carregando CogniVault…</div>;

 return <Shell user={user} section={section} onSection={setSection} onLogout={logout} onSearch={search}>
   {section==='home'&&<HomePanel onSearch={search}/>} 
   {section==='overview'&&user.role==='ADMIN'&&<OverviewPanel/>}
   {section==='assistant'&&<ChatPanel/>}
   {section==='parts'&&<PartsPanel initialQuery={globalQuery} onQueryChange={setGlobalQuery}/>} 
   {section==='catalogs'&&<CatalogsPanel admin={user.role==='ADMIN'}/>} 
   {section==='history'&&<HistoryPanel onSearch={search}/>} 
   {section==='favorites'&&<FavoritesPanel onSearch={search}/>} 
   {section==='users'&&user.role==='ADMIN'&&<UsersPanel/>}
   {section==='feedback'&&user.role==='ADMIN'&&<FeedbackPanel/>}
   {section==='audit'&&user.role==='ADMIN'&&<AuditPanel/>}
 </Shell>;
}
