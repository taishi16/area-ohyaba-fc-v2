#!/usr/bin/env python3
"""sheets/*.csv -> site/data/*.json
Googleスプレッドシートが使えないときのフォールバック用データを生成する。
Apps Scriptが返すJSONと同じ形式にすること。"""
import csv, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(ROOT, 'sheets')
OUT  = os.path.join(ROOT, 'site', 'data')
os.makedirs(OUT, exist_ok=True)

BOOL = {'TRUE','true','True','1','はい','○','TRUE '}
def norm(v):
    v = (v or '').strip()
    if v in ('TRUE','true','True'):  return True
    if v in ('FALSE','false','False'): return False
    return v

def load(name):
    p = os.path.join(SRC, name + '.csv')
    with open(p, encoding='utf-8-sig', newline='') as f:
        return [{k: norm(v) for k, v in row.items() if k} for row in csv.DictReader(f)]

data = {}
for name in ['MATCHES','NEWS','PLAYERS','STAFF','SPONSORS','ACTIVITY']:
    data[name.lower()] = load(name)

data['config'] = {r['key']: r['value'] for r in load('CONFIG')}
data['generated_at'] = __import__('datetime').datetime.now().isoformat(timespec='seconds')
data['source'] = 'static'

with open(os.path.join(OUT, 'site-data.json'), 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

n = {k: len(v) for k, v in data.items() if isinstance(v, list)}
print('site/data/site-data.json を生成:', n, 'config', len(data['config']), '件')
print('サイズ:', os.path.getsize(os.path.join(OUT,'site-data.json')), 'bytes')
