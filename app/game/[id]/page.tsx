'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ChessGame from '@/components/ChessBoard';
import { supabase } from '@/lib/supabase';
import { Chess } from 'chess.js';
import { ArrowLeft, Share2 } from 'lucide-react';

export default function GamePage() {
    const { id: gameId } = useParams();
    const router = useRouter();
    const [fen, setFen] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const [loading, setLoading] = useState(true);
    const [playerColor, setPlayerColor] = useState<'white' | 'black' | null>(null);
    const [gameStatus, setGameStatus] = useState('loading');
    const [copied, setCopied] = useState(false);

    // Memoize the game instance to avoid recreation on every render
    const initialGame = useMemo(() => new Chess(fen), [fen]);

    useEffect(() => {
        const fetchGame = async () => {
            const { data: game } = await supabase
                .from('games')
                .select('*')
                .eq('id', gameId)
                .single();

            if (game) {
                setFen(game.fen);
                setGameStatus(game.status);

                // Determine player color based on user session
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    if (user.id === game.white_player_id) setPlayerColor('white');
                    else if (user.id === game.black_player_id) setPlayerColor('black');
                }
            }
            setLoading(false);
        };

        if (gameId) fetchGame();

        // Subscribe to moves
        const channel = supabase
            .channel(`game:${gameId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'moves',
                    filter: `game_id=eq.${gameId}`,
                },
                (payload) => {
                    console.log('New move received:', payload.new);
                    setFen(payload.new.fen_after);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'games',
                    filter: `id=eq.${gameId}`,
                },
                (payload) => {
                    setGameStatus(payload.new.status);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [gameId]);

    const handleMove = useCallback(async (move: { san: string; from: string; to: string; before: string; after: string }) => {
        // Only persist move if it's an online game and it's the player's turn (simplified check)
        if (!gameId || gameId === 'local-game') return;

        const { error } = await supabase.from('moves').insert({
            game_id: gameId as string,
            move_number: initialGame.history().length,
            notation: move.san,
            from_square: move.from,
            to_square: move.to,
            fen_before: move.before,
            fen_after: move.after,
        });

        if (error) {
            console.error('Error saving move:', error);
        } else {
            // Update game FEN in games table
            await supabase.from('games').update({ fen: move.after }).eq('id', gameId);
        }
    }, [gameId, initialGame]);

    const copyLink = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) return <main><h1>Loading Game...</h1></main>;

    return (
        <main>
            <div className="glass-card" style={{ maxWidth: '1000px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <button onClick={() => router.push('/')} className="btn" style={{ background: 'transparent', padding: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white', border: 'none', cursor: 'pointer' }}>
                        <ArrowLeft size={20} /> Back
                    </button>
                    <div style={{ textAlign: 'center' }}>
                        <h2 style={{ margin: 0 }}>Online Match</h2>
                        <p style={{ margin: 0, opacity: 0.6, fontSize: '0.8rem' }}>ID: {gameId}</p>
                    </div>
                    <span className={`status-badge ${gameStatus}`} style={{ padding: '0.4rem 0.8rem', borderRadius: '1rem', background: gameStatus === 'playing' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)', border: '1px solid currentColor', color: gameStatus === 'playing' ? '#22c55e' : '#f59e0b', fontSize: '0.75rem', fontWeight: 700 }}>
                        {gameStatus.toUpperCase()}
                    </span>
                </div>

                <div className="game-grid">
                    <div>
                        <ChessGame
                            initialFen={fen}
                            onMove={handleMove}
                            orientation={playerColor || 'white'}
                        />
                    </div>

                    <div className="game-controls">
                        <div className="glass-card" style={{ padding: '1.5rem', marginBottom: 0, height: '100%', background: 'rgba(0,0,0,0.2)' }}>
                            <h3>Game Info</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ opacity: 0.7 }}>Your Color:</span>
                                    <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{playerColor ? playerColor.toUpperCase() : 'SPECTATOR'}</span>
                                </div>

                                <button
                                    onClick={copyLink}
                                    className="btn"
                                    style={{ width: '100%', background: 'var(--secondary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                >
                                    {copied ? 'Copied!' : <><Share2 size={16} /> Copy Invite Link</>}
                                </button>
                            </div>

                            <div style={{ marginTop: '2rem' }}>
                                <h4 style={{ marginBottom: '1rem', opacity: 0.7 }}>Move History</h4>
                                <div className="move-history" style={{ maxHeight: '300px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                                    {initialGame.history().map((m, i) => (
                                        <div key={i} style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '0.9rem' }}>
                                            {i % 2 === 0 ? <span style={{ opacity: 0.4, marginRight: '0.5rem' }}>{Math.floor(i / 2) + 1}.</span> : ''}
                                            <span style={{ fontWeight: 600 }}>{m}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
