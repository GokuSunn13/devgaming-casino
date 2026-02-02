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
document.getElementById('bjRevealCardBtn').addEventListener('click', () => socket.emit('bjRevealNextCard'));
document.getElementById('bjNewRoundBtn').addEventListener('click', () => {
    previousDealerCardCount = 0;
    previousPlayerCardCounts = {};
    socket.emit('bjNewRound');
});

// Player controls
document.getElementById('bjPlaceBetBtn').addEventListener('click', () => {
    const amount = parseInt(document.getElementById('bjBetInput').value) || 0;
    socket.emit('bjPlaceBet', { amount });
});
document.getElementById('bjHitBtn').addEventListener('click', () => socket.emit('bjHit'));
document.getElementById('bjStandBtn').addEventListener('click', () => socket.emit('bjStand'));

// Croupier chips assignment
document.getElementById('bjAssignChipsBtn').addEventListener('click', () => {
    const playerId = document.getElementById('bjAssignChipsPlayer').value;
    const amount = parseInt(document.getElementById('bjAssignChipsAmount').value) || 0;
    socket.emit('bjAssignChips', { playerId, amount });
});

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
    let listHtml = '';
    let myCardsHtml = '';
    
    state.players.forEach((player) => {
        const isMe = player.id === myPlayerId;
        const isCurrentTurn = player.isCurrentTurn;
        
        let itemClass = 'player-list-item';
        if (isCurrentTurn) itemClass += ' active-turn';
        if (isMe) itemClass += ' current-player';
        
        listHtml += `
            <div class="${itemClass}">
                <div class="player-name">${isMe ? '👤 ' : ''}${player.name}</div>
                <div class="player-chips">💰 ${player.chips || 0}</div>
                <div class="player-status-text">${getStatusBadge(player.status)}${player.currentBet ? ` (${player.currentBet})` : ''}</div>
                <div class="player-hand-value">Wartość: ${player.handValue}</div>
            </div>
        `;
        
        if (isMe) {
            document.getElementById('bjMyChips').textContent = player.chips || 0;
            
            if (player.hand.length > 0) {
                cardDealIndex = 0;
                const prevCount = previousPlayerCardCounts[player.id] || 0;
                const cardsHtml = player.hand.map((card, i) => 
                    createCardHTML(card, false, i >= prevCount)
                ).join('');
                previousPlayerCardCounts[player.id] = player.hand.length;
                
                myCardsHtml = `
                    <h4>🃏 Twoje Karty</h4>
                    <div class="my-cards">${cardsHtml}</div>
                    <div class="my-hand-value">Wartość: ${player.handValue}</div>
                `;
            }
        }
    });
    
    // Krupier widzi karty wszystkich graczy w zielonym polu
    if (currentRole === 'croupier') {
        myCardsHtml = '<h4>🃏 Karty Graczy</h4><div class="all-players-cards">';
        state.players.forEach((player) => {
            if (player.hand && player.hand.length > 0) {
                const cardsHtml = player.hand.map(card => createCardHTML(card, false, false)).join('');
                myCardsHtml += `
                    <div class="player-hand-display">
                        <div class="player-hand-name">${player.name} (${player.handValue})</div>
                        <div class="player-hand-cards">${cardsHtml}</div>
                    </div>
                `;
            }
        });
        myCardsHtml += '</div>';
        
        // Update croupier chips select
        const select = document.getElementById('bjAssignChipsPlayer');
        select.innerHTML = state.players.map(p => 
            `<option value="${p.id}">${p.name}</option>`
        ).join('');
    }
    
    document.getElementById('bjPlayersArea').innerHTML = listHtml || '<p class="no-players">Brak graczy</p>';
    document.getElementById('bjMyCardsArea').innerHTML = myCardsHtml;
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
        document.getElementById('bjCroupierChipsControls').classList.remove('hidden');
        const hasReadyPlayers = state.players.some(p => p.status === 'ready');
        const allPlayersFinished = state.players.every(p => 
            p.status === 'stand' || p.status === 'bust' || p.status === 'blackjack'
        );
        
        document.getElementById('bjDealCardsBtn').classList.toggle('hidden', 
            state.gamePhase !== 'waiting' || !hasReadyPlayers);
        document.getElementById('bjCroupierPlayBtn').classList.toggle('hidden', 
            state.gamePhase !== 'playing' || !allPlayersFinished);
        document.getElementById('bjRevealCardBtn').classList.toggle('hidden', 
            state.gamePhase !== 'revealing' || !state.canRevealMore);
        document.getElementById('bjNewRoundBtn').classList.toggle('hidden', 
            state.gamePhase !== 'finished');
    } else {
        document.getElementById('bjCroupierChipsControls').classList.add('hidden');
        const myPlayer = state.players.find(p => p.id === myPlayerId);
        
        if (state.gamePhase === 'waiting' && myPlayer?.status === 'waiting') {
            document.getElementById('bjBettingControls').classList.remove('hidden');
            document.getElementById('bjPlayingControls').classList.add('hidden');
        } else if (state.gamePhase === 'playing' && myPlayer?.isCurrentTurn) {
            document.getElementById('bjBettingControls').classList.add('hidden');
            document.getElementById('bjPlayingControls').classList.remove('hidden');
        } else {
            document.getElementById('bjBettingControls').classList.add('hidden');
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
    // Animowane karty wspólne
    cardDealIndex = 0;
    document.getElementById('communityCards').innerHTML = state.communityCards.map((card, i) => 
        createCardHTML(card, false, true)
    ).join('');
    document.getElementById('pokerGamePhase').textContent = formatPokerPhase(state.gamePhase);
    
    // Wyświetl karty krupiera
    const dealerCardsEl = document.getElementById('pokerDealerCards');
    if (state.dealerHand && state.dealerHand.length > 0) {
        dealerCardsEl.innerHTML = state.dealerHand.map(card => createCardHTML(card, false, false)).join('');
    } else {
        dealerCardsEl.innerHTML = '';
    }
    
    updatePokerPlayersArea(state);
    updatePokerControls(state);
}

function updatePokerPlayersArea(state) {
    let listHtml = '';
    let myCardsHtml = '';
    
    // Update pot display
    document.getElementById('pokerPotDisplay').textContent = state.pot || 0;
    document.getElementById('pokerCurrentBet').textContent = state.currentBetAmount || 0;
    
    state.players.forEach((player) => {
        const isMe = player.id === myPlayerId;
        const isCurrentTurn = player.isCurrentTurn;
        
        let itemClass = 'player-list-item';
        if (isCurrentTurn) itemClass += ' active-turn';
        if (isMe) itemClass += ' current-player';
        if (player.folded) itemClass += ' folded';
        
        listHtml += `
            <div class="${itemClass}">
                <div class="player-name">${isMe ? '👤 ' : ''}${player.name}</div>
                <div class="player-chips">💰 ${player.chips || 0}</div>
                <div class="player-status-text">${player.folded ? '❌ FOLD' : (isCurrentTurn ? '🎮 Gra' : '⏳ Czeka')}${player.currentBet ? ` (Stawka: ${player.currentBet})` : ''}</div>
            </div>
        `;
        
        // Zawsze pokaż karty gracza jeśli jest to on i ma karty
        if (isMe && player.hand && player.hand.length > 0) {
            cardDealIndex = 0;
            const cardsHtml = player.hand.map((card, i) => createCardHTML(card, false, true)).join('');
            myCardsHtml = `
                <h4>🃏 Twoje Karty</h4>
                <div class="my-cards">${cardsHtml}</div>
                <div class="my-chips-info">💰 Twoje żetony: ${player.chips || 0}</div>
            `;
        }
    });
    
    // Krupier widzi karty wszystkich graczy w zielonym polu
    if (currentRole === 'croupier') {
        myCardsHtml = '<h4>🃏 Karty Graczy</h4><div class="all-players-cards">';
        state.players.forEach((player) => {
            if (player.hand && player.hand.length > 0) {
                const cardsHtml = player.hand.map(card => createCardHTML(card, false, false)).join('');
                myCardsHtml += `
                    <div class="player-hand-display ${player.folded ? 'folded' : ''}">
                        <div class="player-hand-name">${player.name}${player.folded ? ' (FOLD)' : ''}</div>
                        <div class="player-hand-cards">${cardsHtml}</div>
                    </div>
                `;
            }
        });
        myCardsHtml += '</div>';
        
        // Update croupier chips select - tylko gracze, nie krupier
        const select = document.getElementById('pokerAssignChipsPlayer');
        select.innerHTML = state.players.map(p => 
            `<option value="${p.id}">${p.name}</option>`
        ).join('');
    }
    
    document.getElementById('pokerPlayersArea').innerHTML = listHtml || '<p class="no-players">Brak graczy</p>';
    document.getElementById('pokerMyCardsArea').innerHTML = myCardsHtml;
}

function updatePokerControls(state) {
    const croupierControls = document.getElementById('pokerCroupierControls');
    const playerControls = document.getElementById('pokerPlayerControls');
    const bettingControls = document.getElementById('pokerBettingControls');
    
    if (currentRole === 'croupier') {
        croupierControls.classList.remove('hidden');
        document.getElementById('pokerCroupierChipsControls').classList.remove('hidden');
        
        document.getElementById('pokerStartGameBtn').classList.toggle('hidden', state.gamePhase !== 'waiting');
        document.getElementById('pokerNextPhaseBtn').classList.toggle('hidden', 
            !['flop', 'turn', 'river'].includes(state.gamePhase));
        document.getElementById('pokerNextRoundBtn').classList.toggle('hidden', state.gamePhase !== 'finished');
        
        // Krupier NIE obstawia - tylko kontroluje grę
        bettingControls.classList.add('hidden');
        playerControls.classList.add('hidden');
    } else {
        croupierControls.classList.add('hidden');
        document.getElementById('pokerCroupierChipsControls').classList.add('hidden');
        const myPlayer = state.players.find(p => p.id === myPlayerId);
        
        if (myPlayer && !myPlayer.folded && ['flop', 'turn', 'river'].includes(state.gamePhase)) {
            playerControls.classList.remove('hidden');
            bettingControls.classList.remove('hidden');
        } else {
            playerControls.classList.add('hidden');
            bettingControls.classList.add('hidden');
        }
    }
}

// Poker chips assignment
document.getElementById('pokerAssignChipsBtn').addEventListener('click', () => {
    const playerId = document.getElementById('pokerAssignChipsPlayer').value;
    const amount = parseInt(document.getElementById('pokerAssignChipsAmount').value) || 0;
    socket.emit('pokerAssignChips', { playerId, amount });
});

// Poker betting
document.getElementById('pokerPlaceBetBtn').addEventListener('click', () => {
    const amount = parseInt(document.getElementById('pokerBetInput').value) || 0;
    socket.emit('pokerPlaceBet', { amount });
});

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
        const betAmount = parseInt(document.getElementById('betChipsInput').value) || 10;
        socket.emit('rouletteConfirmBets', { bets: rouletteBets, betAmount: betAmount });
    } else {
        alert('Wybierz przynajmniej jeden typ!');
    }
});

document.getElementById('rouletteSpinBtn').addEventListener('click', () => socket.emit('rouletteSpin'));
document.getElementById('rouletteNewRoundBtn').addEventListener('click', () => socket.emit('rouletteNewRound'));
document.getElementById('rouletteCloseResultsBtn').addEventListener('click', () => {
    document.getElementById('rouletteResultsModal').classList.add('hidden');
});

// Assign chips by croupier
document.getElementById('assignChipsBtn')?.addEventListener('click', () => {
    const playerId = document.getElementById('assignChipsPlayer').value;
    const amount = parseInt(document.getElementById('assignChipsAmount').value) || 0;
    if (playerId && amount >= 0) {
        socket.emit('rouletteAssignChips', { playerId, amount });
        document.getElementById('assignChipsAmount').value = '';
    }
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

// Track wheel rotation
let currentWheelRotation = 0;

socket.on('rouletteSpin', (data) => {
    const wheel = document.getElementById('rouletteWheel');
    
    // Europejska kolejność numerów
    const wheelOrder = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
    const segmentAngle = 360 / wheelOrder.length;
    
    // Znajdź indeks wygranego numeru
    const winningIndex = wheelOrder.indexOf(data.result);
    // Oblicz kąt, aby wygrany numer był pod wskaźnikiem (u góry)
    const targetAngle = -(winningIndex * segmentAngle) - segmentAngle / 2;
    
    // Dodaj pełne obroty (5-8 obrotów) do aktualnej pozycji
    const extraSpins = (5 + Math.floor(Math.random() * 3)) * 360;
    currentWheelRotation += extraSpins + targetAngle - (currentWheelRotation % 360);
    
    wheel.style.transition = 'transform 5s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
    wheel.style.transform = `rotate(${currentWheelRotation}deg)`;
    
    setTimeout(() => {
        document.getElementById('winningNumber').textContent = data.result;
        document.getElementById('winningNumber').className = 'winning-number';
        if (data.result === 0) {
            document.getElementById('winningNumber').classList.add('green-win');
        } else if (isRedNumber(data.result)) {
            document.getElementById('winningNumber').classList.add('red-win');
        } else {
            document.getElementById('winningNumber').classList.add('black-win');
        }
    }, 5000);
});

socket.on('rouletteResults', (results) => {
    const resultNum = document.getElementById('resultNumber');
    resultNum.textContent = results.winningNumber;
    resultNum.className = results.winningNumber === 0 ? 'zero-num' : 
        (isRedNumber(results.winningNumber) ? '' : 'black-num');
    
    document.getElementById('rouletteResultsContent').innerHTML = results.players.map(p => `
        <div class="result-item ${p.won ? 'win' : 'lose'}">
            <span>${p.name}</span>
            <span>${p.won ? `✅ WYGRANA! +${p.winnings} żetonów (${p.multiplier}x)` : '❌ Przegrana'}</span>
        </div>
        ${p.hits && p.hits.length > 0 ? `<div class="hits-detail">Trafione: ${p.hits.join(', ')}</div>` : ''}
        <div class="new-balance">Stan konta: ${p.newChips} żetonów</div>
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
        // Przycisk kręcenia widoczny gdy faza betting
        document.getElementById('rouletteSpinBtn').classList.toggle('hidden', state.gamePhase !== 'betting');
        // Przycisk nowej rundy już niepotrzebny - zawsze ukryty
        document.getElementById('rouletteNewRoundBtn').classList.add('hidden');
        document.getElementById('rouletteCroupierChipsControls').classList.remove('hidden');
        
        // Update player select for chip assignment
        const select = document.getElementById('assignChipsPlayer');
        select.innerHTML = state.players.map(p => 
            `<option value="${p.id}">${p.name}</option>`
        ).join('');
    } else {
        document.getElementById('rouletteCroupierChipsControls')?.classList.add('hidden');
    }
    
    // Update my chips display
    const myPlayer = state.players.find(p => p.id === myPlayerId);
    if (myPlayer) {
        document.getElementById('myChipsAmount').textContent = myPlayer.chips || 0;
    }
    
    // Update players display in sidebar
    let listHtml = '';
    state.players.forEach(p => {
        const isMe = p.id === myPlayerId;
        let itemClass = 'player-list-item';
        if (isMe) itemClass += ' current-player';
        if (p.ready) itemClass += ' ready';
        
        listHtml += `
            <div class="${itemClass}">
                <div class="player-name">${isMe ? '👤 ' : ''}${p.name}</div>
                <div class="player-chips">💰 ${p.chips || 0} żetonów</div>
                <div class="player-status-text">${p.ready ? '✅ Gotowy' : '⏳ Wybiera'}</div>
                ${p.bets && p.bets.length > 0 ? `<div class="player-bets-info">${p.bets.length} typów (${p.totalBet || 0} żet.)</div>` : ''}
            </div>
        `;
    });
    document.getElementById('roulettePlayersArea').innerHTML = listHtml || '<p class="no-players">Brak graczy</p>';
}

function isRedNumber(num) {
    const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
    return redNumbers.includes(num);
}

// Inicjalizacja koła ruletki z numerami
function initRouletteWheel() {
    const wheelNumbers = document.getElementById('wheelNumbers');
    if (!wheelNumbers) return;
    
    // Europejska kolejność numerów na kole ruletki
    const wheelOrder = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
    
    const segmentAngle = 360 / wheelOrder.length;
    const radius = 130; // odległość numerów od środka
    let html = '';
    
    wheelOrder.forEach((num, index) => {
        const angle = (index * segmentAngle - 90) * (Math.PI / 180);
        let colorClass = 'black';
        if (num === 0) {
            colorClass = 'green';
        } else if (isRedNumber(num)) {
            colorClass = 'red';
        }
        
        // Pozycja numeru na obwodzie koła
        const rotation = index * segmentAngle;
        
        html += `
            <div class="wheel-number ${colorClass}" style="transform: rotate(${rotation}deg) translateY(-${radius}px);">
                <span style="transform: rotate(180deg);">${num}</span>
            </div>
        `;
    });
    
    wheelNumbers.innerHTML = html;
}

// Wywołaj po załadowaniu strony
document.addEventListener('DOMContentLoaded', initRouletteWheel);

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
        'revealing': '🎴 Odkrywanie kart',
        'croupierTurn': '🎩 Tura Krupiera',
        'finished': '🏆 Zakończone'
    };
    return phases[phase] || phase;
}

function formatPokerPhase(phase) {
    const phases = {
        'waiting': '⏳ Oczekiwanie',
        'flop': '🃏 Flop - Stawianie',
        'turn': '🃏 Turn - Stawianie',
        'river': '🃏 River - Stawianie',
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
