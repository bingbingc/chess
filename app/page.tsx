'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ChessGame from '@/components/ChessBoard';
import { supabase } from '@/lib/supabase';
import { Trophy, Users, Zap, Search } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const createGame = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('games')
        .insert({
          status: 'playing',
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
        })
        .select()
        .single();

      if (error) throw error;
      if (data) router.push(`/game/${data.id}`);
    } catch (error) {
      console.error('Error creating game:', error);
      alert('Failed to create game. Please check your Supabase configuration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <div className="glass-card" style={{ maxWidth: '1000px' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h1>Grandmaster Chess</h1>
          <p style={{ fontSize: '1.1rem', opacity: 0.8 }}>The ultimate premium real-time chess experience.</p>
        </div>

        <div className="game-grid">
          <div>
            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Zap size={20} color="var(--primary)" />
              <h3 style={{ margin: 0 }}>Local Sandbox</h3>
            </div>
            <ChessGame gameId="local-game" />
          </div>

          <div className="game-controls">
            <div className="glass-card" style={{ padding: '2rem', height: '100%', marginBottom: 0, background: 'rgba(255,255,255,0.03)' }}>
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Users size={24} color="var(--primary)" /> Online Arena
                </h3>
                <p style={{ opacity: 0.7 }}>Challenge players worldwide in real-time matches.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <button
                  className="btn btn-primary"
                  onClick={createGame}
                  disabled={loading}
                  style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }}
                >
                  {loading ? 'Creating...' : 'Create Online Match'}
                </button>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Enter Game ID to join..."
                    style={{ width: '100%', padding: '0.8rem 1rem', paddingLeft: '2.5rem', borderRadius: '0.5rem', background: 'var(--secondary)', border: '1px solid var(--border)', color: 'white' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') router.push(`/game/${(e.target as HTMLInputElement).value}`);
                    }}
                  />
                  <Search size={18} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                </div>
              </div>

              <div style={{ marginTop: '3rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <Trophy size={20} color="var(--accent)" />
                  <h4 style={{ margin: 0 }}>Hall of Fame</h4>
                </div>
                <div style={{ opacity: 0.6, fontSize: '0.9rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem' }}>
                  No grandmasters yet. Connect your Supabase database to start the ranking!
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
