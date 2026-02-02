// Connect to Socket.io server
const socket = io();

// DOM Elements
const lobbyScreen = document.getElementById('lobby');
const gameScreen = document.getElementById('game');
const playerNameInput = document.getElementById('playerName');
const createTableBtn = document.getElementById('createTableBtn');
const refreshTablesBtn = document.getElementById('refreshTablesBtn');
const tablesList = document.getElementById('tablesList');
const leaveTableBtn = document.getElementById('leaveTableBtn');

// Game Elements
const tableIdDisplay = document.getElementById('tableIdDisplay');
const roleDisplay = document.getElementById('roleDisplay');
const croupierNameDisplay = document.getElementById('croupierName');
const dealerCardsEl = document.getElementById('dealerCards');
const dealerValueEl = document.getElementById('dealerValue');
const gamePhaseEl = document.getElementById('gamePhase');
const gameMessageEl = document.getElementById('gameMessage');
const playersAreaEl = document.getElementById('playersArea');

// Controls
const croupierControls = document.getElementById('croupierControls');
const playerControls = document.getElementById('playerControls');
const bettingControls = document.getElementById('bettingControls');
const playingControls = document.getElementById('playingControls');

// Croupier Buttons
const startBettingBtn = document.getElementById('startBettingBtn');
const dealCardsBtn = document.getElementById('dealCardsBtn');
const croupierPlayBtn = document.getElementById('croupierPlayBtn');
const newRoundBtn = document.getElementById('newRoundBtn');

// Player Buttons
const chipBtns = document.querySelectorAll('.chip-btn');
const placeBetBtn = document.getElementById('placeBetBtn');
const hitBtn = document.getElementById('hitBtn');
const standBtn = document.getElementById('standBtn');
const doubleBtn = document.getElementById('doubleBtn');

// Modal
const resultsModal = document.getElementById('resultsModal');
const resultsContent = document.getElementById('resultsContent');
const closeResultsBtn = document.getElementById('closeResultsBtn');

// State
let currentTableId = null;
let currentRole = null;
let currentBet = 0;
let myPlayerId = null;

// Initialize
socket.on('connect', () => {
    myPlayerId = socket.id;
    socket.emit('getTables');
});

// Lobby Event Listeners
createTableBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim() || 'Croupier';
    socket.emit('createTable', { name });
});

refreshTablesBtn.addEventListener('click', () => {
    socket.emit('getTables');
});

leaveTableBtn.addEventListener('click', () => {
    location.reload();
});

// Chip buttons
chipBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        currentBet += parseInt(btn.dataset.value);
        document.getElementById('currentBetAmount').textContent = currentBet;
    });
});

placeBetBtn.addEventListener('click', () => {
    if (currentBet > 0) {
        socket.emit('placeBet', { amount: currentBet });
    }
});

// Croupier Controls
startBettingBtn.addEventListener('click', () => {
    socket.emit('startBetting');
});

dealCardsBtn.addEventListener('click', () => {
    socket.emit('dealCards');
});

croupierPlayBtn.addEventListener('click', () => {
    socket.emit('croupierPlay');
});

newRoundBtn.addEventListener('click', () => {
    socket.emit('startBetting');
});

// Player Controls
hitBtn.addEventListener('click', () => {
    socket.emit('hit');
});

standBtn.addEventListener('click', () => {
    socket.emit('stand');
});

doubleBtn.addEventListener('click', () => {
    socket.emit('doubleDown');
});

closeResultsBtn.addEventListener('click', () => {
    resultsModal.classList.add('hidden');
});

// Socket Events
socket.on('tableList', (tables) => {
    if (tables.length === 0) {
        tablesList.innerHTML = '<p class="no-tables">No tables available. Create one!</p>';
        return;
    }
    
    tablesList.innerHTML = tables.map(table => `
        <div class="table-card">
            <div class="table-card-info">
                <h4>🎰 ${table.croupierName}'s Table</h4>
                <p>Players: ${table.playerCount}/4 | Status: ${formatPhase(table.gamePhase)}</p>
            </div>
            <button class="btn btn-gold join-table-btn" data-id="${table.id}" ${table.playerCount >= 4 ? 'disabled' : ''}>
                ${table.playerCount >= 4 ? 'Full' : 'Join'}
            </button>
        </div>
    `).join('');
    
    // Add click handlers for join buttons
    document.querySelectorAll('.join-table-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const name = playerNameInput.value.trim() || 'Player';
            socket.emit('joinTable', { tableId: btn.dataset.id, name });
        });
    });
});

socket.on('tablesUpdated', () => {
    if (!currentTableId) {
        socket.emit('getTables');
    }
});

socket.on('joinedTable', (data) => {
    currentTableId = data.tableId;
    currentRole = data.role;
    
    lobbyScreen.classList.remove('active');
    gameScreen.classList.add('active');
    
    tableIdDisplay.textContent = `Table: ${data.tableId.slice(-6)}`;
    roleDisplay.textContent = `Role: ${data.role === 'croupier' ? '🎩 Croupier' : '🎮 Player'}`;
    
    if (data.role === 'croupier') {
        croupierControls.classList.remove('hidden');
        playerControls.classList.add('hidden');
    } else {
        croupierControls.classList.add('hidden');
        playerControls.classList.remove('hidden');
    }
    
    updateGameState(data.state);
});

socket.on('tableUpdate', (state) => {
    updateGameState(state);
});

socket.on('message', (data) => {
    gameMessageEl.textContent = data.text;
});

socket.on('roundResults', (results) => {
    resultsContent.innerHTML = `
        <p style="margin-bottom: 20px; font-size: 1.2rem;">
            Dealer: ${results.dealerValue} ${results.dealerBust ? '(BUST!)' : ''}
        </p>
        ${results.players.map(p => `
            <div class="result-item ${p.result}">
                <span>${p.name}</span>
                <span class="result-text">${formatResult(p.result)} (${p.chips} chips)</span>
            </div>
        `).join('')}
    `;
    resultsModal.classList.remove('hidden');
});

socket.on('tableClosed', (data) => {
    alert(data.message);
    location.reload();
});

socket.on('error', (data) => {
    gameMessageEl.textContent = '❌ ' + data.message;
    setTimeout(() => {
        gameMessageEl.textContent = '';
    }, 3000);
});

// Update Game State
function updateGameState(state) {
    // Update croupier name
    croupierNameDisplay.textContent = state.croupier?.name || '---';
    
    // Update dealer cards
    dealerCardsEl.innerHTML = state.dealerHand.map(card => createCardHTML(card)).join('');
    dealerValueEl.textContent = state.dealerHandValue;
    
    // Update game phase
    gamePhaseEl.textContent = formatPhase(state.gamePhase);
    
    // Update players
    updatePlayersArea(state);
    
    // Update controls based on phase
    updateControls(state);
}

function updatePlayersArea(state) {
    const maxSlots = 4;
    let html = '';
    
    // Render existing players
    state.players.forEach((player, index) => {
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
                <div class="player-bet">Bet: $${player.bet}</div>
                <div class="player-cards">
                    ${player.hand.map(card => createCardHTML(card, true)).join('')}
                </div>
                <div class="player-value">Value: ${player.handValue}</div>
                ${player.status !== 'waiting' && player.status !== 'betting' && player.status !== 'ready' && player.status !== 'playing' 
                    ? `<div class="player-status ${player.status}">${player.status.toUpperCase()}</div>` 
                    : ''}
            </div>
        `;
        
        // Update my chips display if I'm a player
        if (isMe) {
            document.getElementById('myChips').textContent = player.chips;
        }
    });
    
    // Render empty slots
    for (let i = state.players.length; i < maxSlots; i++) {
        html += `
            <div class="empty-slot">
                <span>Empty Seat ${i + 1}</span>
            </div>
        `;
    }
    
    playersAreaEl.innerHTML = html;
}

function updateControls(state) {
    if (currentRole === 'croupier') {
        // Croupier controls
        startBettingBtn.classList.toggle('hidden', state.gamePhase !== 'waiting' && state.gamePhase !== 'finished');
        dealCardsBtn.classList.toggle('hidden', state.gamePhase !== 'betting');
        croupierPlayBtn.classList.toggle('hidden', state.gamePhase !== 'croupierTurn');
        newRoundBtn.classList.toggle('hidden', state.gamePhase !== 'finished');
    } else {
        // Player controls
        const myPlayer = state.players.find(p => p.id === myPlayerId);
        
        if (state.gamePhase === 'betting' && myPlayer?.status === 'betting') {
            bettingControls.classList.remove('hidden');
            playingControls.classList.add('hidden');
            currentBet = 0;
            document.getElementById('currentBetAmount').textContent = '0';
        } else if (state.gamePhase === 'betting' && myPlayer?.status === 'ready') {
            bettingControls.classList.add('hidden');
            playingControls.classList.add('hidden');
        } else if (state.gamePhase === 'playing' && myPlayer?.isCurrentTurn) {
            bettingControls.classList.add('hidden');
            playingControls.classList.remove('hidden');
            doubleBtn.disabled = myPlayer.hand.length !== 2 || myPlayer.chips < myPlayer.bet;
        } else {
            bettingControls.classList.add('hidden');
            playingControls.classList.add('hidden');
        }
    }
}

function createCardHTML(card, small = false) {
    if (card.value === '?') {
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
        'waiting': '⏳ Waiting for Players',
        'betting': '💰 Place Your Bets',
        'dealing': '🃏 Dealing Cards',
        'playing': '🎮 Players Turn',
        'croupierTurn': "🎩 Croupier's Turn",
        'finished': '🏆 Round Complete'
    };
    return phases[phase] || phase;
}

function formatResult(result) {
    const results = {
        'win': '✅ WIN',
        'lose': '❌ LOSE',
        'push': '🤝 PUSH',
        'blackjack': '🎰 BLACKJACK!'
    };
    return results[result] || result;
}
