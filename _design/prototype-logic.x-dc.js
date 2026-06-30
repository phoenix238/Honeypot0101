
class Component extends DCLogic {
  state = {
    sheet:null, openLogId:null, deleteRevealId:null, toast:null,
    earned:4280, jarAmount:6840, estBill:9200,
    nextOrd:6, invCounter:19,
    entries:[
      {id:'e1',client:'Brightside',desc:'Homepage build · 3.5h',type:'timed',amount:245,ord:5,billed:false,invoiceNum:null},
      {id:'e2',client:'Lena Studio',desc:'Logo revisions · 2h',type:'manual',amount:140,ord:2,billed:false,invoiceNum:null},
      {id:'e-h1',client:'Northwind',desc:'Brand identity · 6h',type:'manual',amount:420,ord:-1,billed:true,invoiceNum:'INV-2026-015'},
      {id:'e-h2',client:'Maple & Co',desc:'Strategy session · 2h',type:'manual',amount:140,ord:-3,billed:true,invoiceNum:'INV-2026-014'},
    ],
    receipts:[
      {id:'r1',vendor:'Pret',desc:'Lunch w/ client · today',amount:14,ord:4},
      {id:'r-h1',vendor:'Uber',desc:'Client travel · last week',amount:22,ord:-2},
    ],
    events:[
      {id:'v1',kind:'paid',client:'Acme',desc:'INV-2026-018 · auto-matched',amount:1200,ord:3},
      {id:'v-h1',kind:'paid',client:'Northwind',desc:'INV-2026-015 · paid',amount:420,ord:-4},
    ],
    invoices:[
      {id:'i18',num:'INV-2026-018',client:'Acme',amount:1200,status:'paid'},
      {id:'i17',num:'INV-2026-017',client:'Maple & Co',amount:540,status:'sent'},
      {id:'i16',num:'INV-2026-016',client:'Northwind',amount:880,status:'sent'},
      {id:'i15',num:'INV-2026-015',client:'Northwind',amount:420,status:'paid'},
      {id:'i14',num:'INV-2026-014',client:'Maple & Co',amount:140,status:'paid'},
    ],
    payments:[
      {id:'p1',payer:'JKL Design Ltd',ref:'Ref: website build',amount:600,date:'Today',status:'pending'},
      {id:'p2',payer:'R. Okafor',ref:'Ref: cheers!',amount:150,date:'Yesterday',status:'pending'},
      {id:'p3',payer:'Brightside Co',ref:'Ref: project deposit',amount:300,date:'Mon',status:'pending'},
    ],
    clients:['Brightside','Lena Studio','Acme','Northwind','Maple & Co'],
    clientEmails:{'Brightside':'hello@brightside.co','Lena Studio':'lena@lena.studio','Acme':'accounts@acme.com','Northwind':'hello@northwind.io','Maple & Co':'finance@mapleandco.com'},
    logType:'manual', logClient:'', logDesc:'', logRate:70, logAmount:'',
    dayRows:[], newClientMode:false, saveNewClientToggle:true,
    calOpen:false, calStage:'loading', calSel:{},
    calData:[
      {id:'c1',date:'Mon 23 Jun',title:'Brightside · design review',hours:2,client:'Brightside'},
      {id:'c2',date:'Mon 23 Jun',title:'Brightside · build session',hours:3.5,client:'Brightside'},
      {id:'c3',date:'Tue 24 Jun',title:'Lena Studio · logo call',hours:1,client:'Lena Studio'},
      {id:'c4',date:'Wed 25 Jun',title:'Brightside · build session',hours:4,client:'Brightside'},
      {id:'c5',date:'Thu 26 Jun',title:'Northwind · kickoff',hours:1.5,client:'Northwind'},
    ],
    snapStage:'cam',
    billClient:null, selBill:{},
    sheetSend:false, sendEmail:'', sendFromBill:false, pendingLog:null, saveEmailToggle:true,
    incomeTab:'review', payAction:null, matchOpen:false, autoMatchedCount:1,
    syncedMatched:false, syncedNew:false,
    peekInv:null, clientPreview:null,
    gmailEnabled:true, settingsOpen:{you:true,money:false,invoice:false,clients:false,connections:false,tax:false,app:false},
    settings:{
      name:'Sam Taylor', tradingName:'Sam Taylor Studio', email:'sam@samtaylor.co',
      phone:'', address:'', vatNumber:'', bankDetails:'',
      defaultRate:70, taxPct:20, paymentTerms:30,
      invPrefix:'INV', footerText:'Thank you for working with me!',
    },
  };
  componentWillUnmount(){ clearTimeout(this._scan); clearTimeout(this._toastT); clearTimeout(this._cal); }

  fmt(n){ return '£'+Math.max(0,Math.round(n||0)).toLocaleString('en-GB'); }
  flash(msg){ clearTimeout(this._toastT); this.setState({toast:msg}); this._toastT=setTimeout(()=>this.setState({toast:null}),2600); }
  seg(on){ return {flex:1,textAlign:'center',padding:'9px',borderRadius:10,fontFamily:"'Geist Mono',monospace",fontSize:11,letterSpacing:'.06em',cursor:'pointer',background:on?'#E0A92E':'transparent',color:on?'#16140F':'#8A8576',fontWeight:on?700:500}; }
  chip(on){ return {padding:'8px 13px',borderRadius:999,fontSize:12.5,fontWeight:600,cursor:'pointer',border:'1px solid '+(on?'#E0A92E':'#322D23'),background:on?'#E0A92E':'transparent',color:on?'#16140F':'#C9C3B4'}; }
  tabStyle(on){ return {flex:1,textAlign:'center',padding:'10px 4px',fontFamily:"'Space Grotesk'",fontSize:12.5,fontWeight:700,cursor:'pointer',color:on?'#F2EEE3':'#8A8576',borderBottom:'2px solid '+(on?'#E0A92E':'transparent')}; }
  modeChip(on){ return {padding:'4px 9px',borderRadius:7,fontFamily:"'Geist Mono',monospace",fontSize:9,fontWeight:700,letterSpacing:'.06em',cursor:'pointer',background:on?'#3F6FB0':'#16140F',color:on?'#fff':'#8A8576',border:'1px solid '+(on?'#3F6FB0':'#322D23')}; }
  calcTimeHours(s,e){ if(!s||!e) return 0; const[sh,sm]=s.split(':').map(Number); const[eh,em]=e.split(':').map(Number); const h=(eh*60+em-sh*60-sm)/60; return h>0?Math.round(h*100)/100:0; }
  toggle(track){ return {width:44,height:26,borderRadius:13,background:track?'#E0A92E':'#322D23',position:'relative',cursor:'pointer',transition:'background .2s'}; }
  thumb(track){ return {position:'absolute',top:3,left:track?18:3,width:20,height:20,borderRadius:10,background:'#fff',transition:'left .2s'}; }

  // ---- PULL TO CLOSE ----
  sdDown(e){ this._sel=e.currentTarget.closest('[data-screen-label]')||e.currentTarget.parentElement; if(!this._sel) return; this._sy0=e.clientY; this._sdy=0; this._sel.style.transition='none'; try{ e.currentTarget.setPointerCapture(e.pointerId); }catch(_){} }
  sdMove(e){ if(!this._sel) return; const dy=Math.max(0,e.clientY-this._sy0); this._sdy=dy; this._sel.style.transform='translateY('+dy+'px)'; this._sel.style.opacity=Math.max(0.45,1-dy/280); }
  sdUp(e){ if(!this._sel) return; const el=this._sel; this._sel=null; el.style.transition='transform .25s cubic-bezier(.3,.85,.25,1),opacity .25s'; if((this._sdy||0)>100){ el.style.transform='translateY(100%)'; el.style.opacity='0'; setTimeout(()=>this.setState({sheet:null,sheetSend:false,payAction:null,matchOpen:false,peekInv:null,calOpen:false,clientPreview:null}),260); } else { el.style.transform=''; el.style.opacity=''; } }

  // ---- SWIPE ----
  onDown(e){ const el=e.currentTarget; this._el=el; this._x0=e.clientX; this._dx=0; this._wasL=this.state.openLogId===el.dataset.id; this._wasR=this.state.deleteRevealId===el.dataset.id; el.style.transition='none'; try{ el.setPointerCapture(e.pointerId); }catch(_){} }
  onMove(e){ if(!this._el) return; const base=this._wasL?-72:this._wasR?72:0; let dx=Math.max(-72,Math.min(72,e.clientX-this._x0+base)); if(this._el.dataset.billable!=='1') dx=Math.max(0,dx); this._dx=dx; this._el.style.transform='translateX('+dx+'px)'; }
  onUp(e){ if(!this._el) return; const el=this._el; const id=el.dataset.id; el.style.transition='transform .22s cubic-bezier(.3,.85,.3,1)'; const d=this._dx||0; const moved=Math.abs(d); el.style.transform=''; this._el=null; if(moved<6){ this.setState({openLogId:null,deleteRevealId:null}); return; } this.setState({openLogId:d<-36&&el.dataset.billable==='1'?id:null,deleteRevealId:d>36?id:null}); }
  deleteById(id){ if(id.startsWith('grp-')){ const num=id.replace('grp-',''); this.setState(s=>({entries:s.entries.filter(e=>e.invoiceNum!==num),deleteRevealId:null,openLogId:null})); } else { this.setState(s=>({entries:s.entries.filter(e=>e.id!==id),receipts:s.receipts.filter(r=>r.id!==id),events:s.events.filter(v=>v.id!==id),deleteRevealId:null,openLogId:null})); } this.flash('Removed from activity'); }

  // ---- SETTINGS ----
  openSettings(){ this.setState({sheet:'settings',openLogId:null,deleteRevealId:null}); }
  updateSetting(key,val){ this.setState(s=>({settings:{...s.settings,[key]:val}})); }
  removeClient(name){ this.setState(s=>{ const c=s.clients.filter(n=>n!==name); const em={...s.clientEmails}; delete em[name]; return {clients:c,clientEmails:em}; }); }
  toggleGmail(){ this.setState(s=>({gmailEnabled:!s.gmailEnabled})); }
  toggleSection(k){ this.setState(s=>({settingsOpen:{...s.settingsOpen,[k]:!s.settingsOpen[k]}})); }

  // ---- SHEET NAV ----
  openSheet(name,client){
    if(name==='snap') this.setState({snapStage:'cam'});
    if(name==='log'){ const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']; const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; const now=new Date(); const todayLabel=days[now.getDay()]+' '+now.getDate()+' '+months[now.getMonth()]; this.setState({logType:'manual',logClient:'',logDesc:'',logRate:this.state.settings.defaultRate||70,logAmount:'',dayRows:[{id:'d-today',date:todayLabel,hours:'',label:'Today',mode:'hours',startT:'',endT:''}],newClientMode:false,saveNewClientToggle:true,calOpen:false,calStage:'loading',calSel:{},sheetSend:false,pendingLog:null}); }
    if(name==='bill'){ const sel={}; this.state.entries.forEach(e=>{ if(!e.billed&&(!client||e.client===client)) sel[e.id]=true; }); this.setState({billClient:client||null,selBill:sel}); }
    if(name==='income') this.setState({incomeTab:'review',payAction:null,matchOpen:false});
    this.setState({sheet:name,openLogId:null,deleteRevealId:null,peekInv:null,sheetSend:false,clientPreview:null});
  }
  close(){ this.setState({sheet:null,sheetSend:false,clientPreview:null}); }
  closeSend(){ this.setState({sheetSend:false,pendingLog:null}); }

  // ---- LOG ----
  pickClient(n){ this.setState({logClient:n,newClientMode:false}); }
  newClient(){ this.setState({newClientMode:true,logClient:'',saveNewClientToggle:true}); }
  toggleSaveNewClient(){ this.setState(s=>({saveNewClientToggle:!s.saveNewClientToggle})); }
  addDay(){ const pool=['Mon 23 Jun','Tue 24 Jun','Wed 25 Jun','Thu 26 Jun','Fri 27 Jun','Sat 28 Jun','Sun 29 Jun']; this.setState(s=>{ const date=pool[s.dayRows.filter(d=>d.id!=='d-today').length]||('Day '+(s.dayRows.length+1)); return {dayRows:[...s.dayRows,{id:'d'+Date.now().toString(36)+s.dayRows.length,date,hours:'',label:'Manual entry',mode:'hours',startT:'',endT:''}]}; }); }
  setDayHours(id,v){ this.setState(s=>({dayRows:s.dayRows.map(d=>d.id===id?{...d,hours:v}:d)})); }
  setDayStart(id,v){ this.setState(s=>({dayRows:s.dayRows.map(d=>{ if(d.id!==id) return d; const h=this.calcTimeHours(v,d.endT); return {...d,startT:v,hours:h||d.hours}; })})); }
  setDayEnd(id,v){ this.setState(s=>({dayRows:s.dayRows.map(d=>{ if(d.id!==id) return d; const h=this.calcTimeHours(d.startT,v); return {...d,endT:v,hours:h||d.hours}; })})); }
  toggleDayMode(id){ this.setState(s=>({dayRows:s.dayRows.map(d=>d.id===id?{...d,mode:d.mode==='hours'?'time':'hours'}:d)})); }
  removeDay(id){ this.setState(s=>({dayRows:s.dayRows.filter(d=>d.id!==id)})); }
  openCal(){ const s=this.state; const sel={}; if(s.logClient&&!s.newClientMode){ s.calData.forEach(ev=>{ if(ev.client===s.logClient) sel[ev.id]=true; }); } this.setState({calOpen:true,calStage:'loading',calSel:sel}); clearTimeout(this._cal); this._cal=setTimeout(()=>this.setState({calStage:'list'}),1300); }
  toggleCal(id){ this.setState(s=>({calSel:{...s.calSel,[id]:!s.calSel[id]}})); }
  closeCal(){ clearTimeout(this._cal); this.setState({calOpen:false}); }
  addCalDays(){ const s=this.state; const chosen=s.calData.filter(ev=>s.calSel[ev.id]); if(!chosen.length){ this.setState({calOpen:false}); return; } const existing=new Set(s.dayRows.map(d=>d.id)); const rows=chosen.map(ev=>({id:'d'+ev.id,date:ev.date,hours:ev.hours,label:ev.title,mode:'hours',startT:'',endT:''})).filter(r=>!existing.has(r.id)); const patch={dayRows:[...s.dayRows,...rows],calOpen:false}; if(!s.logClient&&!s.newClientMode) patch.logClient=chosen[0].client; this.setState(patch); }
  logGross(){ const s=this.state; if(s.logType==='lump') return parseFloat(s.logAmount)||0; return s.dayRows.reduce((a,d)=>{ let h=parseFloat(d.hours)||0; if(d.mode==='time'&&d.startT&&d.endT) h=this.calcTimeHours(d.startT,d.endT)||h; return a+h; },0)*(parseFloat(s.logRate)||0); }
  buildLogData(){ const s=this.state; if(s.logType==='lump'){ return {amount:parseFloat(s.logAmount)||0,desc:s.logDesc||'Lump sum',client:s.logClient||'Client'}; } const th=s.dayRows.reduce((a,d)=>{ let h=parseFloat(d.hours)||0; if(d.mode==='time'&&d.startT&&d.endT) h=this.calcTimeHours(d.startT,d.endT)||h; return a+h; },0); const g=th*(parseFloat(s.logRate)||0); const days=new Set(s.dayRows.filter(d=>{ let h=parseFloat(d.hours)||0; if(d.mode==='time'&&d.startT&&d.endT) h=this.calcTimeHours(d.startT,d.endT)||h; return h>0; }).map(d=>d.date)).size||s.dayRows.length; return {amount:g,desc:days+' day'+(days!==1?'s':'')+' · '+(Math.round(th*100)/100)+'h',client:s.logClient||'Client'}; }
  _maybeSaveClient(client){ const s=this.state; if(s.newClientMode&&s.saveNewClientToggle&&client&&!s.clients.includes(client)){ this.setState(st=>({clients:[...st.clients,client]})); } }
  saveLog(){ const d=this.buildLogData(); if(d.amount<=0) return; this._maybeSaveClient(d.client); const id='e'+Date.now().toString(36); this.setState(st=>({entries:[{id,client:d.client,desc:d.desc,type:st.logType,amount:d.amount,ord:st.nextOrd,billed:false,invoiceNum:null},...st.entries],nextOrd:st.nextOrd+1,earned:st.earned+d.amount})); this.flash('Logged · '+this.fmt(d.amount)); this.close(); }
  doInvoiceIt(){ const d=this.buildLogData(); if(d.amount<=0) return; this._maybeSaveClient(d.client); this.setState({pendingLog:d,sendEmail:this.state.clientEmails[d.client]||'',saveEmailToggle:true,sheetSend:true,sendFromBill:false}); }

  // ---- SEND SHEET ----
  setBillClient(name){ const sel={}; this.state.entries.forEach(e=>{ if(!e.billed&&e.client===name) sel[e.id]=true; }); this.setState({billClient:name,selBill:sel}); }
  clearBillClient(){ this.setState({billClient:null,selBill:{}}); }
  toggleSel(id){ this.setState(s=>({selBill:{...s.selBill,[id]:!s.selBill[id]}})); }
  selectedTotal(){ return this.state.entries.filter(e=>!e.billed&&this.state.selBill[e.id]).reduce((a,e)=>a+e.amount,0); }
  openSendFromBill(){ const s=this.state; const sel=s.entries.filter(e=>!e.billed&&s.selBill[e.id]); if(!sel.length) return; const total=this.selectedTotal(); const client=s.billClient||sel[0].client; const email=s.clientEmails[client]||''; const desc=sel.length===1?sel[0].desc:(sel.length+' items'); this.setState({pendingLog:{amount:total,desc,client,entries:sel.map(e=>e.id)},sendEmail:email,saveEmailToggle:true,sheetSend:true,sendFromBill:true}); }
  setSendEmail(e){ this.setState({sendEmail:e.target.value}); }
  toggleSaveEmail(){ this.setState(s=>({saveEmailToggle:!s.saveEmailToggle})); }
  _commitSend(savePdfOnly){ const s=this.state; const d=s.pendingLog; if(!d) return; const num=(s.settings.invPrefix||'INV')+'-2026-0'+s.invCounter; const park=Math.round(d.amount*(s.settings.taxPct||20)/100); const newEntry={id:'e'+Date.now().toString(36),client:d.client,desc:d.desc,type:'lump',amount:d.amount,ord:s.nextOrd,billed:true,invoiceNum:num}; const fromBill=s.sendFromBill; const ids=new Set(d.entries||[]);
    this.setState(st=>{ const p={}; if(fromBill){ p.entries=st.entries.map(e=>ids.has(e.id)?{...e,billed:true,invoiceNum:num}:e); } else { p.entries=[newEntry,...st.entries]; p.earned=st.earned+d.amount; } p.invoices=[{id:'iv'+Date.now().toString(36),num,client:d.client,amount:d.amount,status:'sent'},...st.invoices]; p.nextOrd=st.nextOrd+2; p.invCounter=st.invCounter+1; p.jarAmount=st.jarAmount+park; p.sheetSend=false; p.sheet=null; p.pendingLog=null; if(s.sendEmail&&s.saveEmailToggle){ p.clientEmails={...st.clientEmails,[d.client]:s.sendEmail}; } return p; });
    this.flash(savePdfOnly?'PDF saved · '+this.fmt(d.amount):'Sent to '+(s.sendEmail||d.client)+' · '+this.fmt(d.amount)); }
  doSend(){ this._commitSend(false); }
  doSavePdf(){ this._commitSend(true); }

  // ---- SNAP ----
  shoot(){ this.setState({snapStage:'scanning'}); clearTimeout(this._scan); this._scan=setTimeout(()=>this.setState({snapStage:'result'}),1400); }
  fromPhotos(){ this.setState({snapStage:'result'}); }
  fromFiles(){ this.setState({snapStage:'result'}); }
  resetSnap(){ this.setState({snapStage:'cam'}); }
  saveReceipt(){ this.setState(st=>({receipts:[{id:'r'+Date.now().toString(36),vendor:'Ryman',desc:'Office supplies · today',amount:23.5,ord:st.nextOrd},...st.receipts],nextOrd:st.nextOrd+1})); this.flash('Receipt filed · £23 claimable'); this.close(); }

  // ---- INCOME ----
  syncBank(){ const s=this.state; const changes={}; let toast='No new payments — all caught up'; if(!s.syncedMatched){ changes.invoices=s.invoices.map(i=>i.id==='i17'?{...i,status:'paid'}:i); changes.events=[{id:'ev'+Date.now().toString(36),kind:'paid',client:'Maple & Co',desc:'INV-2026-017 · auto-matched',amount:540,ord:s.nextOrd},...s.events]; changes.nextOrd=s.nextOrd+1; changes.jarAmount=s.jarAmount+108; changes.autoMatchedCount=s.autoMatchedCount+1; changes.syncedMatched=true; toast='Auto-matched £540 → INV-2026-017'; } if(!s.syncedNew){ const base=changes.payments||s.payments; changes.payments=[...base,{id:'pn'+Date.now().toString(36),payer:'Tate & Co',ref:'Ref: retainer',amount:420,date:'Just now',status:'pending'}]; changes.syncedNew=true; } this.setState(changes); this.flash(toast); }
  openPay(p){ this.setState({payAction:p,matchOpen:false}); }
  closePay(){ this.setState({payAction:null,matchOpen:false}); }
  openMatch(){ this.setState({matchOpen:true}); }
  closeMatch(){ this.setState({matchOpen:false}); }
  setTab(t){ this.setState({incomeTab:t}); }
  _removePay(id,status){ this.setState(s=>({payments:s.payments.map(p=>p.id===id?{...p,status}:p)})); }
  payLogLump(){ const p=this.state.payAction; if(!p) return; const park=Math.round(p.amount*(this.state.settings.taxPct||20)/100); this.setState(st=>({entries:[{id:'e'+Date.now().toString(36),client:p.payer,desc:'Income · '+p.ref.replace(/^Ref:\s*/,''),type:'lump',amount:p.amount,ord:st.nextOrd,billed:true,invoiceNum:null},...st.entries],events:[{id:'ev'+Date.now().toString(36),kind:'paid',client:p.payer,desc:'Logged from bank',amount:p.amount,ord:st.nextOrd+1},...st.events],payments:st.payments.map(x=>x.id===p.id?{...x,status:'handled'}:x),nextOrd:st.nextOrd+2,earned:st.earned+p.amount,jarAmount:st.jarAmount+park})); this.flash('Logged '+this.fmt(p.amount)+' · '+this.fmt(park)+' parked'); this.closePay(); }
  payInvoice(){ const p=this.state.payAction; if(!p) return; const park=Math.round(p.amount*(this.state.settings.taxPct||20)/100); const num=(this.state.settings.invPrefix||'INV')+'-2026-0'+this.state.invCounter; this.setState(st=>({invoices:[{id:'iv'+Date.now().toString(36),num,client:p.payer,amount:p.amount,status:'paid'},...st.invoices],events:[{id:'ev'+Date.now().toString(36),kind:'paid',client:p.payer,desc:num+' · paid',amount:p.amount,ord:st.nextOrd},...st.events],payments:st.payments.map(x=>x.id===p.id?{...x,status:'handled'}:x),nextOrd:st.nextOrd+1,invCounter:st.invCounter+1,jarAmount:st.jarAmount+park})); this.flash('Invoice raised & paid · '+this.fmt(p.amount)); this.closePay(); }
  doMatch(invId){ const p=this.state.payAction; if(!p) return; const inv=this.state.invoices.find(i=>i.id===invId); if(!inv) return; const park=Math.round(p.amount*(this.state.settings.taxPct||20)/100); this.setState(st=>({invoices:st.invoices.map(i=>i.id===invId?{...i,status:'paid'}:i),events:[{id:'ev'+Date.now().toString(36),kind:'paid',client:inv.client,desc:inv.num+' · matched',amount:inv.amount,ord:st.nextOrd},...st.events],payments:st.payments.map(x=>x.id===p.id?{...x,status:'handled'}:x),nextOrd:st.nextOrd+1,jarAmount:st.jarAmount+park})); this.flash('Matched · '+inv.num+' marked paid'); this.closePay(); }
  dismissPay(){ const p=this.state.payAction; if(!p) return; this._removePay(p.id,'dismissed'); this.flash('Dismissed · find it in Dismissed tab'); this.closePay(); }
  restorePay(id){ this._removePay(id,'pending'); this.flash('Restored to inbox'); }
  exportTax(){ this.flash('Exported · ready for Self Assessment'); }

  // ---- PEEK ----
  openPeekByNum(num){ const inv=this.state.invoices.find(i=>i.num===num); if(inv) this.setState({peekInv:inv,clientPreview:null}); }
  closePeek(){ this.setState({peekInv:null}); }
  openClientPreview(){ const pk=this.state.peekInv; if(pk) this.setState({clientPreview:pk}); }
  closeClientPreview(){ this.setState({clientPreview:null}); }
  payAsClient(){ const cv=this.state.clientPreview; if(!cv) return; this.setState(st=>({invoices:st.invoices.map(i=>i.id===cv.id?{...i,status:'paid'}:i),payments:[{id:'psim'+Date.now().toString(36),payer:cv.client,ref:'Ref: '+cv.num,amount:cv.amount,date:'Just now',status:'pending'},...st.payments],clientPreview:null,peekInv:null,sheet:null})); this.flash('Client paid! Check your Income inbox 📬'); }

  // ---- RESET ----
  resetSim(){ this.setState({sheet:null,openLogId:null,deleteRevealId:null,toast:null,earned:4280,jarAmount:6840,estBill:9200,nextOrd:6,invCounter:19,entries:[{id:'e1',client:'Brightside',desc:'Homepage build · 3.5h',type:'timed',amount:245,ord:5,billed:false,invoiceNum:null},{id:'e2',client:'Lena Studio',desc:'Logo revisions · 2h',type:'manual',amount:140,ord:2,billed:false,invoiceNum:null},{id:'e-h1',client:'Northwind',desc:'Brand identity · 6h',type:'manual',amount:420,ord:-1,billed:true,invoiceNum:'INV-2026-015'},{id:'e-h2',client:'Maple & Co',desc:'Strategy session · 2h',type:'manual',amount:140,ord:-3,billed:true,invoiceNum:'INV-2026-014'}],receipts:[{id:'r1',vendor:'Pret',desc:'Lunch w/ client · today',amount:14,ord:4},{id:'r-h1',vendor:'Uber',desc:'Client travel · last week',amount:22,ord:-2}],events:[{id:'v1',kind:'paid',client:'Acme',desc:'INV-2026-018 · auto-matched',amount:1200,ord:3},{id:'v-h1',kind:'paid',client:'Northwind',desc:'INV-2026-015 · paid',amount:420,ord:-4}],invoices:[{id:'i18',num:'INV-2026-018',client:'Acme',amount:1200,status:'paid'},{id:'i17',num:'INV-2026-017',client:'Maple & Co',amount:540,status:'sent'},{id:'i16',num:'INV-2026-016',client:'Northwind',amount:880,status:'sent'},{id:'i15',num:'INV-2026-015',client:'Northwind',amount:420,status:'paid'},{id:'i14',num:'INV-2026-014',client:'Maple & Co',amount:140,status:'paid'}],payments:[{id:'p1',payer:'JKL Design Ltd',ref:'Ref: website build',amount:600,date:'Today',status:'pending'},{id:'p2',payer:'R. Okafor',ref:'Ref: cheers!',amount:150,date:'Yesterday',status:'pending'},{id:'p3',payer:'Brightside Co',ref:'Ref: project deposit',amount:300,date:'Mon',status:'pending'}],clients:['Brightside','Lena Studio','Acme','Northwind','Maple & Co'],clientEmails:{'Brightside':'hello@brightside.co','Lena Studio':'lena@lena.studio','Acme':'accounts@acme.com','Northwind':'hello@northwind.io','Maple & Co':'finance@mapleandco.com'},logType:'manual',logClient:'',logDesc:'',logRate:70,logAmount:'',dayRows:[],newClientMode:false,saveNewClientToggle:true,calOpen:false,calStage:'loading',calSel:{},snapStage:'cam',billClient:null,selBill:{},sheetSend:false,sendEmail:'',sendFromBill:false,pendingLog:null,saveEmailToggle:true,incomeTab:'review',payAction:null,matchOpen:false,autoMatchedCount:1,syncedMatched:false,syncedNew:false,peekInv:null,clientPreview:null}); this.flash('Simulation reset'); }

  buildFeed(){ const s=this.state; const items=[];
    const groups={};
    s.entries.forEach(e=>{ if(e.invoiceNum){ if(!groups[e.invoiceNum]) groups[e.invoiceNum]=[]; groups[e.invoiceNum].push(e); } else { items.push({id:e.id,ord:e.ord,billable:true,client:e.client,title:'Logged · '+e.client,sub:e.desc,amount:this.fmt(e.amount),paid:false,invoiced:false,invoicedNum:''}); } });
    Object.entries(groups).forEach(([num,ents])=>{ const inv=s.invoices.find(i=>i.num===num); const paid=!!(inv&&inv.status==='paid'); const total=ents.reduce((a,e)=>a+e.amount,0); const client=ents[0].client; const sub=ents.length>1?(ents.length+' items · '+ents.map(e=>e.desc.split('·')[0].trim()).join(', ')):ents[0].desc; const maxOrd=Math.max(...ents.map(e=>e.ord)); items.push({id:'grp-'+num,ord:maxOrd,billable:false,client,title:'Invoiced · '+client,sub,amount:this.fmt(total),paid,invoiced:true,invoicedNum:num}); });
    s.receipts.forEach(r=>items.push({id:r.id,ord:r.ord,billable:false,title:'Snapped · '+r.vendor,sub:r.desc,amount:this.fmt(r.amount),paid:false,invoiced:false}));
    s.events.forEach(v=>items.push({id:v.id,ord:v.ord,billable:false,title:v.kind==='paid'?(v.client+' paid you'):('Invoiced · '+v.client),sub:v.desc,amount:(v.kind==='paid'?'+':'')+this.fmt(v.amount),paid:v.kind==='paid',invoiced:false}));
    items.sort((a,b)=>b.ord-a.ord); return items;
  }

  renderVals(){
    const s=this.state; const f=n=>this.fmt(n); const st=s.settings;
    const taxPct=(st.taxPct||20)/100;
    const parked=Math.round(s.earned*taxPct); const take=s.earned-parked;
    const pct=Math.min(100,Math.round((s.jarAmount/s.estBill)*100));
    const jarFillStyle={position:'absolute',bottom:0,left:0,right:0,height:pct+'%',background:'linear-gradient(#E0A92E,#C98E1C)'};
    const jarLineStyle={position:'absolute',left:0,right:0,bottom:pct+'%',height:'7px',background:'rgba(255,255,255,.18)'};

    const feed=this.buildFeed().map(it=>{
      const billOpen=s.openLogId===it.id; const delOpen=s.deleteRevealId===it.id;
      const tx=billOpen?-72:delOpen?72:0;
      const dot=it.receipt?'#7E62C0':'#E0A92E';
      const slideStyle={position:'relative',zIndex:2,display:'flex',alignItems:'center',gap:13,padding:'13px 14px',borderRadius:14,background:it.paid?'#1B2A22':'#211E17',transform:'translateX('+tx+'px)',transition:'transform .22s cubic-bezier(.3,.85,.3,1)',touchAction:'pan-y',userSelect:'none',cursor:(it.billable||it.invoiced)?'pointer':'default'};
      const titleColor=it.invoiced&&!it.paid?'#D9A23A':'#F2EEE3';
      return {...it,dot,slideStyle,billableFlag:it.billable?'1':'0',showDot:!it.paid,amtColor:it.paid?'#5BBF8A':'#F2EEE3',titleColor,onBill:()=>this.openSheet('bill',it.client),onTap:()=>{ if(it.invoiced) this.openPeekByNum(it.invoicedNum); },onDelete:()=>this.deleteById(it.id)};
    });

    const candidates=s.entries.filter(e=>!e.billed&&(!s.billClient||e.client===s.billClient)).map(e=>({...e,amountStr:f(e.amount),checked:!!s.selBill[e.id],checkBg:s.selBill[e.id]?'#2E7D5B':'transparent',toggle:()=>this.toggleSel(e.id)}));
    const billTotal=this.selectedTotal();
    const logG=this.logGross();
    const totalHours=s.dayRows.reduce((a,d)=>{ let h=parseFloat(d.hours)||0; if(d.mode==='time'&&d.startT&&d.endT) h=this.calcTimeHours(d.startT,d.endT)||h; return a+h; },0);

    const pending=s.payments.filter(p=>p.status==='pending');
    const dismissed=s.payments.filter(p=>p.status==='dismissed');
    const unpaid=s.invoices.filter(i=>i.status==='sent');
    const pa=s.payAction; const pk=s.peekInv; const cv=s.clientPreview;
    const peekLines=pk?s.entries.filter(e=>e.invoiceNum===pk.num).map(e=>({desc:e.desc,client:e.client,amt:f(e.amount)})):[];
    if(pk&&peekLines.length===0) peekLines.push({desc:'Work completed',client:pk?pk.client:'',amt:f(pk?pk.amount:0)});
    const clientInvLines=cv?s.entries.filter(e=>e.invoiceNum===cv.num).map(e=>({desc:e.desc,amt:f(e.amount)})):[{desc:'Work completed',amt:f(cv?cv.amount:0)}];

    const sd=s.pendingLog;
    const existingEmail=sd?s.clientEmails[sd.client]:'';
    const sendIsNewEmail=!!(sd&&s.sendEmail&&s.sendEmail!==existingEmail);

    // settings clients list
    const settingsClients=s.clients.map(name=>({name,email:s.clientEmails[name]||'No email saved',remove:()=>this.removeClient(name)}));

    return {
      takeHome:f(take), earnedLine:f(s.earned)+' earned · '+f(parked)+' in the pot',
      jarFillStyle, jarLineStyle, jarPct:pct+'%', jarAmount:f(s.jarAmount), estBill:f(s.estBill), toGo:f(s.estBill-s.jarAmount),
      feed,
      openLog:()=>this.openSheet('log'), openSnap:()=>this.openSheet('snap'), openBill:()=>this.openSheet('bill',null), openTax:()=>this.openSheet('tax'), openIncome:()=>this.openSheet('income'), openSettings:()=>this.openSettings(), close:()=>this.close(),
      onDown:e=>this.onDown(e), onMove:e=>this.onMove(e), onUp:e=>this.onUp(e),
      sdDown:e=>this.sdDown(e), sdMove:e=>this.sdMove(e), sdUp:e=>this.sdUp(e),
      sheetLog:s.sheet==='log', sheetSnap:s.sheet==='snap', sheetBill:s.sheet==='bill', sheetTax:s.sheet==='tax', sheetIncome:s.sheet==='income', sheetSettings:s.sheet==='settings',
      sheetSend:s.sheetSend,
      incomeBadge:pending.length, showBadge:pending.length>0,
      // settings
      setName:st.name, setSetName:e=>this.updateSetting('name',e.target.value),
      setTradingName:st.tradingName, setSetTradingName:e=>this.updateSetting('tradingName',e.target.value),
      setEmail:st.email, setSetEmail:e=>this.updateSetting('email',e.target.value),
      setPhone:st.phone, setSetPhone:e=>this.updateSetting('phone',e.target.value),
      setAddress:st.address, setSetAddress:e=>this.updateSetting('address',e.target.value),
      setVat:st.vatNumber, setSetVat:e=>this.updateSetting('vatNumber',e.target.value),
      setBankDetails:st.bankDetails, setSetBankDetails:e=>this.updateSetting('bankDetails',e.target.value),
      setDefaultRate:st.defaultRate, setSetDefaultRate:e=>this.updateSetting('defaultRate',e.target.value),
      setTaxPct:st.taxPct, setSetTaxPct:e=>this.updateSetting('taxPct',e.target.value),
      setPayTerms:st.paymentTerms, setSetPayTerms:e=>this.updateSetting('paymentTerms',e.target.value),
      setInvPrefix:st.invPrefix, setSetInvPrefix:e=>this.updateSetting('invPrefix',e.target.value),
      setFooter:st.footerText, setSetFooter:e=>this.updateSetting('footerText',e.target.value),
      settingsClients,
      soYou:s.settingsOpen.you, soMoney:s.settingsOpen.money, soInvoice:s.settingsOpen.invoice, soClients:s.settingsOpen.clients, soConnections:s.settingsOpen.connections, soTax:s.settingsOpen.tax, soApp:s.settingsOpen.app,
      togYou:()=>this.toggleSection('you'), togMoney:()=>this.toggleSection('money'), togInvoice:()=>this.toggleSection('invoice'), togClients:()=>this.toggleSection('clients'), togConnections:()=>this.toggleSection('connections'), togTax:()=>this.toggleSection('tax'), togApp:()=>this.toggleSection('app'),
      chevYou:s.settingsOpen.you?'rotate(180deg)':'rotate(0deg)', chevMoney:s.settingsOpen.money?'rotate(180deg)':'rotate(0deg)', chevInvoice:s.settingsOpen.invoice?'rotate(180deg)':'rotate(0deg)', chevClients:s.settingsOpen.clients?'rotate(180deg)':'rotate(0deg)', chevConnections:s.settingsOpen.connections?'rotate(180deg)':'rotate(0deg)', chevTax:s.settingsOpen.tax?'rotate(180deg)':'rotate(0deg)', chevApp:s.settingsOpen.app?'rotate(180deg)':'rotate(0deg)',
      gmailToggleStyle:this.toggle(s.gmailEnabled), gmailThumbStyle:this.thumb(s.gmailEnabled), toggleGmail:()=>this.toggleGmail(),
      // log
      segHours:this.seg(s.logType==='manual'), segLump:this.seg(s.logType==='lump'),
      setManual:()=>this.setState({logType:'manual'}), setLump:()=>this.setState({logType:'lump'}),
      isManual:s.logType==='manual', isLump:s.logType==='lump',
      clientChips:s.clients.map(name=>({name,pick:()=>this.pickClient(name),style:this.chip(s.logClient===name&&!s.newClientMode)})),
      newClient:()=>this.newClient(), newClientStyle:this.chip(s.newClientMode), isNewClient:s.newClientMode,
      hasNewClientName:!!(s.newClientMode&&s.logClient&&s.logClient.trim()),
      saveNewClientToggle:s.saveNewClientToggle, toggleSaveNewClient:()=>this.toggleSaveNewClient(),
      saveNewClientBg:s.saveNewClientToggle?'#2E7D5B':'transparent',
      logClient:s.logClient, setClient:e=>this.setState({logClient:e.target.value}),
      logDesc:s.logDesc, setDesc:e=>this.setState({logDesc:e.target.value}),
      logRate:s.logRate, setRate:e=>this.setState({logRate:e.target.value}),
      logAmount:s.logAmount, setAmount:e=>this.setState({logAmount:e.target.value}),
      dayRows:s.dayRows.map(d=>{ const isT=d.mode==='time'; const hc=isT&&d.startT&&d.endT?this.calcTimeHours(d.startT,d.endT):0; return {dateLabel:d.date,label:d.label,hours:d.hours,setHours:e=>this.setDayHours(d.id,e.target.value),remove:()=>this.removeDay(d.id),isHours:!isT,isTime:isT,modeLabel:isT?'TIME':'HRS',modeStyle:this.modeChip(isT),toggleMode:()=>this.toggleDayMode(d.id),startT:d.startT||'',endT:d.endT||'',setStart:e=>this.setDayStart(d.id,e.target.value),setEnd:e=>this.setDayEnd(d.id,e.target.value),hoursCalc:hc?hc+'h':''}; }),
      hasDays:s.dayRows.length>0, totalHoursLabel:totalHours>0?((Math.round(totalHours*100)/100)+'h · '+f(totalHours*(parseFloat(s.logRate)||0))):'',
      addDay:()=>this.addDay(), openCal:()=>this.openCal(),
      calOpen:s.calOpen, calLoading:s.calStage==='loading', calList:s.calStage==='list', closeCal:()=>this.closeCal(),
      calEvents:s.calData.map(ev=>({title:ev.title,date:ev.date,hoursLabel:ev.hours+'h',checked:!!s.calSel[ev.id],checkBg:s.calSel[ev.id]?'#2E7D5B':'transparent',toggle:()=>this.toggleCal(ev.id)})),
      calSelCount:Object.values(s.calSel).filter(Boolean).length, calAddOpacity:Object.values(s.calSel).filter(Boolean).length>0?'1':'.4',
      addCalDays:()=>this.addCalDays(),
      saveLog:()=>this.saveLog(), doInvoiceIt:()=>this.doInvoiceIt(), saveOpacity:logG>0?'1':'.4',
      logPreview:logG>0?(f(logG)+' · '+f(Math.round(logG*taxPct))+' parked for tax'):'Enter your work above',
      isCam:s.snapStage==='cam', isScan:s.snapStage==='scanning', isResult:s.snapStage==='result',
      shoot:()=>this.shoot(), fromPhotos:()=>this.fromPhotos(), fromFiles:()=>this.fromFiles(), resetSnap:()=>this.resetSnap(), saveReceipt:()=>this.saveReceipt(),
      candidates, hasCandidates:candidates.length>0, noCandidates:candidates.length===0,
      billTotal:f(billTotal), billClientName:s.billClient||'a client',
      billClientSet:!!s.billClient, billClientUnset:!s.billClient,
      billClientChips:[...new Set(s.entries.filter(e=>!e.billed).map(e=>e.client))].map(name=>({name,pick:()=>this.setBillClient(name),style:this.chip(false)})),
      clearBillClient:()=>this.clearBillClient(),
      billParked:f(Math.round(billTotal*taxPct)), openSendFromBill:()=>this.openSendFromBill(), sendOpacity:(billTotal>0&&!!s.billClient)?'1':'.4',
      exportTax:()=>this.exportTax(),
      sendClient:sd?sd.client:'', sendDesc:sd?sd.desc:'', sendAmt:sd?f(sd.amount):'',
      sendEmail:s.sendEmail, setSendEmail:e=>this.setSendEmail(e),
      sendEmailPlaceholder:existingEmail||'email@client.com',
      sendHasEmail:!!existingEmail, sendIsNewEmail, saveEmailToggle:s.saveEmailToggle, toggleSaveEmail:()=>this.toggleSaveEmail(),
      saveEmailBg:s.saveEmailToggle?'#2E7D5B':'transparent',
      sendInvNum:(st.invPrefix||'INV')+'-2026-0'+s.invCounter,
      sendParked:sd?f(Math.round(sd.amount*taxPct)):'£0',
      doSend:()=>this.doSend(), doSavePdf:()=>this.doSavePdf(), closeSend:()=>this.closeSend(),
      reviewTab:s.incomeTab==='review', dismissedTab:s.incomeTab==='dismissed',
      setReview:()=>this.setTab('review'), setDismissed:()=>this.setTab('dismissed'),
      tabReviewStyle:this.tabStyle(s.incomeTab==='review'), tabDismissedStyle:this.tabStyle(s.incomeTab==='dismissed'),
      reviewCount:pending.length, dismissedCount:dismissed.length,
      showAutoBanner:s.autoMatchedCount>0, autoMatchedCount:s.autoMatchedCount,
      hasPending:pending.length>0, noPending:pending.length===0,
      reviewSummary:pending.length+' to review · '+f(pending.reduce((a,p)=>a+p.amount,0))+' in',
      pendingCards:pending.map(p=>({payer:p.payer,amount:'+'+f(p.amount),meta:p.ref+' · '+p.date,open:()=>this.openPay(p)})),
      hasDismissed:dismissed.length>0, noDismissed:dismissed.length===0,
      dismissedCards:dismissed.map(p=>({payer:p.payer,amount:f(p.amount)+' · '+p.ref.replace(/^Ref:\s*/,''),restore:()=>this.restorePay(p.id)})),
      syncBank:()=>this.syncBank(),
      payActionOpen:!!pa, payAmt:pa?'+'+f(pa.amount):'', payPayer:pa?pa.payer:'', payRef:pa?pa.ref+' · '+pa.date:'',
      payLogLump:()=>this.payLogLump(), payInvoice:()=>this.payInvoice(), dismissPay:()=>this.dismissPay(),
      openMatch:()=>this.openMatch(), closeMatch:()=>this.closeMatch(), matchOpen:s.matchOpen, closePay:()=>this.closePay(),
      unpaidInvoices:unpaid.map(i=>({num:i.num,client:i.client,amt:f(i.amount),match:()=>this.doMatch(i.id)})),
      hasUnpaid:unpaid.length>0, noUnpaid:unpaid.length===0,
      peekOpen:!!pk, peekNum:pk?pk.num:'', peekClient:pk?pk.client:'', peekTotal:pk?f(pk.amount):'',
      peekStatus:pk?(pk.status==='paid'?'PAID':'SENT'):'', peekStatusColor:pk&&pk.status==='paid'?'#5BBF8A':'#E0A92E',
      peekLines, peekFooter:pk?(pk.status==='paid'?'RECONCILED · RECEIPT-BACKED':'AWAITING PAYMENT · WILL AUTO-MATCH'):'', closePeek:()=>this.closePeek(),
      peekCanSimulate:pk&&pk.status==='sent',
      openClientPreview:()=>this.openClientPreview(),
      clientPreviewOpen:!!cv, clientInvNum:cv?cv.num:'', clientInvTotal:cv?f(cv.amount):'',
      clientInvLines, closeClientPreview:()=>this.closeClientPreview(), payAsClient:()=>this.payAsClient(),
      resetSim:()=>this.resetSim(),
      toast:s.toast,
    };
  }
}
