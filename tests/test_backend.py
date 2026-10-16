"""Offline contract tests. All provider responses here are synthetic test fixtures."""
import json
import threading
import time
from concurrent.futures import Future
import pytest
from fastapi.testclient import TestClient
from backend import app as api
from backend import engine
from hedge_fund.data.models import FinancialMetrics

TOKEN = 'test-only-' + 'x' * 32
HEADERS = {'Authorization': 'Bearer ' + TOKEN}

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(api, 'STATE', tmp_path)
    monkeypatch.setenv('ANALYSIS_SERVICE_TOKEN', TOKEN)
    monkeypatch.setenv('HEDGE_FUND_LLM_MODEL', 'deepseek-flash')
    monkeypatch.setenv('DEEPSEEK_API_KEY', 'test-fixture-not-a-key')
    monkeypatch.setenv('FINANCIAL_DATASETS_API_KEY', 'test-fixture-not-a-key')
    with TestClient(api.app) as c:
        yield c

class NoExecutor:
    def submit(self, *args):
        return Future()


def test_auth_and_input(client):
    assert client.post('/api/analysis', json={'ticker': 'AAPL'}).status_code == 401
    for ticker in ['../../secret', 'AAPL,MSFT', 'TOOLONG', '', '<script>']:
        assert client.post('/api/analysis', json={'ticker': ticker}, headers=HEADERS).status_code == 422
    assert client.get('/api/analysis/not-a-uuid', headers=HEADERS).status_code == 422


def test_missing_key_no_job(client, monkeypatch):
    monkeypatch.delenv('FINANCIAL_DATASETS_API_KEY')
    assert client.get('/health').json()['status'] == 'configuration_required'
    assert client.post('/api/analysis', json={'ticker': 'AAPL'}, headers=HEADERS).status_code == 503
    with api.database() as db:
        assert db.execute('select count(*) from jobs').fetchone()[0] == 0


def test_duplicate_busy_cache_and_budget(client, monkeypatch):
    monkeypatch.setattr(api, 'POOL', NoExecutor())
    req = lambda ticker: client.post('/api/analysis', json={'ticker': ticker}, headers=HEADERS)
    first = req('aapl').json()
    assert req('AAPL').json()['id'] == first['id']
    assert req('MSFT').status_code == 429
    with api.database() as db:
        db.execute("UPDATE jobs SET status='completed', result=?", (json.dumps({'mode': 'live', 'ticker': 'AAPL'}),))
    assert req('AAPL').json()['cached'] is True
    assert client.get('/api/analysis/' + first['id'], headers=HEADERS).json()['result']['ticker'] == 'AAPL'
    monkeypatch.setenv('ANALYSIS_DAILY_LIMIT', '1')
    assert req('MSFT').status_code == 429


def test_async_result_and_safe_error(client, monkeypatch):
    done = threading.Event()
    def fake(*args):
        done.set()
        raise RuntimeError('SENSITIVE_PROVIDER_ERROR')
    monkeypatch.setattr(api, 'analyze', fake)
    job = client.post('/api/analysis', json={'ticker': 'AAPL'}, headers=HEADERS).json()
    assert done.wait(2)
    for _ in range(100):
        response = client.get('/api/analysis/' + job['id'], headers=HEADERS)
        if response.json()['status'] == 'failed': break
        time.sleep(.01)
    assert response.json()['status'] == 'failed'
    assert 'SENSITIVE' not in response.text


def test_recover_interrupted_jobs(client, monkeypatch):
    monkeypatch.setattr(api, 'POOL', NoExecutor())
    job = client.post('/api/analysis', json={'ticker': 'AAPL'}, headers=HEADERS).json()
    api.recover()
    assert client.get('/api/analysis/' + job['id'], headers=HEADERS).json()['status'] == 'failed'


def test_reject_invented_citation():
    raw = {key: {'text': '판단 불가', 'evidence': []} for key in engine.SECTIONS}
    raw['summary'] = {'text': '주장', 'evidence': ['invented-source']}
    with pytest.raises(ValueError): engine.validate_narrative(raw, {'F1': {}})
    raw['summary'] = {'text': '근거 없는 주장', 'evidence': []}
    with pytest.raises(ValueError): engine.validate_narrative(raw, {})


def test_real_upstream_agents_with_fake_providers(tmp_path, monkeypatch):
    """Runs original predict, snapshot, parse and prompt caching. No paid calls."""
    monkeypatch.setenv('HEDGE_FUND_LLM_MODEL', 'deepseek-flash')
    monkeypatch.setenv('DEEPSEEK_API_KEY', 'fixture')
    monkeypatch.setenv('FINANCIAL_DATASETS_API_KEY', 'fixture')
    class Data:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def get_financial_metrics(self, *args, **kwargs):
            return [FinancialMetrics(ticker='TEST', report_period=d, filing_date=d, period='ttm', market_cap=1e9,
                      return_on_equity=.2, gross_margin=.4, book_value_per_share=10) for d in
                    ['2024-12-31', '2024-09-30', '2024-06-30', '2024-03-31']]
        def get_company_facts(self, *args): return None
        def get_prices(self, *args): return []
    class LLM:
        model = 'test-fixture'
        calls = 0
        def complete(self, system, user):
            self.calls += 1
            if 'JSON만 출력' in system:
                return json.dumps({key: {'text': '판단 불가: 추가 자료가 필요합니다.', 'evidence': []} for key in engine.SECTIONS})
            assert '한국어' in system
            return json.dumps({'signal': 'bullish', 'confidence': 70, 'reasoning': '테스트용 합성 의견'})
    llm = LLM()
    monkeypatch.setattr(engine, 'FDClient', lambda **kw: Data())
    monkeypatch.setattr(engine, 'CachedDataClient', lambda fd, **kw: fd)
    monkeypatch.setattr(engine, 'make_llm', lambda **kw: llm)
    result = engine.analyze('TEST', '2025-01-01', tmp_path)
    assert len(result['analysts']) == 3
    assert result['opinion'] == '긍정'
    assert all(not a['abstained'] for a in result['analysts'])
    assert result['sections']['early_stage']['text'].startswith('판단 불가')
    assert result['evidence']['F1']['data']['periods'][0]['filing_date'] == '2024-12-31'
    assert llm.calls == 4
    engine.analyze('TEST', '2025-01-01', tmp_path)
    assert llm.calls == 5  # Original persona prompt caches reused; synthesis uncached at engine level.
