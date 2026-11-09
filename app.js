const STORAGE_KEY = 'veritas-attendance-v1';
const $ = (selector) => document.querySelector(selector);
const studentForm = $('#student-form');
const attendanceForm = $('#attendance-form');
let state = loadState();
let deferredInstallPrompt = null;

function loadState() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { students: Array.isArray(value.students) ? value.students : [], records: Array.isArray(value.records) ? value.records : [] };
  } catch { return { students: [], records: [] }; }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function makeId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function formatDateTime(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }).format(date).replace(/\. /g, '.').replace(/\.$/, '');
}
function localDateTimeValue(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function render() {
  const now = new Date();
  $('#today-label').textContent = new Intl.DateTimeFormat('ko-KR', { month:'long', day:'numeric', weekday:'short' }).format(now);
  const todayKey = now.toLocaleDateString('ko-KR');
  const todayCount = state.records.filter((record) => new Date(record.time).toLocaleDateString('ko-KR') === todayKey).length;
  $('#today-count').textContent = `출석 ${todayCount}명`;
  $('#student-count').textContent = state.students.length;
  $('#record-count').textContent = state.records.length;
  const select = $('#attendance-student');
  const previous = select.value;
  select.innerHTML = state.students.length ? '<option value="">학생을 선택해 주세요</option>' + state.students.map((student) => `<option value="${escapeHTML(student.id)}">${escapeHTML(student.name)}</option>`).join('') : '<option value="">학생을 먼저 등록해 주세요</option>';
  if (state.students.some((student) => student.id === previous)) select.value = previous;
  $('#empty-students').hidden = state.students.length > 0;
  $('#student-list').innerHTML = state.students.map((student) => `<li class="student-item"><span class="avatar">${escapeHTML(student.name.slice(0,1))}</span><div class="student-meta"><strong>${escapeHTML(student.name)}</strong><span>보호자 ${escapeHTML(student.phone)}</span></div><button class="text-button" type="button" data-delete-student="${escapeHTML(student.id)}">삭제</button></li>`).join('');
  $('#empty-records').hidden = state.records.length > 0;
  $('#record-list').innerHTML = state.records.slice().sort((a,b) => new Date(b.time) - new Date(a.time)).map((record) => `<tr><td><input class="record-checkbox" type="checkbox" value="${escapeHTML(record.id)}" aria-label="${escapeHTML(record.name)} 출결 기록 선택"></td><td class="student-cell">${escapeHTML(record.name)}</td><td class="time-cell">${escapeHTML(formatDateTime(record.time))}</td><td><button class="sms-button" type="button" data-send="${escapeHTML(record.id)}">문자 작성</button></td></tr>`).join('');
  $('#select-all').checked = false;
  updateDeleteButton();
}
function messageFor(record) {
  const time = formatDateTime(record.time);
  return `[베리타스 러닝센터] 안녕하세요, 보호자님. ${record.name} 학생이 ${time}에 안전하게 출석하였습니다. 오늘도 학생이 학습에 집중할 수 있도록 세심히 지도하겠습니다. 감사합니다.`;
}
function openSMS(record) {
  const student = state.students.find((item) => item.id === record.studentId);
  if (!student) { alert('학생 명단에서 보호자 연락처를 찾을 수 없습니다. 학생 정보를 확인해 주세요.'); return; }
  const phone = student.phone.replace(/[^\d+]/g, '');
  const href = `sms:${phone}?body=${encodeURIComponent(messageFor(record))}`;
  window.location.href = href;
}
studentForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('#student-name').value.trim();
  const phone = $('#parent-phone').value.trim();
  if (!name || !phone) return;
  if (state.students.some((student) => student.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { alert('같은 이름의 학생이 이미 등록되어 있습니다.'); return; }
  state.students.push({ id: makeId(), name, phone });
  saveState(); studentForm.reset(); render(); $('#student-name').focus();
});
$('#student-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-delete-student]');
  if (!button) return;
  const student = state.students.find((item) => item.id === button.dataset.deleteStudent);
  if (!student || !confirm(`${student.name} 학생을 명단에서 삭제할까요? 기존 출결 기록은 보존됩니다.`)) return;
  state.students = state.students.filter((item) => item.id !== student.id);
  saveState(); render();
});
attendanceForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const student = state.students.find((item) => item.id === $('#attendance-student').value);
  const time = $('#attendance-time').value;
  if (!student || !time) { alert('학생과 출석 시간을 확인해 주세요.'); return; }
  const record = { id: makeId(), studentId: student.id, name: student.name, time: new Date(time).toISOString() };
  state.records.push(record); saveState(); render(); openSMS(record);
});
$('#record-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-send]');
  if (!button) return;
  const record = state.records.find((item) => item.id === button.dataset.send);
  if (record) openSMS(record);
});
$('#record-list').addEventListener('change', updateDeleteButton);
$('#select-all').addEventListener('change', (event) => {
  document.querySelectorAll('.record-checkbox').forEach((checkbox) => { checkbox.checked = event.target.checked; });
  updateDeleteButton();
});
function updateDeleteButton() {
  const checked = document.querySelectorAll('.record-checkbox:checked').length;
  $('#delete-selected').disabled = checked === 0;
  $('#delete-selected').textContent = checked ? `선택 삭제 (${checked})` : '선택 삭제';
}
$('#delete-selected').addEventListener('click', () => {
  const selected = new Set([...document.querySelectorAll('.record-checkbox:checked')].map((checkbox) => checkbox.value));
  if (!selected.size || !confirm(`선택한 ${selected.size}개의 출결 기록을 삭제할까요?`)) return;
  state.records = state.records.filter((record) => !selected.has(record.id));
  saveState(); render();
});
$('#attendance-time').value = localDateTimeValue();
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault(); deferredInstallPrompt = event; $('#install-button').hidden = false;
});
$('#install-button').addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $('#install-button').hidden = true;
});
window.addEventListener('appinstalled', () => { $('#install-button').hidden = true; });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch((error) => console.warn('오프라인 앱 등록 실패:', error)));
}
render();
