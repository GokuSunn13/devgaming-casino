// Connect to Socket.io server
const socket = io();

// Player State
let playerData = {
    nickname: '',
    balance: 0
};

let currentGame = null;
let currentTableId = null;
let currentRole = null;
let myPlayerId = null;

// Blackjack state
let bjCurrentBet = 0;

// Roulette state
let rouletteBets = [];
let selectedChipValue = 10;

// Initialize
socket.on('connect', () => {
    myPlayerId = socket.id;
});

// ==================== MAIN MENU ====================

const mainMenu = document.getElementById('mainMenu');
const gameSelection = document.getElementById('gameSelection');
const enterCasinoBtn = document.getElementById('enterCasinoBtn');
const exitCasinoBtn = document.getElementById('exitCasinoBtn');
const playerNicknameInput = document.getElementById('playerNickname');
const entryStakeInput = document.getElementById('entryStake');

// Stake buttons
document.querySelectorAll('.stake-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        entryStakeInput.value = btn.dataset.value;
    });
});

enterCasinoBtn.addEventListener('click', () => {
    const nickname = playerNicknameInput.value.trim();
    const stake = parseInt(entryStakeInput.value);
    
    if (!nickname) {
        alert('Wprowadź nick postaci IC!');
        return;
    }
    
    if (!stake || stake < 100) {
        alert('Minimalna stawka wejściowa to $100!');
        return;
    }
    
    playerData.nickname = nickname;
    playerData.balance = stake;
    
    updateBalanceDisplays();
    showScreen('gameSelection');
});

exitCasinoBtn.addEventListener('click', () => {
    if (confirm('Czy na pewno chcesz opuścić kasyno?')) {
        location.reload();
    }
});

function updateBalanceDisplays() {
    document.getElementById('displayNickname').textContent = playerData.nickname;
    document.getElementById('displayBalance').textContent = playerData.balance.toLocaleString();
    
    // Update all game-specific displays
    const displays = ['bjDisplayNick', 'pokerDisplayNick', 'rouletteDisplayNick'];
    displays.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = playerData.nickname;
    });
    
    const balanceDisplays = ['bjDisplayBalance', 'pokerDisplayBalance', 'rouletteDisplayBalance', 'bjMyChips'];
    balanceDisplays.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = playerData.balance.toLocaleString();
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
    updateBalanceDisplays();
}

// ==================== BLACKJACK ====================

const blackjackLobby = document.getElementById('blackjackLobby');
const blackjackGame = document.getElementById('blackjackGame');
const blackjackTablesList = document.getElementById('blackjackTablesList');

document.getElementById('createBlackjackTableBtn').addEventListener('click', () => {
    socket.emit('createBlackjackTable', { name: playerData.nickname, chips: playerData.balance });
});

document.getElementById('refreshBlackjackTablesBtn').addEventListener('click', () => {
    socket.emit('getBlackjackTables');
});

document.getElementById('leaveBlackjackTableBtn').addEventListener('click', () => {
    location.reload();
});

// Blackjack chip buttons
document.querySelectorAll('.bj-chip').forEach(btn => {
    btn.addEventListener('click', () => {
        bjCurrentBet += parseInt(btn.dataset.value);
        document.getElementById('bjCurrentBetAmount').textContent = bjCurrentBet;
    });
});

document.getElementById('bjPlaceBetBtn').addEventListener('click', () => {
    if (bjCurrentBet > 0 && bjCurrentBet <= playerData.balance) {
        socket.emit('bjPlaceBet', { amount: bjCurrentBet });
    }
});

// Croupier controls
document.getElementById('bjStartBettingBtn').addEventListener('click', () => socket.emit('bjStartBetting'));
document.getElementById('bjDealCardsBtn').addEventListener('click', () => socket.emit('bjDealCards'));
document.getElementById('bjCroupierPlayBtn').addEventListener('click', () => socket.emit('bjCroupierPlay'));
document.getElementById('bjNewRoundBtn').addEventListener('click', () => socket.emit('bjStartBetting'));

// Player controls
document.getElementById('bjHitBtn').addEventListener('click', () => socket.emit('bjHit'));
document.getElementById('bjStandBtn').addEventListener('click', () => socket.emit('bjStand'));
document.getElementById('bjDoubleBtn').addEventListener('click', () => socket.emit('bjDoubleDown'));

document.getElementById('bjCloseResultsBtn').addEventListener('click', () => {
    document.getElementById('bjResultsModal').classList.add('hidden');
});

// Blackjack Socket Events
socket.on('blackjackTableList', (tables) => {
    if (tables.length === 0) {
        blackjackTablesList.innerHTML = '<p class="no-tables">Brak dostępnych stołów. Stwórz własny!</p>';
        return;
    }
    
    blackjackTablesList.innerHTML = tables.map(table => `
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
                name: playerData.nickname,
                chips: playerData.balance
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
                <span class="result-text">${formatResult(p.result)} (${p.chips} żetonów)</span>
            </div>
        `).join('')}
    `;
    document.getElementById('bjResultsModal').classList.remove('hidden');
    
    // Update balance
    const myResult = results.players.find(p => p.id === myPlayerId);
    if (myResult) {
        playerData.balance = myResult.chips;
        updateBalanceDisplays();
    }
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
    document.getElementById('bjDealerCards').innerHTML = state.dealerHand.map(card => createCardHTML(card)).join('');
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
        
        let slotClass = 'player-slot';
        if (isCurrentTurn) slotClass += ' active-turn';
        if (isMe) slotClass += ' current-player';
        if (player.status === 'bust') slotClass += ' bust';
        if (player.status === 'blackjack') slotClass += ' blackjack';
        
        html += `
            <div class="${slotClass}">
                <div class="player-info">
                    <span class="player-name">${isMe ? '👤 ' : ''}${player.name}</span>
                    <span class="player-chips">💰 ${player.chips}</span>
                </div>
                <div class="player-bet">Zakład: $${player.bet}</div>
                <div class="player-cards">
                    ${player.hand.map(card => createCardHTML(card, true)).join('')}
                </div>
                <div class="player-value">Wartość: ${player.handValue}</div>
                ${player.status !== 'waiting' && player.status !== 'betting' && player.status !== 'ready' && player.status !== 'playing' 
                    ? `<div class="player-status ${player.status}">${player.status.toUpperCase()}</div>` 
                    : ''}
            </div>
        `;
        
        if (isMe) {
            playerData.balance = player.chips;
            updateBalanceDisplays();
        }
    });
    
    for (let i = state.players.length; i < maxSlots; i++) {
        html += `<div class="empty-slot"><span>Puste miejsce ${i + 1}</span></div>`;
    }
    
    document.getElementById('bjPlayersArea').innerHTML = html;
}

function updateBJControls(state) {
    if (currentRole === 'croupier') {
        document.getElementById('bjStartBettingBtn').classList.toggle('hidden', state.gamePhase !== 'waiting' && state.gamePhase !== 'finished');
        document.getElementById('bjDealCardsBtn').classList.toggle('hidden', state.gamePhase !== 'betting');
        document.getElementById('bjCroupierPlayBtn').classList.toggle('hidden', state.gamePhase !== 'croupierTurn');
        document.getElementById('bjNewRoundBtn').classList.toggle('hidden', state.gamePhase !== 'finished');
    } else {
        const myPlayer = state.players.find(p => p.id === myPlayerId);
        
        if (state.gamePhase === 'betting' && myPlayer?.status === 'betting') {
            document.getElementById('bjBettingControls').classList.remove('hidden');
            document.getElementById('bjPlayingControls').classList.add('hidden');
            bjCurrentBet = 0;
            document.getElementById('bjCurrentBetAmount').textContent = '0';
        } else if (state.gamePhase === 'playing' && myPlayer?.isCurrentTurn) {
            document.getElementById('bjBettingControls').classList.add('hidden');
            document.getElementById('bjPlayingControls').classList.remove('hidden');
            document.getElementById('bjDoubleBtn').disabled = myPlayer.hand.length !== 2 || myPlayer.chips < myPlayer.bet;
        } else {
            document.getElementById('bjBettingControls').classList.add('hidden');
            document.getElementById('bjPlayingControls').classList.add('hidden');
        }
    }
}

// ==================== POKER ====================

document.getElementById('createPokerTableBtn').addEventListener('click', () => {
    socket.emit('createPokerTable', { name: playerData.nickname, chips: playerData.balance });
});

document.getElementById('refreshPokerTablesBtn').addEventListener('click', () => {
    socket.emit('getPokerTables');
});

document.getElementById('leavePokerTableBtn').addEventListener('click', () => {
    location.reload();
});

// Poker controls
document.getElementById('pokerStartGameBtn').addEventListener('click', () => socket.emit('pokerStartGame'));
document.getElementById('pokerNextRoundBtn').addEventListener('click', () => socket.emit('pokerNextRound'));
document.getElementById('pokerFoldBtn').addEventListener('click', () => socket.emit('pokerFold'));
document.getElementById('pokerCheckBtn').addEventListener('click', () => socket.emit('pokerCheck'));
document.getElementById('pokerCallBtn').addEventListener('click', () => socket.emit('pokerCall'));
document.getElementById('pokerRaiseBtn').addEventListener('click', () => {
    const amount = parseInt(document.getElementById('raiseAmount').value);
    socket.emit('pokerRaise', { amount });
});
document.getElementById('pokerAllInBtn').addEventListener('click', () => socket.emit('pokerAllIn'));

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
                name: playerData.nickname,
                chips: playerData.balance
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
    document.getElementById('currentPot').textContent = state.pot;
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
        if (player.isDealer) slotClass += ' dealer-btn';
        
        html += `
            <div class="${slotClass}">
                <div class="player-name">${isMe ? '👤 ' : ''}${player.name}</div>
                <div class="player-chips">💰 ${player.chips}</div>
                <div class="player-bet">Zakład: $${player.currentBet}</div>
                <div class="player-cards">
                    ${(isMe ? player.hand : player.hand.map(() => ({value: '?', suit: '?'}))).map(card => createCardHTML(card, true)).join('')}
                </div>
                ${player.folded ? '<div class="player-status">FOLD</div>' : ''}
            </div>
        `;
        
        if (isMe) {
            playerData.balance = player.chips;
            updateBalanceDisplays();
        }
    });
    
    document.getElementById('pokerPlayersArea').innerHTML = html;
}

function updatePokerControls(state) {
    if (currentRole === 'croupier') {
        document.getElementById('pokerStartGameBtn').classList.toggle('hidden', state.gamePhase !== 'waiting');
        document.getElementById('pokerNextRoundBtn').classList.toggle('hidden', state.gamePhase !== 'finished');
    } else {
        const myPlayer = state.players.find(p => p.id === myPlayerId);
        const controls = document.getElementById('pokerPlayerControls');
        
        if (myPlayer?.isCurrentTurn && state.gamePhase === 'betting') {
            controls.classList.remove('hidden');
            document.getElementById('callAmount').textContent = state.currentBet - (myPlayer.currentBet || 0);
            document.getElementById('pokerCheckBtn').disabled = state.currentBet > myPlayer.currentBet;
        } else {
            controls.classList.add('hidden');
        }
    }
}

// ==================== ROULETTE ====================

document.getElementById('createRouletteTableBtn').addEventListener('click', () => {
    socket.emit('createRouletteTable', { name: playerData.nickname, chips: playerData.balance });
});

document.getElementById('refreshRouletteTablesBtn').addEventListener('click', () => {
    socket.emit('getRouletteTables');
});

document.getElementById('leaveRouletteTableBtn').addEventListener('click', () => {
    location.reload();
});

// Roulette chip selection
document.querySelectorAll('.roulette-chip').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.roulette-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedChipValue = parseInt(btn.dataset.value);
    });
});

// Betting on roulette
document.querySelectorAll('.bet-cell').forEach(cell => {
    cell.addEventListener('click', () => {
        const betType = cell.dataset.bet;
        addRouletteBet(betType, selectedChipValue);
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
    }
});

document.getElementById('rouletteSpinBtn').addEventListener('click', () => socket.emit('rouletteSpin'));
document.getElementById('rouletteNewRoundBtn').addEventListener('click', () => socket.emit('rouletteNewRound'));
document.getElementById('rouletteCloseResultsBtn').addEventListener('click', () => {
    document.getElementById('rouletteResultsModal').classList.add('hidden');
});

function addRouletteBet(betType, amount) {
    const totalBet = rouletteBets.reduce((sum, b) => sum + b.amount, 0);
    if (totalBet + amount > playerData.balance) {
        alert('Niewystarczające środki!');
        return;
    }
    
    const existingBet = rouletteBets.find(b => b.type === betType);
    if (existingBet) {
        existingBet.amount += amount;
    } else {
        rouletteBets.push({ type: betType, amount });
    }
    
    document.querySelector(`[data-bet="${betType}"]`)?.classList.add('selected');
    updateRouletteBetsDisplay();
}

function updateRouletteBetsDisplay() {
    const container = document.getElementById('myRouletteBets');
    const total = rouletteBets.reduce((sum, b) => sum + b.amount, 0);
    
    container.innerHTML = rouletteBets.map(b => `
        <div>${b.type}: $${b.amount}</div>
    `).join('') || '<p style="color: rgba(255,255,255,0.5)">Brak zakładów</p>';
    
    document.getElementById('totalRouletteBet').textContent = total;
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
                name: playerData.nickname,
                chips: playerData.balance
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
    }, 4000);
});

socket.on('rouletteResults', (results) => {
    const resultNum = document.getElementById('resultNumber');
    resultNum.textContent = results.winningNumber;
    resultNum.className = results.winningNumber === 0 ? 'zero-num' : 
        (isRedNumber(results.winningNumber) ? '' : 'black-num');
    
    document.getElementById('rouletteResultsContent').innerHTML = results.players.map(p => `
        <div class="result-item ${p.won > 0 ? 'win' : 'lose'}">
            <span>${p.name}</span>
            <span>${p.won > 0 ? '+' : ''}$${p.won} (${p.chips} żetonów)</span>
        </div>
    `).join('');
    
    document.getElementById('rouletteResultsModal').classList.remove('hidden');
    
    // Update balance
    const myResult = results.players.find(p => p.id === myPlayerId);
    if (myResult) {
        playerData.balance = myResult.chips;
        updateBalanceDisplays();
    }
    
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
    document.getElementById('winningNumber').textContent = state.lastResult || '-';
    
    if (currentRole === 'croupier') {
        document.getElementById('rouletteSpinBtn').classList.toggle('hidden', state.gamePhase !== 'betting');
        document.getElementById('rouletteNewRoundBtn').classList.toggle('hidden', state.gamePhase !== 'finished');
    }
    
    // Update players display
    let html = '';
    state.players.forEach(p => {
        const isMe = p.id === myPlayerId;
        html += `
            <div class="poker-player ${isMe ? 'current-player' : ''}">
                <div class="player-name">${isMe ? '👤 ' : ''}${p.name}</div>
                <div class="player-chips">💰 ${p.chips}</div>
                <div class="player-bet">Zakład: $${p.totalBet || 0}</div>
            </div>
        `;
        
        if (isMe) {
            playerData.balance = p.chips;
            updateBalanceDisplays();
        }
    });
    document.getElementById('roulettePlayersArea').innerHTML = html;
}

function isRedNumber(num) {
    const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
    return redNumbers.includes(num);
}

// ==================== HELPER FUNCTIONS ====================

function createCardHTML(card, small = false) {
    if (!card || card.value === '?') {
        return '<div class="card hidden-card">?</div>';
    }
    
    const isRed = card.suit === '♥' || card.suit === '♦';
    const colorClass = isRed ? 'red' : 'black';
    
    return `
        <div class="card ${colorClass}">
            <span class="value">${card.value}</span>
            <span class="suit">${card.suit}</span>
        </div>
    `;
}

function formatPhase(phase) {
    const phases = {
        'waiting': '⏳ Oczekiwanie',
        'betting': '💰 Stawianie Zakładów',
        'dealing': '🃏 Rozdawanie',
        'playing': '🎮 Tura Graczy',
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
        'betting': '💰 Stawianie Zakładów',
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
