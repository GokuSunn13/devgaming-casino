// Connect to Socket.io server
const socket = io();

// Player State
let playerData = {
    nickname: ''
};

let currentGame = null;
let currentTableId = null;
let currentRole = null;
let myPlayerId = null;

// Blackjack state
let previousDealerCardCount = 0;
let previousPlayerCardCounts = {};

// Roulette state
let rouletteBets = [];

// Initialize
socket.on('connect', () => {
    myPlayerId = socket.id;
});

// ==================== MAIN MENU ====================

const enterCasinoBtn = document.getElementById('enterCasinoBtn');
const exitCasinoBtn = document.getElementById('exitCasinoBtn');
const playerNicknameInput = document.getElementById('playerNickname');

enterCasinoBtn.addEventListener('click', () => {
    const nickname = playerNicknameInput.value.trim();
    
    if (!nickname) {
        alert('Wprowadź nick postaci IC!');
        return;
    }
    
    playerData.nickname = nickname;
    updateNicknameDisplays();
    showScreen('gameSelection');
});

exitCasinoBtn.addEventListener('click', () => {
    if (confirm('Czy na pewno chcesz opuścić kasyno?')) {
        location.reload();
    }
});

function updateNicknameDisplays() {
    document.getElementById('displayNickname').textContent = playerData.nickname;
    
    const displays = ['bjDisplayNick', 'pokerDisplayNick', 'rouletteDisplayNick'];
    displays.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = playerData.nickname;
    });
}

// ==================== GAME SELECTION ====================

document.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', () => {
        const game = card.dataset.game;
        currentGame = game;
        
        if (game === 'blackjack') {
            showScreen('blackjackLobby');
            socket.emit('getBlackjackTables');
        } else if (game === 'poker') {
            showScreen('pokerLobby');
            socket.emit('getPokerTables');
        } else if (game === 'roulette') {
            showScreen('rouletteLobby');
            socket.emit('getRouletteTables');
        }
    });
});

// Back buttons
document.getElementById('backToGamesFromBJ').addEventListener('click', () => showScreen('gameSelection'));
document.getElementById('backToGamesFromPoker').addEventListener('click', () => showScreen('gameSelection'));
document.getElementById('backToGamesFromRoulette').addEventListener('click', () => showScreen('gameSelection'));

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    updateNicknameDisplays();
}

// ==================== BLACKJACK ====================

document.getElementById('createBlackjackTableBtn').addEventListener('click', () => {
    socket.emit('createBlackjackTable', { name: playerData.nickname });
});

document.getElementById('refreshBlackjackTablesBtn').addEventListener('click', () => {
    socket.emit('getBlackjackTables');
});

document.getElementById('leaveBlackjackTableBtn').addEventListener('click', () => {
    socket.emit('leaveBlackjackTable');
    currentTableId = null;
    previousDealerCardCount = 0;
    previousPlayerCardCounts = {};
    showScreen('blackjackLobby');
    socket.emit('getBlackjackTables');
});

// Croupier controls
document.getElementById('bjDealCardsBtn').addEventListener('click', () => {
    previousDealerCardCount = 0;
    previousPlayerCardCounts = {};
    socket.emit('bjDealCards');
});
document.getElementById('bjCroupierPlayBtn').addEventListener('click', () => socket.emit('bjCroupierPlay'));
document.getElementById('bjNewRoundBtn').addEventListener('click', () => {
    previousDealerCardCount = 0;
    previousPlayerCardCounts = {};
    socket.emit('bjNewRound');
});

// Player controls
document.getElementById('bjReadyBtn').addEventListener('click', () => socket.emit('bjReady'));
document.getElementById('bjHitBtn').addEventListener('click', () => socket.emit('bjHit'));
document.getElementById('bjStandBtn').addEventListener('click', () => socket.emit('bjStand'));

document.getElementById('bjCloseResultsBtn').addEventListener('click', () => {
    document.getElementById('bjResultsModal').classList.add('hidden');
});

// Blackjack Socket Events
socket.on('blackjackTableList', (tables) => {
    const list = document.getElementById('blackjackTablesList');
    if (tables.length === 0) {
        list.innerHTML = '<p class="no-tables">Brak dostępnych stołów. Stwórz własny!</p>';
        return;
    }
    
    list.innerHTML = tables.map(table => `
        <div class="table-card">
            <div class="table-card-info">
                <h4>🎰 Stół ${table.croupierName}</h4>
                <p>Gracze: ${table.playerCount}/4 | Status: ${formatPhase(table.gamePhase)}</p>
            </div>
            <button class="btn btn-gold join-bj-table-btn" data-id="${table.id}" ${table.playerCount >= 4 ? 'disabled' : ''}>
                ${table.playerCount >= 4 ? 'Pełny' : 'Dołącz'}
            </button>
        </div>
    `).join('');
    
    document.querySelectorAll('.join-bj-table-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            socket.emit('joinBlackjackTable', { 
                tableId: btn.dataset.id, 
                name: playerData.nickname
            });
        });
    });
});

socket.on('bjJoinedTable', (data) => {
    currentTableId = data.tableId;
    currentRole = data.role;
    
    showScreen('blackjackGame');
    
    document.getElementById('bjTableIdDisplay').textContent = `Stół: ${data.tableId.slice(-6)}`;
    document.getElementById('bjRoleDisplay').textContent = `Rola: ${data.role === 'croupier' ? '🎩 Krupier' : '🎮 Gracz'}`;
    
    if (data.role === 'croupier') {
        document.getElementById('bjCroupierControls').classList.remove('hidden');
        document.getElementById('bjPlayerControls').classList.add('hidden');
    } else {
        document.getElementById('bjCroupierControls').classList.add('hidden');
        document.getElementById('bjPlayerControls').classList.remove('hidden');
    }
    
    updateBlackjackState(data.state);
});

socket.on('bjTableUpdate', (state) => {
    updateBlackjackState(state);
});

socket.on('bjMessage', (data) => {
    document.getElementById('bjGameMessage').textContent = data.text;
});

socket.on('bjRoundResults', (results) => {
    document.getElementById('bjResultsContent').innerHTML = `
        <p style="margin-bottom: 20px; font-size: 1.2rem;">
            Krupier: ${results.dealerValue} ${results.dealerBust ? '(BUST!)' : ''}
        </p>
        ${results.players.map(p => `
            <div class="result-item ${p.result}">
                <span>${p.name}</span>
                <span class="result-text">${formatResult(p.result)} ${p.multiplier ? `(${p.multiplier}x)` : ''}</span>
            </div>
        `).join('')}
    `;
    document.getElementById('bjResultsModal').classList.remove('hidden');
});

socket.on('bjTableClosed', (data) => {
    alert(data.message);
    showScreen('blackjackLobby');
    socket.emit('getBlackjackTables');
});

socket.on('bjTablesUpdated', () => {
    if (currentGame === 'blackjack' && !currentTableId) {
        socket.emit('getBlackjackTables');
    }
});

function updateBlackjackState(state) {
    document.getElementById('bjCroupierName').textContent = state.croupier?.name || '---';
    
    // Animate dealer cards if new
    const dealerCardsEl = document.getElementById('bjDealerCards');
    const newDealerCount = state.dealerHand.length;
    if (newDealerCount > previousDealerCardCount) {
        cardDealIndex = 0;
        dealerCardsEl.innerHTML = state.dealerHand.map((card, i) => 
            createCardHTML(card, false, i >= previousDealerCardCount)
        ).join('');
    } else {
        dealerCardsEl.innerHTML = state.dealerHand.map(card => createCardHTML(card)).join('');
    }
    previousDealerCardCount = newDealerCount;
    
    document.getElementById('bjDealerValue').textContent = state.dealerHandValue;
    document.getElementById('bjGamePhase').textContent = formatPhase(state.gamePhase);
    
    updateBJPlayersArea(state);
    updateBJControls(state);
}

function updateBJPlayersArea(state) {
    const maxSlots = 4;
    let html = '';
    
    state.players.forEach((player) => {
        const isMe = player.id === myPlayerId;
        const isCurrentTurn = player.isCurrentTurn;
        const prevCount = previousPlayerCardCounts[player.id] || 0;
        const newCount = player.hand.length;
        
        let slotClass = 'player-slot';
        if (isCurrentTurn) slotClass += ' active-turn';
        if (isMe) slotClass += ' current-player';
        if (player.status === 'bust') slotClass += ' bust';
        if (player.status === 'blackjack') slotClass += ' blackjack';
        
        cardDealIndex = 0;
        const cardsHtml = player.hand.map((card, i) => 
            createCardHTML(card, true, i >= prevCount)
        ).join('');
        
        previousPlayerCardCounts[player.id] = newCount;
        
        html += `
            <div class="${slotClass}">
                <div class="player-info">
                    <span class="player-name">${isMe ? '👤 ' : ''}${player.name}</span>
                    <span class="player-status-badge ${player.status}">${getStatusBadge(player.status)}</span>
                </div>
                <div class="player-cards">
                    ${cardsHtml}
                </div>
                <div class="player-value">Wartość: ${player.handValue}</div>
                ${player.status !== 'waiting' && player.status !== 'ready' && player.status !== 'playing' 
                    ? `<div class="player-status ${player.status}">${player.status.toUpperCase()}</div>` 
                    : ''}
            </div>
        `;
    });
    
    for (let i = state.players.length; i < maxSlots; i++) {
        html += `<div class="empty-slot"><span>Puste miejsce ${i + 1}</span></div>`;
    }
    
    document.getElementById('bjPlayersArea').innerHTML = html;
}

function getStatusBadge(status) {
    const badges = {
        'waiting': '⏳ Czeka',
        'ready': '✅ Gotowy',
        'playing': '🎮 Gra',
        'stand': '✋ Stoi',
        'bust': '💥 Bust',
        'blackjack': '🎰 BJ!'
    };
    return badges[status] || status;
}

function updateBJControls(state) {
    if (currentRole === 'croupier') {
        const hasReadyPlayers = state.players.some(p => p.status === 'ready');
        const allPlayersFinished = state.players.every(p => 
            p.status === 'stand' || p.status === 'bust' || p.status === 'blackjack'
        );
        
        document.getElementById('bjDealCardsBtn').classList.toggle('hidden', 
            state.gamePhase !== 'waiting' || !hasReadyPlayers);
        document.getElementById('bjCroupierPlayBtn').classList.toggle('hidden', 
            state.gamePhase !== 'playing' || !allPlayersFinished);
        document.getElementById('bjNewRoundBtn').classList.toggle('hidden', 
            state.gamePhase !== 'finished');
    } else {
        const myPlayer = state.players.find(p => p.id === myPlayerId);
        
        if (state.gamePhase === 'waiting' && myPlayer?.status === 'waiting') {
            document.getElementById('bjReadyControls').classList.remove('hidden');
            document.getElementById('bjPlayingControls').classList.add('hidden');
        } else if (state.gamePhase === 'playing' && myPlayer?.isCurrentTurn) {
            document.getElementById('bjReadyControls').classList.add('hidden');
            document.getElementById('bjPlayingControls').classList.remove('hidden');
        } else {
            document.getElementById('bjReadyControls').classList.add('hidden');
            document.getElementById('bjPlayingControls').classList.add('hidden');
        }
    }
}

// ==================== POKER ====================

document.getElementById('createPokerTableBtn').addEventListener('click', () => {
    socket.emit('createPokerTable', { name: playerData.nickname });
});

document.getElementById('refreshPokerTablesBtn').addEventListener('click', () => {
    socket.emit('getPokerTables');
});

document.getElementById('leavePokerTableBtn').addEventListener('click', () => {
    socket.emit('leavePokerTable');
    currentTableId = null;
    showScreen('pokerLobby');
    socket.emit('getPokerTables');
});

// Poker controls
document.getElementById('pokerStartGameBtn').addEventListener('click', () => socket.emit('pokerStartGame'));
document.getElementById('pokerNextPhaseBtn').addEventListener('click', () => socket.emit('pokerNextPhase'));
document.getElementById('pokerNextRoundBtn').addEventListener('click', () => socket.emit('pokerNextRound'));
document.getElementById('pokerFoldBtn').addEventListener('click', () => socket.emit('pokerFold'));
document.getElementById('pokerCheckBtn').addEventListener('click', () => socket.emit('pokerCheck'));
document.getElementById('pokerCloseResultsBtn').addEventListener('click', () => {
    document.getElementById('pokerResultsModal').classList.add('hidden');
});

socket.on('pokerTableList', (tables) => {
    const list = document.getElementById('pokerTablesList');
    if (tables.length === 0) {
        list.innerHTML = '<p class="no-tables">Brak dostępnych stołów. Stwórz własny!</p>';
        return;
    }
    
    list.innerHTML = tables.map(table => `
        <div class="table-card">
            <div class="table-card-info">
                <h4>♠️ Stół ${table.croupierName}</h4>
                <p>Gracze: ${table.playerCount}/6 | Status: ${formatPokerPhase(table.gamePhase)}</p>
            </div>
            <button class="btn btn-gold join-poker-table-btn" data-id="${table.id}" ${table.playerCount >= 6 ? 'disabled' : ''}>
                ${table.playerCount >= 6 ? 'Pełny' : 'Dołącz'}
            </button>
        </div>
    `).join('');
    
    document.querySelectorAll('.join-poker-table-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            socket.emit('joinPokerTable', { 
                tableId: btn.dataset.id, 
                name: playerData.nickname
            });
        });
    });
});

socket.on('pokerJoinedTable', (data) => {
    currentTableId = data.tableId;
    currentRole = data.role;
    
    showScreen('pokerGame');
    
    document.getElementById('pokerTableIdDisplay').textContent = `Stół: ${data.tableId.slice(-6)}`;
    document.getElementById('pokerRoleDisplay').textContent = `Rola: ${data.role === 'croupier' ? '🎩 Krupier' : '🎮 Gracz'}`;
    
    if (data.role === 'croupier') {
        document.getElementById('pokerCroupierControls').classList.remove('hidden');
        document.getElementById('pokerPlayerControls').classList.add('hidden');
    } else {
        document.getElementById('pokerCroupierControls').classList.add('hidden');
        document.getElementById('pokerPlayerControls').classList.remove('hidden');
    }
    
    updatePokerState(data.state);
});

socket.on('pokerTableUpdate', (state) => {
    updatePokerState(state);
});

socket.on('pokerMessage', (data) => {
    document.getElementById('pokerGameMessage').textContent = data.text;
});

socket.on('pokerRoundResult', (data) => {
    document.getElementById('pokerResultsContent').innerHTML = `
        <div class="winner-display">
            <div class="winner-name">🏆 ${data.winner.name}</div>
            <div class="winner-hand">${data.winner.handName}</div>
            <div class="winner-cards">
                ${data.winner.hand.map(card => createCardHTML(card)).join('')}
            </div>
        </div>
    `;
    document.getElementById('pokerResultsModal').classList.remove('hidden');
});

socket.on('pokerTableClosed', (data) => {
    alert(data.message);
    showScreen('pokerLobby');
    socket.emit('getPokerTables');
});

socket.on('pokerTablesUpdated', () => {
    if (currentGame === 'poker' && !currentTableId) {
        socket.emit('getPokerTables');
    }
});

function updatePokerState(state) {
    document.getElementById('communityCards').innerHTML = state.communityCards.map(card => createCardHTML(card)).join('');
    document.getElementById('pokerGamePhase').textContent = formatPokerPhase(state.gamePhase);
    
    updatePokerPlayersArea(state);
    updatePokerControls(state);
}

function updatePokerPlayersArea(state) {
    let html = '';
    
    state.players.forEach((player) => {
        const isMe = player.id === myPlayerId;
        const isCurrentTurn = player.isCurrentTurn;
        
        let slotClass = 'poker-player';
        if (isCurrentTurn) slotClass += ' active';
        if (player.folded) slotClass += ' folded';
        
        html += `
            <div class="${slotClass}">
                <div class="player-name">${isMe ? '👤 ' : ''}${player.name}</div>
                <div class="player-cards">
                    ${(isMe || state.gamePhase === 'showdown' ? player.hand : player.hand.map(() => ({value: '?', suit: '?'}))).map(card => createCardHTML(card, true)).join('')}
                </div>
                ${player.folded ? '<div class="player-status folded">FOLD</div>' : ''}
            </div>
        `;
    });
    
    document.getElementById('pokerPlayersArea').innerHTML = html;
}

function updatePokerControls(state) {
    if (currentRole === 'croupier') {
        document.getElementById('pokerStartGameBtn').classList.toggle('hidden', state.gamePhase !== 'waiting');
        document.getElementById('pokerNextPhaseBtn').classList.toggle('hidden', 
            !['preflop', 'flop', 'turn', 'river'].includes(state.gamePhase));
        document.getElementById('pokerNextRoundBtn').classList.toggle('hidden', state.gamePhase !== 'finished');
    } else {
        const myPlayer = state.players.find(p => p.id === myPlayerId);
        const controls = document.getElementById('pokerPlayerControls');
        
        if (myPlayer?.isCurrentTurn && ['preflop', 'flop', 'turn', 'river'].includes(state.gamePhase)) {
            controls.classList.remove('hidden');
        } else {
            controls.classList.add('hidden');
        }
    }
}

// ==================== ROULETTE ====================

document.getElementById('createRouletteTableBtn').addEventListener('click', () => {
    socket.emit('createRouletteTable', { name: playerData.nickname });
});

document.getElementById('refreshRouletteTablesBtn').addEventListener('click', () => {
    socket.emit('getRouletteTables');
});

document.getElementById('leaveRouletteTableBtn').addEventListener('click', () => {
    socket.emit('leaveRouletteTable');
    currentTableId = null;
    rouletteBets = [];
    showScreen('rouletteLobby');
    socket.emit('getRouletteTables');
});

// Roulette betting
document.querySelectorAll('.bet-cell').forEach(cell => {
    cell.addEventListener('click', () => {
        const betType = cell.dataset.bet;
        toggleRouletteBet(betType, cell);
    });
});

document.getElementById('clearRouletteBetsBtn').addEventListener('click', () => {
    rouletteBets = [];
    updateRouletteBetsDisplay();
    document.querySelectorAll('.bet-cell').forEach(c => c.classList.remove('selected'));
});

document.getElementById('confirmRouletteBetsBtn').addEventListener('click', () => {
    if (rouletteBets.length > 0) {
        socket.emit('rouletteConfirmBets', { bets: rouletteBets });
    } else {
        alert('Wybierz przynajmniej jeden typ!');
    }
});

document.getElementById('rouletteSpinBtn').addEventListener('click', () => socket.emit('rouletteSpin'));
document.getElementById('rouletteNewRoundBtn').addEventListener('click', () => socket.emit('rouletteNewRound'));
document.getElementById('rouletteCloseResultsBtn').addEventListener('click', () => {
    document.getElementById('rouletteResultsModal').classList.add('hidden');
});

function toggleRouletteBet(betType, cell) {
    const index = rouletteBets.indexOf(betType);
    if (index > -1) {
        rouletteBets.splice(index, 1);
        cell.classList.remove('selected');
    } else {
        rouletteBets.push(betType);
        cell.classList.add('selected');
    }
    updateRouletteBetsDisplay();
}

function updateRouletteBetsDisplay() {
    const container = document.getElementById('myRouletteBets');
    
    if (rouletteBets.length === 0) {
        container.innerHTML = '<p class="no-bets">Wybierz pola na planszy</p>';
    } else {
        container.innerHTML = rouletteBets.map(b => `
            <div class="bet-tag">${formatBetType(b)}</div>
        `).join('');
    }
}

function formatBetType(bet) {
    const labels = {
        'red': '🔴 Czerwone',
        'black': '⚫ Czarne',
        'even': 'Parzyste',
        'odd': 'Nieparzyste',
        '1-18': '1-18',
        '19-36': '19-36'
    };
    return labels[bet] || `Numer ${bet}`;
}

socket.on('rouletteTableList', (tables) => {
    const list = document.getElementById('rouletteTablesList');
    if (tables.length === 0) {
        list.innerHTML = '<p class="no-tables">Brak dostępnych stołów. Stwórz własny!</p>';
        return;
    }
    
    list.innerHTML = tables.map(table => `
        <div class="table-card">
            <div class="table-card-info">
                <h4>🎡 Stół ${table.croupierName}</h4>
                <p>Gracze: ${table.playerCount}/8 | Status: ${formatRoulettePhase(table.gamePhase)}</p>
            </div>
            <button class="btn btn-gold join-roulette-table-btn" data-id="${table.id}" ${table.playerCount >= 8 ? 'disabled' : ''}>
                ${table.playerCount >= 8 ? 'Pełny' : 'Dołącz'}
            </button>
        </div>
    `).join('');
    
    document.querySelectorAll('.join-roulette-table-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            socket.emit('joinRouletteTable', { 
                tableId: btn.dataset.id, 
                name: playerData.nickname
            });
        });
    });
});

socket.on('rouletteJoinedTable', (data) => {
    currentTableId = data.tableId;
    currentRole = data.role;
    
    showScreen('rouletteGame');
    
    document.getElementById('rouletteTableIdDisplay').textContent = `Stół: ${data.tableId.slice(-6)}`;
    document.getElementById('rouletteRoleDisplay').textContent = `Rola: ${data.role === 'croupier' ? '🎩 Krupier' : '🎮 Gracz'}`;
    
    if (data.role === 'croupier') {
        document.getElementById('rouletteCroupierControls').classList.remove('hidden');
    } else {
        document.getElementById('rouletteCroupierControls').classList.add('hidden');
    }
    
    updateRouletteState(data.state);
});

socket.on('rouletteTableUpdate', (state) => {
    updateRouletteState(state);
});

socket.on('rouletteMessage', (data) => {
    document.getElementById('rouletteGameMessage').textContent = data.text;
});

socket.on('rouletteSpin', (data) => {
    const wheel = document.getElementById('rouletteWheel');
    wheel.classList.add('spinning');
    wheel.style.transform = `rotate(${data.rotation}deg)`;
    
    setTimeout(() => {
        document.getElementById('winningNumber').textContent = data.result;
        wheel.classList.remove('spinning');
    }, 4000);
});

socket.on('rouletteResults', (results) => {
    const resultNum = document.getElementById('resultNumber');
    resultNum.textContent = results.winningNumber;
    resultNum.className = results.winningNumber === 0 ? 'zero-num' : 
        (isRedNumber(results.winningNumber) ? '' : 'black-num');
    
    document.getElementById('rouletteResultsContent').innerHTML = results.players.map(p => `
        <div class="result-item ${p.won ? 'win' : 'lose'}">
            <span>${p.name}</span>
            <span>${p.won ? `✅ WYGRANA! ${p.multiplier}x` : '❌ Przegrana'}</span>
        </div>
        ${p.hits && p.hits.length > 0 ? `<div class="hits-detail">Trafione: ${p.hits.join(', ')}</div>` : ''}
    `).join('');
    
    document.getElementById('rouletteResultsModal').classList.remove('hidden');
    
    // Reset bets
    rouletteBets = [];
    updateRouletteBetsDisplay();
    document.querySelectorAll('.bet-cell').forEach(c => c.classList.remove('selected'));
});

socket.on('rouletteTableClosed', (data) => {
    alert(data.message);
    showScreen('rouletteLobby');
    socket.emit('getRouletteTables');
});

socket.on('rouletteTablesUpdated', () => {
    if (currentGame === 'roulette' && !currentTableId) {
        socket.emit('getRouletteTables');
    }
});

function updateRouletteState(state) {
    document.getElementById('rouletteGamePhase').textContent = formatRoulettePhase(state.gamePhase);
    document.getElementById('winningNumber').textContent = state.lastResult !== null ? state.lastResult : '-';
    
    if (currentRole === 'croupier') {
        document.getElementById('rouletteSpinBtn').classList.toggle('hidden', state.gamePhase !== 'betting');
        document.getElementById('rouletteNewRoundBtn').classList.toggle('hidden', state.gamePhase !== 'finished');
    }
    
    // Update players display
    let html = '';
    state.players.forEach(p => {
        const isMe = p.id === myPlayerId;
        html += `
            <div class="roulette-player ${isMe ? 'current-player' : ''} ${p.ready ? 'ready' : ''}">
                <div class="player-name">${isMe ? '👤 ' : ''}${p.name}</div>
                <div class="player-status">${p.ready ? '✅ Gotowy' : '⏳ Wybiera'}</div>
                ${p.bets && p.bets.length > 0 ? `<div class="player-bets">${p.bets.length} typów</div>` : ''}
            </div>
        `;
    });
    document.getElementById('roulettePlayersArea').innerHTML = html;
}

function isRedNumber(num) {
    const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
    return redNumbers.includes(num);
}

// ==================== HELPER FUNCTIONS ====================

let cardDealIndex = 0;

function createCardHTML(card, small = false, animate = false) {
    if (!card || card.value === '?') {
        const animClass = animate ? ' dealing' : '';
        const delay = animate ? ` style="animation-delay: ${cardDealIndex++ * 0.15}s"` : '';
        return `<div class="card hidden-card${animClass}"${delay}>?</div>`;
    }
    
    const isRed = card.suit === '♥' || card.suit === '♦';
    const colorClass = isRed ? 'red' : 'black';
    const animClass = animate ? ' dealing' : '';
    const delay = animate ? ` style="animation-delay: ${cardDealIndex++ * 0.15}s"` : '';
    
    return `
        <div class="card ${colorClass}${animClass}"${delay}>
            <span class="value">${card.value}</span>
            <span class="suit">${card.suit}</span>
        </div>
    `;
}

function formatPhase(phase) {
    const phases = {
        'waiting': '⏳ Oczekiwanie',
        'playing': '🎮 Gra w toku',
        'croupierTurn': '🎩 Tura Krupiera',
        'finished': '🏆 Zakończone'
    };
    return phases[phase] || phase;
}

function formatPokerPhase(phase) {
    const phases = {
        'waiting': '⏳ Oczekiwanie',
        'preflop': '🃏 Pre-Flop',
        'flop': '🃏 Flop',
        'turn': '🃏 Turn',
        'river': '🃏 River',
        'showdown': '🏆 Showdown',
        'finished': '🏆 Zakończone'
    };
    return phases[phase] || phase;
}

function formatRoulettePhase(phase) {
    const phases = {
        'waiting': '⏳ Oczekiwanie',
        'betting': '🎯 Wybieranie typów',
        'spinning': '🎡 Kręcenie...',
        'finished': '🏆 Zakończone'
    };
    return phases[phase] || phase;
}

function formatResult(result) {
    const results = {
        'win': '✅ WYGRANA',
        'lose': '❌ PRZEGRANA',
        'push': '🤝 REMIS',
        'blackjack': '🎰 BLACKJACK!'
    };
    return results[result] || result;
}

// Error handling
socket.on('error', (data) => {
    alert('Błąd: ' + data.message);
});
