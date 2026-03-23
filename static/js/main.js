/**
 * main.js — Automated University Theory Examination Seating Arrangement System
 * PS09 · GCEE Examination Cell
 * Handles: AI chat mode + Manual entry mode (bulk dept / individual students)
 */
'use strict';

const $ = id => document.getElementById(id);

// ════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════
let currentResult = null;
let chatHistory   = [];
let activeHall    = 0;
let viewMode      = 'grid';
let inputMode     = 'ai';
let entryMode     = 'bulk';
let manualHalls   = [];
let manualDepts   = [];
let studentRows   = [];

// injected from Flask template
const DEPT_LIST = window.DEPT_LIST || ["CSE","ECE","MECH","CIVIL","EEE","IT","AUTO","CSDS"];
const SUBJECTS  = window.SUBJECTS  || {};

// ════════════════════════════════════════════════════════════
// LOCALSTORAGE PERSISTENCE
// Saves all state on every change — survives refresh/reopen.
// ════════════════════════════════════════════════════════════
const LS = {
  result:    'es_result',
  halls:     'es_halls',
  depts:     'es_depts',
  students:  'es_students',
  chat:      'es_chat',
  view:      'es_view',
  input:     'es_input',
  entry:     'es_entry',
  hall:      'es_hall',
};

function lsSave(k, v){
  try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){}
}
function lsLoad(k, fb=null){
  try{
    const r = localStorage.getItem(k);
    return r !== null ? JSON.parse(r) : fb;
  }catch(e){ return fb; }
}
function lsClear(){
  Object.values(LS).forEach(k => localStorage.removeItem(k));
}
function saveAll(){
  lsSave(LS.result,   currentResult);
  lsSave(LS.halls,    manualHalls);
  lsSave(LS.depts,    manualDepts);
  lsSave(LS.students, studentRows);
  lsSave(LS.chat,     chatHistory);
  lsSave(LS.view,     viewMode);
  lsSave(LS.input,    inputMode);
  lsSave(LS.entry,    entryMode);
  lsSave(LS.hall,     activeHall);
}

// ════════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════════
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function toast(msg, ms=2800){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),ms); }
function setStatus(txt,live=false){ $('stext').textContent=txt; $('sdot').className='sdot'+(live?' live':''); }
function autoGrow(el){ el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,90)+'px'; }
function handleKey(e){ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();} }
const deptOpts = () => DEPT_LIST.map(d=>`<option value="${d}">${d}</option>`).join('');
const subjOpts = (dept,sel='') => (SUBJECTS[dept]||[]).map(s=>`<option value="${esc(s)}" ${s===sel?'selected':''}>${esc(s)}</option>`).join('');

// ════════════════════════════════════════════════════════════
// MODE SWITCHING
// ════════════════════════════════════════════════════════════
function switchMode(mode){
  inputMode = mode;
  document.querySelectorAll('.mtab').forEach(t=>t.classList.toggle('on', t.dataset.mode===mode));
  $('chat-view') .classList.toggle('hidden', mode!=='ai');
  $('manual-view').classList.toggle('hidden', mode!=='manual');
  $('ipanel-title').textContent = mode==='ai' ? 'AI Seating Assistant' : 'Manual Entry';
  $('ipanel-sub').textContent   = mode==='ai' ? 'Natural Language Engine' : 'Form-Based Configuration';
  lsSave(LS.input, inputMode);
}

function switchItab(mode){
  entryMode = mode;
  document.querySelectorAll('.itab').forEach(t=>t.classList.toggle('on', t.dataset.itab===mode));
  $('bulk-view').classList.toggle('hidden', mode!=='bulk');
  $('individual-view').classList.toggle('hidden', mode!=='individual');
  lsSave(LS.entry, entryMode);
}

// ════════════════════════════════════════════════════════════
// AI CHAT
// ════════════════════════════════════════════════════════════
function pushMsg(role,html){
  const box=$('messages'), d=document.createElement('div');
  d.className=`msg ${role}`;
  d.innerHTML=`<div class="mavatar">${role==='ai'?'AI':'YOU'}</div><div class="mbubble">${html}</div>`;
  box.appendChild(d); box.scrollTop=box.scrollHeight;
}
function pushSys(txt){
  const box=$('messages'), d=document.createElement('div');
  d.className='sys-msg'; d.textContent=`── ${txt} ──`;
  box.appendChild(d); box.scrollTop=box.scrollHeight;
}
function showThink(){
  const box=$('messages'), d=document.createElement('div');
  d.className='msg ai'; d.id='think';
  d.innerHTML=`<div class="mavatar">AI</div><div class="mbubble"><div class="thinking"><div class="tdot"></div><div class="tdot"></div><div class="tdot"></div></div></div>`;
  box.appendChild(d); box.scrollTop=box.scrollHeight;
}
function hideThink(){ const el=$('think'); if(el)el.remove(); }

function fillAndSend(txt){ $('chat-input').value=txt; sendMessage(); }

async function sendMessage(){
  const inp=$('chat-input'), txt=inp.value.trim();
  if(!txt)return;
  inp.value=''; inp.style.height='auto';
  $('send-btn').disabled=true; setStatus('PROCESSING…');
  pushMsg('user', esc(txt));
  chatHistory.push({role:'user',content:txt});
  showThink();
  try{
    const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:txt,history:chatHistory})});
    const data=await res.json();
    hideThink();
    if(data.error&&!data.reply){ pushMsg('ai',`⚠ ${esc(data.error)}`); setStatus('ERROR'); return; }
    const reply=data.reply||'Done.';
    chatHistory.push({role:'assistant',content:reply});
    pushMsg('ai', esc(reply).replace(/\n/g,'<br>'));
    if(data.result&&data.result.success){ currentResult=data.result; activeHall=0; renderArrangement(currentResult); toast(`✓ ${currentResult.summary.total_allocated} students allocated`); }
    setStatus('READY',true);
    saveAll();
  }catch(ex){ hideThink(); pushMsg('ai',`⚠ Network error: ${esc(ex.message)}`); setStatus('ERROR'); }
  $('send-btn').disabled=false;
}

// ════════════════════════════════════════════════════════════
// MANUAL — HALLS BUILDER
// ════════════════════════════════════════════════════════════
function renderHallsList(){
  $('halls-list').innerHTML = manualHalls.map((h,i)=>`
    <div class="hall-item">
      <div class="hall-item-info">
        <div class="hall-item-name">${esc(h.name)}</div>
        <div class="hall-item-meta">Capacity: ${h.capacity} · Grid: ${h.rows}×${h.cols}</div>
      </div>
      <button class="btn-remove" onclick="removeHall(${i})">Remove</button>
    </div>`).join('') || '<div style="font-family:var(--fm);font-size:10px;color:var(--g30);text-align:center;padding:10px">No halls added yet</div>';
  $('hall-count-label').textContent = manualHalls.length ? `${manualHalls.length} hall(s) configured` : 'Add at least one hall';
}

function syncCapacity(){
  const rows=parseInt($('new-hall-rows').value)||1;
  const cols=parseInt($('new-hall-cols').value)||1;
  const cap=rows*cols;
  $('new-hall-cap').value=cap;
  // Live badge on capacity field
  const capField=$('new-hall-cap');
  capField.title=`${rows} rows × ${cols} cols = ${cap} seats`;
}

function addHall(){
  const rows=parseInt($('new-hall-rows').value)||5;
  const cols=parseInt($('new-hall-cols').value)||5;
  const cap =rows*cols;
  const L='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let name=($('new-hall-name').value||'').trim();
  if(!name){
    const idx=manualHalls.length;
    name = idx<26 ? 'Hall '+L[idx] : 'Hall '+L[Math.floor(idx/26)-1]+L[idx%26];
  }
  if(manualHalls.find(h=>h.name.toLowerCase()===name.toLowerCase())){
    let n=2;
    while(manualHalls.find(h=>h.name.toLowerCase()===(name+' '+n).toLowerCase())) n++;
    name=name+' '+n;
  }
  manualHalls.push({name,capacity:cap,rows,cols});
  $('new-hall-name').value='';
  renderHallsList();
  lsSave(LS.halls, manualHalls);
  toast(`\u2713 ${name} added \u2014 ${rows}\u00d7${cols} = ${cap} seats`);
}

function removeHall(i){ manualHalls.splice(i,1); renderHallsList(); lsSave(LS.halls, manualHalls); }

// ════════════════════════════════════════════════════════════
// MANUAL — BULK DEPT MODE
// ════════════════════════════════════════════════════════════
function renderDeptRows(){
  const COLORS={CSE:'#6366f1',ECE:'#10b981',MECH:'#f59e0b',CIVIL:'#ef4444',EEE:'#8b5cf6',IT:'#06b6d4',AUTO:'#f97316',CSDS:'#ec4899',OTHER:'#64748b'};
  $('dept-rows').innerHTML = manualDepts.map((d,i)=>{
    const col = COLORS[d.dept] || COLORS.OTHER;
    return `<div class="dept-row" id="dr-${i}">
      <div class="dept-dot" style="background:${col}"></div>
      <select class="dr-dept" onchange="deptChanged(${i},this.value)">${deptOpts().replace(`value="${d.dept}"`,`value="${d.dept}" selected`)}</select>
      <input class="dr-count" type="number" min="1" max="200" value="${d.count}" placeholder="Count" oninput="manualDepts[${i}].count=+this.value||1;lsSave(LS.depts,manualDepts)">
      <input class="dr-sem" type="number" min="1" max="8" value="${d.semester}" placeholder="Sem" oninput="manualDepts[${i}].semester=+this.value||3;lsSave(LS.depts,manualDepts)">
      <select class="dr-subj" onchange="manualDepts[${i}].subject=this.value">
        <option value="">Auto subject</option>${subjOpts(d.dept,d.subject||'')}
      </select>
      <button class="btn-del-row" onclick="removeDeptRow(${i})" title="Remove">✕</button>
    </div>`;
  }).join('');
}

function deptChanged(i,val){ manualDepts[i].dept=val; manualDepts[i].subject=''; renderDeptRows(); lsSave(LS.depts, manualDepts); }
function removeDeptRow(i){ manualDepts.splice(i,1); renderDeptRows(); lsSave(LS.depts, manualDepts); }
function addDeptRow(){
  const existing = manualDepts.map(d=>d.dept);
  const next = DEPT_LIST.find(d=>!existing.includes(d)) || DEPT_LIST[0];
  manualDepts.push({dept:next,count:20,semester:3,subject:''});
  renderDeptRows();
  lsSave(LS.depts, manualDepts);
}

async function submitBulk(){
  const errs = [];
  if(!manualHalls.length) errs.push('Add at least one hall.');
  if(!manualDepts.length) errs.push('Add at least one department.');
  manualDepts.forEach((d,i)=>{ if(!d.count||d.count<1) errs.push(`Dept row ${i+1}: count must be ≥ 1.`); });
  if(errs.length){ showFormErrors(errs); return; }
  clearFormErrors();
  await submitManual({ halls:manualHalls, departments:manualDepts });
}

// ════════════════════════════════════════════════════════════
// MANUAL — INDIVIDUAL STUDENTS MODE
// ════════════════════════════════════════════════════════════
// Debounced save for student table inline edits
let _stuSaveTimer = null;
function saveStudentsDebounced(){ clearTimeout(_stuSaveTimer); _stuSaveTimer = setTimeout(()=>lsSave(LS.students,studentRows),600); }

function renderStudentTable(){
  const tbody = $('student-tbody');
  tbody.innerHTML = studentRows.map((s,i)=>`
    <tr>
      <td><input type="text" value="${esc(s.register_no)}" placeholder="21CS001" oninput="studentRows[${i}].register_no=this.value.trim();saveStudentsDebounced()"></td>
      <td><input type="text" value="${esc(s.name)}" placeholder="Student Name" oninput="studentRows[${i}].name=this.value.trim();saveStudentsDebounced()"></td>
      <td>
        <select onchange="studentDeptChanged(${i},this.value)">
          ${DEPT_LIST.map(d=>`<option value="${d}" ${d===s.dept?'selected':''}>${d}</option>`).join('')}
        </select>
      </td>
      <td>
        <select onchange="studentRows[${i}].subject=this.value">
          <option value="${esc(s.subject)}" selected>${esc(s.subject)||'Select'}</option>
          ${subjOpts(s.dept,s.subject)}
        </select>
      </td>
      <td><input type="number" value="${s.semester}" min="1" max="8" style="width:50px" oninput="studentRows[${i}].semester=+this.value||3"></td>
      <td class="td-del"><button class="btn-del-row" onclick="removeStudentRow(${i})">✕</button></td>
    </tr>`).join('');
}

function studentDeptChanged(i,dept){
  studentRows[i].dept=dept;
  studentRows[i].subject=(SUBJECTS[dept]||[])[0]||'';
  renderStudentTable();
}

function addStudentRow(){
  const dept = DEPT_LIST[0];
  studentRows.push({register_no:'',name:'',dept,subject:(SUBJECTS[dept]||[])[0]||'',semester:3});
  renderStudentTable();
  // scroll to bottom of table
  const wrap=$('student-tbl-wrap'); if(wrap) wrap.scrollTop=wrap.scrollHeight;
}

function addMultipleRows(){
  const n=parseInt(prompt('How many rows to add?','10'))||0;
  for(let i=0;i<n;i++) addStudentRow();
}

function removeStudentRow(i){ studentRows.splice(i,1); renderStudentTable(); lsSave(LS.students, studentRows); }

function clearStudents(){ if(confirm('Clear all student rows?')){ studentRows=[]; renderStudentTable(); lsSave(LS.students, studentRows); } }

async function submitIndividual(){
  const errs=[];
  if(!manualHalls.length) errs.push('Add at least one hall.');
  if(!studentRows.length) errs.push('Add at least one student.');
  const regs=studentRows.map(s=>s.register_no.trim());
  regs.forEach((r,i)=>{ if(!r) errs.push(`Row ${i+1}: Register number is empty.`); });
  const dupes=[...new Set(regs.filter((r,i)=>r&&regs.indexOf(r)!==i))];
  if(dupes.length) errs.push(`Duplicate register numbers: ${dupes.join(', ')}`);
  if(errs.length){ showFormErrors(errs); return; }
  clearFormErrors();
  await submitManual({ halls:manualHalls, students:studentRows });
}

// ════════════════════════════════════════════════════════════
// MANUAL SUBMIT
// ════════════════════════════════════════════════════════════
async function submitManual(payload){
  setStatus('GENERATING…'); $('submit-bulk-btn').disabled=true; $('submit-ind-btn').disabled=true;
  try{
    const res  = await fetch('/api/manual',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data = await res.json();
    if(data.success){
      currentResult=data; activeHall=0;
      renderArrangement(data);
      toast(`✓ ${data.summary.total_allocated} students allocated across ${data.summary.halls_used} hall(s)`);
      setStatus('READY',true);
      saveAll();
    } else {
      showFormErrors(data.errors||['Unknown error.']);
      setStatus('ERROR');
    }
  }catch(ex){ showFormErrors([`Network error: ${ex.message}`]); setStatus('ERROR'); }
  $('submit-bulk-btn').disabled=false; $('submit-ind-btn').disabled=false;
}

function showFormErrors(errs){
  let el=$('form-errors');
  if(!el){ el=document.createElement('div'); el.id='form-errors'; $('manual-view').prepend(el); }
  el.className='verr'; el.innerHTML='<strong>Please fix:</strong><br>'+errs.map(e=>`• ${esc(e)}`).join('<br>');
  el.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function clearFormErrors(){ const el=$('form-errors'); if(el)el.remove(); }

// ════════════════════════════════════════════════════════════
// BULK FILE UPLOAD
// ════════════════════════════════════════════════════════════

function onDragOver(e, zoneId){
  e.preventDefault();
  $(zoneId).classList.add('drag-over');
}
function onDragLeave(zoneId){
  $(zoneId).classList.remove('drag-over');
}
function onDrop(e, type){
  e.preventDefault();
  const zoneId = type === 'departments' ? 'dept-upload-zone' : 'stu-upload-zone';
  $(zoneId).classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if(file) processUploadFile(file, type);
}

function handleFileUpload(input, type){
  if(input.files && input.files[0]) processUploadFile(input.files[0], type);
  input.value = ''; // reset so same file can be re-uploaded
}

async function processUploadFile(file, type){
  const statusId = type === 'departments' ? 'dept-upload-status' : 'stu-upload-status';
  const statusEl = $(statusId);
  const endpoint = `/api/upload/${type}`;

  // show loading
  statusEl.className = 'upload-status success';
  statusEl.classList.remove('hidden');
  statusEl.innerHTML = `<div class="us-title">⏳ Parsing ${esc(file.name)}…</div>`;

  const fd = new FormData();
  fd.append('file', file);

  try {
    const res  = await fetch(endpoint, { method:'POST', body:fd });
    const data = await res.json();

    if(data.error){
      statusEl.className = 'upload-status error';
      statusEl.innerHTML = `<div class="us-title">✕ Upload Failed</div><div class="us-row">${esc(data.error)}</div>`;
      return;
    }

    if(type === 'departments'){
      // load into dept rows
      if(data.rows && data.rows.length){
        manualDepts = data.rows;
        renderDeptRows();
      }
      statusEl.className = 'upload-status success';
      statusEl.innerHTML = `
        <div class="us-title">✓ ${data.rows.length} department(s) loaded from ${esc(file.name)}</div>
        ${data.errors && data.errors.length
          ? `<div class="us-err">⚠ ${data.errors.length} warning(s):<br>${data.errors.map(e=>`• ${esc(e)}`).join('<br>')}</div>`
          : '<div class="us-row">No issues found.</div>'}`;
      toast(`✓ ${data.rows.length} department rows loaded`);
      lsSave(LS.depts, manualDepts);

    } else {
      // load into student table
      if(data.rows && data.rows.length){
        studentRows = data.rows;
        renderStudentTable();
      }
      statusEl.className = 'upload-status success';
      statusEl.innerHTML = `
        <div class="us-title">✓ ${data.count} student(s) loaded from ${esc(file.name)}</div>
        ${data.errors && data.errors.length
          ? `<div class="us-err">⚠ ${data.errors.length} warning(s):<br>${data.errors.map(e=>`• ${esc(e)}`).join('<br>')}</div>`
          : '<div class="us-row">No issues found.</div>'}`;
      toast(`✓ ${data.count} students loaded`);
      lsSave(LS.students, studentRows);
    }

  } catch(ex){
    statusEl.className = 'upload-status error';
    statusEl.innerHTML = `<div class="us-title">✕ Error</div><div class="us-row">${esc(ex.message)}</div>`;
  }
}

function clearDeptRows(){ if(confirm('Clear all department rows?')){ manualDepts=[]; renderDeptRows(); lsSave(LS.depts, manualDepts); } }

// ════════════════════════════════════════════════════════════
// RESHUFFLE / EXPORT / CLEAR
// ════════════════════════════════════════════════════════════
async function doReshuffle(){
  if(!currentResult){ toast('No arrangement to reshuffle.'); return; }
  setStatus('RESHUFFLING…');
  try{
    const data=await fetch('/api/reshuffle').then(r=>r.json());
    if(data.result&&data.result.success){ currentResult=data.result; activeHall=0; renderArrangement(currentResult); toast('Seats reshuffled'); saveAll(); }
    setStatus('READY',true);
  }catch(ex){ setStatus('ERROR'); toast('Reshuffle failed.'); }
}

function doExport(fmt){ if(!currentResult){toast('Nothing to export.');return;} window.location.href=`/api/export/${fmt}`; toast(`Downloading ${fmt.toUpperCase()}…`); }

async function clearAll(){
  await fetch('/api/clear').catch(()=>{});
  currentResult=null; chatHistory=[]; activeHall=0; viewMode='grid';
  lsClear();
  $('empty-state').classList.remove('hidden');
  $('hall-view').classList.add('hidden');
  $('stats-strip').classList.add('hidden');
  $('util-strip').classList.add('hidden');
  $('hall-nav').classList.add('hidden');
  $('btn-xlsx').style.display=$('btn-csv').style.display=$('btn-clr').style.display='none';
  $('messages').innerHTML='<div class="sys-msg">── SESSION CLEARED ──</div>';
  pushMsg('ai','Session cleared. Enter a new exam setup.');
  setStatus('READY',true); toast('Session cleared');
}

// ════════════════════════════════════════════════════════════
// RENDER ARRANGEMENT
// ════════════════════════════════════════════════════════════
function renderArrangement(res){
  const halls=res.halls.filter(h=>h.occupied>0);
  const s=res.summary;

  $('sv-total').textContent=s.total_allocated;
  $('sv-halls').textContent=s.halls_used;
  $('sv-depts').textContent=s.departments.length;
  $('sv-pct').textContent=s.overall_util+'%';
  $('stats-strip').classList.remove('hidden');

  const us=$('util-strip');
  us.classList.remove('hidden');
  us.innerHTML=s.utilization.filter(h=>h.occupied>0).map(h=>{
    const dots=(h.depts||[]).map(d=>`<span class="u-dept-dot" style="background:${(typeof deptColor!=='undefined'?deptColor(d):'#888')}" title="${d}"></span>`).join('');
    return `<div class="urow">
      <div class="uname">${esc(h.name)}</div>
      <div class="ubar"><div class="ufill" style="width:${h.pct}%"></div></div>
      <div class="upct">${h.occupied}/${h.capacity}</div>
      <div class="u-depts">${dots}</div>
    </div>`;
  }).join('');

  const nav=$('hall-nav');
  nav.classList.remove('hidden');
  $('htabs').innerHTML=halls.map((h,i)=>{
    const COLORS={CSE:'#6366f1',ECE:'#10b981',MECH:'#f59e0b',CIVIL:'#ef4444',EEE:'#8b5cf6',IT:'#06b6d4',AUTO:'#f97316',CSDS:'#ec4899',OTHER:'#64748b'};
    const dots=(h.depts||[]).map(d=>`<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${COLORS[d]||COLORS.OTHER};margin-left:3px;vertical-align:middle"></span>`).join('');
    return `<button class="htab ${i===0?'on':''}" id="ht-${i}" onclick="switchHall(${i})">
      ${esc(h.name)}${dots}&nbsp;<span style="opacity:.45;font-size:9px">(${h.occupied})</span>
    </button>`;
  }).join('');

  // warnings — split into suggestion (min halls) vs regular warnings
  if(res.warnings&&res.warnings.length){
    let el=$('arrangement-warnings');
    if(!el){ el=document.createElement('div'); el.id='arrangement-warnings'; $('seating-body').prepend(el); }
    // Separate the "add more halls" suggestion from other warnings
    const suggestions = res.warnings.filter(w=>w.includes('For zero malpractice'));
    const regular     = res.warnings.filter(w=>!w.includes('For zero malpractice'));
    let html = '';
    if(suggestions.length){
      html += `<div class="vsugg">💡 ${esc(suggestions[0])}</div>`;
    }
    if(regular.length){
      html += `<div class="vwarn">${regular.map(w=>`⚠ ${esc(w)}`).join('<br>')}</div>`;
    }
    el.innerHTML = html;
  } else { const el=$('arrangement-warnings'); if(el)el.remove(); }

  $('empty-state').classList.add('hidden');
  $('hall-view').classList.remove('hidden');
  $('btn-xlsx').style.display=$('btn-csv').style.display=$('btn-clr').style.display='inline-flex';
  renderHall(halls[0]);
}

function switchHall(idx){
  activeHall=idx;
  lsSave(LS.hall, activeHall);
  document.querySelectorAll('.htab').forEach((t,i)=>t.classList.toggle('on',i===idx));
  const halls=currentResult.halls.filter(h=>h.occupied>0);
  if(halls[idx]) renderHall(halls[idx]);
}

function setView(mode){
  viewMode=mode;
  lsSave(LS.view, viewMode);
  document.querySelectorAll('.vbtn').forEach(b=>b.classList.toggle('active',b.dataset.view===mode));
  if(!currentResult)return;
  const halls=currentResult.halls.filter(h=>h.occupied>0);
  if(halls[activeHall]) renderHall(halls[activeHall]);
}

const KNOWN=['CSE','ECE','MECH','CIVIL','EEE','IT','AUTO','CSDS','MBA','MCA'];
const dk=dept=>KNOWN.includes((dept||'').toUpperCase())?dept.toUpperCase():'OTHER';

// Dept color map for JS use
const DEPT_COLORS={
  CSE:'#6366f1',ECE:'#10b981',MECH:'#f59e0b',CIVIL:'#ef4444',
  EEE:'#8b5cf6',IT:'#06b6d4',AUTO:'#f97316',CSDS:'#ec4899',OTHER:'#64748b'
};
const DEPT_TEXT_DARK={MECH:true,IT:true}; // depts where dark text needed on badge

function deptColor(d){ return DEPT_COLORS[dk(d)]||DEPT_COLORS.OTHER; }

function renderHall(hall){
  const occ=(hall.seats||[]).filter(s=>s.student);
  const depts=[...new Set(occ.map(s=>dk(s.student.dept)))];

  // Legend
  const legend=depts.map(d=>`
    <div class="leg">
      <div class="leg-sq leg-${d}" style="background:${deptColor(d)}"></div>${d}
    </div>`).join('');

  // Dept badges
  const badges=depts.map(d=>{
    const dark=DEPT_TEXT_DARK[d];
    return `<span class="dept-badge" style="background:${deptColor(d)};color:${dark?'#000':'#fff'}">${d}</span>`;
  }).join('');

  // Header card
  const header=`<div class="hall-header-card">
    <div class="hall-header-left">
      <div class="hall-header-title">${esc(hall.name)}</div>
      <div class="hall-header-meta">
        <div class="hall-meta-item">Capacity <span class="hall-meta-val">${hall.capacity}</span></div>
        <div class="hall-meta-item">Occupied <span class="hall-meta-val">${hall.occupied}</span></div>
        <div class="hall-meta-item">Utilization <span class="hall-meta-val">${hall.utilization}%</span></div>
      </div>
    </div>
    <div class="hall-dept-badges">${badges}</div>
  </div>`;

  $('hall-view').innerHTML=`<div class="legend">${legend}</div>${header}${viewMode==='grid'?renderGrid(hall):renderList(hall)}`;
}

function renderGrid(hall){
  const rows=hall.rows||5, cols=hall.cols||5;
  const smap={};
  (hall.seats||[]).forEach(s=>{ if(s.row&&s.col) smap[`${s.row}-${s.col}`]=s; });
  const hasCoords=Object.keys(smap).length>0;
  const seq=hall.seats||[]; let si=0;
  let cells='';
  for(let r=1;r<=rows;r++) for(let c=1;c<=cols;c++){
    let s=hasCoords?smap[`${r}-${c}`]:seq[si++];
    const id=s?.seat_id||`${String.fromCharCode(64+r)}${c}`;
    if(s?.student){
      const d=dk(s.student.dept);
      const dark=DEPT_TEXT_DARK[d];
      cells+=`<div class="seat dc-${d}" title="${esc(s.student.name)} · ${esc(s.student.subject)} · Sem ${s.student.semester}">
        <div class="s-id">${id}</div>
        <div class="s-reg">${esc(s.student.register_no)}</div>
        <div class="s-name">${esc(s.student.name.split(' ')[0])}</div>
        <div class="s-sem">Sem ${s.student.semester}</div>
        <div class="s-tag dt-${d}">${d}</div>
      </div>`;
    } else cells+=`<div class="seat empty"><div class="s-id">${id}</div></div>`;
  }
  return `<div class="seat-grid" style="grid-template-columns:repeat(${cols},1fr)">${cells}</div>
    <div class="front-label">▲ front — invigilator's desk</div>`;
}

function renderList(hall){
  const rows=(hall.seats||[]).filter(s=>s.student).map(s=>{
    const d=dk(s.student.dept);
    const dark=DEPT_TEXT_DARK[d];
    return `<tr>
      <td>${esc(s.seat_id||'—')}</td>
      <td>${esc(s.student.register_no)}</td>
      <td>${esc(s.student.name)}</td>
      <td><span class="s-tag dt-${d}">${d}</span></td>
      <td>${esc(s.student.subject)}</td>
      <td><span class="sem-badge">Sem ${s.student.semester}</span></td>
    </tr>`;
  }).join('');
  return `<div class="list-wrap"><table class="list-tbl">
    <thead><tr><th>Seat</th><th>Register No</th><th>Name</th><th>Dept</th><th>Subject</th><th>Sem</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

// ════════════════════════════════════════════════════════════
// INIT — restore all state from localStorage on page load
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', ()=>{

  // ── Restore or set defaults for manual config ────────────
  manualHalls = lsLoad(LS.halls, []);
  // Clear stale 3-hall default that was hardcoded in older versions
  if(manualHalls.length===3 &&
     ['hall a','hall b','hall c'].every((n,i)=>manualHalls[i]&&manualHalls[i].name.toLowerCase()===n)){
    manualHalls = [];
    lsSave(LS.halls, manualHalls);
  }
  renderHallsList();

  manualDepts = lsLoad(LS.depts, [
    {dept:'CSE',  count:20, semester:3, subject:''},
    {dept:'ECE',  count:18, semester:3, subject:''},
    {dept:'MECH', count:15, semester:3, subject:''},
    {dept:'CIVIL',count:12, semester:3, subject:''},
    {dept:'EEE',  count:10, semester:3, subject:''},
  ]);
  renderDeptRows();

  studentRows = lsLoad(LS.students, []);
  if(studentRows.length) renderStudentTable();

  // ── Restore chat history ─────────────────────────────────
  const savedChat = lsLoad(LS.chat, []);
  if(savedChat.length){
    chatHistory = savedChat;
    // replay messages into the UI (skip the initial AI greeting already in HTML)
    const msgs = $('messages');
    // clear default greeting
    msgs.innerHTML = '<div class="sys-msg">── SESSION RESTORED ──</div>';
    chatHistory.forEach(m => pushMsg(m.role === 'user' ? 'user' : 'ai',
      esc(m.content).replace(/\n/g,'<br>')));
  }

  // ── Restore view/input/entry mode ───────────────────────
  const savedView  = lsLoad(LS.view,  'grid');
  const savedInput = lsLoad(LS.input, 'ai');
  const savedEntry = lsLoad(LS.entry, 'bulk');

  viewMode = savedView;
  document.querySelectorAll('.vbtn').forEach(b =>
    b.classList.toggle('active', b.dataset.view === viewMode));

  switchMode(savedInput);
  if(savedEntry !== 'bulk') switchItab(savedEntry);

  // ── Restore seating arrangement ──────────────────────────
  const savedResult = lsLoad(LS.result, null);
  if(savedResult && savedResult.success !== false && savedResult.halls && savedResult.halls.length){
    currentResult = savedResult;
    activeHall    = lsLoad(LS.hall, 0);
    renderArrangement(currentResult);
    // restore the active hall tab
    setTimeout(()=>{
      const halls = currentResult.halls.filter(h=>h.occupied>0);
      if(halls[activeHall]) switchHall(activeHall);
    }, 0);
    setStatus('RESTORED', true);
    toast('Session restored from last visit');
  } else {
    setStatus('READY', true);
  }
});
