/* ================= M2 刷题站 app.js ================= */
const DATA_URL = 'questions.json';
const LS_KEY = 'm2quiz_state_v1';   // { cardId: 'known' | 'unknown' }

let decks = [];
let state = loadState();
let current = [];
let idx = 0;
let mode = null;   // 'study' | 'review'
let langMode = loadLang();   // 'bilingual' | 'english'

/* ---------- 工具 ---------- */
function $(id) { return document.getElementById(id); }
function loadState() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }
function saveState() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }
function loadLang() { try { return localStorage.getItem('m2quiz_lang_v1') || 'bilingual'; } catch (e) { return 'bilingual'; } }
function saveLang(m) { try { localStorage.setItem('m2quiz_lang_v1', m); } catch (e) {} }
function isEnglish() { return langMode === 'english'; }
function stripCJK(text) {
  if (!text) return text;
  return text.split('\n')
    .map(l => l
      .replace(/（[^）]*）/g, '')
      .replace(/\([^)]*[\u4e00-\u9fff][^)]*\)/g, '')
      .replace(/[，。；：、]/g, ch => ({'，': ',', '。': '.', '；': ';', '：': ':', '、': ','}[ch] || ch))
      .trim())
    .filter(l => l && !/[\u4e00-\u9fff]/.test(l))
    .join('\n');
}
function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function renderText(text) {
  if (!text) return '';
  return text.split(/(!\[[^\]]*\]\([^)]+\))/g)
    .map(part => {
      const m = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      return m ? `<img src="${esc(m[2])}" alt="${esc(m[1])}" loading="lazy">` : esc(part);
    })
    .join('')
    .replace(/\n/g, '<br>');
}
function hint(isReview, text) { document.getElementById(isReview ? 'card-hint' : 'card-hint').textContent = text; }

/* ---------- 统计 ---------- */
function allCards() { return decks.flatMap(d => d.cards); }
function countBy(pred) { return allCards().filter(pred).length; }
function refreshStats() {
  $('stat-total').textContent = allCards().length;
  $('stat-done').textContent = countBy(c => state[c.id]);
  $('stat-mastered').textContent = countBy(c => state[c.id] === 'known');
  const wrong = countBy(c => state[c.id] === 'unknown');
  $('wrong-count').textContent = wrong ? `(${wrong})` : '';
}

/* ---------- 首页 deck 列表 ---------- */
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
    el.innerHTML = `<div class="deck-name">${esc(d.name)}</div>
      <div class="deck-meta">${done}/${d.cards.length}</div>`;
    el.onclick = () => startStudy(d);
    list.appendChild(el);
  }
}

/* ---------- 渲染单卡（mcq / fill / sa 三种题型） ---------- */
function renderCard(card, isReview) {
  const p = isReview ? '2' : '';
  const $cardEl = $(isReview ? 'card2' : 'card');
  $cardEl.classList.remove('flipped', 'mcq');
  $(`options${p}`).innerHTML = '';
  $(`btn-again${p}`).hidden = true;
  $(`btn-know${p}`).hidden = true;
  $(`btn-next${p}`).hidden = true;

  const eng = isEnglish();
  $(`q${p}-en`).innerHTML = renderText(card.q_en);
  $(`q${p}-zh`).style.display = eng ? 'none' : '';
  $(`q${p}-zh`).innerHTML = renderText(card.q_zh);
  const aText = eng ? stripCJK(card.a || card.explain) : (card.a || card.explain);
  $(`a${p}-text`).innerHTML = renderText(aText) || (eng ? '(no answer)' : '（无答案）');

  if (card.type === 'mcq') {
    $cardEl.classList.add('mcq');
    const labels = ['A', 'B', 'C', 'D'];
    (card.options || []).forEach((opt, i) => {
      const b = document.createElement('button');
      b.className = 'opt';
      b.textContent = `${labels[i]}) ${eng ? stripCJK(opt) : opt}`;
      b.onclick = () => answerMcq(i, card, isReview);
      $(`options${p}`).appendChild(b);
    });
    $cardEl.onclick = null;
    hint(isReview, eng ? 'Tap an option to answer' : '点击选项作答');
  } else {
    $cardEl.onclick = () => flip(isReview);
    hint(isReview, eng ? 'Tap the card to reveal answer' : '点击卡片翻答案');
  }
}

function flip(isReview) {
  const p = isReview ? '2' : '';
  $(isReview ? 'card2' : 'card').classList.add('flipped');
  $(`btn-again${p}`).hidden = false;
  $(`btn-know${p}`).hidden = false;
  hint(isReview, '左滑 / 点「不会」　　右滑 / 点「会了」');
}

function answerMcq(pickedIdx, card, isReview) {
  const p = isReview ? '2' : '';
  const opts = document.querySelectorAll(`#options${p} .opt`);
  const known = (pickedIdx === card.correct);
  opts.forEach((o, i) => {
    o.classList.add('locked');
    if (i === card.correct) o.classList.add('correct');
    else if (i === pickedIdx) o.classList.add('wrong');
  });
  $(isReview ? 'card2' : 'card').classList.add('flipped');

  // 记状态
  if (isReview) {
    if (known) { state[card.id] = 'known'; saveState(); }
  } else {
    state[card.id] = known ? 'known' : 'unknown';
    saveState();
  }
  $(`btn-next${p}`).hidden = false;
  hint(isReview, known ? '✓ 答对了！' : '✗ 答错了（已进错题本）');
}

/* ---------- 刷题流程 ---------- */
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
  const tag = state[card.id] === 'unknown' ? '✗ 错题' : (state[card.id] === 'known' ? '✓ 已会' : '');
  $('card-tag').textContent = tag;
  renderCard(card, false);
}

function answer(known) {
  const card = current[idx];
  state[card.id] = known ? 'known' : 'unknown';
  saveState();
  idx++;
  showCard();
}

function nextCard() { idx++; showCard(); }

function finish() {
  $('study-counter').textContent = '完成';
  $('study-progress').style.width = '100%';
  $('card').innerHTML = '<div class="empty"><span class="big">✓</span>本轮刷完！<br>回首页看下一套</div>';
  $('card').classList.add('flipped');
  $('btn-again').hidden = true; $('btn-know').hidden = true; $('btn-next').hidden = true;
  $('card-hint').textContent = '';
  refreshStats();
}

/* ---------- 错题本 ---------- */
function startReview() {
  mode = 'review';
  current = allCards().filter(c => state[c.id] === 'unknown');
  if (!current.length) {
    $('home').hidden = true; $('study').hidden = true; $('review').hidden = false;
    $('review-counter').textContent = '';
    $('card2').innerHTML = '<div class="empty"><span class="big">✧</span>没有错题！<br>全都掌握啦～</div>';
    $('card2').classList.add('flipped');
    $('btn-again2').hidden = true; $('btn-know2').hidden = true; $('btn-next2').hidden = true;
    return;
  }
  idx = 0;
  show('review');
  showReviewCard();
}

function showReviewCard() {
  const card = current[idx];
  if (!card) { finishReview(); return; }
  $('review-counter').textContent = `${idx + 1} / ${current.length}`;
  $('review-progress').style.width = (idx / current.length * 100) + '%';
  $('card2-tag').textContent = '✗ 错题';
  renderCard(card, true);
}

function answer2(known) {
  const card = current[idx];
  if (known) { state[card.id] = 'known'; saveState(); }
  current = current.filter(c => state[c.id] === 'unknown');
  if (!current.length) { finishReview(); return; }
  if (idx >= current.length) idx = 0;
  showReviewCard();
}

function nextReviewCard() {
  // MCQ 在错题本答对后已从 current 移除，重新取剩余
  current = current.filter(c => state[c.id] === 'unknown');
  if (!current.length) { finishReview(); return; }
  if (idx >= current.length) idx = 0;
  showReviewCard();
}

function finishReview() {
  $('review-counter').textContent = '完成';
  $('review-progress').style.width = '100%';
  $('card2').innerHTML = '<div class="empty"><span class="big">✓</span>错题清空！</div>';
  $('card2').classList.add('flipped');
  $('btn-again2').hidden = true; $('btn-know2').hidden = true; $('btn-next2').hidden = true;
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
  el.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) onLeft(); else onRight();
  }, { passive: true });
}

/* ---------- 事件绑定 ---------- */
$('btn-know').onclick = () => answer(true);
$('btn-again').onclick = () => answer(false);
$('btn-next').onclick = () => nextCard();
$('btn-know2').onclick = () => answer2(true);
$('btn-again2').onclick = () => answer2(false);
$('btn-next2').onclick = () => nextReviewCard();
$('btn-back').onclick = () => { refreshStats(); renderHome(); show('home'); };
$('btn-back2').onclick = () => { refreshStats(); renderHome(); show('home'); };
$('btn-wrong').onclick = () => startReview();
$('btn-lang').onclick = () => {
  langMode = isEnglish() ? 'bilingual' : 'english';
  saveLang(langMode);
  $('btn-lang').textContent = isEnglish() ? 'EN' : '中英';
  if (mode === 'study') showCard();
  else if (mode === 'review') showReviewCard();
};
$('btn-lang').textContent = isEnglish() ? 'EN' : '中英';

attachSwipe($('card'), () => { if (mode === 'study' && $('card').classList.contains('flipped')) answer(false); },
                          () => { if (mode === 'study' && $('card').classList.contains('flipped')) answer(true); });
attachSwipe($('card2'), () => { if (mode === 'review' && $('card2').classList.contains('flipped')) answer2(false); },
                           () => { if (mode === 'review' && $('card2').classList.contains('flipped')) answer2(true); });

/* ---------- 启动 ---------- */
fetch(DATA_URL)
  .then(r => r.json())
  .then(data => { decks = data; refreshStats(); renderHome(); })
  .catch(err => { $('deck-list').innerHTML = `<div class="empty"><span class="big">⚠</span>加载失败：${esc(err.message)}</div>`; });
