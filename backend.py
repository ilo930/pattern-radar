#!/usr/bin/env python3
"""
Pattern Radar Backend
- Fetches RSS news daily (cached)
- Scrapes regulatory calendars monthly
- Fetches real-time prices on demand (Finnhub free tier)
- Stores everything in SQLite
- Serves via simple HTTP endpoint
- Claude API calls happen in the React dashboard (on demand only)
"""

import feedparser
import requests
import json
import sqlite3
import os
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
RSS_FEEDS = {
    'energy-storage': [
        "https://www.energy-storage.news/feed/",
        "https://www.utilitydive.com/feeds/news/"
    ],
    'space': [
        "https://arstechnica.com/space/feed/",
        "https://spaceflightnow.com/feed/"
    ]
}

REGULATORY_SOURCES = {
    'EU': 'https://ec.europa.eu/energy/topics/infrastructure/trans-european-networks-energy/timelines_en',
    'US': 'https://www.ferc.gov/news-updates/events'
}

FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY", "demo")  # Sign up at finnhub.io

DB_PATH = "pattern_radar.db"

class PatternRadarDB:
    def __init__(self, db_path=DB_PATH):
        self.db_path = db_path
        self.init_db()
    
    def init_db(self):
        """Initialize SQLite database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # News table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS news (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                source TEXT,
                url TEXT,
                sector TEXT,
                summary TEXT,
                date TEXT,
                signal_type TEXT,
                relevance_score REAL,
                fetched_at TEXT
            )
        """)
        
        # Regulations table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS regulations (
                id TEXT PRIMARY KEY,
                event TEXT NOT NULL,
                date TEXT,
                impact TEXT,
                affected_tickers TEXT,
                status TEXT,
                source TEXT,
                fetched_at TEXT
            )
        """)
        
        # Price cache table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS price_cache (
                ticker TEXT PRIMARY KEY,
                price REAL,
                change_pct REAL,
                change_abs REAL,
                timestamp TEXT
            )
        """)
        
        # Pattern ledger (for learning)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS patterns (
                id TEXT PRIMARY KEY,
                news_id TEXT,
                ticker TEXT,
                analysis_json TEXT,
                created_at TEXT,
                outcome TEXT
            )
        """)
        
        conn.commit()
        conn.close()
    
    def insert_news(self, news_items: List[Dict]) -> int:
        """Insert or update news items"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        count = 0
        for item in news_items:
            try:
                cursor.execute("""
                    INSERT OR REPLACE INTO news 
                    (id, title, source, url, sector, summary, date, signal_type, relevance_score, fetched_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    item['id'],
                    item['title'],
                    item['source'],
                    item.get('url', ''),
                    item.get('sector', 'general'),
                    item.get('summary', ''),
                    item.get('date', datetime.now().isoformat()),
                    item.get('signal_type', 'news'),
                    item.get('relevance_score', 0),
                    datetime.now().isoformat()
                ))
                count += 1
            except Exception as e:
                logger.error(f"Error inserting news: {e}")
        
        conn.commit()
        conn.close()
        return count
    
    def get_recent_news(self, hours=24, sector=None) -> List[Dict]:
        """Retrieve recent news"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cutoff = (datetime.now() - timedelta(hours=hours)).isoformat()
        
        if sector:
            cursor.execute("""
                SELECT * FROM news 
                WHERE date > ? AND sector = ?
                ORDER BY date DESC
            """, (cutoff, sector))
        else:
            cursor.execute("""
                SELECT * FROM news 
                WHERE date > ?
                ORDER BY date DESC
            """, (cutoff,))
        
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]
    
    def insert_regulations(self, regs: List[Dict]) -> int:
        """Insert or update regulations"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        count = 0
        for reg in regs:
            try:
                cursor.execute("""
                    INSERT OR REPLACE INTO regulations
                    (id, event, date, impact, affected_tickers, status, source, fetched_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    reg['id'],
                    reg['event'],
                    reg.get('date', ''),
                    reg.get('impact', ''),
                    json.dumps(reg.get('affected_tickers', [])),
                    reg.get('status', 'upcoming'),
                    reg.get('source', 'manual'),
                    datetime.now().isoformat()
                ))
                count += 1
            except Exception as e:
                logger.error(f"Error inserting regulation: {e}")
        
        conn.commit()
        conn.close()
        return count
    
    def get_upcoming_regulations(self, days=30) -> List[Dict]:
        """Get regulations within next N days"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        today = datetime.now().date()
        future = (today + timedelta(days=days)).isoformat()
        
        cursor.execute("""
            SELECT * FROM regulations 
            WHERE date BETWEEN ? AND ?
            ORDER BY date ASC
        """, (today.isoformat(), future))
        
        rows = cursor.fetchall()
        conn.close()
        
        result = []
        for row in rows:
            result.append({
                **dict(row),
                'affected_tickers': json.loads(row['affected_tickers'])
            })
        return result
    
    def cache_price(self, ticker: str, price: float, change_pct: float, change_abs: float):
        """Cache stock price"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT OR REPLACE INTO price_cache
            (ticker, price, change_pct, change_abs, timestamp)
            VALUES (?, ?, ?, ?, ?)
        """, (ticker, price, change_pct, change_abs, datetime.now().isoformat()))
        
        conn.commit()
        conn.close()
    
    def get_price(self, ticker: str) -> Optional[Dict]:
        """Get cached price"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM price_cache WHERE ticker = ?", (ticker,))
        row = cursor.fetchone()
        conn.close()
        
        return dict(row) if row else None


class NewsAggregator:
    """Fetch and parse RSS feeds"""
    
    def __init__(self, db: PatternRadarDB):
        self.db = db
    
    def fetch_rss(self, sectors: Dict[str, List[str]]) -> List[Dict]:
        """Fetch and parse RSS feeds"""
        all_items = []
        
        for sector, feeds in sectors.items():
            for feed_url in feeds:
                try:
                    logger.info(f"Fetching {sector} feed: {feed_url}")
                    feed = feedparser.parse(feed_url)
                    
                    for entry in feed.entries[:10]:  # Limit to 10 per feed
                        # Filter noise
                        title_lower = entry.title.lower()
                        noise_keywords = ['podcast', 'webinar', 'opinion', 'philosophical']
                        if any(kw in title_lower for kw in noise_keywords):
                            continue
                        
                        item = {
                            'id': entry.link,
                            'title': entry.title,
                            'source': feed.feed.get('title', 'Unknown'),
                            'url': entry.link,
                            'sector': sector,
                            'summary': entry.get('summary', '')[:200],
                            'date': entry.get('published', datetime.now().isoformat()),
                            'signal_type': self._classify_signal(entry.title),
                            'relevance_score': self._score_relevance(entry.title, sector)
                        }
                        all_items.append(item)
                
                except Exception as e:
                    logger.error(f"Error fetching {feed_url}: {e}")
        
        return all_items
    
    @staticmethod
    def _classify_signal(title: str) -> str:
        """Classify news into signal types"""
        title_lower = title.lower()
        
        if any(kw in title_lower for kw in ['fund', 'invest', 'million', 'billion', 'acquisition', 'secures']):
            return 'capital_deployment'
        elif any(kw in title_lower for kw in ['regulation', 'policy', 'law', 'rule', 'approve', 'mandate']):
            return 'regulatory'
        elif any(kw in title_lower for kw in ['shortage', 'supply', 'constraint', 'price spike']):
            return 'supply_shock'
        elif any(kw in title_lower for kw in ['test', 'trial', 'prototype', 'launch', 'achieve']):
            return 'technical'
        else:
            return 'news'
    
    @staticmethod
    def _score_relevance(title: str, sector: str) -> float:
        """Score relevance to investment thesis (0-10)"""
        score = 5.0
        title_lower = title.lower()
        
        # Capital deployment = high relevance
        if any(kw in title_lower for kw in ['fund', 'invest', 'million', 'billion']):
            score += 2
        
        # Regulatory = medium-high
        if 'regulation' in title_lower or 'policy' in title_lower:
            score += 1.5
        
        # Specific markets boost
        if sector == 'energy-storage':
            if any(kw in title_lower for kw in ['bess', 'battery', 'storage', 'grid']):
                score += 1
        elif sector == 'space':
            if any(kw in title_lower for kw in ['starship', 'orbit', 'satellite', 'launch']):
                score += 1
        
        return min(score, 10.0)


class RegulationScraper:
    """Scrape regulatory calendars (simplified for demo)"""
    
    def __init__(self, db: PatternRadarDB):
        self.db = db
    
    def scrape_regulations(self) -> List[Dict]:
        """Scrape upcoming regulations"""
        # In production, use BeautifulSoup to scrape actual sites
        # For now, return hardcoded known events
        
        regs = [
            {
                'id': 'eu-grid-2029',
                'event': 'EU Grid Code Revision (2029 implementation)',
                'date': (datetime.now() + timedelta(days=83)).date().isoformat(),
                'impact': 'Cross-border balancing, BESS incentives increase',
                'affected_tickers': ['FLNC', 'ENGI.PA', 'EDF.P', 'RWE'],
                'status': 'upcoming'
            },
            {
                'id': 'us-ira-tax-2',
                'event': 'US IRA Battery Tax Credit Reduction (phase 2)',
                'date': (datetime.now() + timedelta(days=37)).date().isoformat(),
                'impact': 'Domestic content requirements increase to 60%',
                'affected_tickers': ['TSLA', 'STEM', 'VRRM', 'PLUG'],
                'status': 'upcoming'
            },
            {
                'id': 'fcc-debris',
                'event': 'FCC Space Debris Rules (approved)',
                'date': (datetime.now() - timedelta(days=4)).date().isoformat(),
                'impact': 'Satellite operators must plan deorbits',
                'affected_tickers': ['SPCE', 'ASTRA', 'TSLA'],
                'status': 'live'
            }
        ]
        
        return regs


class PriceClient:
    """Fetch real-time prices from Finnhub or cache"""
    
    def __init__(self, api_key: str, db: PatternRadarDB):
        self.api_key = api_key
        self.db = db
        self.base_url = "https://finnhub.io/api/v1"
    
    def get_quote(self, ticker: str) -> Optional[Dict]:
        """Fetch real-time quote or return cached"""
        
        # Check cache first (< 1 min old)
        cached = self.db.get_price(ticker)
        if cached:
            cached_time = datetime.fromisoformat(cached['timestamp'])
            if (datetime.now() - cached_time).seconds < 60:
                return cached
        
        try:
            url = f"{self.base_url}/quote"
            params = {'symbol': ticker, 'token': self.api_key}
            response = requests.get(url, params=params, timeout=5)
            
            if response.status_code == 200:
                data = response.json()
                result = {
                    'ticker': ticker,
                    'price': data.get('c'),
                    'change_pct': data.get('dp'),
                    'change_abs': data.get('d')
                }
                
                # Cache it
                self.db.cache_price(
                    ticker,
                    data.get('c', 0),
                    data.get('dp', 0),
                    data.get('d', 0)
                )
                
                return result
        except Exception as e:
            logger.error(f"Error fetching price for {ticker}: {e}")
        
        return cached


def main():
    """Main workflow: fetch all data, update DB"""
    
    db = PatternRadarDB()
    
    # 1. Fetch news
    logger.info("Fetching news from RSS feeds...")
    agg = NewsAggregator(db)
    news = agg.fetch_rss(RSS_FEEDS)
    inserted = db.insert_news(news)
    logger.info(f"Inserted {inserted} news items")
    
    # 2. Scrape regulations
    logger.info("Scraping regulatory calendar...")
    scraper = RegulationScraper(db)
    regs = scraper.scrape_regulations()
    inserted = db.insert_regulations(regs)
    logger.info(f"Inserted {inserted} regulations")
    
    # 3. Pre-cache key prices
    logger.info("Caching key prices...")
    price_client = PriceClient(FINNHUB_API_KEY, db)
    tickers = ['STEM', 'FLNC', 'TSLA', 'ENGI.PA', 'SPCE']
    for ticker in tickers:
        quote = price_client.get_quote(ticker)
        if quote:
            logger.info(f"Cached {ticker}: ${quote['price']}")
    
    # 4. Export data for dashboard
    logger.info("Exporting data...")
    all_news = db.get_recent_news(hours=7*24)  # Past 7 days
    regs = db.get_upcoming_regulations(days=30)
    
    export = {
        'news': all_news[:50],
        'regulations': regs,
        'last_update': datetime.now().isoformat()
    }
    
    with open('dashboard_data.json', 'w') as f:
        json.dump(export, f, indent=2, default=str)
    
    logger.info("Done. Data exported to dashboard_data.json")


if __name__ == '__main__':
    main()
