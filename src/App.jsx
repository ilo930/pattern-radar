import React, { useState, useEffect, useCallback, useRef } from 'react';

const PredictiveDashboard = () => {
  const [activeTab, setActiveTab] = useState('signals');
  const [selectedNews, setSelectedNews] = useState(null);
  const [news, setNews] = useState([]);
  const [regulations, setRegulations] = useState([]);
  const [priceData, setPriceData] = useState({});
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [selectedTicker, setSelectedTicker] = useState('HYPE');
  const dbRef = useRef(null);

  // Initialize IndexedDB once
  useEffect(() => {
    const initDB = async () => {
      const request = indexedDB.open('TradingPatterns', 1);
      request.onerror = () => console.error('DB error');
      request.onsuccess = () => {
        dbRef.current = request.result;
        loadPatternsFromDB();
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('patterns')) {
          db.createObjectStore('patterns', { keyPath: 'id', autoIncrement: true });
        }
      };
    };
    initDB();
  }, []);

  const loadPatternsFromDB = () => {
    if (!dbRef.current) return;
    const tx = dbRef.current.transaction(['patterns'], 'readonly');
    const store = tx.objectStore('patterns');
    const request = store.getAll();
    request.onsuccess = () => setPatterns(request.result);
  };

  // Load real news from backend
  const loadRealNews = async () => {
    try {
      const response = await fetch('/dashboard_data.json');
      if (response.ok) {
        const data = await response.json();
        if (data.news && data.news.length > 0) {
          // Filter out price/perpetual data from news feed
          const realNews = data.news.filter(item => 
            !item.title.includes('spot price') && 
            !item.title.includes('Open Interest') &&
            !item.title.includes('Funding Rate') &&
            !item.title.includes('$')
          );
          setNews(realNews);
          return;
        }
      }
    } catch (e) {
      console.log('Could not load dashboard_data.json');
    }
    
    // Fallback if no data
    setNews([
      { id: 1, title: 'Run python3 backend.py to fetch real data', source: 'System', date: new Date().toISOString(), sector: 'general', summary: 'No data yet', relevance_score: 5 }
    ]);
  };

  // Load regulations (keep as is)
  const loadRegulations = () => {
    setRegulations([
      { id: 1, event: 'EU Grid Code Revision (2029 implementation)', date: '2026-08-15', impact: 'Cross-border balancing, BESS incentives', affected_tickers: ['FLNC', 'ENGI.PA', 'EDF.P'], status: 'upcoming' },
      { id: 2, event: 'US IRA Battery Tax Credit Reduction (phase 2)', date: '2026-06-30', impact: 'Domestic content requirements increase to 60%', affected_tickers: ['TSLA', 'STEM', 'VRRM'], status: 'upcoming' },
      { id: 3, event: 'FCC Space Debris Rules (approved)', date: '2026-05-20', impact: 'Satellite operators must plan deorbits', affected_tickers: ['SPCE', 'ASTRA', 'TSLA'], status: 'live' },
      { id: 4, event: 'SEC Stablecoin Ruling (Clarity Act)', date: '2026-07-15', impact: 'Regulatory clarity for USD-backed tokens', affected_tickers: ['USDC', 'USDT', 'HYPE'], status: 'upcoming' },
      { id: 5, event: 'FAA Launch License Decision - Starship V3', date: '2026-06-10', impact: 'Approval could accelerate commercial launches', affected_tickers: ['ASTS', 'RKLB', 'RDW'], status: 'upcoming' },
      { id: 6, event: 'CFTC Perpetual Futures Guidelines', date: '2026-08-01', impact: 'New rules for crypto perps across exchanges', affected_tickers: ['BTC', 'ETH', 'HYPE'], status: 'upcoming' }
    ]);
  };

  // Load data on mount
  useEffect(() => {
    loadRealNews();
    loadRegulations();
  }, []);

  // Fetch real-time price data (mock for now)
  const fetchPriceData = useCallback((ticker) => {
    setSelectedTicker(ticker);
    const mockPrices = {
      HYPE: { price: 62.50, change: 2.3, ta: 'Funding rate: -0.01% (bullish)' },
      BTC: { price: 76356, change: -0.38, ta: 'OI: $35B' },
      ETH: { price: 2095, change: -0.94, ta: 'OI: $12B' },
      SUI: { price: 1.04, change: 0.5, ta: 'Range bound' },
      EGLD: { price: 3.93, change: -1.2, ta: 'Support at $3.50' },
      MINA: { price: 0.056, change: -0.8, ta: 'Low volume' },
      STEM: { price: 9.47, change: 1.2, ta: 'RSI 45' },
      FLNC: { price: 21.50, change: 0.5, ta: 'SMA crossover' }
    };
    setPriceData(mockPrices[ticker] || { price: 0, change: 0, ta: 'No data' });
  }, []);

  const recordPattern = async (patternData) => {
    if (!dbRef.current) return;
    const pattern = { ...patternData, recorded_date: new Date().toISOString(), id: Date.now() };
    const tx = dbRef.current.transaction(['patterns'], 'readwrite');
    tx.objectStore('patterns').add(pattern);
    setPatterns([...patterns, pattern]);
  };

const analyzeAsHighStakesCapital = async (newsItem) => {
  if (!newsItem) return;
  setLoading(true);
  
  try {
    const response = await fetch("http://localhost:5000/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newsItem.title,
        summary: newsItem.summary,
        date: newsItem.date,
        sector: newsItem.sector,
        ticker: selectedTicker
      })
    });

    if (response.ok) {
      const analysis = await response.json();
      setAnalysisResult(analysis);
      recordPattern({ news_title: newsItem.title, analysis, ticker: selectedTicker, sector: newsItem.sector });
    } else {
      throw new Error("Backend error");
    }
  } catch (err) {
    console.error("Analysis error:", err);
    setAnalysisResult({ error: "Make sure backend is running: python3 backend.py" });
  }
  
  setLoading(false);
};

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#ffffff', minHeight: '100vh', padding: '2rem', color: '#111827' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 500, margin: '0 0 4px 0' }}>Pattern Radar</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '0' }}>Spot market-moving signals 2 weeks before the crowd</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ fontSize: '13px', fontWeight: 500 }}>Watch:</label>
          <select value={selectedTicker} onChange={(e) => fetchPriceData(e.target.value)} style={{ padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: '6px', background: '#ffffff', cursor: 'pointer' }}>
            <option>HYPE</option><option>BTC</option><option>ETH</option><option>SUI</option><option>EGLD</option><option>MINA</option><option>STEM</option><option>FLNC</option><option>TSLA</option><option>ASTS</option><option>RKLB</option><option>RDW</option>
          </select>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', borderBottom: '1px solid #e5e7eb' }}>
        {['signals', 'regulations', 'patterns', 'portfolio'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ background: 'none', border: 'none', padding: '12px 0', fontSize: '14px', fontWeight: 500, cursor: 'pointer', color: activeTab === tab ? '#3b82f6' : '#6b7280', borderBottom: activeTab === tab ? '2px solid #3b82f6' : 'none' }}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Signals Tab */}
      {activeTab === 'signals' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '2rem' }}>
          {/* News List */}
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 500, marginBottom: '1rem' }}>Upcoming Signals</h3>
            {news.map(item => (
              <div key={item.id} onClick={() => { setSelectedNews(item); setAnalysisResult(null); fetchPriceData(selectedTicker); }} style={{ padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '8px', cursor: 'pointer', background: selectedNews?.id === item.id ? '#f3f4f6' : 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '11px' }}>
                  <span style={{ background: '#f3f4f6', padding: '4px 8px', borderRadius: '3px', textTransform: 'capitalize' }}>{item.sector}</span>
                  <span style={{ fontWeight: 500, color: '#3b82f6' }}>{item.relevance_score}/10</span>
                </div>
                <h4 style={{ fontSize: '13px', fontWeight: 500, margin: '0 0 4px 0', lineHeight: '1.4' }}>{item.title}</h4>
                <p style={{ fontSize: '11px', color: '#6b7280', margin: '0' }}>{new Date(item.date).toLocaleDateString()}</p>
              </div>
            ))}
          </div>

          {/* Analysis Panel */}
          <div>
            {selectedNews ? (
              <>
                <div style={{ padding: '1rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 500, margin: '0 0 8px 0' }}>{selectedNews.title}</h3>
                  <p style={{ fontSize: '11px', color: '#6b7280', margin: '0 0 8px 0' }}>{selectedNews.source}</p>
                  <p style={{ fontSize: '13px', lineHeight: 1.5, margin: '0', color: '#4b5563' }}>{selectedNews.summary}</p>
                </div>

                <div style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#f9fafb', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>${selectedTicker}</span>
                    <span style={{ fontSize: '18px', fontWeight: 500, color: priceData.change > 0 ? '#059669' : '#dc2626' }}>{priceData.price} {priceData.change > 0 ? '+' : ''}{priceData.change}%</span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '0' }}>TA: {priceData.ta}</p>
                </div>

                <button onClick={() => analyzeAsHighStakesCapital(selectedNews)} disabled={loading} style={{ width: '100%', padding: '10px', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, fontSize: '13px', opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Analyzing...' : 'Analyze Pattern'}
                </button>

                {analysisResult && (
                  <div style={{ marginTop: '1rem', padding: '1rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <p><strong>Edge or Noise:</strong> {analysisResult.is_edge_or_noise}</p>
                    <p><strong>Action:</strong> {analysisResult.action}</p>
                    <p><strong>Catalyst:</strong> {analysisResult.specific_catalyst}</p>
                    <p><strong>Institutional Signal:</strong> {analysisResult.institutional_signal}</p>
                    <p><strong>Historical Precedent:</strong> {analysisResult.historical_precedent}</p>
                    <p><strong>Confidence:</strong> {analysisResult.confidence}%</p>
                    <p><strong>Position Sizing:</strong> {analysisResult.position_sizing_conviction}</p>
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}><p>Select a news item to analyze patterns</p></div>
            )}
          </div>
        </div>
      )}

      {/* Regulations Tab */}
      {activeTab === 'regulations' && (
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 500, marginBottom: '1rem' }}>Regulatory Calendar (2-4 weeks ahead)</h3>
          {regulations.map(reg => (
            <div key={reg.id} style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '12px', background: '#f9fafb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 500, margin: '0' }}>{reg.event}</h4>
                <span style={{ padding: '4px 8px', borderRadius: '3px', fontSize: '11px', fontWeight: 500, background: reg.status === 'upcoming' ? '#fef3c7' : '#d1fae5', color: reg.status === 'upcoming' ? '#92400e' : '#065f46' }}>{reg.status}</span>
              </div>
              <p style={{ fontSize: '12px', margin: '0 0 4px 0', color: '#6b7280' }}>📅 {reg.date}</p>
              <p style={{ fontSize: '13px', margin: '0 0 8px 0' }}>Impact: {reg.impact}</p>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>{reg.affected_tickers.map(t => <span key={t} style={{ padding: '4px 8px', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '3px', fontSize: '11px', fontWeight: 500 }}>${t}</span>)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Patterns Tab */}
      {activeTab === 'patterns' && (
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 500, marginBottom: '1rem' }}>Your Historical Patterns ({patterns.length})</h3>
          {patterns.length === 0 ? <p>No patterns recorded yet. Analyze signals to build your pattern library.</p> : patterns.map((pattern, idx) => (
            <div key={idx} style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '12px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 500, margin: '0 0 4px 0' }}>{pattern.news_title}</h4>
              <p style={{ fontSize: '11px', color: '#6b7280', margin: '0 0 8px 0' }}>${pattern.ticker} • {new Date(pattern.recorded_date).toLocaleDateString()}</p>
              {pattern.analysis?.confidence && <div style={{ display: 'flex', gap: '1rem', fontSize: '12px' }}><span>Confidence: {pattern.analysis.confidence}%</span><span>Action: {pattern.analysis.action}</span></div>}
            </div>
          ))}
        </div>
      )}

      {/* Portfolio Tab */}
      {activeTab === 'portfolio' && (
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 500, marginBottom: '1rem' }}>Portfolio Correlation</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
            {['HYPE', 'BTC', 'ETH', 'SUI', 'EGLD', 'MINA', 'STEM', 'FLNC', 'TSLA', 'ASTS', 'RKLB', 'RDW'].map(ticker => (
              <div key={ticker} style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#f9fafb' }}>
                <h4>${ticker}</h4>
                <p style={{ color: '#6b7280', fontSize: '13px' }}>Exposure to upcoming signals</p>
                <div style={{ marginTop: '12px', height: '4px', background: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.random() * 80 + 20}%`, background: '#3b82f6' }}></div></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PredictiveDashboard;