let events = [];
let currentFilter = 'All';
const list = document.querySelector('#event-list');
const status = document.querySelector('#events-status');
const select = document.querySelector('#event');
const formStatus = document.querySelector('#form-status');
const submit = document.querySelector('#submit-button');
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateText = value => new Date(value + 'T00:00:00+05:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' });

function render() {
  const visible = events.filter(e => currentFilter === 'All' || e.category === currentFilter);
  status.textContent = visible.length ? '' : 'No events in this category.';
  list.innerHTML = visible.map(e => `<article class="event-card"><div class="card-top"><span class="category">${escapeHtml(e.category)}</span><span class="event-index">0${e.id}</span></div><h3>${escapeHtml(e.title)}</h3><p>${escapeHtml(e.description)}</p><div class="event-meta">${dateText(e.event_date)} · ${escapeHtml(e.start_time)} PKT · ${escapeHtml(e.venue)}</div><div class="card-bottom"><span>${e.remaining} spots available</span><button type="button" data-event="${e.id}" ${e.remaining < 1 ? 'disabled' : ''}>${e.remaining < 1 ? 'Fully booked' : 'Register ↗'}</button></div></article>`).join('');
  const selected = select.value;
  select.replaceChildren(new Option('Select your event', ''));
  for (const event of events) {
    const option = new Option(`${event.title}${event.remaining < 1 ? ' (Fully booked)' : ''}`, event.id);
    option.disabled = event.remaining < 1;
    select.add(option);
  }
  if (events.some(e => String(e.id) === selected && e.remaining > 0)) select.value = selected;
  document.querySelector('#schedule-list').innerHTML = events.map(e => `<article><time>${dateText(e.event_date)}<br>${escapeHtml(e.start_time)} PKT</time><div><b>${escapeHtml(e.title)}</b><small>${escapeHtml(e.venue)}</small></div></article>`).join('');
  submit.disabled = !events.some(e => e.remaining > 0);
}
async function loadEvents() {
  const response = await fetch('/api/events');
  if (!response.ok) throw Error('Events could not be loaded. Please refresh to try again.');
  events = await response.json();
  render();
}
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  currentFilter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
  render();
}));
list.addEventListener('click', event => {
  const button = event.target.closest('[data-event]');
  if (!button || button.disabled) return;
  select.value = button.dataset.event;
  document.querySelector('#register').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  document.querySelector('#name').focus({ preventScroll: true });
});
document.querySelector('#registration-form').addEventListener('submit', async event => {
  event.preventDefault();
  submit.disabled = true;
  submit.textContent = 'Submitting...';
  formStatus.textContent = '';
  formStatus.className = '';
  try {
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch('/api/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Registration failed. Please try again.');
    formStatus.className = 'success';
    formStatus.textContent = `Thank you, ${result.name}! You are registered for ${result.event}. Your reference is #${result.id}.`;
    event.target.reset();
    try { await loadEvents(); } catch { status.textContent = 'Registration saved. Refresh to update available places.'; }
  } catch (error) { formStatus.className = 'error'; formStatus.textContent = error.message; }
  finally { submit.disabled = !events.some(e => e.remaining > 0); submit.textContent = 'Confirm registration ↗'; }
});
loadEvents().catch(error => { status.textContent = error.message; document.querySelector('#schedule-list').textContent = 'Schedule unavailable. Please refresh.'; select.replaceChildren(new Option('Events unavailable', '')); });
