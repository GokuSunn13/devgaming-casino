const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static(path.join(__dirname, 'public')));

// Game tables storage
const blackjackTables = new Map();
const pokerTables = new Map();
const rouletteTables = new Map();

// ==================== UTILITY FUNCTIONS ====================

function generateTableId() {
    return 'table_' + Math.random().toString(36).substring(2, 9);
}

function createDeck() {
    const suits = ['♥', '♦', '♣', '♠'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];
    
    for (const suit of suits) {
        for (const value of values) {
            deck.push({ value, suit });
        }
    }
    
    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    
    return deck;
}

function getCardValue(card) {
    if (card.value === 'A') return 11;
    if (['K', 'Q', 'J'].includes(card.value)) return 10;
    return parseInt(card.value);
}

function calculateHandValue(hand) {
    let value = 0;
    let aces = 0;
    
    for (const card of hand) {
        value += getCardValue(card);
        if (card.value === 'A') aces++;
    }
    
    while (value > 21 && aces > 0) {
        value -= 10;
        aces--;
    }
    
    return value;
}

// ==================== BLACKJACK ====================

function createBlackjackTable(croupierId, croupierName) {
    const tableId = generateTableId();
    const table = {
        id: tableId,
        croupier: { id: croupierId, name: croupierName },
        players: [],
        deck: createDeck(),
        dealerHand: [],
        gamePhase: 'waiting',
        currentPlayerIndex: -1
    };
    blackjackTables.set(tableId, table);
    return table;
}

function getBJTableState(table) {
    // Determine how many dealer cards to show
    let visibleDealerCards = [];
    if (table.gamePhase === 'croupierTurn' || table.gamePhase === 'finished') {
        visibleDealerCards = table.dealerHand;
    } else if (table.gamePhase === 'revealing') {
        // Show cards up to revealIndex
        const revealIndex = table.dealerRevealIndex || 0;
        visibleDealerCards = table.dealerHand.slice(0, revealIndex);
        // Add hidden cards for remaining
        for (let i = revealIndex; i < table.dealerHand.length; i++) {
            visibleDealerCards.push({ value: '?', suit: '?' });
        }
    } else {
        // Normal gameplay - show first card, hide second
        visibleDealerCards = table.dealerHand.slice(0, 1).concat(table.dealerHand.length > 1 ? [{ value: '?', suit: '?' }] : []);
    }
    
    return {
        id: table.id,
        croupier: table.croupier,
        players: table.players.map(p => ({
            id: p.id,
            name: p.name,
            hand: p.hand,
            handValue: calculateHandValue(p.hand),
            status: p.status,
            chips: p.chips || 0,
            currentBet: p.currentBet || 0,
            isCurrentTurn: table.currentPlayerIndex !== -1 && 
                          table.players[table.currentPlayerIndex]?.id === p.id
        })),
        dealerHand: visibleDealerCards,
        dealerHandValue: (table.gamePhase === 'croupierTurn' || table.gamePhase === 'finished')
            ? calculateHandValue(table.dealerHand)
            : (table.gamePhase === 'revealing' ? calculateHandValue(table.dealerHand.slice(0, table.dealerRevealIndex || 0)) : '?'),
        gamePhase: table.gamePhase,
        playerCount: table.players.length,
        canRevealMore: table.gamePhase === 'revealing' && (table.dealerRevealIndex || 0) < table.dealerHand.length
    };
}

// ==================== POKER ====================

function createPokerTable(croupierId, croupierName) {
    const tableId = generateTableId();
    const table = {
        id: tableId,
        croupier: { id: croupierId, name: croupierName },
        players: [],
        deck: createDeck(),
        communityCards: [],
        currentPlayerIndex: -1,
        gamePhase: 'waiting'
    };
    pokerTables.set(tableId, table);
    return table;
}

function getPokerTableState(table) {
    return {
        id: table.id,
        croupier: table.croupier,
        players: table.players.map(p => ({
            id: p.id,
            name: p.name,
            hand: p.hand,
            folded: p.folded,
            chips: p.chips || 0,
            currentBet: p.currentBet || 0,
            isCurrentTurn: table.currentPlayerIndex !== -1 && 
                          table.players[table.currentPlayerIndex]?.id === p.id
        })),
        communityCards: table.communityCards,
        gamePhase: table.gamePhase,
        pot: table.pot || 0,
        playerCount: table.players.length
    };
}

function evaluatePokerHand(hand, communityCards) {
    const allCards = [...hand, ...communityCards];
    const values = {};
    const suits = {};
    
    allCards.forEach(card => {
        const v = card.value;
        values[v] = (values[v] || 0) + 1;
        suits[card.suit] = (suits[card.suit] || 0) + 1;
    });
    
    const pairs = Object.values(values).filter(v => v === 2).length;
    const threes = Object.values(values).filter(v => v === 3).length;
    const fours = Object.values(values).filter(v => v === 4).length;
    const flush = Object.values(suits).some(v => v >= 5);
    
    let score = 0;
    let handName = 'Wysoka karta';
    
    if (fours > 0) { score = 700; handName = 'Kareta'; }
    else if (threes > 0 && pairs > 0) { score = 600; handName = 'Full House'; }
    else if (flush) { score = 500; handName = 'Kolor'; }
    else if (threes > 0) { score = 300; handName = 'Trójka'; }
    else if (pairs >= 2) { score = 200; handName = 'Dwie pary'; }
    else if (pairs === 1) { score = 100; handName = 'Para'; }
    
    const cardOrder = '23456789TJQKA';
    allCards.forEach(card => {
        const v = card.value === '10' ? 'T' : card.value;
        score += cardOrder.indexOf(v);
    });
    
    return { score, handName };
}

// ==================== ROULETTE ====================

function createRouletteTable(croupierId, croupierName) {
    const tableId = generateTableId();
    const table = {
        id: tableId,
        croupier: { id: croupierId, name: croupierName },
        players: [],
        gamePhase: 'betting',
        lastResult: null
    };
    rouletteTables.set(tableId, table);
    return table;
}

function getRouletteTableState(table) {
    return {
        id: table.id,
        croupier: table.croupier,
        players: table.players.map(p => ({
            id: p.id,
            name: p.name,
            bets: p.bets,
            ready: p.ready,
            chips: p.chips || 0,
            totalBet: p.totalBet || 0
        })),
        gamePhase: table.gamePhase,
        lastResult: table.lastResult,
        playerCount: table.players.length
    };
}

function isRedNumber(num) {
    const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
    return redNumbers.includes(num);
}

function checkRouletteWin(bets, result) {
    let won = false;
    let maxMultiplier = 0;
    let hits = [];
    
    bets.forEach(bet => {
        let hitMultiplier = 0;
        
        if (bet === result.toString()) {
            hitMultiplier = 35;
            hits.push(`Numer ${bet} (35x)`);
        } else if (bet === 'red' && isRedNumber(result)) {
            hitMultiplier = 2;
            hits.push('Czerwone (2x)');
        } else if (bet === 'black' && result > 0 && !isRedNumber(result)) {
            hitMultiplier = 2;
            hits.push('Czarne (2x)');
        } else if (bet === 'even' && result > 0 && result % 2 === 0) {
            hitMultiplier = 2;
            hits.push('Parzyste (2x)');
        } else if (bet === 'odd' && result % 2 === 1) {
            hitMultiplier = 2;
            hits.push('Nieparzyste (2x)');
        } else if (bet === '1-18' && result >= 1 && result <= 18) {
            hitMultiplier = 2;
            hits.push('1-18 (2x)');
        } else if (bet === '19-36' && result >= 19 && result <= 36) {
            hitMultiplier = 2;
            hits.push('19-36 (2x)');
        }
        
        if (hitMultiplier > 0) {
            won = true;
            if (hitMultiplier > maxMultiplier) maxMultiplier = hitMultiplier;
        }
    });
    
    return { won, multiplier: maxMultiplier, hits };
}

// ==================== SOCKET.IO EVENTS ====================

io.on('connection', (socket) => {
    console.log('Gracz połączony:', socket.id);
    
    // ========== BLACKJACK EVENTS ==========
    
    socket.on('getBlackjackTables', () => {
        const tables = Array.from(blackjackTables.values()).map(t => ({
            id: t.id,
            croupierName: t.croupier.name,
            playerCount: t.players.length,
            gamePhase: t.gamePhase
        }));
        socket.emit('blackjackTableList', tables);
    });
    
    socket.on('createBlackjackTable', (data) => {
        const table = createBlackjackTable(socket.id, data.name);
        socket.join(table.id);
        socket.emit('bjJoinedTable', { 
            tableId: table.id, 
            role: 'croupier',
            state: getBJTableState(table)
        });
        io.emit('bjTablesUpdated');
    });
    
    socket.on('joinBlackjackTable', (data) => {
        const table = blackjackTables.get(data.tableId);
        if (!table) {
            socket.emit('error', { message: 'Stół nie istnieje!' });
            return;
        }
        
        if (table.players.length >= 4) {
            socket.emit('error', { message: 'Stół jest pełny!' });
            return;
        }
        
        table.players.push({
            id: socket.id,
            name: data.name,
            hand: [],
            status: 'waiting'
        });
        
        socket.join(data.tableId);
        socket.emit('bjJoinedTable', { 
            tableId: table.id, 
            role: 'player',
            state: getBJTableState(table)
        });
        
        io.to(data.tableId).emit('bjTableUpdate', getBJTableState(table));
        io.to(data.tableId).emit('bjMessage', { text: `${data.name} dołączył do stołu!` });
        io.emit('bjTablesUpdated');
    });
    
    socket.on('bjReady', () => {
        const table = findPlayerTable(socket.id, blackjackTables);
        if (!table) return;
        
        const player = table.players.find(p => p.id === socket.id);
        if (player && player.status === 'waiting') {
            player.status = 'ready';
            io.to(table.id).emit('bjTableUpdate', getBJTableState(table));
            io.to(table.id).emit('bjMessage', { text: `${player.name} jest gotowy!` });
        }
    });
    
    socket.on('bjDealCards', () => {
        const table = findPlayerTable(socket.id, blackjackTables);
        if (!table || table.croupier.id !== socket.id) return;
        
        const readyPlayers = table.players.filter(p => p.status === 'ready');
        if (readyPlayers.length === 0) {
            socket.emit('error', { message: 'Brak gotowych graczy!' });
            return;
        }
        
        table.deck = createDeck();
        table.dealerHand = [];
        
        // Reset players not ready
        table.players.forEach(p => {
            if (p.status !== 'ready') {
                p.status = 'waiting';
            }
            p.hand = [];
        });
        
        // Deal cards
        for (let i = 0; i < 2; i++) {
            readyPlayers.forEach(p => {
                p.hand.push(table.deck.pop());
            });
            table.dealerHand.push(table.deck.pop());
        }
        
        // Check for blackjacks
        readyPlayers.forEach(p => {
            if (calculateHandValue(p.hand) === 21) {
                p.status = 'blackjack';
            } else {
                p.status = 'playing';
            }
        });
        
        // Find first active player
        const firstActive = table.players.findIndex(p => p.status === 'playing');
        table.currentPlayerIndex = firstActive;
        table.gamePhase = firstActive >= 0 ? 'playing' : 'croupierTurn';
        
        io.to(table.id).emit('bjTableUpdate', getBJTableState(table));
        io.to(table.id).emit('bjMessage', { text: 'Karty rozdane!' });
    });
    
    socket.on('bjHit', () => {
        const table = findPlayerTable(socket.id, blackjackTables);
        if (!table || table.gamePhase !== 'playing') return;
        
        const currentPlayer = table.players[table.currentPlayerIndex];
        if (currentPlayer?.id !== socket.id) return;
        
        currentPlayer.hand.push(table.deck.pop());
        const value = calculateHandValue(currentPlayer.hand);
        
        if (value > 21) {
            currentPlayer.status = 'bust';
            advanceBJTurn(table);
        } else if (value === 21) {
            currentPlayer.status = 'stand';
            advanceBJTurn(table);
        }
        
        io.to(table.id).emit('bjTableUpdate', getBJTableState(table));
    });
    
    socket.on('bjStand', () => {
        const table = findPlayerTable(socket.id, blackjackTables);
        if (!table || table.gamePhase !== 'playing') return;
        
        const currentPlayer = table.players[table.currentPlayerIndex];
        if (currentPlayer?.id !== socket.id) return;
        
        currentPlayer.status = 'stand';
        advanceBJTurn(table);
        
        io.to(table.id).emit('bjTableUpdate', getBJTableState(table));
    });
    
    socket.on('bjCroupierPlay', () => {
        const table = findPlayerTable(socket.id, blackjackTables);
        if (!table || table.croupier.id !== socket.id) return;
        
        // Check if all players finished
        const activePlayers = table.players.filter(p => 
            p.status === 'playing' || p.status === 'stand' || p.status === 'bust' || p.status === 'blackjack'
        );
        
        if (activePlayers.some(p => p.status === 'playing')) {
            socket.emit('error', { message: 'Nie wszyscy gracze skończyli!' });
            return;
        }
        
        // Switch to revealing phase - dealer draws cards but shows them one by one
        table.gamePhase = 'revealing';
        table.dealerRevealIndex = 1; // Start with first card already visible
        
        // Dealer draws until 17
        while (calculateHandValue(table.dealerHand) < 17) {
            table.dealerHand.push(table.deck.pop());
        }
        
        io.to(table.id).emit('bjTableUpdate', getBJTableState(table));
        io.to(table.id).emit('bjMessage', { text: 'Krupier odkrywa karty... Kliknij "Odkryj kartę" aby odkryć następną.' });
    });
    
    socket.on('bjRevealNextCard', () => {
        const table = findPlayerTable(socket.id, blackjackTables);
        if (!table || table.croupier.id !== socket.id) return;
        if (table.gamePhase !== 'revealing') return;
        
        table.dealerRevealIndex = (table.dealerRevealIndex || 1) + 1;
        
        // Check if all cards revealed
        if (table.dealerRevealIndex >= table.dealerHand.length) {
            // All cards revealed - proceed to finish
            table.gamePhase = 'croupierTurn';
            
            const dealerValue = calculateHandValue(table.dealerHand);
            const dealerBust = dealerValue > 21;
            
            // Calculate results
            const results = {
                dealerValue,
                dealerBust,
                players: []
            };
            
            const activePlayers = table.players.filter(p => 
                p.status === 'stand' || p.status === 'bust' || p.status === 'blackjack'
            );
            
            activePlayers.forEach(player => {
                const playerValue = calculateHandValue(player.hand);
                let result = 'lose';
                let multiplier = 0;
                let winnings = 0;
                
                if (player.status === 'blackjack') {
                    result = 'blackjack';
                    multiplier = 2.5;
                } else if (player.status === 'bust') {
                    result = 'lose';
                    multiplier = 0;
                } else if (dealerBust) {
                    result = 'win';
                    multiplier = 2;
                } else if (playerValue > dealerValue) {
                    result = 'win';
                    multiplier = 2;
                } else if (playerValue === dealerValue) {
                    result = 'push';
                    multiplier = 1;
                }
                
                if (multiplier > 0 && player.currentBet) {
                    winnings = Math.floor(player.currentBet * multiplier);
                    player.chips = (player.chips || 0) + winnings;
                }
                
                results.players.push({
                    id: player.id,
                    name: player.name,
                    result,
                    multiplier: multiplier > 0 ? multiplier : null,
                    bet: player.currentBet || 0,
                    winnings: winnings,
                    newChips: player.chips || 0
                });
            });
            
            table.gamePhase = 'finished';
            
            io.to(table.id).emit('bjTableUpdate', getBJTableState(table));
            io.to(table.id).emit('bjRoundResults', results);
        } else {
            io.to(table.id).emit('bjTableUpdate', getBJTableState(table));
            io.to(table.id).emit('bjMessage', { text: `Krupier odkrywa kartę ${table.dealerRevealIndex}/${table.dealerHand.length}...` });
        }
    });
    
    socket.on('bjNewRound', () => {
        const table = findPlayerTable(socket.id, blackjackTables);
        if (!table || table.croupier.id !== socket.id) return;
        
        table.gamePhase = 'waiting';
        table.dealerHand = [];
        table.dealerRevealIndex = 0;
        table.currentPlayerIndex = -1;
        table.players.forEach(p => {
            p.hand = [];
            p.status = 'waiting';
            p.currentBet = 0;
        });
        
        io.to(table.id).emit('bjTableUpdate', getBJTableState(table));
        io.to(table.id).emit('bjMessage', { text: 'Nowa runda! Gracze, kliknijcie "Gotowy".' });
    });
    
    socket.on('bjAssignChips', (data) => {
        const table = findPlayerTable(socket.id, blackjackTables);
        if (!table || table.croupier.id !== socket.id) return;
        
        const player = table.players.find(p => p.id === data.playerId);
        if (!player) return;
        
        player.chips = data.amount;
        
        io.to(table.id).emit('bjTableUpdate', getBJTableState(table));
        io.to(table.id).emit('bjMessage', { text: `Krupier przydzielił ${data.amount} żetonów graczowi ${player.name}` });
    });
    
    socket.on('bjPlaceBet', (data) => {
        const table = findPlayerTable(socket.id, blackjackTables);
        if (!table || table.gamePhase !== 'waiting') return;
        
        const player = table.players.find(p => p.id === socket.id);
        if (!player) return;
        
        const betAmount = parseInt(data.amount) || 0;
        if (betAmount <= 0 || betAmount > (player.chips || 0)) {
            socket.emit('error', { message: 'Nieprawidłowa stawka!' });
            return;
        }
        
        player.currentBet = betAmount;
        player.chips -= betAmount;
        player.status = 'ready';
        
        io.to(table.id).emit('bjTableUpdate', getBJTableState(table));
        io.to(table.id).emit('bjMessage', { text: `${player.name} postawił ${betAmount} żetonów!` });
    });
    
    function advanceBJTurn(table) {
        let nextIndex = table.currentPlayerIndex + 1;
        
        while (nextIndex < table.players.length) {
            if (table.players[nextIndex].status === 'playing') {
                table.currentPlayerIndex = nextIndex;
                return;
            }
            nextIndex++;
        }
        
        table.currentPlayerIndex = -1;
        io.to(table.id).emit('bjMessage', { text: 'Wszyscy gracze skończyli. Krupier może odkryć karty.' });
    }
    
    // ========== POKER EVENTS ==========
    
    socket.on('getPokerTables', () => {
        const tables = Array.from(pokerTables.values()).map(t => ({
            id: t.id,
            croupierName: t.croupier.name,
            playerCount: t.players.length,
            gamePhase: t.gamePhase
        }));
        socket.emit('pokerTableList', tables);
    });
    
    socket.on('createPokerTable', (data) => {
        const table = createPokerTable(socket.id, data.name);
        socket.join(table.id);
        socket.emit('pokerJoinedTable', { 
            tableId: table.id, 
            role: 'croupier',
            state: getPokerTableState(table)
        });
        io.emit('pokerTablesUpdated');
    });
    
    socket.on('joinPokerTable', (data) => {
        const table = pokerTables.get(data.tableId);
        if (!table) {
            socket.emit('error', { message: 'Stół nie istnieje!' });
            return;
        }
        
        if (table.players.length >= 6) {
            socket.emit('error', { message: 'Stół jest pełny!' });
            return;
        }
        
        table.players.push({
            id: socket.id,
            name: data.name,
            hand: [],
            folded: false
        });
        
        socket.join(data.tableId);
        socket.emit('pokerJoinedTable', { 
            tableId: table.id, 
            role: 'player',
            state: getPokerTableState(table)
        });
        
        io.to(data.tableId).emit('pokerTableUpdate', getPokerTableState(table));
        io.to(data.tableId).emit('pokerMessage', { text: `${data.name} dołączył do stołu!` });
        io.emit('pokerTablesUpdated');
    });
    
    socket.on('pokerStartGame', () => {
        const table = findPlayerTable(socket.id, pokerTables);
        if (!table || table.croupier.id !== socket.id) return;
        
        if (table.players.length < 1) {
            socket.emit('error', { message: 'Potrzeba minimum 1 gracza!' });
            return;
        }
        
        startPokerRound(table);
    });
    
    function startPokerRound(table) {
        table.deck = createDeck();
        table.communityCards = [];
        table.gamePhase = 'preflop';
        table.pot = 0;
        
        table.players.forEach(p => {
            p.hand = [];
            p.folded = false;
            p.currentBet = 0;
        });
        
        // Deal 2 cards to each player
        for (let i = 0; i < 2; i++) {
            table.players.forEach(p => {
                p.hand.push(table.deck.pop());
            });
        }
        
        table.currentPlayerIndex = 0;
        
        io.to(table.id).emit('pokerTableUpdate', getPokerTableState(table));
        io.to(table.id).emit('pokerMessage', { text: 'Karty rozdane! Pre-Flop.' });
    }
    
    socket.on('pokerFold', () => {
        const table = findPlayerTable(socket.id, pokerTables);
        if (!table) return;
        
        const player = table.players.find(p => p.id === socket.id);
        if (!player || player.folded) return;
        
        player.folded = true;
        
        // Check if only one player left
        const activePlayers = table.players.filter(p => !p.folded);
        if (activePlayers.length === 1) {
            endPokerRound(table, activePlayers[0]);
            return;
        }
        
        advancePokerTurn(table);
        io.to(table.id).emit('pokerTableUpdate', getPokerTableState(table));
        io.to(table.id).emit('pokerMessage', { text: `${player.name} spasował.` });
    });
    
    socket.on('pokerCheck', () => {
        const table = findPlayerTable(socket.id, pokerTables);
        if (!table) return;
        
        const currentPlayer = table.players[table.currentPlayerIndex];
        if (currentPlayer?.id !== socket.id) return;
        
        advancePokerTurn(table);
        io.to(table.id).emit('pokerTableUpdate', getPokerTableState(table));
    });
    
    socket.on('pokerNextPhase', () => {
        const table = findPlayerTable(socket.id, pokerTables);
        if (!table || table.croupier.id !== socket.id) return;
        
        advancePokerPhase(table);
    });
    
    function advancePokerTurn(table) {
        let nextIndex = (table.currentPlayerIndex + 1) % table.players.length;
        let checked = 0;
        
        while (checked < table.players.length) {
            if (!table.players[nextIndex].folded) {
                table.currentPlayerIndex = nextIndex;
                return;
            }
            nextIndex = (nextIndex + 1) % table.players.length;
            checked++;
        }
    }
    
    function advancePokerPhase(table) {
        table.currentPlayerIndex = 0;
        while (table.players[table.currentPlayerIndex]?.folded) {
            table.currentPlayerIndex++;
        }
        
        if (table.communityCards.length === 0) {
            // Deal flop
            table.deck.pop(); // Burn card
            for (let i = 0; i < 3; i++) {
                table.communityCards.push(table.deck.pop());
            }
            table.gamePhase = 'flop';
            io.to(table.id).emit('pokerMessage', { text: 'Flop!' });
        } else if (table.communityCards.length === 3) {
            // Deal turn
            table.deck.pop();
            table.communityCards.push(table.deck.pop());
            table.gamePhase = 'turn';
            io.to(table.id).emit('pokerMessage', { text: 'Turn!' });
        } else if (table.communityCards.length === 4) {
            // Deal river
            table.deck.pop();
            table.communityCards.push(table.deck.pop());
            table.gamePhase = 'river';
            io.to(table.id).emit('pokerMessage', { text: 'River!' });
        } else {
            // Showdown
            table.gamePhase = 'showdown';
            const activePlayers = table.players.filter(p => !p.folded);
            let winner = activePlayers[0];
            let bestResult = { score: 0, handName: '' };
            
            activePlayers.forEach(p => {
                const result = evaluatePokerHand(p.hand, table.communityCards);
                if (result.score > bestResult.score) {
                    bestResult = result;
                    winner = p;
                }
            });
            
            endPokerRound(table, winner, bestResult.handName);
            return;
        }
        
        io.to(table.id).emit('pokerTableUpdate', getPokerTableState(table));
    }
    
    function endPokerRound(table, winner, handName = 'Zwycięzca przez fold') {
        table.gamePhase = 'finished';
        
        // Give pot to winner
        const potWinnings = table.pot || 0;
        winner.chips = (winner.chips || 0) + potWinnings;
        
        io.to(table.id).emit('pokerTableUpdate', getPokerTableState(table));
        io.to(table.id).emit('pokerRoundResult', {
            winner: {
                id: winner.id,
                name: winner.name,
                hand: winner.hand,
                handName: handName,
                winnings: potWinnings,
                newChips: winner.chips
            }
        });
        io.to(table.id).emit('pokerMessage', { text: `🏆 ${winner.name} wygrywa ${potWinnings} żetonów z: ${handName}!` });
    }
    
    socket.on('pokerNextRound', () => {
        const table = findPlayerTable(socket.id, pokerTables);
        if (!table || table.croupier.id !== socket.id || table.gamePhase !== 'finished') return;
        
        startPokerRound(table);
    });
    
    socket.on('pokerAssignChips', (data) => {
        const table = findPlayerTable(socket.id, pokerTables);
        if (!table || table.croupier.id !== socket.id) return;
        
        const player = table.players.find(p => p.id === data.playerId);
        if (!player) return;
        
        player.chips = data.amount;
        
        io.to(table.id).emit('pokerTableUpdate', getPokerTableState(table));
        io.to(table.id).emit('pokerMessage', { text: `Krupier przydzielił ${data.amount} żetonów graczowi ${player.name}` });
    });
    
    socket.on('pokerPlaceBet', (data) => {
        const table = findPlayerTable(socket.id, pokerTables);
        if (!table || table.gamePhase !== 'waiting') return;
        
        const player = table.players.find(p => p.id === socket.id);
        if (!player) return;
        
        const betAmount = parseInt(data.amount) || 0;
        if (betAmount <= 0 || betAmount > (player.chips || 0)) {
            socket.emit('error', { message: 'Nieprawidłowa stawka!' });
            return;
        }
        
        player.currentBet = betAmount;
        player.chips -= betAmount;
        table.pot = (table.pot || 0) + betAmount;
        
        io.to(table.id).emit('pokerTableUpdate', getPokerTableState(table));
        io.to(table.id).emit('pokerMessage', { text: `${player.name} postawił ${betAmount} żetonów!` });
    });
    
    // ========== ROULETTE EVENTS ==========
    
    socket.on('getRouletteTables', () => {
        const tables = Array.from(rouletteTables.values()).map(t => ({
            id: t.id,
            croupierName: t.croupier.name,
            playerCount: t.players.length,
            gamePhase: t.gamePhase
        }));
        socket.emit('rouletteTableList', tables);
    });
    
    socket.on('createRouletteTable', (data) => {
        const table = createRouletteTable(socket.id, data.name);
        socket.join(table.id);
        socket.emit('rouletteJoinedTable', { 
            tableId: table.id, 
            role: 'croupier',
            state: getRouletteTableState(table)
        });
        io.emit('rouletteTablesUpdated');
    });
    
    socket.on('joinRouletteTable', (data) => {
        const table = rouletteTables.get(data.tableId);
        if (!table) {
            socket.emit('error', { message: 'Stół nie istnieje!' });
            return;
        }
        
        if (table.players.length >= 8) {
            socket.emit('error', { message: 'Stół jest pełny!' });
            return;
        }
        
        table.players.push({
            id: socket.id,
            name: data.name,
            bets: [],
            ready: false,
            chips: 0,
            totalBet: 0
        });
        
        socket.join(data.tableId);
        socket.emit('rouletteJoinedTable', { 
            tableId: table.id, 
            role: 'player',
            state: getRouletteTableState(table)
        });
        
        io.to(data.tableId).emit('rouletteTableUpdate', getRouletteTableState(table));
        io.to(data.tableId).emit('rouletteMessage', { text: `${data.name} dołączył do stołu!` });
        io.emit('rouletteTablesUpdated');
    });
    
    socket.on('rouletteConfirmBets', (data) => {
        const table = findPlayerTable(socket.id, rouletteTables);
        if (!table || table.gamePhase !== 'betting') return;
        
        const player = table.players.find(p => p.id === socket.id);
        if (!player) return;
        
        const betAmount = data.betAmount || 10;
        const totalBet = betAmount * data.bets.length;
        
        if (player.chips < totalBet) {
            socket.emit('error', { message: `Nie masz wystarczająco żetonów! Potrzebujesz ${totalBet}, masz ${player.chips}` });
            return;
        }
        
        player.bets = data.bets;
        player.betAmount = betAmount;
        player.totalBet = totalBet;
        player.chips -= totalBet;
        player.ready = true;
        
        io.to(table.id).emit('rouletteTableUpdate', getRouletteTableState(table));
        io.to(table.id).emit('rouletteMessage', { text: `${player.name} postawił ${totalBet} żetonów!` });
    });
    
    socket.on('rouletteAssignChips', (data) => {
        const table = findPlayerTable(socket.id, rouletteTables);
        if (!table || table.croupier.id !== socket.id) return;
        
        const player = table.players.find(p => p.id === data.playerId);
        if (!player) return;
        
        player.chips = data.amount;
        
        io.to(table.id).emit('rouletteTableUpdate', getRouletteTableState(table));
        io.to(table.id).emit('rouletteMessage', { text: `Krupier przydzielił ${data.amount} żetonów graczowi ${player.name}` });
    });
    
    socket.on('rouletteSpin', () => {
        const table = findPlayerTable(socket.id, rouletteTables);
        if (!table || table.croupier.id !== socket.id || table.gamePhase !== 'betting') return;
        
        table.gamePhase = 'spinning';
        
        const result = Math.floor(Math.random() * 37);
        table.lastResult = result;
        
        const rotation = 1800 + Math.random() * 720 + (result * (360 / 37));
        
        io.to(table.id).emit('rouletteSpin', { result, rotation });
        io.to(table.id).emit('rouletteMessage', { text: 'Koło się kręci...' });
        
        // Process results after 5 seconds
        setTimeout(() => {
            const results = {
                winningNumber: result,
                players: []
            };
            
            table.players.forEach(player => {
                const { won, multiplier, hits } = checkRouletteWin(player.bets, result);
                
                let winnings = 0;
                if (won && player.betAmount) {
                    // Calculate winnings based on bet amount and multiplier
                    winnings = player.betAmount * multiplier;
                    player.chips += winnings;
                }
                
                results.players.push({
                    id: player.id,
                    name: player.name,
                    won,
                    multiplier: won ? `${multiplier}` : null,
                    hits,
                    winnings: winnings,
                    newChips: player.chips
                });
                
                player.bets = [];
                player.betAmount = 0;
                player.totalBet = 0;
                player.ready = false;
            });
            
            // Automatycznie wróć do betting - nie trzeba nowej rundy
            table.gamePhase = 'betting';
            
            io.to(table.id).emit('rouletteResults', results);
            io.to(table.id).emit('rouletteTableUpdate', getRouletteTableState(table));
            io.to(table.id).emit('rouletteMessage', { text: 'Możecie stawiać ponownie!' });
        }, 5000);
    });
    
    socket.on('rouletteNewRound', () => {
        const table = findPlayerTable(socket.id, rouletteTables);
        if (!table || table.croupier.id !== socket.id || table.gamePhase !== 'finished') return;
        
        table.gamePhase = 'betting';
        table.players.forEach(p => {
            p.bets = [];
            p.ready = false;
        });
        
        io.to(table.id).emit('rouletteTableUpdate', getRouletteTableState(table));
        io.to(table.id).emit('rouletteMessage', { text: 'Nowa runda! Wybierzcie swoje typy.' });
    });
    
    // ========== UTILITY ==========
    
    function findPlayerTable(playerId, tables) {
        for (const table of tables.values()) {
            if (table.croupier.id === playerId) return table;
            if (table.players.some(p => p.id === playerId)) return table;
        }
        return null;
    }
    
    // ========== LEAVE TABLE EVENTS ==========
    
    socket.on('leaveBlackjackTable', () => {
        for (const [tableId, table] of blackjackTables.entries()) {
            if (table.croupier.id === socket.id) {
                io.to(tableId).emit('bjTableClosed', { message: 'Krupier opuścił stół.' });
                blackjackTables.delete(tableId);
                io.emit('bjTablesUpdated');
                socket.leave(tableId);
                return;
            }
            const playerIndex = table.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const playerName = table.players[playerIndex].name;
                table.players.splice(playerIndex, 1);
                socket.leave(tableId);
                io.to(tableId).emit('bjTableUpdate', getBJTableState(table));
                io.to(tableId).emit('bjMessage', { text: `${playerName} opuścił stół.` });
                io.emit('bjTablesUpdated');
                return;
            }
        }
    });
    
    socket.on('leavePokerTable', () => {
        for (const [tableId, table] of pokerTables.entries()) {
            if (table.croupier.id === socket.id) {
                io.to(tableId).emit('pokerTableClosed', { message: 'Krupier opuścił stół.' });
                pokerTables.delete(tableId);
                io.emit('pokerTablesUpdated');
                socket.leave(tableId);
                return;
            }
            const playerIndex = table.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const playerName = table.players[playerIndex].name;
                table.players.splice(playerIndex, 1);
                socket.leave(tableId);
                io.to(tableId).emit('pokerTableUpdate', getPokerTableState(table));
                io.to(tableId).emit('pokerMessage', { text: `${playerName} opuścił stół.` });
                io.emit('pokerTablesUpdated');
                return;
            }
        }
    });
    
    socket.on('leaveRouletteTable', () => {
        for (const [tableId, table] of rouletteTables.entries()) {
            if (table.croupier.id === socket.id) {
                io.to(tableId).emit('rouletteTableClosed', { message: 'Krupier opuścił stół.' });
                rouletteTables.delete(tableId);
                io.emit('rouletteTablesUpdated');
                socket.leave(tableId);
                return;
            }
            const playerIndex = table.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const playerName = table.players[playerIndex].name;
                table.players.splice(playerIndex, 1);
                socket.leave(tableId);
                io.to(tableId).emit('rouletteTableUpdate', getRouletteTableState(table));
                io.to(tableId).emit('rouletteMessage', { text: `${playerName} opuścił stół.` });
                io.emit('rouletteTablesUpdated');
                return;
            }
        }
    });
    
    // ========== DISCONNECT ==========
    
    socket.on('disconnect', () => {
        console.log('Gracz rozłączony:', socket.id);
        
        // Clean up blackjack tables
        for (const [tableId, table] of blackjackTables.entries()) {
            if (table.croupier.id === socket.id) {
                io.to(tableId).emit('bjTableClosed', { message: 'Krupier opuścił stół.' });
                blackjackTables.delete(tableId);
                io.emit('bjTablesUpdated');
            } else {
                const playerIndex = table.players.findIndex(p => p.id === socket.id);
                if (playerIndex !== -1) {
                    const playerName = table.players[playerIndex].name;
                    table.players.splice(playerIndex, 1);
                    io.to(tableId).emit('bjTableUpdate', getBJTableState(table));
                    io.to(tableId).emit('bjMessage', { text: `${playerName} opuścił stół.` });
                }
            }
        }
        
        // Clean up poker tables
        for (const [tableId, table] of pokerTables.entries()) {
            if (table.croupier.id === socket.id) {
                io.to(tableId).emit('pokerTableClosed', { message: 'Krupier opuścił stół.' });
                pokerTables.delete(tableId);
                io.emit('pokerTablesUpdated');
            } else {
                const playerIndex = table.players.findIndex(p => p.id === socket.id);
                if (playerIndex !== -1) {
                    const playerName = table.players[playerIndex].name;
                    table.players.splice(playerIndex, 1);
                    io.to(tableId).emit('pokerTableUpdate', getPokerTableState(table));
                    io.to(tableId).emit('pokerMessage', { text: `${playerName} opuścił stół.` });
                }
            }
        }
        
        // Clean up roulette tables
        for (const [tableId, table] of rouletteTables.entries()) {
            if (table.croupier.id === socket.id) {
                io.to(tableId).emit('rouletteTableClosed', { message: 'Krupier opuścił stół.' });
                rouletteTables.delete(tableId);
                io.emit('rouletteTablesUpdated');
            } else {
                const playerIndex = table.players.findIndex(p => p.id === socket.id);
                if (playerIndex !== -1) {
                    const playerName = table.players[playerIndex].name;
                    table.players.splice(playerIndex, 1);
                    io.to(tableId).emit('rouletteTableUpdate', getRouletteTableState(table));
                    io.to(tableId).emit('rouletteMessage', { text: `${playerName} opuścił stół.` });
                }
            }
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🎰 Devgaming Casino Server działa na porcie ${PORT}`);
    console.log(`   http://localhost:${PORT}`);
});
