# -*- coding: utf-8 -*-
"""从 Obsidian vault 提取所有刷题卡片 → questions.json
支持：填空(fill) / 选择题(mcq) / 简答(sa) / 真题问答(qa)"""
import re, json, glob, os

def has_cjk(s):
    return bool(re.search(r'[\u4e00-\u9fff]', s))

def clean(s):
    s = s.strip()
    s = re.sub(r'^>\s?', '', s)
    s = s.replace('==', '').replace('**', '')
    s = re.sub(r'^[-*]\s?', '', s)
    s = re.sub(r'^\[!(question|check|tip|note)\]', '', s)
    return s.strip()

def split_en_zh(lines):
    en, zh = [], []
    for l in lines:
        c = clean(l)
        if not c:
            continue
        (zh if has_cjk(c) else en).append(c)
    return '\n'.join(en), '\n'.join(zh)

def natural_key(s):
    return [int(t) if t.isdigit() else t for t in re.split(r'(\d+)', s)]

# ---------- SDBM 真题 / Mock（question + check 块）----------
def parse_sdbm(path):
    text = open(path, encoding='utf-8').read()
    lines = text.split('\n')
    cards = []
    i = 0
    while i < len(lines):
        if '[!question]' in lines[i]:
            title = ''
            j = i - 1
            while j >= 0:
                if lines[j].startswith('## '):
                    title = clean(lines[j]).split('—')[0].split('——')[0].strip()
                    break
                j -= 1
            q, a = [], []
            k = i + 1
            while k < len(lines) and '[!check]' not in lines[k]:
                q.append(lines[k]); k += 1
            while k < len(lines) and not lines[k].startswith('## ') and '[!question]' not in lines[k]:
                a.append(lines[k]); k += 1
            q_en, q_zh = split_en_zh(q)
            a_text = '\n'.join(clean(x) for x in a if clean(x) and '深度解析' not in clean(x) and 'WHY' != clean(x))
            if q_en or q_zh:
                cards.append({'id': f"{os.path.basename(path)}::{title}::{len(cards)}", 'type': 'qa',
                              'q_en': q_en, 'q_zh': q_zh, 'a': a_text})
            i = k
        else:
            i += 1
    return cards

# ---------- 填空题 Quiz ----------
def parse_quiz(path):
    text = open(path, encoding='utf-8').read()
    lines = text.split('\n')
    key_idx = None
    for n, l in enumerate(lines):
        if l.startswith('# ANSWER KEY'):
            key_idx = n; break
    if key_idx is None:
        return []
    answers = []
    for l in lines[key_idx+1:]:
        m = re.match(r'^(\d+)\.\s*(.*)$', l.strip())
        if m and not l.strip().startswith('##'):
            answers.append(m.group(2).strip())
    q_list, cur_en, cur_zh = [], None, None
    def flush():
        if cur_en is not None:
            q_list.append((cur_en, cur_zh or ''))
    for l in lines[:key_idx]:
        m = re.match(r'^\*\*(\d+)\.\*\*\s*(.*)$', l.strip())
        if m:
            flush(); cur_en, cur_zh = m.group(2), None
        elif l.strip().startswith('ZH：') or l.strip().startswith('ZH:'):
            cur_zh = l.strip()[3:].strip()
    flush()
    return [{'id': f"{os.path.basename(path)}::{i}", 'type': 'fill',
             'q_en': q_en, 'q_zh': q_zh, 'a': (answers[i] if i < len(answers) else '')}
            for i, (q_en, q_zh) in enumerate(q_list)]

# ---------- ISCB Mock / ANNALE ----------
def parse_qa(path):
    text = open(path, encoding='utf-8').read()
    lines = text.split('\n')
    cards = []
    i = 0
    while i < len(lines):
        if re.match(r'^#+\s*Q\d+', lines[i]):
            title = clean(lines[i]).strip()
            q_en, q_zh = [], []
            k = i + 1
            while k < len(lines) and '[!check]' not in lines[k] and not re.match(r'^#+\s*Q\d+', lines[k]):
                s = lines[k].strip()
                if s.startswith('**EN:') or s.startswith('**EN：'):
                    q_en.append(s.split(':', 1)[1].strip())
                elif s.startswith('**ZH：') or s.startswith('**ZH:'):
                    q_zh.append(s.split('：', 1)[1].strip())
                k += 1
            a = []
            while k < len(lines) and not re.match(r'^#+\s*(Q\d+|Part)', lines[k]):
                a.append(lines[k]); k += 1
            a_text = '\n'.join(clean(x) for x in a if clean(x) and '深度解析' not in clean(x) and 'WHY' != clean(x))
            if q_en or q_zh or a_text:
                cards.append({'id': f"{os.path.basename(path)}::{title}::{len(cards)}", 'type': 'qa',
                              'q_en': '\n'.join(q_en), 'q_zh': '\n'.join(q_zh), 'a': a_text})
            i = k
        else:
            i += 1
    return cards

# ---------- MCQ 选择题 ----------
def parse_mcq(path):
    text = open(path, encoding='utf-8').read()
    blocks = re.split(r'^\*\*\d+\.\*\*', text, flags=re.M)
    cards = []
    for blk in blocks[1:]:
        lines = blk.strip().split('\n')
        if not lines or not lines[0].strip():
            continue
        q_en = lines[0].strip()
        q_zh, options, correct, explain, in_explain = '', [], -1, [], False
        for l in lines[1:]:
            s = l.strip()
            if s.startswith('ZH：') or s.startswith('ZH:'):
                q_zh = s[3:].strip()
            elif re.match(r'^-\s*[A-D]\)', s):
                options.append(re.sub(r'^-\s*[A-D]\)\s*', '', s))
            elif '答案' in s:
                mm = re.search(r'答案[：:]\s*([A-D])', s)
                if mm:
                    correct = ord(mm.group(1)) - 65
            elif '解析' in s:
                in_explain = True
                tail = re.split(r'解析[：:]\s*', s, maxsplit=1)
                if len(tail) > 1 and tail[1].strip():
                    explain.append(clean(tail[1]))
            elif in_explain and s and s != '---':
                explain.append(clean(s))
            elif s == '---':
                in_explain = False
        cards.append({'id': f"{os.path.basename(path)}::{len(cards)}", 'type': 'mcq',
                      'q_en': q_en, 'q_zh': q_zh, 'options': options, 'correct': correct,
                      'a': '\n'.join(explain)})
    return cards

# ---------- 简答题 ----------
def parse_sa(path):
    text = open(path, encoding='utf-8').read()
    blocks = re.split(r'^\*\*\d+\.\*\*', text, flags=re.M)
    cards = []
    for blk in blocks[1:]:
        lines = blk.strip().split('\n')
        if not lines or not lines[0].strip():
            continue
        q_en = lines[0].strip()
        q_zh, ans, in_ans = '', [], False
        for l in lines[1:]:
            s = l.strip()
            if s.startswith('ZH：') or s.startswith('ZH:'):
                q_zh = s[3:].strip()
            elif '[!check]' in s or '答案' in s:
                in_ans = True
            elif in_ans and s and s != '---':
                ans.append(clean(s))
        cards.append({'id': f"{os.path.basename(path)}::{len(cards)}", 'type': 'sa',
                      'q_en': q_en, 'q_zh': q_zh, 'a': '\n'.join(ans)})
    return cards

# ---------- 真题 quiz (Exam) ----------
def parse_exam(path):
    text = open(path, encoding='utf-8').read()
    blocks = re.split(r'^## 题目', text, flags=re.M)
    cards = []
    for blk in blocks[1:]:
        lines = blk.strip().split('\n')
        q_en, q_zh, a_lines, in_a = [], [], [], False
        for l in lines:
            s = l.strip()
            if s == '---':
                in_a = False
                continue
            if '[!check]' in s:
                in_a = True
                continue
            c = clean(s)
            if not c:
                continue
            # 分离图片引用（语言无关，转网站 img/ 路径）
            imgs = re.findall(r'!\[[^\]]*\]\([^)]+\)', c)
            for im in imgs:
                q_en.append(im.replace('attachments/', 'img/'))
            c = re.sub(r'!\[[^\]]*\]\([^)]+\)', '', c).strip()
            if not c:
                continue
            if in_a:
                a_lines.append(c)
            elif c.startswith('背景') or c.startswith('Given'):
                tail = re.split(r'[：:]', c, maxsplit=1)
                if len(tail) > 1 and tail[1].strip():
                    content = '背景: ' + tail[1].strip()
                    (q_zh if has_cjk(content) else q_en).append(content)
            elif c.startswith('题目') or c.startswith('Question'):
                tail = re.split(r'[：:]', c, maxsplit=1)
                if len(tail) > 1 and tail[1].strip():
                    content = tail[1].strip()
                    (q_zh if has_cjk(content) else q_en).append(content)
            elif c.startswith('ZH：') or c.startswith('ZH:'):
                q_zh.append(c[3:].strip())
            else:
                (q_zh if has_cjk(c) else q_en).append(c)
        cards.append({'id': f"{os.path.basename(path)}::{len(cards)}", 'type': 'qa',
                      'q_en': '\n'.join(q_en), 'q_zh': '\n'.join(q_zh), 'a': '\n'.join(a_lines)})
    return cards

SDBM_DIR = "/mnt/d/obsidian/obsidian/M2/structure determination of biological macromolecule/exam"
SDBM_MAIN = "/mnt/d/obsidian/obsidian/M2/structure determination of biological macromolecule"
ISCB_DIR = "/mnt/d/obsidian/obsidian/M2/Integrated Structural Cell Biology"

decks = []

# ---- SDBM 真题 ----
for f in sorted(glob.glob(os.path.join(SDBM_DIR, "Exam 20*.md"))):
    name = os.path.basename(f).replace(' (Solutions).md', '').replace('.md', '')
    decks.append({'id': 'sdbm', 'name': name, 'cards': parse_sdbm(f)})
    print(f"SDBM {name}: {len(decks[-1]['cards'])}")

mock = os.path.join(SDBM_DIR, "Mock Exam - Comprehensive (All Topics).md")
if os.path.exists(mock):
    decks.append({'id': 'sdbm', 'name': "综合模拟卷 Mock", 'cards': parse_sdbm(mock)})

# ---- SDBM 填空 Quiz ----
for f in sorted(glob.glob(os.path.join(SDBM_MAIN, "Quiz *.md")), key=natural_key):
    if '(MCQ)' in f or '(Short Answer)' in f or '(Exam)' in f:
        continue
    name = os.path.basename(f).replace('.md', '')
    decks.append({'id': 'sdbm', 'name': name, 'cards': parse_quiz(f)})
    print(f"SDBM {name}: {len(decks[-1]['cards'])}")

# ---- SDBM MCQ + 简答 ----
for f in sorted(glob.glob(os.path.join(SDBM_MAIN, "Quiz * (MCQ).md")), key=natural_key):
    name = os.path.basename(f).replace(' (MCQ).md', '') + ' [选择]'
    decks.append({'id': 'sdbm', 'name': name, 'cards': parse_mcq(f)})
    print(f"SDBM {name}: {len(decks[-1]['cards'])}")
for f in sorted(glob.glob(os.path.join(SDBM_MAIN, "Quiz * (Short Answer).md")), key=natural_key):
    name = os.path.basename(f).replace(' (Short Answer).md', '') + ' [简答]'
    decks.append({'id': 'sdbm', 'name': name, 'cards': parse_sa(f)})
    print(f"SDBM {name}: {len(decks[-1]['cards'])}")

# ---- SDBM 真题 quiz (Exam) ----
for f in sorted(glob.glob(os.path.join(SDBM_MAIN, "Quiz * (Exam).md")), key=natural_key):
    name = os.path.basename(f).replace(' (Exam).md', '') + ' [真题]'
    decks.append({'id': 'sdbm', 'name': name, 'cards': parse_exam(f)})
    print(f"SDBM {name}: {len(decks[-1]['cards'])}")

# ---- ISCB 填空 Quiz ----
for f in sorted(glob.glob(os.path.join(ISCB_DIR, "Quiz *.md")), key=natural_key):
    if '(MCQ)' in f or '(Short Answer)' in f or '(Exam)' in f:
        continue
    name = os.path.basename(f).replace('.md', '')
    decks.append({'id': 'iscb', 'name': name, 'cards': parse_quiz(f)})
    print(f"ISCB {name}: {len(decks[-1]['cards'])}")

# ---- ISCB MCQ + 简答 ----
for f in sorted(glob.glob(os.path.join(ISCB_DIR, "Quiz * (MCQ).md")), key=natural_key):
    name = os.path.basename(f).replace(' (MCQ).md', '') + ' [选择]'
    decks.append({'id': 'iscb', 'name': name, 'cards': parse_mcq(f)})
    print(f"ISCB {name}: {len(decks[-1]['cards'])}")
for f in sorted(glob.glob(os.path.join(ISCB_DIR, "Quiz * (Short Answer).md")), key=natural_key):
    name = os.path.basename(f).replace(' (Short Answer).md', '') + ' [简答]'
    decks.append({'id': 'iscb', 'name': name, 'cards': parse_sa(f)})
    print(f"ISCB {name}: {len(decks[-1]['cards'])}")

# ---- ISCB 真题 quiz (Exam) ----
for f in sorted(glob.glob(os.path.join(ISCB_DIR, "Quiz * (Exam).md")), key=natural_key):
    name = os.path.basename(f).replace(' (Exam).md', '') + ' [真题]'
    decks.append({'id': 'iscb', 'name': name, 'cards': parse_exam(f)})
    print(f"ISCB {name}: {len(decks[-1]['cards'])}")

# ---- ISCB Mock / ANNALE ----
for f in sorted(glob.glob(os.path.join(ISCB_DIR, "Mock Exam *.md"))):
    name = os.path.basename(f).replace('.md', '')
    decks.append({'id': 'iscb', 'name': name, 'cards': parse_qa(f)})
annale = os.path.join(ISCB_DIR, "ANNALE - Exam Solutions.md")
if os.path.exists(annale):
    decks.append({'id': 'iscb', 'name': "ANNALE 真题", 'cards': parse_qa(annale)})

total = sum(len(d['cards']) for d in decks)
print(f"\nTOTAL: {len(decks)} decks, {total} cards")
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "questions.json")
json.dump(decks, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f"written -> {out}")
