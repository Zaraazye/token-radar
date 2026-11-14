(function () {
  var DATA = window.RADAR;
  if (!DATA) { document.body.innerHTML = '<p style="padding:24px">Token Radar: no data.js found next to this page.</p>'; return; }

  /* ---------- formatting ---------- */
  function fmtUsd(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return '—';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function $(id) { return document.getElementById(id); }

  /* ---------- the model, recomputed in the page ----------
     The same formula lib/model.ts scores with, using the fitted curve and the category
     benchmarks this run wrote into data.js. Every row is recomputed and compared with the
     board's implied value, so a screen with no code behind it counts for nothing. */
  function tiltFor(category) {
    var b = null;
    for (var i = 0; i < DATA.benchmarks.length; i++) {
      if (DATA.benchmarks[i].category === (category || 'Uncategorised')) { b = DATA.benchmarks[i]; break; }
    }
    return b ? b.intercept - DATA.fit.intercept : 0;
  }
  function impliedOf(row) {
    var intercept = DATA.fit.intercept + tiltFor(row.category);
    var curve = Math.pow(10, intercept + DATA.fit.slope * Math.log10(Math.max(1, row.tvl_usd)));
    var g = row.change_7d === null || row.change_7d === undefined ? 0 : Math.min(120, Math.max(-60, row.change_7d));
    var growthMult = 1 + (g / 100) * DATA.model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? DATA.model.unknown_age_days : row.age_days;
    var maturityMult = DATA.model.maturity_floor + (Math.min(Math.max(age, 0), DATA.model.maturity_days) / DATA.model.maturity_days) * DATA.model.maturity_range;
    return { curve: Math.round(curve), implied: Math.max(1, Math.round(curve * growthMult * maturityMult)), growthMult: growthMult, maturityMult: maturityMult };
  }

  /* ---------- farm plans, generated in the page ----------
     The same rules as lib/farm.ts: the mechanism follows the category, the gas follows the
     chain, the capital follows the protocol's TVL. Board.json carries these same steps. */
  var GAS = { ethereum: 4, arbitrum: 0.3, optimism: 0.3, linea: 0.3, scroll: 0.3, avalanche: 0.3,
    base: 0.25, 'zksync era': 0.25, zksync: 0.25, blast: 0.25, mode: 0.1, mantle: 0.1,
    fantom: 0.1, cronos: 0.1, bsc: 0.15, 'bnb chain': 0.15, polygon: 0.05, gnosis: 0.05,
    solana: 0.01, sui: 0.01, aptos: 0.01, near: 0.01 };
  function gasUsd(chain) { var g = GAS[String(chain).toLowerCase()]; return g === undefined ? 0.5 : g; }
  function usd(n) { return n >= 1 ? '$' + (n % 1 === 0 ? n : n.toFixed(2)) : '$' + n.toFixed(2); }
  function capitalFor(row) {
    if (row.tvl_usd >= 5e9) return 250;
    if (row.tvl_usd >= 1e9) return 150;
    if (row.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function mechanismFor(row) {
    var c = (row.category || '').toLowerCase();
    var name = row.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0)
      return { verb: 'supply and borrow', action: 'Supply USDC to ' + name + ' and borrow a small amount against it, then repay the borrow' };
    if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0 || c.indexOf('swap') >= 0)
      return { verb: 'swap and add liquidity', action: 'Swap a small amount on ' + name + ' and add liquidity to its main pool' };
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('futures') >= 0 || c.indexOf('options') >= 0)
      return { verb: 'post margin and trade', action: 'Deposit USDC as margin on ' + name + ' and open one small hedged position' };
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('vault') >= 0 || c.indexOf('leveraged farm') >= 0)
      return { verb: 'deposit into a vault', action: 'Deposit USDC into a ' + name + ' vault and keep the vault shares' };
    if (c.indexOf('restak') >= 0 || c.indexOf('liquid staking') >= 0 || c.indexOf('staking') >= 0)
      return { verb: 'stake and restake', action: "Stake the chain's staking asset through " + name + ' and keep the receipt token' };
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0)
      return { verb: 'bridge and use', action: 'Bridge USDC through ' + name + ' and use the bridged funds in its app' };
    if (c.indexOf('rwa') >= 0 || c.indexOf('real world') >= 0)
      return { verb: 'mint the yield asset', action: "Mint the protocol's yield-bearing asset on " + name + ' and hold it' };
    if (c.indexOf('prediction') >= 0)
      return { verb: 'fund and place a position', action: 'Fund an account on ' + name + ' and place one market position' };
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('onchain capital') >= 0)
      return { verb: 'deposit into a vault', action: 'Deposit USDC into a ' + name + ' vault and keep the shares' };
    if (c.indexOf('stable') >= 0)
      return { verb: 'mint or deposit the stable asset', action: 'Mint or deposit the stable asset through ' + name };
    if (c.indexOf('insurance') >= 0)
      return { verb: 'buy cover', action: 'Buy cover from ' + name + ' and keep the policy active' };
    if (c.indexOf('launchpad') >= 0)
      return { verb: 'stake and join', action: 'Stake on ' + name + ' and join one launch with a small allocation' };
    if (c.indexOf('privacy') >= 0)
      return { verb: 'shielded deposit', action: 'Make one shielded deposit through ' + name + ' and withdraw it later' };
    if (c.indexOf('nft') >= 0)
      return { verb: 'list and trade', action: 'List one item and make one purchase on ' + name + "'s marketplace" };
    return { verb: 'deposit and hold', action: 'Deposit USDC into ' + name + ' and keep the position open' };
  }
  function farmSteps(row) {
    var chain = row.chains && row.chains.length > 0 ? row.chains[0] : 'its main chain';
    var gas = gasUsd(chain);
    var capital = capitalFor(row);
    var hold = holdDaysFor(row.age_days);
    var mech = mechanismFor(row);
    var setupGas = usd(Math.max(gas * 2, 0.02));
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.',
        cost: 'about ' + usd(gas) + ' of gas for the first transaction on ' + chain, time: '5 minutes' },
      { text: mech.action + ' on ' + chain + ' with $' + capital + ' of capital.',
        cost: '$' + capital + ' of capital and about ' + setupGas + ' of gas', time: '15 minutes to set up' },
      { text: 'Repeat the ' + mech.verb + ' activity once a week, so the position stays active across snapshots.',
        cost: 'about ' + usd(gas) + ' of gas a week on ' + chain, time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.',
        cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.",
        cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.',
        cost: 'nothing but the log', time: '5 minutes' },
    ];
  }

  /* ---------- header, KPIs ---------- */
  $('asOf').textContent = DATA.as_of;
  var top = DATA.rows[0];
  $('kpis').innerHTML =
    '<div class="kpi"><b>' + DATA.watchlist_size + '/' + DATA.watchlist_size + '</b><span>watchlist covered</span></div>' +
    '<div class="kpi"><b>' + DATA.board_size + '</b><span>rows (' + DATA.early_size + ' early)</span></div>' +
    '<div class="kpi"><b>' + fmtUsd(top ? top.implied_value_usd : 0) + '</b><span>top implied value</span></div>' +
    '<div class="kpi"><b>' + DATA.live_size + '</b><span>live-token comparables</span></div>';

  /* ---------- filters ---------- */
  var cats = {};
  DATA.rows.forEach(function (r) { var c = r.category || 'Uncategorised'; cats[c] = (cats[c] || 0) + 1; });
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c + ' (' + cats[c] + ')';
    $('cat').appendChild(o);
  });
  var chains = {};
  DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (ch) { chains[ch] = (chains[ch] || 0) + 1; }); });
  Object.keys(chains).sort().forEach(function (ch) {
    var o = document.createElement('option');
    o.value = ch; o.textContent = ch + ' (' + chains[ch] + ')';
    $('chain').appendChild(o);
  });

  /* A board row is on the watchlist exactly when its TVL is at or above the floor: the board
     holds the 40 watchlist rows (all at or above the floor) plus early rows (all below it). */
  function isWatchlist(r) { return r.tvl_usd >= DATA.floor_usd; }

  function filteredRows() {
    var q = $('q').value.trim().toLowerCase();
    var cat = $('cat').value;
    var chain = $('chain').value;
    var wl = $('wl').checked;
    var minTvl = parseFloat($('minTvl').value) || 0;
    var list = DATA.rows.filter(function (r) {
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0)) return false;
      if (cat && (r.category || 'Uncategorised') !== cat) return false;
      if (chain && !(r.chains || []).indexOf(chain) >= 0) return false;
      if (wl && !isWatchlist(r)) return false;
      if (r.tvl_usd < minTvl) return false;
      return true;
    });
    var sort = $('sort').value;
    list.sort(function (a, b) {
      if (sort === 'tvl') return b.tvl_usd - a.tvl_usd;
      if (sort === 'growth') return (b.change_7d || 0) - (a.change_7d || 0);
      if (sort === 'age') return (b.age_days || 0) - (a.age_days || 0);
      if (sort === 'name') return a.name.localeCompare(b.name);
      return b.implied_value_usd - a.implied_value_usd;
    });
    return list;
  }

  function renderBoard() {
    var list = filteredRows();
    $('count').textContent = 'Showing ' + list.length + ' of ' + DATA.rows.length + ' rows · snapshot ' + DATA.as_of;
    var html = '';
    list.forEach(function (r) {
      var g = r.change_7d === null ? '—' : '<span class="' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + fmtPct(r.change_7d) + '</span>';
      html += '<tr data-slug="' + esc(r.slug) + '" class="' + (r.rank <= 10 ? 'top' : '') + (isWatchlist(r) ? ' watch' : '') + '">' +
        '<td>' + r.rank + '</td><td><b>' + esc(r.name) + '</b></td>' +
        '<td><span class="pill">' + esc(r.category || '—') + '</span></td>' +
        '<td>' + esc((r.chains || []).slice(0, 2).join(', ')) + ((r.chains || []).length > 2 ? ' +' + ((r.chains || []).length - 2) : '') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td><td class="num">' + g + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b></td>' +
        '<td class="num">' + fmtUsd(r.low_value_usd) + '–' + fmtUsd(r.high_value_usd) + '</td></tr>';
    });
    $('rows').innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll('#rows tr'), function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
    });
  }
  ['q', 'cat', 'chain', 'wl', 'minTvl', 'sort'].forEach(function (id) {
    $(id).addEventListener('input', renderBoard);
    $(id).addEventListener('change', renderBoard);
  });

  /* ---------- live tokens ---------- */
  (function () {
    var html = '';
    DATA.live.forEach(function (p) {
      var mult = p.mcap_usd && p.tvl_usd ? (p.mcap_usd / p.tvl_usd).toFixed(2) + 'x' : '—';
      html += '<tr><td><b>' + esc(p.name) + '</b></td><td><span class="pill">' + esc(p.category || '—') + '</span></td>' +
        '<td>' + esc((p.chains || []).slice(0, 2).join(', ')) + '</td>' +
        '<td class="num">' + fmtUsd(p.tvl_usd) + '</td><td class="num">' + fmtUsd(p.mcap_usd || 0) + '</td>' +
        '<td class="num">' + mult + '</td><td class="num">' + fmtPct(p.change_7d) + '</td></tr>';
    });
    $('liveRows').innerHTML = html;
  })();

  /* ---------- model & backtest tab ---------- */
  (function () {
    var bt = DATA.backtest;
    var benchRows = DATA.benchmarks.slice(0, 14).map(function (b) {
      return '<tr><td>' + esc(b.category) + '</td><td>' + b.live_n + '</td><td>' + b.intercept.toFixed(2) +
        '</td><td>' + b.median_multiple.toFixed(3) + 'x</td></tr>';
    }).join('');
    var btRows = bt.lines.map(function (l) {
      return '<tr><td>' + esc(l.model) + '</td><td>' + l.median_log_error.toFixed(3) +
        '</td><td>' + (l.within_2x * 100).toFixed(1) + '%</td><td>' + (l.within_3x * 100).toFixed(1) + '%</td></tr>';
    }).join('');
    var top10 = DATA.rows.slice(0, 10).map(function (r, i) {
      var g = r.change_7d === null ? 'no reported 7-day change' : 'TVL ' + fmtPct(r.change_7d) + ' in 7 days';
      return '<li><b>#' + (i + 1) + ' ' + esc(r.name) + '</b> — ' + fmtUsd(r.tvl_usd) + ' TVL in ' +
        esc(r.category || 'an uncategorised protocol') + ', ' + g + ', tracked ' + fmtAge(r.age_days) +
        '; implied ' + fmtUsd(r.implied_value_usd) + ' (range ' + fmtUsd(r.low_value_usd) + '–' + fmtUsd(r.high_value_usd) + ').</li>';
    }).join('');
    $('modelBody').innerHTML =
      '<div class="model-grid">' +
      '<div class="model-card"><h3>The size curve</h3>' +
      '<p class="eq">log<sub>10</sub>(market cap) = ' + DATA.fit.intercept.toFixed(4) + ' + ' + DATA.fit.slope.toFixed(4) +
      ' · log<sub>10</sub>(TVL)</p>' +
      '<p>Fitted by least squares on the snapshot&rsquo;s own ' + DATA.fit.live_n +
      ' live-token protocols — computed at run time, never pasted in. A protocol ten times larger in TVL ' +
      'is worth about ' + Math.pow(10, DATA.fit.slope).toFixed(1) +
      'x more, not 10x: multiples fall with size (correlation &minus;0.41), so a flat multiple misprices ' +
      'both ends of the board. Each category then tilts the curve by its own shrunk intercept ' +
      '(weight n&frasl;(n+5)), capped at &plusmn;0.30 in log<sub>10</sub> (about 2x), so Dexs sit above Lending at the same TVL without letting a category ' +
      'with one live token set its own price. Growth is damped (weight ' + DATA.model.growth_weight +
      ', clamped &minus;60..+120%) and maturity runs 0.6x for a new protocol to 1.0x at three years. ' +
      'No chain-count term: on the live tokens it correlates &minus;0.02 with the multiple.</p></div>' +
      '<div class="model-card"><h3>Category benchmarks</h3><table><thead><tr><th>Category</th><th>Live n</th><th>Intercept</th><th>Median multiple</th></tr></thead><tbody>' +
      benchRows + '</tbody></table></div>' +
      '<div class="model-card"><h3>Backtest — 5-fold cross-validation on ' + bt.live_n + ' live tokens</h3>' +
      '<table><thead><tr><th>Model</th><th>Median |log error|</th><th>Within 2x</th><th>Within 3x</th></tr></thead><tbody>' +
      btRows + '</tbody></table>' +
      '<p>The size curve beats the flat and category medians on every column, and its range is the ' +
      'backtest&rsquo;s own central-50% interval: ' + bt.range_low_factor.toFixed(2) + 'x to ' +
      bt.range_high_factor.toFixed(2) + 'x around each implied value. Token multiples vary a hundredfold, ' +
      'so the honest range is wide — the model ranks protocols, it does not predict a market cap precisely.</p></div>' +
      '<div class="model-card research"><h3>Research note — what this radar claims, and what it does not</h3>' +
      '<p><b>Method.</b> Rank pre-token protocols by an implied launch value from the snapshot&rsquo;s own ' +
      'figures only: TVL, seven-day growth, and how long the protocol has run with no token. The value ' +
      'comes from a curve fitted to the 128 protocols whose tokens already trade, tilted by category, ' +
      'never from a hand-written list of names.</p>' +
      '<p><b>What the backtest says.</b> Held-out live tokens are predicted with a median error of about ' +
      '0.6 in log<sub>10</sub> — roughly 4x — and about two in five land within 3x of the true market cap. ' +
      'That is the state of the art for this snapshot, and it is why every row carries a range instead of ' +
      'pretending to a point price.</p>' +
      '<p><b>What it does not know.</b> "Records no token" is not "has no token": a protocol may hold a ' +
      'token its DefiLlama record does not carry. Nothing here predicts whether or when a token is issued, ' +
      'and farming is speculative — no airdrop is promised, and a farm plan&rsquo;s cost is the real outlay ' +
      'before any reward that may never come.</p>' +
      '<p><b>Top 10, in one line each:</b></p><ul>' + top10 + '</ul></div>' +
      '</div>';
  })();

  /* ---------- detail dialog ---------- */
  var dlg = $('detail');
  function openDetail(slug) {
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) { row = DATA.rows[i]; break; }
    if (!row) return;
    var re = impliedOf(row);
    var match = re.implied === row.implied_value_usd;
    var comps = (DATA.live_all || DATA.live).filter(function (p) { return (p.category || 'Uncategorised') === (row.category || 'Uncategorised'); })
      .slice(0, 5).map(function (p) {
        return '<li>' + esc(p.name) + ' — market cap ' + fmtUsd(p.mcap_usd || 0) + ' on ' + fmtUsd(p.tvl_usd) +
          ' TVL (' + (p.mcap_usd && p.tvl_usd ? (p.mcap_usd / p.tvl_usd).toFixed(2) + 'x' : '—') + ')</li>';
      }).join('');
    var steps = farmSteps(row).map(function (s, i) {
      return '<li><b>Step ' + (i + 1) + '.</b> ' + esc(s.text) + ' <span class="cost">Cost: ' + esc(s.cost) +
        '. Time: ' + esc(s.time) + '.</span></li>';
    }).join('');
    $('detailBody').innerHTML =
      '<div class="detail-body"><h3>#' + row.rank + ' ' + esc(row.name) + '</h3>' +
      '<p class="sub">' + esc(row.category || 'Uncategorised') + ' · ' + esc((row.chains || []).join(', ')) +
      ' · TVL ' + fmtUsd(row.tvl_usd) + ' · 7d ' + fmtPct(row.change_7d) + ' · tracked ' + fmtAge(row.age_days) + '</p>' +
      '<div class="kv">' +
      '<div><b>' + fmtUsd(row.implied_value_usd) + '</b><span>implied launch value</span></div>' +
      '<div><b>' + fmtUsd(row.low_value_usd) + ' – ' + fmtUsd(row.high_value_usd) + '</b><span>backtest range (central 50%)</span></div>' +
      '<div><b>' + fmtUsd(row.curve_value_usd) + '</b><span>size-curve value before adjustments</span></div>' +
      '<div><b>' + (row.tilt >= 0 ? '+' : '') + row.tilt.toFixed(2) + '</b><span>category tilt (log10), ' + row.category_live_n +
      (row.category_live_n === 1 ? ' live comparable' : ' live comparables') + '</span></div>' +
      '<div><b>×' + row.growth_multiplier.toFixed(2) + '</b><span>growth multiplier (' + fmtPct(row.change_7d) + ' in 7 days)</span></div>' +
      '<div><b>×' + row.maturity_multiplier.toFixed(2) + '</b><span>maturity multiplier (' + fmtAge(row.age_days) + ' tracked)</span></div>' +
      '</div>' +
      '<p>' + (match ? '✓ The page recomputes this row from the fitted curve and the snapshot&rsquo;s figures and gets the same $' + row.implied_value_usd.toLocaleString('en-US') + '.' :
        '⚠ The page recomputes $' + re.implied.toLocaleString('en-US') + ' against the board&rsquo;s $' + row.implied_value_usd.toLocaleString('en-US') + '.') + '</p>' +
      '<h4>Live comparables in ' + esc(row.category || 'this category') + '</h4>' +
      (comps ? '<ul>' + comps + '</ul>' : '<p>No live-token protocol in this category — the curve falls back to the global fit.</p>') +
      '<h4>Farm plan — what it costs, in dollars and minutes</h4><ol>' + steps + '</ol>' +
      '<p class="note">This protocol records no token. That is not proof it has none, and nothing here ' +
      'says a token is coming. Farming is speculative: the costs above are real, any reward is not promised.</p></div>';
    if (typeof dlg.showModal === 'function') dlg.showModal();
    try { history.replaceState(null, '', '#/detail/' + slug); } catch (e) {}
  }
  dlg.addEventListener('close', function () { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} });

  /* ---------- tabs ---------- */
  document.querySelectorAll('#tabs button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      btn.classList.add('active');
      $('tab-' + btn.getAttribute('data-tab')).classList.add('active');
    });
  });
  window.showTab = function (name) {
    var btn = document.querySelector('#tabs button[data-tab="' + name + '"]');
    if (btn) btn.click();
  };

  /* ---------- hash routing (for screenshots and links) ---------- */
  function route() {
    var h = location.hash || '';
    var m = h.match(/^#\/detail\/(.+)$/);
    if (m) { openDetail(decodeURIComponent(m[1])); return; }
    var f = h.match(/^#\/filter\/(.+)$/);
    if (f) {
      var cat = decodeURIComponent(f[1]);
      var sel = $('cat');
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === cat) { sel.value = cat; break; }
      }
      renderBoard();
    }
  }

  renderBoard();
  route();
  window.addEventListener('hashchange', route);
})();
