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

function createBlackjackTable(croupierId, croupierName, chips) {
    const tableId = generateTableId();
    const table = {
        id: tableId,
        croupier: { id: croupierId, name: croupierName, chips },
        players: [],
        deck: createDeck(),
        dealerHand: [],
        gamePhase: 'waiting',
        currentPlayerIndex: -1
    };
    blackjackTables.set(tableId, table);
    return table;
}

function getBJTableState(table, forPublic = false) {
    return {
        id: table.id,
        croupier: table.croupier,
        players: table.players.map(p => ({
            id: p.id,
            name: p.name,
            chips: p.chips,
            bet: p.bet,
            hand: p.hand,
            handValue: calculateHandValue(p.hand),
            status: p.status,
            isCurrentTurn: table.currentPlayerIndex !== -1 && 
                          table.players[table.currentPlayerIndex]?.id === p.id
        })),
        dealerHand: table.gamePhase === 'croupierTurn' || table.gamePhase === 'finished'
            ? table.dealerHand
            : table.dealerHand.slice(0, 1).concat(table.dealerHand.length > 1 ? [{ value: '?', suit: '?' }] : []),
        dealerHandValue: table.gamePhase === 'croupierTurn' || table.gamePhase === 'finished'
            ? calculateHandValue(table.dealerHand)
            : '?',
        gamePhase: table.gamePhase,
        playerCount: table.players.length
    };
}

// ==================== POKER ====================

function createPokerTable(croupierId, croupierName, chips) {
    const tableId = generateTableId();
    const table = {
        id: tableId,
        croupier: { id: croupierId, name: croupierName, chips },
        players: [],
        deck: createDeck(),
        communityCards: [],
        pot: 0,
        currentBet: 0,
        dealerPosition: 0,
        currentPlayerIndex: -1,
        gamePhase: 'waiting',
        smallBlind: 10,
        bigBlind: 20
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
            chips: p.chips,
            hand: p.hand,
            currentBet: p.currentBet,
            folded: p.folded,
            isDealer: table.players[table.dealerPosition]?.id === p.id,
            isCurrentTurn: table.currentPlayerIndex !== -1 && 
                          table.players[table.currentPlayerIndex]?.id === p.id
        })),
        communityCards: table.communityCards,
        pot: table.pot,
        currentBet: table.currentBet,
        gamePhase: table.gamePhase,
        playerCount: table.players.length
    };
}

function evaluatePokerHand(hand, communityCards) {
    const allCards = [...hand, ...communityCards];
    // Simplified poker hand evaluation - returns score
    // Real implementation would be more complex
    let score = 0;
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
    
    if (fours > 0) score = 700;
    else if (threes > 0 && pairs > 0) score = 600; // Full house
    else if (flush) score = 500;
    else if (threes > 0) score = 300;
    else if (pairs >= 2) score = 200;
    else if (pairs === 1) score = 100;
    
    // Add high card value
    const cardOrder = '23456789TJQKA';
    allCards.forEach(card => {
        const v = card.value === '10' ? 'T' : card.value;
        score += cardOrder.indexOf(v);
    });
    
    return score;
}

// ==================== ROULETTE ====================

function createRouletteTable(croupierId, croupierName, chips) {
    const tableId = generateTableId();
    const table = {
        id: tableId,
        croupier: { id: croupierId, name: croupierName, chips },
        players: [],
        gamePhase: 'waiting',
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
            chips: p.chips,
            bets: p.bets,
            totalBet: p.bets.reduce((sum, b) => sum + b.amount, 0)
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

function calculateRouletteWinnings(bets, result) {
    let winnings = 0;
    
    bets.forEach(bet => {
        if (bet.type === result.toString()) {
            winnings += bet.amount * 35;
        } else if (bet.type === 'red' && isRedNumber(result)) {
            winnings += bet.amount * 2;
        } else if (bet.type === 'black' && result > 0 && !isRedNumber(result)) {
            winnings += bet.amount * 2;
        } else if (bet.type === 'even' && result > 0 && result % 2 === 0) {
            winnings += bet.amount * 2;
        } else if (bet.type === 'odd' && result % 2 === 1) {
            winnings += bet.amount * 2;
        } else if (bet.type === '1-18' && result >= 1 && result <= 18) {
            winnings += bet.amount * 2;
        } else if (bet.type === '19-36' && result >= 19 && result <= 36) {
            winnings += bet.amount * 2;
        } else if (bet.type === '1st12' && result >= 1 && result <= 12) {
            winnings += bet.amount * 3;
        } else if (bet.type === '2nd12' && result >= 13 && result <= 24) {
            winnings += bet.amount * 3;
        } else if (bet.type === '3rd12' && result >= 25 && result <= 36) {
            winnings += bet.amount * 3;
        }
    });
    
    return winnings;
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
        const table = createBlackjackTable(socket.id, data.name, data.chips);
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
            chips: data.chips,
            hand: [],
            bet: 0,
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
    
    socket.on('bjStartBetting', () => {
        const table = findPlayerTable(socket.id, blackjackTables);
        if (!table || table.croupier.id !== socket.id) return;
        
        table.gamePhase = 'betting';
        table.deck = createDeck();
        table.dealerHand = [];
        table.players.forEach(p => {
            p.hand = [];
            p.bet = 0;
            p.status = 'betting';
        });
        
        io.to(table.id).emit('bjTableUpdate', getBJTableState(table));
        io.to(table.id).emit('bjMessage', { text: 'Faza obstawiania! Gracze, postawcie zakłady.' });
    });
    
    socket.on('bjPlaceBet', (data) => {
        const table = findPlayerTable(socket.id, blackjackTables);
        if (!table) return;
        
        const player = table.players.find(p => p.id === socket.id);
        if (!player || player.status !== 'betting') return;
        
        if (data.amount > player.chips) {
            socket.emit('error', { message: 'Niewystarczające środki!' });
            return;
        }
        
        player.bet = data.amount;
        player.chips -= data.amount;
        player.status = 'ready';
        
        io.to(table.id).emit('bjTableUpdate', getBJTableState(table));
        io.to(table.id).emit('bjMessage', { text: `${player.name} postawił $${data.amount}` });
    });
    
    socket.on('bjDealCards', () => {
        const table = findPlayerTable(socket.id, blackjackTables);
        if (!table || table.croupier.id !== socket.id) return;
        
        const readyPlayers = table.players.filter(p => p.status === 'ready');
        if (readyPlayers.length === 0) {
            socket.emit('error', { message: 'Brak graczy z zakładami!' });
            return;
        }
        
        table.gamePhase = 'dealing';
        
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
        io.to(table.id).emit('bjMessage', { text: 'Karty rozdane! Gracze, wasza tura.' });
    });
    
    socket.on('bjHit', () => {
        const table = findPlayerTable(socket.id, blackjackTables);
        if (!table || table.gamePhase !== 'playing') return;
        
        const player = table.players.find(p => p.id === socket.id);
        if (!player || player.status !== 'playing' || !player.isCurrentTurn) {
            const currentPlayer = table.players[table.currentPlayerIndex];
            if (currentPlayer?.id !== socket.id) return;
        }
        
        player.hand.push(table.deck.pop());
        const value = calculateHandValue(player.hand);
        
        if (value > 21) {
            player.status = 'bust';
            advanceBJTurn(table);
        } else if (value === 21) {
            player.status = 'stand';
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
    
    socket.on('bjDoubleDown', () => {
        const table = findPlayerTable(socket.id, blackjackTables);
        if (!table || table.gamePhase !== 'playing') return;
        
        const player = table.players.find(p => p.id === socket.id);
        if (!player || player.hand.length !== 2 || player.chips < player.bet) return;
        
        player.chips -= player.bet;
        player.bet *= 2;
        player.hand.push(table.deck.pop());
        
        const value = calculateHandValue(player.hand);
        player.status = value > 21 ? 'bust' : 'stand';
        
        advanceBJTurn(table);
        io.to(table.id).emit('bjTableUpdate', getBJTableState(table));
    });
    
    socket.on('bjCroupierPlay', () => {
        const table = findPlayerTable(socket.id, blackjackTables);
        if (!table || table.croupier.id !== socket.id || table.gamePhase !== 'croupierTurn') return;
        
        // Dealer draws until 17
        while (calculateHandValue(table.dealerHand) < 17) {
            table.dealerHand.push(table.deck.pop());
        }
        
        const dealerValue = calculateHandValue(table.dealerHand);
        const dealerBust = dealerValue > 21;
        
        // Calculate results
        const results = {
            dealerValue,
            dealerBust,
            players: []
        };
        
        table.players.forEach(player => {
            const playerValue = calculateHandValue(player.hand);
            let result = 'lose';
            let payout = 0;
            
            if (player.status === 'blackjack') {
                result = 'blackjack';
                payout = player.bet * 2.5;
            } else if (player.status === 'bust') {
                result = 'lose';
                payout = 0;
            } else if (dealerBust) {
                result = 'win';
                payout = player.bet * 2;
            } else if (playerValue > dealerValue) {
                result = 'win';
                payout = player.bet * 2;
            } else if (playerValue === dealerValue) {
                result = 'push';
                payout = player.bet;
            }
            
            player.chips += payout;
            
            results.players.push({
                id: player.id,
                name: player.name,
                result,
                chips: player.chips
            });
        });
        
        table.gamePhase = 'finished';
        
        io.to(table.id).emit('bjTableUpdate', getBJTableState(table));
        io.to(table.id).emit('bjRoundResults', results);
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
        
        // No more active players - croupier's turn
        table.currentPlayerIndex = -1;
        table.gamePhase = 'croupierTurn';
        io.to(table.id).emit('bjMessage', { text: 'Tura krupiera!' });
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
        const table = createPokerTable(socket.id, data.name, data.chips);
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
            chips: data.chips,
            hand: [],
            currentBet: 0,
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
        
        if (table.players.length < 2) {
            socket.emit('error', { message: 'Potrzeba minimum 2 graczy!' });
            return;
        }
        
        startPokerRound(table);
    });
    
    function startPokerRound(table) {
        table.deck = createDeck();
        table.communityCards = [];
        table.pot = 0;
        table.currentBet = 0;
        table.gamePhase = 'preflop';
        
        // Reset players
        table.players.forEach(p => {
            p.hand = [];
            p.currentBet = 0;
            p.folded = false;
        });
        
        // Deal 2 cards to each player
        for (let i = 0; i < 2; i++) {
            table.players.forEach(p => {
                p.hand.push(table.deck.pop());
            });
        }
        
        // Post blinds
        const sbIndex = (table.dealerPosition + 1) % table.players.length;
        const bbIndex = (table.dealerPosition + 2) % table.players.length;
        
        table.players[sbIndex].chips -= table.smallBlind;
        table.players[sbIndex].currentBet = table.smallBlind;
        table.players[bbIndex].chips -= table.bigBlind;
        table.players[bbIndex].currentBet = table.bigBlind;
        
        table.pot = table.smallBlind + table.bigBlind;
        table.currentBet = table.bigBlind;
        
        table.currentPlayerIndex = (bbIndex + 1) % table.players.length;
        table.gamePhase = 'betting';
        
        io.to(table.id).emit('pokerTableUpdate', getPokerTableState(table));
        io.to(table.id).emit('pokerMessage', { text: 'Nowa runda rozpoczęta! Pre-Flop.' });
    }
    
    socket.on('pokerFold', () => {
        const table = findPlayerTable(socket.id, pokerTables);
        if (!table || table.gamePhase !== 'betting') return;
        
        const player = table.players[table.currentPlayerIndex];
        if (player?.id !== socket.id) return;
        
        player.folded = true;
        advancePokerTurn(table);
    });
    
    socket.on('pokerCheck', () => {
        const table = findPlayerTable(socket.id, pokerTables);
        if (!table || table.gamePhase !== 'betting') return;
        
        const player = table.players[table.currentPlayerIndex];
        if (player?.id !== socket.id) return;
        
        if (table.currentBet > player.currentBet) {
            socket.emit('error', { message: 'Nie możesz sprawdzić, musisz wyrównać lub spasować!' });
            return;
        }
        
        advancePokerTurn(table);
    });
    
    socket.on('pokerCall', () => {
        const table = findPlayerTable(socket.id, pokerTables);
        if (!table || table.gamePhase !== 'betting') return;
        
        const player = table.players[table.currentPlayerIndex];
        if (player?.id !== socket.id) return;
        
        const toCall = table.currentBet - player.currentBet;
        if (toCall > player.chips) {
            socket.emit('error', { message: 'Niewystarczające środki!' });
            return;
        }
        
        player.chips -= toCall;
        player.currentBet = table.currentBet;
        table.pot += toCall;
        
        advancePokerTurn(table);
    });
    
    socket.on('pokerRaise', (data) => {
        const table = findPlayerTable(socket.id, pokerTables);
        if (!table || table.gamePhase !== 'betting') return;
        
        const player = table.players[table.currentPlayerIndex];
        if (player?.id !== socket.id) return;
        
        const totalBet = table.currentBet + data.amount;
        const needed = totalBet - player.currentBet;
        
        if (needed > player.chips) {
            socket.emit('error', { message: 'Niewystarczające środki!' });
            return;
        }
        
        player.chips -= needed;
        table.pot += needed;
        player.currentBet = totalBet;
        table.currentBet = totalBet;
        
        // Reset betting round for other players
        table.lastRaiser = socket.id;
        advancePokerTurn(table);
    });
    
    socket.on('pokerAllIn', () => {
        const table = findPlayerTable(socket.id, pokerTables);
        if (!table || table.gamePhase !== 'betting') return;
        
        const player = table.players[table.currentPlayerIndex];
        if (player?.id !== socket.id) return;
        
        const allIn = player.chips;
        player.currentBet += allIn;
        table.pot += allIn;
        player.chips = 0;
        
        if (player.currentBet > table.currentBet) {
            table.currentBet = player.currentBet;
            table.lastRaiser = socket.id;
        }
        
        advancePokerTurn(table);
    });
    
    function advancePokerTurn(table) {
        const activePlayers = table.players.filter(p => !p.folded);
        
        // Check if only one player left
        if (activePlayers.length === 1) {
            endPokerRound(table, activePlayers[0]);
            return;
        }
        
        // Find next active player
        let nextIndex = (table.currentPlayerIndex + 1) % table.players.length;
        let looped = false;
        
        while (nextIndex !== table.currentPlayerIndex) {
            if (nextIndex === 0) looped = true;
            
            const nextPlayer = table.players[nextIndex];
            if (!nextPlayer.folded && nextPlayer.chips > 0) {
                // Check if betting round complete
                if (nextPlayer.currentBet === table.currentBet && looped) {
                    advancePokerPhase(table);
                    return;
                }
                table.currentPlayerIndex = nextIndex;
                io.to(table.id).emit('pokerTableUpdate', getPokerTableState(table));
                return;
            }
            nextIndex = (nextIndex + 1) % table.players.length;
        }
        
        advancePokerPhase(table);
    }
    
    function advancePokerPhase(table) {
        // Reset bets
        table.players.forEach(p => p.currentBet = 0);
        table.currentBet = 0;
        
        if (table.communityCards.length === 0) {
            // Deal flop
            table.deck.pop(); // Burn card
            for (let i = 0; i < 3; i++) {
                table.communityCards.push(table.deck.pop());
            }
            io.to(table.id).emit('pokerMessage', { text: 'Flop!' });
        } else if (table.communityCards.length === 3) {
            // Deal turn
            table.deck.pop();
            table.communityCards.push(table.deck.pop());
            io.to(table.id).emit('pokerMessage', { text: 'Turn!' });
        } else if (table.communityCards.length === 4) {
            // Deal river
            table.deck.pop();
            table.communityCards.push(table.deck.pop());
            io.to(table.id).emit('pokerMessage', { text: 'River!' });
        } else {
            // Showdown
            const activePlayers = table.players.filter(p => !p.folded);
            let winner = activePlayers[0];
            let bestScore = 0;
            
            activePlayers.forEach(p => {
                const score = evaluatePokerHand(p.hand, table.communityCards);
                if (score > bestScore) {
                    bestScore = score;
                    winner = p;
                }
            });
            
            endPokerRound(table, winner);
            return;
        }
        
        table.currentPlayerIndex = (table.dealerPosition + 1) % table.players.length;
        while (table.players[table.currentPlayerIndex].folded) {
            table.currentPlayerIndex = (table.currentPlayerIndex + 1) % table.players.length;
        }
        
        io.to(table.id).emit('pokerTableUpdate', getPokerTableState(table));
    }
    
    function endPokerRound(table, winner) {
        winner.chips += table.pot;
        table.gamePhase = 'finished';
        table.dealerPosition = (table.dealerPosition + 1) % table.players.length;
        
        io.to(table.id).emit('pokerTableUpdate', getPokerTableState(table));
        io.to(table.id).emit('pokerMessage', { text: `${winner.name} wygrywa pulę $${table.pot}!` });
    }
    
    socket.on('pokerNextRound', () => {
        const table = findPlayerTable(socket.id, pokerTables);
        if (!table || table.croupier.id !== socket.id || table.gamePhase !== 'finished') return;
        
        startPokerRound(table);
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
        const table = createRouletteTable(socket.id, data.name, data.chips);
        socket.join(table.id);
        table.gamePhase = 'betting';
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
            chips: data.chips,
            bets: []
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
        
        const totalBet = data.bets.reduce((sum, b) => sum + b.amount, 0);
        if (totalBet > player.chips) {
            socket.emit('error', { message: 'Niewystarczające środki!' });
            return;
        }
        
        player.bets = data.bets;
        player.chips -= totalBet;
        
        io.to(table.id).emit('rouletteTableUpdate', getRouletteTableState(table));
        io.to(table.id).emit('rouletteMessage', { text: `${player.name} postawił $${totalBet}` });
    });
    
    socket.on('rouletteSpin', () => {
        const table = findPlayerTable(socket.id, rouletteTables);
        if (!table || table.croupier.id !== socket.id || table.gamePhase !== 'betting') return;
        
        table.gamePhase = 'spinning';
        
        const result = Math.floor(Math.random() * 37);
        table.lastResult = result;
        
        // Random rotation for visual effect
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
                const winnings = calculateRouletteWinnings(player.bets, result);
                player.chips += winnings;
                
                results.players.push({
                    id: player.id,
                    name: player.name,
                    won: winnings - player.bets.reduce((s, b) => s + b.amount, 0),
                    chips: player.chips
                });
                
                player.bets = [];
            });
            
            table.gamePhase = 'finished';
            
            io.to(table.id).emit('rouletteResults', results);
            io.to(table.id).emit('rouletteTableUpdate', getRouletteTableState(table));
        }, 5000);
    });
    
    socket.on('rouletteNewRound', () => {
        const table = findPlayerTable(socket.id, rouletteTables);
        if (!table || table.croupier.id !== socket.id || table.gamePhase !== 'finished') return;
        
        table.gamePhase = 'betting';
        table.players.forEach(p => p.bets = []);
        
        io.to(table.id).emit('rouletteTableUpdate', getRouletteTableState(table));
        io.to(table.id).emit('rouletteMessage', { text: 'Nowa runda! Stawiajcie zakłady.' });
    });
    
    // ========== UTILITY ==========
    
    function findPlayerTable(playerId, tables) {
        for (const table of tables.values()) {
            if (table.croupier.id === playerId) return table;
            if (table.players.some(p => p.id === playerId)) return table;
        }
        return null;
    }
    
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
