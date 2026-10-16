import hashlib
import hmac
import json
import os
import re
import sqlite3
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from hedge_fund.data.sessions import completed_through
from pathlib import Path
from fastapi import FastAPI, Header, HTTPException, Depends
from pydantic import BaseModel, ConfigDict, field_validator
from backend.engine import analyze, configuration, REVISION

@asynccontextmanager
async def lifespan(app):
    recover()
    yield


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
STATE = Path(os.getenv('INVESTMENT_STATE_DIR', '.state'))
LOCK = threading.Lock()
POOL = ThreadPoolExecutor(max_workers=1)
TTL = 21600


def database():
    STATE.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(STATE / 'analysis.sqlite')
    db.row_factory = sqlite3.Row
    db.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, key TEXT, created REAL, day TEXT, status TEXT, result TEXT)')
    return db


def authenticate(authorization: str = Header(default='')):
    token = os.getenv('ANALYSIS_SERVICE_TOKEN', '')
    if len(token) < 32:
        raise HTTPException(503, '서버 인증 토큰 설정이 필요합니다.')
    if not hmac.compare_digest(authorization.encode(), ('Bearer ' + token).encode()):
        raise HTTPException(401, '인증이 필요합니다.')


class Request(BaseModel):
    model_config = ConfigDict(extra='forbid')
    ticker: str

    @field_validator('ticker')
    @classmethod
    def ticker_valid(cls, value):
        value = value.strip().upper()
        if not re.fullmatch(r'[A-Z]{1,5}(?:[.-][A-Z])?', value):
            raise ValueError('미국주식 티커를 입력하세요.')
        return value


@app.get('/health')
def health():
    _, missing = configuration()
    if len(os.getenv('ANALYSIS_SERVICE_TOKEN', '')) < 32:
        missing.append('ANALYSIS_SERVICE_TOKEN')
    return {'status': 'configuration_required' if missing else 'configured', 'missing': missing,
            'live_verified': False}


def run_job(job_id, ticker, as_of):
    try:
        result = json.dumps(analyze(ticker, as_of, STATE), ensure_ascii=False)
        status = 'completed'
    except Exception:
        # No raw provider errors/prompts/keys are sent to clients or logs.
        status, result = 'failed', json.dumps({'error': '분석 실패: 데이터 권한·이력 또는 모델 응답을 확인하세요. 자동 재시도하지 않습니다.'})
    with database() as db:
        db.execute('UPDATE jobs SET status=?, result=? WHERE id=?', (status, result, job_id))


@app.post('/api/analysis', dependencies=[Depends(authenticate)], status_code=202)
def submit(body: Request):
    model, missing = configuration()
    if missing:
        raise HTTPException(503, '분석 서버에 데이터 키와 지원 모델 설정이 필요합니다.')
    # Original cutoff excludes the current New York day, including after close.
    as_of = completed_through()
    key = hashlib.sha256(f'v1:{body.ticker}:{as_of}:{model}:{REVISION}'.encode()).hexdigest()
    now = time.time()
    with LOCK, database() as db:
        db.execute("DELETE FROM jobs WHERE created < ?", (now - 7 * 86400,))
        row = db.execute("SELECT * FROM jobs WHERE key=? AND created>? AND status IN ('running','completed') ORDER BY created DESC LIMIT 1", (key, now - TTL)).fetchone()
        if row:
            return {'id': row['id'], 'cached': row['status'] == 'completed'}
        # Single process/worker deployment. Recovered stale jobs are failed on startup.
        if db.execute("SELECT 1 FROM jobs WHERE status='running'").fetchone():
            raise HTTPException(429, '다른 분석이 진행 중입니다. 완료 후 다시 실행하세요.')
        day = datetime.now(timezone.utc).date().isoformat()
        count = db.execute('SELECT COUNT(*) FROM jobs WHERE day=?', (day,)).fetchone()[0]
        if count >= int(os.getenv('ANALYSIS_DAILY_LIMIT', '5')):
            raise HTTPException(429, '서버의 일일 분석 제한에 도달했습니다.')
        job_id = str(uuid.uuid4())
        db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?)', (job_id, key, now, day, 'running', None))
        db.commit()
        POOL.submit(run_job, job_id, body.ticker, as_of)
    return {'id': job_id, 'cached': False}


@app.get('/api/analysis/{job_id}', dependencies=[Depends(authenticate)])
def result(job_id: uuid.UUID):
    with database() as db:
        row = db.execute('SELECT * FROM jobs WHERE id=?', (str(job_id),)).fetchone()
    if not row:
        raise HTTPException(404, '분석 결과가 없습니다.')
    return {'id': row['id'], 'status': row['status'], 'created_at': datetime.fromtimestamp(row['created'], timezone.utc).isoformat(),
            'result': json.loads(row['result']) if row['result'] else None}


def recover():
    with database() as db:
        db.execute("UPDATE jobs SET status='failed', result=? WHERE status='running'", (json.dumps({'error': '서버 재시작으로 분석이 중단되었습니다. 자동 재실행하지 않습니다.'}),))
