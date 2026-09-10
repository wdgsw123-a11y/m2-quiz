/* ================= M2 刷题站 app.js ================= */
const DATA_URL = 'questions.json';
const LS_KEY = 'm2quiz_state_v1';   // { cardId: 'known' | 'unknown' }

let decks = [];           // 原始数据
let state = loadState();  // 本地进度
let current = [];         // 当前刷题队列（card 对象）
let idx = 0;
let mode = null;          // 'study' | 'review'

/* ---------- 工具 ---------- */
function $(id) { return document.getElementById(id); }
function loadState() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }
function saveState() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* storage 不可用时静默 */ } }

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ---------- 统计 ---------- */
function allCards() { return decks.flatMap(d => d.cards); }
function countBy(pred) { return allCards().filter(pred).length; }
function refreshStats() {
  const total = allCards().length;
  const done = countBy(c => state[c.id]);
  const mastered = countBy(c => state[c.id] === 'known');
  $('stat-total').textContent = total;
  $('stat-done').textContent = done;
  $('stat-mastered').textContent = mastered;
  const wrong = countBy(c => state[c.id] === 'unknown');
  $('wrong-count').textContent = wrong ? `(${wrong})` : '';
}

/* ---------- 首页：deck 列表 ---------- */
function renderHome() {
  const list = $('deck-list');
  list.innerHTML = '';
  const subjects = { sdbm: '结构测定 SDBM', iscb: '整合结构细胞生物 ISCB' };
  let lastSubject = null;
  for (const d of decks) {
    if (d.id !== lastSubject) {
      lastSubject = d.id;
      const h = document.createElement('div');
      h.className = 'subject';
      h.textContent = '◆ ' + (subjects[d.id] || d.id).toUpperCase();
      list.appendChild(h);
    }
    const done = d.cards.filter(c => state[c.id]).length;
    const el = document.createElement('div');
    el.className = 'deck';
    el.innerHTML = `
      <div class="deck-name">${esc(d.name)}</div>
      <div class="deck-meta">${done}/${d.cards.length}</div>`;
    el.onclick = () => startStudy(d);
    list.appendChild(el);
  }
}

/* ---------- 刷题 ---------- */
function startStudy(deck) {
  mode = 'study';
  current = deck.cards.slice();
  idx = 0;
  $('study-deck-name').textContent = deck.name;
  show('study');
  showCard();
}

function showCard() {
  const card = current[idx];
  if (!card) { finish(); return; }
  $('study-counter').textContent = `${idx + 1} / ${current.length}`;
  $('study-progress').style.width = (idx / current.length * 100) + '%';
  $('card').classList.remove('flipped');
  $('btn-again').hidden = true;
  $('btn-know').hidden = true;
  $('card-hint').textContent = '点击卡片翻答案';
  const tag = state[card.id] === 'unknown' ? '✗ 错题' : (state[card.id] === 'known' ? '✓ 已会' : '');
  $('card-tag').textContent = tag;
  $('q-en').innerHTML = esc(card.q_en).replace(/\n/g, '<br>');
  $('q-zh').innerHTML = card.q_zh ? esc(card.q_zh).replace(/\n/g, '<br>') : '';
  $('a-text').textContent = card.a || '（无答案）';
}

function flip() {
  const c = $('card');
  if (c.classList.contains('flipped')) return;
  c.classList.add('flipped');
  $('btn-again').hidden = false;
  $('btn-know').hidden = false;
  $('card-hint').textContent = '左滑 / 点「不会」　　右滑 / 点「会了」';
}

function answer(known) {
  const card = current[idx];
  state[card.id] = known ? 'known' : 'unknown';
  saveState();
  idx++;
  showCard();
}

function finish() {
  $('study-counter').textContent = '完成';
  $('study-progress').style.width = '100%';
  $('card').innerHTML = '<div class="empty"><span class="big">✓</span>本轮刷完！<br>回首页看下一套</div>';
  $('card').classList.add('flipped');
  $('btn-again').hidden = true;
  $('btn-know').hidden = true;
  $('card-hint').textContent = '';
  refreshStats();
}

/* ---------- 错题本 ---------- */
function startReview() {
  mode = 'review';
  const wrongCards = allCards().filter(c => state[c.id] === 'unknown');
  if (!wrongCards.length) {
    $('home').hidden = true;
    $('study').hidden = true;
    $('review').hidden = false;
    $('review-counter').textContent = '';
    $('card2').innerHTML = '<div class="empty"><span class="big">✧</span>没有错题！<br>全都掌握啦～</div>';
    $('card2').classList.add('flipped');
    $('btn-again2').hidden = true;
    $('btn-know2').hidden = true;
    return;
  }
  current = wrongCards;
  idx = 0;
  show('review');
  showReviewCard();
}

function showReviewCard() {
  const card = current[idx];
  if (!card) { finishReview(); return; }
  $('review-counter').textContent = `${idx + 1} / ${current.length}`;
  $('review-progress').style.width = (idx / current.length * 100) + '%';
  $('card2').classList.remove('flipped');
  $('btn-again2').hidden = true;
  $('btn-know2').hidden = true;
  $('card2-tag').textContent = '✗ 错题';
  $('q2-en').innerHTML = esc(card.q_en).replace(/\n/g, '<br>');
  $('q2-zh').innerHTML = card.q_zh ? esc(card.q_zh).replace(/\n/g, '<br>') : '';
  $('a2-text').textContent = card.a || '（无答案）';
}

function flip2() {
  const c = $('card2');
  if (c.classList.contains('flipped')) return;
  c.classList.add('flipped');
  $('btn-again2').hidden = false;
  $('btn-know2').hidden = false;
}

function answer2(known) {
  const card = current[idx];
  if (known) {
    state[card.id] = 'known';  // 从错题本移除
    saveState();
  }
  // 重新计算剩余错题
  const remaining = current.filter(c => state[c.id] === 'unknown');
  current = remaining;
  if (!remaining.length) { finishReview(); return; }
  idx = idx < remaining.length ? idx : 0;
  showReviewCard();
}

function finishReview() {
  $('review-counter').textContent = '完成';
  $('review-progress').style.width = '100%';
  $('card2').innerHTML = '<div class="empty"><span class="big">✓</span>错题清空！</div>';
  $('card2').classList.add('flipped');
  $('btn-again2').hidden = true;
  $('btn-know2').hidden = true;
  refreshStats();
}

/* ---------- 页面切换 ---------- */
function show(name) {
  $('home').hidden = name !== 'home';
  $('study').hidden = name !== 'study';
  $('review').hidden = name !== 'review';
}

/* ---------- 滑动手势 ---------- */
function attachSwipe(el, onLeft, onRight) {
  let sx = 0, sy = 0;
  el.addEventListener('touchstart', e => {
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) onLeft(); else onRight();
  }, { passive: true });
}

/* ---------- 事件绑定 ---------- */
$('card').onclick = () => { if (mode === 'study') flip(); };
$('card2').onclick = () => { if (mode === 'review') flip2(); };
$('btn-know').onclick = () => answer(true);
$('btn-again').onclick = () => answer(false);
$('btn-know2').onclick = () => answer2(true);
$('btn-again2').onclick = () => answer2(false);
$('btn-back').onclick = () => { refreshStats(); renderHome(); show('home'); };
$('btn-back2').onclick = () => { refreshStats(); renderHome(); show('home'); };
$('btn-wrong').onclick = () => startReview();

attachSwipe($('card'),
  () => { if (mode === 'study' && $('card').classList.contains('flipped')) answer(false); },
  () => { if (mode === 'study' && $('card').classList.contains('flipped')) answer(true); });
attachSwipe($('card2'),
  () => { if (mode === 'review' && $('card2').classList.contains('flipped')) answer2(false); },
  () => { if (mode === 'review' && $('card2').classList.contains('flipped')) answer2(true); });

/* ---------- 启动 ---------- */
fetch(DATA_URL)
  .then(r => r.json())
  .then(data => {
    decks = data;
    refreshStats();
    renderHome();
  })
  .catch(err => {
    $('deck-list').innerHTML = `<div class="empty"><span class="big">⚠</span>加载失败：${esc(err.message)}</div>`;
  });
