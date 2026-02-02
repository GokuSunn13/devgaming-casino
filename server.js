const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Game state
const tables = new Map();

function createDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const deck = [];
    
    // Use 6 decks like in real casinos
    for (let d = 0; d < 6; d++) {
        for (const suit of suits) {
            for (const value of values) {
                deck.push({ suit, value });
            }
        }
    }
    
    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    
    return deck;
}

function calculateHandValue(hand) {
    let value = 0;
    let aces = 0;
    
    for (const card of hand) {
        if (card.value === 'A') {
            aces++;
            value += 11;
        } else if (['K', 'Q', 'J'].includes(card.value)) {
            value += 10;
        } else {
            value += parseInt(card.value);
        }
    }
    
    while (value > 21 && aces > 0) {
        value -= 10;
        aces--;
    }
    
    return value;
}

function createTable(tableId) {
    return {
        id: tableId,
        croupier: null,
        players: [],
        deck: createDeck(),
        dealerHand: [],
        gamePhase: 'waiting', // waiting, betting, dealing, playing, croupierTurn, finished
        currentPlayerIndex: -1,
        minBet: 10,
        maxBet: 1000
    };
}

function getTableState(table, forSocket = null) {
    const state = {
        id: table.id,
        croupier: table.croupier ? { id: table.croupier.id, name: table.croupier.name } : null,
        players: table.players.map(p => ({
            id: p.id,
            name: p.name,
            chips: p.chips,
            bet: p.bet,
            hand: p.hand,
            handValue: calculateHandValue(p.hand),
            status: p.status,
            isCurrentTurn: table.players[table.currentPlayerIndex]?.id === p.id
        })),
        dealerHand: table.gamePhase === 'playing' || table.gamePhase === 'betting' || table.gamePhase === 'dealing'
            ? [table.dealerHand[0], { suit: '?', value: '?' }].slice(0, table.dealerHand.length)
            : table.dealerHand,
        dealerHandValue: table.gamePhase === 'croupierTurn' || table.gamePhase === 'finished' 
            ? calculateHandValue(table.dealerHand) 
            : '?',
        gamePhase: table.gamePhase,
        currentPlayerIndex: table.currentPlayerIndex,
        minBet: table.minBet,
        maxBet: table.maxBet
    };
    
    return state;
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    let currentTable = null;
    let playerRole = null; // 'croupier' or 'player'
    
    socket.on('getTables', () => {
        const tableList = Array.from(tables.values()).map(t => ({
            id: t.id,
            croupierName: t.croupier?.name || 'No Croupier',
            playerCount: t.players.length,
            maxPlayers: 4,
            gamePhase: t.gamePhase
        }));
        socket.emit('tableList', tableList);
    });
    
    socket.on('createTable', (data) => {
        const tableId = 'table_' + Date.now();
        const table = createTable(tableId);
        table.croupier = {
            id: socket.id,
            name: data.name || 'Croupier'
        };
        tables.set(tableId, table);
        currentTable = table;
        playerRole = 'croupier';
        
        socket.join(tableId);
        socket.emit('joinedTable', { 
            tableId, 
            role: 'croupier',
            state: getTableState(table)
        });
        
        io.emit('tablesUpdated');
        console.log(`Table ${tableId} created by ${data.name}`);
    });
    
    socket.on('joinTable', (data) => {
        const table = tables.get(data.tableId);
        if (!table) {
            socket.emit('error', { message: 'Table not found' });
            return;
        }
        
        if (table.players.length >= 4) {
            socket.emit('error', { message: 'Table is full' });
            return;
        }
        
        if (table.gamePhase !== 'waiting' && table.gamePhase !== 'finished') {
            socket.emit('error', { message: 'Game in progress, wait for next round' });
            return;
        }
        
        const player = {
            id: socket.id,
            name: data.name || 'Player',
            chips: 1000,
            bet: 0,
            hand: [],
            status: 'waiting' // waiting, betting, playing, stand, bust, blackjack
        };
        
        table.players.push(player);
        currentTable = table;
        playerRole = 'player';
        
        socket.join(data.tableId);
        socket.emit('joinedTable', {
            tableId: data.tableId,
            role: 'player',
            state: getTableState(table)
        });
        
        io.to(data.tableId).emit('tableUpdate', getTableState(table));
        io.emit('tablesUpdated');
        console.log(`${data.name} joined table ${data.tableId}`);
    });
    
    socket.on('startBetting', () => {
        if (!currentTable || playerRole !== 'croupier') return;
        if (currentTable.players.length === 0) {
            socket.emit('error', { message: 'Need at least one player to start' });
            return;
        }
        
        currentTable.gamePhase = 'betting';
        currentTable.players.forEach(p => {
            p.status = 'betting';
            p.bet = 0;
            p.hand = [];
        });
        currentTable.dealerHand = [];
        
        io.to(currentTable.id).emit('tableUpdate', getTableState(currentTable));
        io.to(currentTable.id).emit('message', { text: 'Place your bets!' });
    });
    
    socket.on('placeBet', (data) => {
        if (!currentTable || playerRole !== 'player') return;
        if (currentTable.gamePhase !== 'betting') return;
        
        const player = currentTable.players.find(p => p.id === socket.id);
        if (!player) return;
        
        const bet = parseInt(data.amount);
        if (bet < currentTable.minBet || bet > currentTable.maxBet || bet > player.chips) {
            socket.emit('error', { message: 'Invalid bet amount' });
            return;
        }
        
        player.bet = bet;
        player.status = 'ready';
        
        io.to(currentTable.id).emit('tableUpdate', getTableState(currentTable));
        
        // Check if all players have bet
        const allReady = currentTable.players.every(p => p.status === 'ready');
        if (allReady) {
            io.to(currentTable.id).emit('message', { text: 'All bets placed. Croupier can deal cards.' });
        }
    });
    
    socket.on('dealCards', () => {
        if (!currentTable || playerRole !== 'croupier') return;
        if (currentTable.gamePhase !== 'betting') return;
        
        const allReady = currentTable.players.every(p => p.status === 'ready');
        if (!allReady) {
            socket.emit('error', { message: 'Not all players have placed bets' });
            return;
        }
        
        // Reshuffle if needed
        if (currentTable.deck.length < 52) {
            currentTable.deck = createDeck();
        }
        
        currentTable.gamePhase = 'dealing';
        
        // Deal 2 cards to each player and dealer
        for (let i = 0; i < 2; i++) {
            currentTable.players.forEach(player => {
                player.hand.push(currentTable.deck.pop());
            });
            currentTable.dealerHand.push(currentTable.deck.pop());
        }
        
        // Check for blackjacks
        currentTable.players.forEach(player => {
            const value = calculateHandValue(player.hand);
            if (value === 21) {
                player.status = 'blackjack';
            } else {
                player.status = 'playing';
            }
        });
        
        // Find first player who can play
        currentTable.currentPlayerIndex = currentTable.players.findIndex(p => p.status === 'playing');
        
        if (currentTable.currentPlayerIndex === -1) {
            // All players have blackjack, go to dealer's turn
            currentTable.gamePhase = 'croupierTurn';
        } else {
            currentTable.gamePhase = 'playing';
        }
        
        io.to(currentTable.id).emit('tableUpdate', getTableState(currentTable));
        io.to(currentTable.id).emit('message', { text: 'Cards dealt!' });
    });
    
    socket.on('hit', () => {
        if (!currentTable || playerRole !== 'player') return;
        if (currentTable.gamePhase !== 'playing') return;
        
        const player = currentTable.players.find(p => p.id === socket.id);
        if (!player || currentTable.players[currentTable.currentPlayerIndex]?.id !== socket.id) {
            socket.emit('error', { message: 'Not your turn' });
            return;
        }
        
        player.hand.push(currentTable.deck.pop());
        const value = calculateHandValue(player.hand);
        
        if (value > 21) {
            player.status = 'bust';
            moveToNextPlayer(currentTable);
        } else if (value === 21) {
            player.status = 'stand';
            moveToNextPlayer(currentTable);
        }
        
        io.to(currentTable.id).emit('tableUpdate', getTableState(currentTable));
    });
    
    socket.on('stand', () => {
        if (!currentTable || playerRole !== 'player') return;
        if (currentTable.gamePhase !== 'playing') return;
        
        const player = currentTable.players.find(p => p.id === socket.id);
        if (!player || currentTable.players[currentTable.currentPlayerIndex]?.id !== socket.id) {
            socket.emit('error', { message: 'Not your turn' });
            return;
        }
        
        player.status = 'stand';
        moveToNextPlayer(currentTable);
        
        io.to(currentTable.id).emit('tableUpdate', getTableState(currentTable));
    });
    
    socket.on('doubleDown', () => {
        if (!currentTable || playerRole !== 'player') return;
        if (currentTable.gamePhase !== 'playing') return;
        
        const player = currentTable.players.find(p => p.id === socket.id);
        if (!player || currentTable.players[currentTable.currentPlayerIndex]?.id !== socket.id) {
            socket.emit('error', { message: 'Not your turn' });
            return;
        }
        
        if (player.hand.length !== 2 || player.chips < player.bet) {
            socket.emit('error', { message: 'Cannot double down' });
            return;
        }
        
        player.bet *= 2;
        player.hand.push(currentTable.deck.pop());
        const value = calculateHandValue(player.hand);
        
        if (value > 21) {
            player.status = 'bust';
        } else {
            player.status = 'stand';
        }
        
        moveToNextPlayer(currentTable);
        io.to(currentTable.id).emit('tableUpdate', getTableState(currentTable));
    });
    
    socket.on('croupierPlay', () => {
        if (!currentTable || playerRole !== 'croupier') return;
        if (currentTable.gamePhase !== 'croupierTurn') return;
        
        // Dealer draws until 17 or higher
        while (calculateHandValue(currentTable.dealerHand) < 17) {
            currentTable.dealerHand.push(currentTable.deck.pop());
        }
        
        const dealerValue = calculateHandValue(currentTable.dealerHand);
        const dealerBust = dealerValue > 21;
        
        // Resolve bets
        currentTable.players.forEach(player => {
            const playerValue = calculateHandValue(player.hand);
            
            if (player.status === 'bust') {
                // Player loses bet (already lost)
                player.chips -= player.bet;
                player.result = 'lose';
            } else if (player.status === 'blackjack') {
                if (dealerValue === 21 && currentTable.dealerHand.length === 2) {
                    // Push - tie
                    player.result = 'push';
                } else {
                    // Blackjack pays 3:2
                    player.chips += Math.floor(player.bet * 1.5);
                    player.result = 'blackjack';
                }
            } else if (dealerBust) {
                player.chips += player.bet;
                player.result = 'win';
            } else if (playerValue > dealerValue) {
                player.chips += player.bet;
                player.result = 'win';
            } else if (playerValue < dealerValue) {
                player.chips -= player.bet;
                player.result = 'lose';
            } else {
                player.result = 'push';
            }
        });
        
        currentTable.gamePhase = 'finished';
        io.to(currentTable.id).emit('tableUpdate', getTableState(currentTable));
        io.to(currentTable.id).emit('roundResults', {
            dealerValue,
            dealerBust,
            players: currentTable.players.map(p => ({
                name: p.name,
                result: p.result,
                chips: p.chips
            }))
        });
    });
    
    function moveToNextPlayer(table) {
        // Find next player who can still play
        let nextIndex = table.currentPlayerIndex + 1;
        while (nextIndex < table.players.length) {
            if (table.players[nextIndex].status === 'playing') {
                table.currentPlayerIndex = nextIndex;
                return;
            }
            nextIndex++;
        }
        
        // No more players, move to croupier's turn
        table.currentPlayerIndex = -1;
        table.gamePhase = 'croupierTurn';
        io.to(table.id).emit('message', { text: "All players done. Croupier's turn." });
    }
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        if (currentTable) {
            if (playerRole === 'croupier') {
                // Croupier left, close the table
                io.to(currentTable.id).emit('tableClosed', { message: 'Croupier left the table' });
                tables.delete(currentTable.id);
            } else {
                // Player left
                currentTable.players = currentTable.players.filter(p => p.id !== socket.id);
                io.to(currentTable.id).emit('tableUpdate', getTableState(currentTable));
            }
            io.emit('tablesUpdated');
        }
    });
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
server.listen(PORT, HOST, () => {
    console.log(`DevGaming Casino server running on port ${PORT}`);
});
